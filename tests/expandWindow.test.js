import { describe, expect, it, vi } from 'vitest';
import { mergeChunkWindow, expandDocumentWindows } from '@/services/retrieval/expandWindow.js';

describe('expanding-window context', () => {
  it('merges neighbor chunks around a matched document chunk without duplication', () => {
    const result = {
      id: 'doc-1-chunk-1',
      text: 'middle',
      metadata: {
        type: 'document',
        documentId: 'doc-1',
        chunkIndex: 1,
        text: 'middle',
      },
    };

    const expanded = mergeChunkWindow(result, [
      { documentId: 'doc-1', chunkIndex: 0, text: 'before' },
      { documentId: 'doc-1', chunkIndex: 1, text: 'middle' },
      { documentId: 'doc-1', chunkIndex: 1, text: 'middle duplicate' },
      { documentId: 'doc-1', chunkIndex: 2, text: 'after' },
    ]);

    expect(expanded.text).toBe('before\n\nmiddle\n\nafter');
    expect(expanded.metadata.windowChunkIndexes).toEqual([0, 1, 2]);
  });

  it('leaves the result unchanged when no neighbors are available', () => {
    const result = {
      id: 'doc-1-chunk-1',
      text: 'middle',
      metadata: {
        type: 'document',
        documentId: 'doc-1',
        chunkIndex: 1,
      },
    };

    expect(mergeChunkWindow(result, [])).toBe(result);
  });

  it('fetches all windows in a single batched query and buckets them per candidate', async () => {
    const rows = [
      { documentId: 'doc-1', chunkIndex: 0, text: 'c0' },
      { documentId: 'doc-1', chunkIndex: 1, text: 'c1' },
      { documentId: 'doc-1', chunkIndex: 2, text: 'c2' },
      { documentId: 'doc-1', chunkIndex: 4, text: 'c4' },
      { documentId: 'doc-1', chunkIndex: 5, text: 'c5' },
      { documentId: 'doc-1', chunkIndex: 6, text: 'c6' },
      { documentId: 'doc-2', chunkIndex: 0, text: 'd0' },
      { documentId: 'doc-2', chunkIndex: 1, text: 'd1' },
    ];
    const queryMock = vi.fn().mockResolvedValue(rows);
    const prisma = { $queryRawUnsafe: queryMock };

    const results = [
      { id: 'r1', metadata: { type: 'document', documentId: 'doc-1', chunkIndex: 1 } },
      { id: 'r2', metadata: { type: 'document', documentId: 'doc-1', chunkIndex: 5 } },
      { id: 'r3', metadata: { type: 'document', documentId: 'doc-2', chunkIndex: 0 } },
    ];

    const expanded = await expandDocumentWindows(prisma, results, { windowSize: 1 });

    // One query for all candidates, not one per candidate (no N+1).
    expect(queryMock).toHaveBeenCalledTimes(1);

    const byId = Object.fromEntries(expanded.map((r) => [r.id, r]));
    expect(byId.r1.text).toBe('c0\n\nc1\n\nc2');
    expect(byId.r2.text).toBe('c4\n\nc5\n\nc6');
    expect(byId.r3.text).toBe('d0\n\nd1');
  });
});
