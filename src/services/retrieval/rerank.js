import { createLogger } from '../logger.js';

const logger = createLogger('rerank');

// Blend weights for the local relevance score. Sum of the first four is 1.0;
// intent is a small additive nudge on top. Override via options.weights.
const DEFAULT_WEIGHTS = {
  base: 0.35, // semantic/fused retrieval score (normalized against the top candidate)
  lexical: 0.35, // query-term coverage + TF saturation over the body text
  phrase: 0.15, // exact phrase / n-gram overlap
  field: 0.1, // matches in high-value fields (title, heading, ids)
  intent: 0.05, // result-type alignment with the query intent
};

// BM25-style term-frequency saturation constant.
const TF_K1 = 1.5;

// High-value fields and how much a query-term match in each is worth.
const FIELD_WEIGHTS = {
  serialNumber: 1.0,
  caseNumber: 1.0,
  title: 0.6,
  heading: 0.6,
  summary: 0.3,
};

const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'was', 'were', 'be', 'by', 'at', 'as', 'that', 'this', 'it', 'from',
  'find', 'show', 'me', 'my', 'all', 'any', 'list', 'get', 'please',
  // Arabic (common particles)
  'من', 'في', 'على', 'الى', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'التي', 'الذي',
  'و', 'ما', 'كل', 'عن',
]);

/**
 * Normalize text for matching: lowercase, strip Latin diacritics, fold common
 * Arabic letter variants, drop tatweel/harakat, collapse punctuation.
 */
function normalizeText(input) {
  if (!input) return '';
  let text = String(input).toLowerCase();
  // Strip Latin combining diacritics.
  text = text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Fold Arabic variants and remove diacritics/tatweel.
  text = text
    .replace(/[ؗ-ًؚ-ْـ]/g, '') // harakat + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  return text;
}

/**
 * Tokenize into content words (letters/digits across scripts), dropping
 * stopwords and 1-character noise.
 */
function tokenize(input) {
  const normalized = normalizeText(input);
  const raw = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  return raw.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function uniqueTerms(tokens) {
  return [...new Set(tokens)];
}

function ngrams(tokens, n) {
  const grams = [];
  for (let i = 0; i + n <= tokens.length; i += 1) {
    grams.push(tokens.slice(i, i + n).join(' '));
  }
  return grams;
}

function getBodyText(result) {
  return result.text
    || result.metadata?.text
    || result.metadata?.summary
    || result.metadata?.title
    || result.id
    || '';
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Normalize the incoming (fused) scores against the top candidate. Dividing by
 * the max (rather than min-max) keeps near-tied scores near-equal — important
 * because RRF fusion produces a very compressed range, so a minuscule base-score
 * edge should not dominate the content signals below.
 */
function normalizeBaseScores(results) {
  const scores = results.map((r) => Number(r.score) || 0);
  const max = Math.max(...scores);
  return scores.map((score) => (max > 0 ? score / max : 0.5));
}

/** Query-term coverage + TF saturation of the body text. */
function lexicalScore(queryTerms, docTokens) {
  if (queryTerms.length === 0 || docTokens.length === 0) return 0;

  const counts = new Map();
  for (const token of docTokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  let matched = 0;
  let tfSat = 0;
  for (const term of queryTerms) {
    const tf = counts.get(term) || 0;
    if (tf > 0) {
      matched += 1;
      tfSat += tf / (tf + TF_K1);
    }
  }

  const coverage = matched / queryTerms.length;
  const saturation = tfSat / queryTerms.length;
  return clamp01(0.6 * coverage + 0.4 * saturation);
}

/** Exact full-phrase match, else fraction of query bigrams found in the body. */
function phraseScore(queryTokens, docText, docTokens) {
  if (queryTokens.length < 2) return 0;

  const phrase = queryTokens.join(' ');
  if (docText.includes(phrase)) return 1;

  const queryBigrams = ngrams(queryTokens, 2);
  if (queryBigrams.length === 0) return 0;

  const docBigrams = new Set(ngrams(docTokens, 2));
  const hits = queryBigrams.filter((gram) => docBigrams.has(gram)).length;
  return clamp01(hits / queryBigrams.length);
}

/** Weighted query-term coverage across high-value metadata fields. */
function fieldScore(queryTerms, metadata) {
  if (!metadata || queryTerms.length === 0) return 0;

  let weighted = 0;
  let weightSum = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const value = metadata[field];
    if (!value) continue;
    weightSum += weight;
    const fieldTokens = new Set(tokenize(value));
    if (fieldTokens.size === 0) continue;
    const matched = queryTerms.filter((term) => fieldTokens.has(term)).length;
    weighted += weight * (matched / queryTerms.length);
  }

  if (weightSum === 0) return 0;
  return clamp01(weighted / weightSum);
}

/** Does the candidate's type match the query intent? */
function intentAligned(intent, metadata) {
  const type = intent?.type;
  if (type === 'case') return metadata?.type === 'case' ? 1 : 0;
  if (type === 'document') return metadata?.type === 'document' ? 1 : 0;
  return 0; // hybrid / unknown — no directional boost
}

/**
 * Rerank fused retrieval candidates with a local hybrid lexical + structural
 * scorer. No external API. Drop-in replacement for the previous Jina call.
 *
 * @param {string} query
 * @param {Array} results - fused candidates ({ id, score, text, metadata })
 * @param {Object} [options] - { topK, enabled, intent, weights }
 * @returns {Array} top-K candidates with rerankScore/score set to the blend
 */
export function rerankResults(query, results, options = {}) {
  const topK = options.topK || 8;
  const enabled = options.enabled ?? process.env.ENABLE_RERANK === '1';
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const intent = options.intent;
  const timer = logger.timer('local', {
    enabled,
    candidates: results?.length || 0,
    topK,
  });

  if (!enabled || !results || results.length === 0) {
    timer.result({ action: 'skipped' });
    return (results || []).slice(0, topK);
  }

  const queryTokens = tokenize(query);
  const queryTerms = uniqueTerms(queryTokens);

  // With no usable query terms there's nothing to rerank on — preserve order.
  if (queryTerms.length === 0) {
    timer.result({ action: 'no-query-terms' });
    return results.slice(0, topK);
  }

  const normBase = normalizeBaseScores(results);

  const scored = results.map((result, index) => {
    const docText = normalizeText(getBodyText(result));
    const docTokens = tokenize(getBodyText(result));

    const lexical = lexicalScore(queryTerms, docTokens);
    const phrase = phraseScore(queryTokens, docText, docTokens);
    const field = fieldScore(queryTerms, result.metadata);
    const intentBoost = intentAligned(intent, result.metadata);

    const relevance = clamp01(
      weights.base * normBase[index]
      + weights.lexical * lexical
      + weights.phrase * phrase
      + weights.field * field
      + weights.intent * intentBoost,
    );

    return {
      ...result,
      rerankScore: relevance,
      score: relevance,
      _baseScore: Number(result.score) || 0,
    };
  });

  scored.sort((a, b) => (b.rerankScore - a.rerankScore) || (b._baseScore - a._baseScore));
  const reranked = scored.slice(0, topK);

  timer.result({ returned: reranked.length });
  return reranked;
}

export default {
  rerankResults,
};
