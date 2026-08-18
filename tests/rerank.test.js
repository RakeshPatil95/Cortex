import { describe, expect, it } from 'vitest';
import { rerankResults } from '@/services/retrieval/rerank.js';

describe('local hybrid reranker', () => {
  it('promotes the lexically relevant candidate above a higher base score', () => {
    const reranked = rerankResults('payment terms', [
      { id: 'a', text: 'general contract text', score: 0.5 },
      { id: 'b', text: 'unrelated cooking note', score: 0.4 },
      { id: 'c', text: 'payment terms and invoice payment schedule', score: 0.3 },
    ], {
      enabled: true,
      topK: 2,
    });

    expect(reranked.map((item) => item.id)).toEqual(['c', 'a']);
    expect(reranked).toHaveLength(2);
    // score is overwritten with the blended relevance in 0..1.
    expect(reranked[0].score).toBeGreaterThan(reranked[1].score);
    expect(reranked[0].rerankScore).toBeGreaterThan(0);
  });

  it('boosts a title/field match as a tie-breaker between equal candidates', () => {
    const body = 'the fraud allegations are detailed in this case file';
    const reranked = rerankResults('fraud case', [
      { id: 'plain', text: body, score: 0.5, metadata: { type: 'document' } },
      { id: 'titled', text: body, score: 0.5, metadata: { type: 'document', title: 'Criminal Fraud Case File' } },
    ], { enabled: true, topK: 2 });

    expect(reranked[0].id).toBe('titled');
  });

  it('uses intent to break ties toward the matching result type', () => {
    const base = [
      { id: 'doc', text: 'mohammad fraud', score: 0.5, metadata: { type: 'document' } },
      { id: 'case', text: 'mohammad fraud', score: 0.5, metadata: { type: 'case' } },
    ];

    const asCase = rerankResults('mohammad fraud', base, {
      enabled: true,
      topK: 2,
      intent: { type: 'case' },
    });
    expect(asCase[0].id).toBe('case');

    const asDoc = rerankResults('mohammad fraud', base, {
      enabled: true,
      topK: 2,
      intent: { type: 'document' },
    });
    expect(asDoc[0].id).toBe('doc');
  });

  it('matches across Arabic letter variants', () => {
    const reranked = rerankResults('محمد', [
      { id: 'x', text: 'قضية احتيال عامة', score: 0.6 },
      { id: 'y', text: 'المتهم مُحمّد الفارسي', score: 0.3 },
    ], { enabled: true, topK: 1 });

    expect(reranked[0].id).toBe('y');
  });

  it('returns the original topK when disabled', () => {
    const results = rerankResults('query', [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
    ], {
      enabled: false,
      topK: 1,
    });

    expect(results.map((item) => item.id)).toEqual(['a']);
  });

  it('preserves order when the query has no usable terms', () => {
    const results = rerankResults('the a of', [
      { id: 'a', text: 'one', score: 0.2 },
      { id: 'b', text: 'two', score: 0.9 },
    ], { enabled: true, topK: 2 });

    expect(results.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
