import { describe, expect, it } from 'vitest';
import {
  precisionAtK,
  recallAtK,
  reciprocalRank,
  summarizeEvalRows,
} from '@/services/eval/metrics.js';

describe('eval metrics', () => {
  it('computes recall and precision across cases and documents', () => {
    const expected = {
      cases: ['CASE-2024-001'],
      documents: ['DOC-001'],
    };
    const retrieved = {
      cases: ['CASE-2024-001', 'CASE-2024-999'],
      documents: ['DOC-404'],
    };

    expect(recallAtK(expected, retrieved, 3)).toBe(0.5);
    expect(precisionAtK(expected, retrieved, 3)).toBe(1 / 3);
  });

  it('computes reciprocal rank from the first relevant result', () => {
    const expected = {
      cases: ['CASE-2024-001'],
    };
    const retrieved = {
      cases: ['CASE-2024-999', 'CASE-2024-001'],
    };

    expect(reciprocalRank(expected, retrieved)).toBe(0.5);
  });

  it('summarizes eval rows', () => {
    const summary = summarizeEvalRows([
      {
        metrics: { 'recall@5': 1, 'precision@5': 0.5, mrr: 1 },
        answerCorrectness: 0.8,
      },
      {
        metrics: { 'recall@5': 0, 'precision@5': 0, mrr: 0 },
        answerCorrectness: 0.2,
        error: 'failed',
      },
    ], 5);

    expect(summary).toEqual({
      count: 2,
      recallAtK: 0.5,
      precisionAtK: 0.25,
      mrr: 0.5,
      answerCorrectness: 0.5,
      errors: 1,
    });
  });
});
