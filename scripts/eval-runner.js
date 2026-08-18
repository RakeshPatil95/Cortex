import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@/generated/prisma';
import { createLogger } from '@/services/logger.js';
import {
  precisionAtK,
  recallAtK,
  reciprocalRank,
  summarizeEvalRows,
} from '@/services/eval/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const logger = createLogger('eval');
const DEFAULT_K = Number.parseInt(process.env.EVAL_K || '8', 10);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function resolveUserId() {
  if (process.env.EVAL_USER_ID) {
    return process.env.EVAL_USER_ID;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        email: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    if (user?.id) {
      return user.id;
    }
  } catch (error) {
    logger.error('resolve-user error', error);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  return 'eval-user-without-db-row';
}

function getCaseIds(cases = []) {
  return cases.flatMap((caseResult) => {
    const ids = [
      caseResult.serialNumber,
      caseResult.caseNumber,
      caseResult.caseCategory,
      caseResult.caseSubType,
      caseResult.status,
      caseResult.priority,
      caseResult.assignedTo,
      caseResult.id,
    ];

    if (typeof caseResult.parties === 'string') {
      ids.push(caseResult.parties);
    }

    if (Array.isArray(caseResult.parties)) {
      ids.push(...caseResult.parties.map((party) => party.name || party.role));
    }

    return ids.filter(Boolean).map(String);
  });
}

function getDocumentIds(documents = []) {
  return documents.flatMap((documentResult) => [
    documentResult.documentId,
    documentResult.uniqueDocumentId,
    documentResult.title,
    documentResult.originalName,
    documentResult.fileName,
    documentResult.documentType,
    ...(documentResult.tags || []),
  ].filter(Boolean).map(String));
}

function extractRetrievedSources(response) {
  const results = response?.results || {};

  return {
    cases: getCaseIds(results.cases || []),
    documents: getDocumentIds(results.documents || []),
  };
}

function heuristicAnswerCorrectness(answer, rubric) {
  if (!answer || !rubric) {
    return 0;
  }

  const answerTerms = new Set(
    String(answer).toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((term) => term.length > 3)
  );
  const rubricTerms = String(rubric)
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((term) => term.length > 3);

  if (rubricTerms.length === 0) {
    return 0;
  }

  const hits = rubricTerms.filter((term) => answerTerms.has(term)).length;
  return Math.min(1, hits / Math.min(rubricTerms.length, 8));
}

function formatScore(value) {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

async function preflightOpenAI() {
  if (process.env.EVAL_FORCE_LIVE === '1') {
    return { ok: true, skipped: true };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: 'OPENAI_API_KEY is not configured.',
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: 'cortex eval preflight',
        dimensions: 512,
      }),
    });

    if (response.ok) {
      return { ok: true };
    }

    const body = await response.json().catch(() => ({}));
    const code = body?.error?.code || body?.error?.type || response.status;

    return {
      ok: false,
      reason: `OpenAI preflight failed (${code}): ${body?.error?.message || response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `OpenAI preflight failed: ${error.message}`,
    };
  }
}

function createSkippedRows(goldenCases, reason, k) {
  return goldenCases.map((goldenCase) => ({
    id: goldenCase.id,
    query: goldenCase.query,
    expected: goldenCase.expected,
    retrieved: {
      cases: [],
      documents: [],
    },
    metrics: {
      [`recall@${k}`]: recallAtK(goldenCase.expected, {}, k),
      [`precision@${k}`]: precisionAtK(goldenCase.expected, {}, k),
      mrr: reciprocalRank(goldenCase.expected, {}),
    },
    answerCorrectness: 0,
    error: reason,
  }));
}

function writeReports({ rows, summary, report, blockedReason = '' }) {
  fs.writeFileSync(path.join(rootDir, 'docs', 'eval-baseline.md'), report);
  fs.writeFileSync(
    path.join(rootDir, 'docs', 'eval-baseline.json'),
    `${JSON.stringify({ summary, rows, blockedReason }, null, 2)}\n`
  );
}

function buildMarkdownReport({ rows, summary, k, userId, startedAt, finishedAt, blockedReason = '' }) {
  const lines = [
    '# Cortex RAG Eval Baseline',
    '',
    `Generated: ${finishedAt.toISOString()}`,
    `Started: ${startedAt.toISOString()}`,
    `User ID: \`${userId}\``,
    `Top K: ${k}`,
    '',
    '## Summary',
    '',
    `- Questions: ${summary.count}`,
    `- Recall@${k}: ${formatScore(summary.recallAtK)}`,
    `- Precision@${k}: ${formatScore(summary.precisionAtK)}`,
    `- MRR: ${formatScore(summary.mrr)}`,
    `- Answer correctness: ${formatScore(summary.answerCorrectness)}`,
    `- Errors: ${summary.errors}`,
    '',
  ];

  if (blockedReason) {
    lines.push('## Blocker');
    lines.push('');
    lines.push(blockedReason);
    lines.push('');
  }

  lines.push(
    '## Rows',
    '',
    '| ID | Recall | Precision | MRR | Answer | Error |',
    '|---|---:|---:|---:|---:|---|',
  );

  for (const row of rows) {
    lines.push([
      row.id,
      formatScore(row.metrics[`recall@${k}`]),
      formatScore(row.metrics[`precision@${k}`]),
      formatScore(row.metrics.mrr),
      formatScore(row.answerCorrectness),
      row.error ? row.error.replace(/\|/g, '/') : '',
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This report exercises the current chat pipeline and records the retrieval backend state at the time of the run.');
  lines.push('- Answer correctness currently uses a deterministic rubric-term heuristic so the eval runner itself does not add extra LLM calls. Retrieval still goes through the live chat pipeline.');
  lines.push('- Generic expected IDs in the golden set are intentionally document/case-level labels, not chunk IDs, so the set survives future re-chunking.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  loadEnvFile(path.join(rootDir, '.env'));

  const startedAt = new Date();
  const evalTimer = logger.timer('baseline', { k: DEFAULT_K });
  const goldenPath = path.join(rootDir, 'tests', 'golden', 'cases.json');
  const goldenCases = readJson(goldenPath);
  const userId = await resolveUserId();
  const openaiPreflight = await preflightOpenAI();

  if (!openaiPreflight.ok) {
    const rows = createSkippedRows(goldenCases, openaiPreflight.reason, DEFAULT_K);
    const summary = summarizeEvalRows(rows, DEFAULT_K);
    const finishedAt = new Date();
    const report = buildMarkdownReport({
      rows,
      summary,
      k: DEFAULT_K,
      userId,
      startedAt,
      finishedAt,
      blockedReason: openaiPreflight.reason,
    });

    writeReports({
      rows,
      summary,
      report,
      blockedReason: openaiPreflight.reason,
    });
    evalTimer.result({
      questions: rows.length,
      errors: summary.errors,
      blocked: true,
    });
    console.log(report);
    return;
  }

  let processChatMessage;
  try {
    ({ processChatMessage } = await import('@/services/chat/index.js'));
  } catch (error) {
    logger.error('load-chat error', error);
  }

  const rows = [];

  for (const goldenCase of goldenCases) {
    const rowTimer = logger.timer('case', {
      id: goldenCase.id,
      locale: goldenCase.locale,
    });
    let response = null;
    let errorMessage = '';

    try {
      if (!processChatMessage) {
        throw new Error('processChatMessage could not be loaded');
      }

      response = await processChatMessage(
        goldenCase.query,
        userId,
        goldenCase.history || [],
        goldenCase.filters || {}
      );
      rowTimer.result({
        cases: response?.results?.cases?.length || 0,
        documents: response?.results?.documents?.length || 0,
      });
    } catch (error) {
      errorMessage = error.message;
      rowTimer.error(error);
    }

    const retrieved = extractRetrievedSources(response);
    rows.push({
      id: goldenCase.id,
      query: goldenCase.query,
      expected: goldenCase.expected,
      retrieved,
      metrics: {
        [`recall@${DEFAULT_K}`]: recallAtK(goldenCase.expected, retrieved, DEFAULT_K),
        [`precision@${DEFAULT_K}`]: precisionAtK(goldenCase.expected, retrieved, DEFAULT_K),
        mrr: reciprocalRank(goldenCase.expected, retrieved),
      },
      answerCorrectness: heuristicAnswerCorrectness(response?.message || '', goldenCase.rubric),
      error: errorMessage,
    });
  }

  const summary = summarizeEvalRows(rows, DEFAULT_K);
  const finishedAt = new Date();
  const report = buildMarkdownReport({
    rows,
    summary,
    k: DEFAULT_K,
    userId,
    startedAt,
    finishedAt,
  });

  writeReports({ rows, summary, report });

  evalTimer.result({
    questions: rows.length,
    errors: summary.errors,
    recallAtK: summary.recallAtK,
    precisionAtK: summary.precisionAtK,
  });

  console.log(report);
}

main().catch((error) => {
  logger.error('baseline error', error);
  process.exitCode = 1;
});
