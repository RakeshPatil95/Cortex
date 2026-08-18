import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from '@/services/retrieval/hybridSearch.js';

describe('hybrid retrieval helpers', () => {
  it('uses reciprocal rank fusion to combine lexical and vector rankings', () => {
    const fused = reciprocalRankFusion([
      [
        { id: 'a', source: 'vector' },
        { id: 'b', source: 'vector' },
        { id: 'c', source: 'vector' },
      ],
      [
        { id: 'b', source: 'bm25' },
        { id: 'a', source: 'bm25' },
        { id: 'd', source: 'bm25' },
      ],
    ]);

    expect(fused.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(fused[0].fusionScore).toBeGreaterThan(fused[2].fusionScore);
  });

  it('allows custom IDs for heterogeneous result types', () => {
    const fused = reciprocalRankFusion([
      [{ id: '1', type: 'document' }],
      [{ id: '1', type: 'case' }],
    ], {
      getId: (item) => `${item.type}:${item.id}`,
    });

    expect(fused).toHaveLength(2);
  });
});
