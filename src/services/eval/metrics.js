function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

export function normalizeSourceIds(sources = {}) {
  return {
    cases: unique(sources.cases || []),
    documents: unique(sources.documents || []),
  };
}

export function flattenSourceIds(sources = {}) {
  const normalized = normalizeSourceIds(sources);

  return [
    ...normalized.cases.map((id) => `case:${id}`),
    ...normalized.documents.map((id) => `document:${id}`),
  ];
}

export function recallAtK(expectedSources, retrievedSources, k = 10) {
  const expected = flattenSourceIds(expectedSources);
  if (expected.length === 0) {
    return 1;
  }

  const retrieved = new Set(flattenSourceIds(retrievedSources).slice(0, k));
  const hits = expected.filter((id) => retrieved.has(id)).length;

  return hits / expected.length;
}

export function precisionAtK(expectedSources, retrievedSources, k = 10) {
  const retrieved = flattenSourceIds(retrievedSources).slice(0, k);
  if (retrieved.length === 0) {
    return 0;
  }

  const expected = new Set(flattenSourceIds(expectedSources));
  const hits = retrieved.filter((id) => expected.has(id)).length;

  return hits / retrieved.length;
}

export function reciprocalRank(expectedSources, retrievedSources) {
  const expected = new Set(flattenSourceIds(expectedSources));
  const retrieved = flattenSourceIds(retrievedSources);

  if (expected.size === 0) {
    return 1;
  }

  const firstHitIndex = retrieved.findIndex((id) => expected.has(id));
  return firstHitIndex === -1 ? 0 : 1 / (firstHitIndex + 1);
}

export function average(values) {
  if (!values || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeEvalRows(rows = [], k = 10) {
  return {
    count: rows.length,
    recallAtK: average(rows.map((row) => row.metrics?.[`recall@${k}`] ?? 0)),
    precisionAtK: average(rows.map((row) => row.metrics?.[`precision@${k}`] ?? 0)),
    mrr: average(rows.map((row) => row.metrics?.mrr ?? 0)),
    answerCorrectness: average(rows.map((row) => row.answerCorrectness ?? 0)),
    errors: rows.filter((row) => row.error).length,
  };
}
