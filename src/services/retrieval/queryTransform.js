import { ChatOpenAI } from '@langchain/openai';
import { createLogger } from '../logger.js';
import { QUERY_UNDERSTANDING_MODEL, QUERY_UNDERSTANDING_REASONING_EFFORT } from '@/config/models';

const logger = createLogger('query');
const hydeLogger = createLogger('hyde');
const CASE_ID_PATTERN = /(CASE-\d{4}-\d{3}|CASE-\d{3}|CASE\d+|\b\d{4}-\d{3}\b|\b\d{1,10}\/\d{1,10}\b)/i;

function getFlag(name) {
  return process.env[name] === '1' || process.env[name] === 'true';
}

function getDefaultLlm() {
  return new ChatOpenAI({
    modelName: QUERY_UNDERSTANDING_MODEL,
    reasoningEffort: QUERY_UNDERSTANDING_REASONING_EFFORT,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
}

function getContent(response) {
  return typeof response === 'string' ? response : response?.content || '';
}

export function selectQueryTransformPlan(query, intent = {}, flags = {}) {
  const explicitFlags = {
    hyde: flags.hyde ?? getFlag('ENABLE_HYDE'),
    decomposition: flags.decomposition ?? getFlag('ENABLE_QUERY_DECOMPOSITION'),
    rerank: flags.rerank ?? getFlag('ENABLE_RERANK'),
  };
  const exactLookup = Boolean(
    intent.parameters?.needsExactMatch
    || CASE_ID_PATTERN.test(query)
  );
  const complexQuery = /\b(and|with|plus|including|also|as well as)\b/i.test(query)
    || query.split(/[?،,]/).filter(Boolean).length > 1
    || intent.type === 'hybrid';

  return {
    useHyde: explicitFlags.hyde && !exactLookup && intent.type !== 'case',
    useDecomposition: explicitFlags.decomposition && !exactLookup && complexQuery,
    useRerank: explicitFlags.rerank,
    exactLookup,
    complexQuery,
  };
}

export async function hyde(query, options = {}) {
  const llm = options.llm || getDefaultLlm();
  const timer = hydeLogger.timer('generate', {
    chars: query.length,
  });

  try {
    const response = await llm.invoke(`Write a concise hypothetical legal document passage that would answer this search query. Do not include citations.\n\nQuery: ${query}`);
    const content = getContent(response).trim();
    timer.result({ chars: content.length });
    return content;
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

export async function decompose(query, options = {}) {
  const llm = options.llm || getDefaultLlm();
  const timer = logger.timer('decompose', {
    chars: query.length,
  });

  try {
    const response = await llm.invoke(`Split this legal search query into 2-4 focused subqueries. Return only a JSON array of strings.\n\nQuery: ${query}`);
    const content = getContent(response).trim();
    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = content
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean);
    }

    const subqueries = Array.isArray(parsed)
      ? parsed.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4)
      : [];

    timer.result({ subqueries: subqueries.length });
    return subqueries.length > 0 ? subqueries : [query];
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

export async function applyQueryTransforms(query, intent = {}, options = {}) {
  const plan = selectQueryTransformPlan(query, intent, options.flags || {});
  const timer = logger.timer('transform', {
    intent: intent.type,
    hyde: plan.useHyde,
    decompose: plan.useDecomposition,
    rerank: plan.useRerank,
  });
  const llm = options.llm;
  let subqueries = [query];
  let hypotheticalDocument = '';

  try {
    if (plan.useDecomposition) {
      subqueries = await decompose(query, { llm });
    }

    if (plan.useHyde) {
      hypotheticalDocument = await hyde(query, { llm });
    }

    const retrievalQuery = [
      ...subqueries,
      hypotheticalDocument,
    ].filter(Boolean).join('\n');

    timer.result({
      subqueries: subqueries.length,
      hydeChars: hypotheticalDocument.length,
    });

    return {
      plan,
      subqueries,
      hypotheticalDocument,
      retrievalQuery: retrievalQuery || query,
    };
  } catch (error) {
    timer.error(error);
    return {
      plan: {
        ...plan,
        useHyde: false,
        useDecomposition: false,
      },
      subqueries: [query],
      hypotheticalDocument: '',
      retrievalQuery: query,
      error: error.message,
    };
  }
}

export default {
  applyQueryTransforms,
  decompose,
  hyde,
  selectQueryTransformPlan,
};
