import { createLogger } from '../logger.js';

const vectorLogger = createLogger('retrieval:vector');
const bm25Logger = createLogger('retrieval:bm25');
const hybridLogger = createLogger('retrieval');

export function reciprocalRankFusion(resultGroups, options = {}) {
  const rankConstant = options.rankConstant ?? 60;
  const getId = options.getId || ((item) => item.id);
  const fused = new Map();

  for (const group of resultGroups) {
    group.forEach((item, index) => {
      const id = getId(item);
      const rankScore = 1 / (rankConstant + index + 1);
      const existing = fused.get(id);

      if (existing) {
        existing.fusionScore += rankScore;
      } else {
        fused.set(id, {
          item,
          fusionScore: rankScore,
        });
      }
    });
  }

  return [...fused.values()]
    .sort((a, b) => b.fusionScore - a.fusionScore)
    .map(({ item, fusionScore }) => ({
      ...item,
      fusionScore,
    }));
}

function withFusionKey(type, row) {
  return {
    ...row,
    resultType: type,
    fusionKey: `${type}:${row.id}`,
  };
}

export async function hybridSearchPgvector({
  prisma,
  query,
  queryVector,
  topK,
  userId = null,
  caseId = null,
  documentId = null,
  type = 'all',
}) {
  const timer = hybridLogger.timer('hybrid', {
    topK,
    type,
    hasUserFilter: Boolean(userId),
    hasCaseFilter: Boolean(caseId),
    hasDocumentFilter: Boolean(documentId),
  });
  const searchLimit = Math.max(topK * 3, topK);
  const shouldSearchChunks = type !== 'case';
  const shouldSearchCases = type !== 'document' && !caseId && !documentId;
  let vectorChunks = [];
  let vectorCases = [];
  let lexicalChunks = [];
  let lexicalCases = [];

  if (shouldSearchChunks) {
    const vectorTimer = vectorLogger.timer('match chunks', {
      topK: searchLimit,
      hasUserFilter: Boolean(userId),
      hasCaseFilter: Boolean(caseId),
    });

    vectorChunks = await prisma.$queryRawUnsafe(
      'SELECT * FROM match_chunks($1::vector, $2::integer, $3::text, $4::text)',
      queryVector,
      searchLimit,
      userId,
      caseId
    );

    if (documentId) {
      vectorChunks = vectorChunks.filter((row) => row.documentId === documentId);
    }

    vectorTimer.result({ matches: vectorChunks.length });

    const lexicalTimer = bm25Logger.timer('match chunks', {
      topK: searchLimit,
      hasUserFilter: Boolean(userId),
      hasCaseFilter: Boolean(caseId),
      hasDocumentFilter: Boolean(documentId),
    });

    lexicalChunks = await prisma.$queryRawUnsafe(
      `
        SELECT
          dc."id",
          dc."documentId",
          dc."caseId",
          dc."userId",
          dc."chunkIndex",
          dc."text",
          dc."heading",
          dc."sectionPath",
          ts_rank(dc."search_vector", plainto_tsquery('simple', $1))::double precision AS similarity
        FROM "document_chunks" dc
        WHERE dc."search_vector" @@ plainto_tsquery('simple', $1)
          AND ($2::text IS NULL OR dc."userId" = $2::text)
          AND ($3::text IS NULL OR dc."caseId" = $3::text)
          AND ($4::text IS NULL OR dc."documentId" = $4::text)
        ORDER BY similarity DESC
        LIMIT $5::integer
      `,
      query,
      userId,
      caseId,
      documentId,
      searchLimit
    );

    lexicalTimer.result({ matches: lexicalChunks.length });
  }

  if (shouldSearchCases) {
    const vectorTimer = vectorLogger.timer('match cases', {
      topK: searchLimit,
      hasUserFilter: Boolean(userId),
    });

    vectorCases = await prisma.$queryRawUnsafe(
      'SELECT * FROM match_cases($1::vector, $2::integer, $3::text)',
      queryVector,
      searchLimit,
      userId
    );

    vectorTimer.result({ matches: vectorCases.length });

    const lexicalTimer = bm25Logger.timer('match cases', {
      topK: searchLimit,
      hasUserFilter: Boolean(userId),
    });

    lexicalCases = await prisma.$queryRawUnsafe(
      `
        SELECT
          cv."id",
          cv."caseId",
          cv."userId",
          cv."serialNumber",
          cv."caseNumber",
          cv."caseCategory",
          cv."caseSubType",
          cv."currentStage",
          cv."status",
          cv."priority",
          cv."assignedTo",
          cv."parties",
          cv."summary",
          ts_rank(cv."search_vector", plainto_tsquery('simple', $1))::double precision AS similarity
        FROM "case_vectors" cv
        WHERE cv."search_vector" @@ plainto_tsquery('simple', $1)
          AND ($2::text IS NULL OR cv."userId" = $2::text)
        ORDER BY similarity DESC
        LIMIT $3::integer
      `,
      query,
      userId,
      searchLimit
    );

    lexicalTimer.result({ matches: lexicalCases.length });
  }

  const fused = reciprocalRankFusion([
    vectorChunks.map((row) => withFusionKey('document', row)),
    lexicalChunks.map((row) => withFusionKey('document', row)),
    vectorCases.map((row) => withFusionKey('case', row)),
    lexicalCases.map((row) => withFusionKey('case', row)),
  ], {
    getId: (item) => item.fusionKey,
  }).slice(0, topK);

  const chunkRows = fused
    .filter((row) => row.resultType === 'document')
    .map((row) => ({
      ...row,
      similarity: row.fusionScore,
    }));
  const caseRows = fused
    .filter((row) => row.resultType === 'case')
    .map((row) => ({
      ...row,
      similarity: row.fusionScore,
    }));

  timer.result({
    vector: vectorChunks.length + vectorCases.length,
    bm25: lexicalChunks.length + lexicalCases.length,
    fused: fused.length,
  });

  return {
    chunkRows,
    caseRows,
    stats: {
      vector: vectorChunks.length + vectorCases.length,
      bm25: lexicalChunks.length + lexicalCases.length,
      fused: fused.length,
    },
  };
}

export default {
  hybridSearchPgvector,
  reciprocalRankFusion,
};
