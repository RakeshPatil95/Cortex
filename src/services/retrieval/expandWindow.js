import { createLogger } from '../logger.js';

const logger = createLogger('retrieval:window');

function isDocumentResult(result) {
  return result?.metadata?.type === 'document'
    && result.metadata.documentId
    && Number.isInteger(Number(result.metadata.chunkIndex));
}

export function mergeChunkWindow(result, neighborChunks = []) {
  const seen = new Set();
  const sortedNeighbors = [...neighborChunks]
    .sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
  const texts = [];
  const chunkIndexes = [];

  for (const chunk of sortedNeighbors) {
    const key = `${chunk.documentId}:${chunk.chunkIndex}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    if (chunk.text) {
      texts.push(chunk.text);
    }
    chunkIndexes.push(Number(chunk.chunkIndex));
  }

  if (texts.length === 0) {
    return result;
  }

  const mergedText = texts.join('\n\n');

  return {
    ...result,
    text: mergedText,
    metadata: {
      ...result.metadata,
      text: mergedText,
      windowChunkIndexes: chunkIndexes,
    },
  };
}

export async function expandDocumentWindows(prisma, results, options = {}) {
  const windowSize = options.windowSize ?? 1;
  const candidates = (results || []).filter(isDocumentResult);
  const timer = logger.timer('expand', {
    candidates: candidates.length,
    windowSize,
  });

  if (candidates.length === 0 || windowSize <= 0) {
    timer.result({ expanded: 0 });
    return results || [];
  }

  try {
    // Collect the neighbor windows every candidate needs, grouped per document,
    // then fetch them all in a single query instead of one query per candidate
    // (the old approach was an N+1 loop — very slow when many chunks share a
    // document). Windows for the same document are merged into one index range.
    const rangesByDocument = new Map();
    for (const result of candidates) {
      const documentId = result.metadata.documentId;
      const chunkIndex = Number(result.metadata.chunkIndex);
      const minIndex = Math.max(0, chunkIndex - windowSize);
      const maxIndex = chunkIndex + windowSize;

      const existing = rangesByDocument.get(documentId);
      if (existing) {
        existing.min = Math.min(existing.min, minIndex);
        existing.max = Math.max(existing.max, maxIndex);
      } else {
        rangesByDocument.set(documentId, { min: minIndex, max: maxIndex });
      }
    }

    // One parameterized OR-group query covering every document's needed range.
    const documentIds = [...rangesByDocument.keys()];
    const conditions = [];
    const params = [];
    documentIds.forEach((documentId) => {
      const { min, max } = rangesByDocument.get(documentId);
      const base = params.length;
      conditions.push(
        `("documentId" = $${base + 1} AND "chunkIndex" BETWEEN $${base + 2}::integer AND $${base + 3}::integer)`
      );
      params.push(documentId, min, max);
    });

    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT "documentId", "chunkIndex", "text"
        FROM "document_chunks"
        WHERE ${conditions.join(' OR ')}
        ORDER BY "documentId" ASC, "chunkIndex" ASC
      `,
      ...params
    );

    // Bucket fetched neighbors by document for O(1) lookup per candidate.
    const neighborsByDocument = new Map();
    for (const row of rows) {
      const bucket = neighborsByDocument.get(row.documentId);
      if (bucket) {
        bucket.push(row);
      } else {
        neighborsByDocument.set(row.documentId, [row]);
      }
    }

    const expandedById = new Map();
    for (const result of candidates) {
      const documentId = result.metadata.documentId;
      const chunkIndex = Number(result.metadata.chunkIndex);
      const minIndex = Math.max(0, chunkIndex - windowSize);
      const maxIndex = chunkIndex + windowSize;

      const neighbors = (neighborsByDocument.get(documentId) || [])
        .filter((row) => {
          const index = Number(row.chunkIndex);
          return index >= minIndex && index <= maxIndex;
        });

      expandedById.set(result.id, mergeChunkWindow(result, neighbors));
    }

    const expanded = results.map((result) => expandedById.get(result.id) || result);

    timer.result({
      expanded: expandedById.size,
      documents: documentIds.length,
    });

    return expanded;
  } catch (error) {
    timer.error(error);
    return results;
  }
}

export default {
  expandDocumentWindows,
  mergeChunkWindow,
};
