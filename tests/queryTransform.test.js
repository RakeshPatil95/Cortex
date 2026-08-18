import { describe, expect, it, vi } from 'vitest';
import {
  applyQueryTransforms,
  decompose,
  hyde,
  selectQueryTransformPlan,
} from '@/services/retrieval/queryTransform.js';

describe('query transforms', () => {
  it('generates a HyDE hypothetical document with a mocked LLM', async () => {
    const llm = {
      invoke: vi.fn().mockResolvedValue({
        content: 'A legal document discussing contract payment terms.',
      }),
    };

    await expect(hyde('contract payment terms', { llm }))
      .resolves.toBe('A legal document discussing contract payment terms.');
  });

  it('decomposes a multi-part query with a mocked LLM', async () => {
    const llm = {
      invoke: vi.fn().mockResolvedValue({
        content: '["fraud cases", "evidence documents"]',
      }),
    };

    await expect(decompose('fraud cases with evidence documents', { llm }))
      .resolves.toEqual(['fraud cases', 'evidence documents']);
  });

  it('skips expensive transforms for exact case lookups', () => {
    const plan = selectQueryTransformPlan('Show CASE-2024-001', {
      type: 'case',
      parameters: {
        needsExactMatch: true,
      },
    }, {
      hyde: true,
      decomposition: true,
      rerank: true,
    });

    expect(plan).toMatchObject({
      useHyde: false,
      useDecomposition: false,
      useRerank: true,
      exactLookup: true,
    });
  });

  it('treats slash-formatted case numbers as exact lookups', () => {
    const plan = selectQueryTransformPlan('give details of 2024/11001', {
      type: 'hybrid',
      parameters: {},
    }, {
      hyde: true,
      decomposition: true,
      rerank: true,
    });

    expect(plan).toMatchObject({
      useHyde: false,
      useDecomposition: false,
      exactLookup: true,
    });
  });

  it('applies HyDE and decomposition when enabled for complex semantic queries', async () => {
    const llm = {
      invoke: vi.fn()
        .mockResolvedValueOnce({ content: '["fraud cases", "evidence documents"]' })
        .mockResolvedValueOnce({ content: 'Hypothetical fraud evidence passage.' }),
    };

    const result = await applyQueryTransforms('fraud cases with evidence documents', {
      type: 'hybrid',
      parameters: {},
    }, {
      llm,
      flags: {
        hyde: true,
        decomposition: true,
        rerank: true,
      },
    });

    expect(result.subqueries).toEqual(['fraud cases', 'evidence documents']);
    expect(result.hypotheticalDocument).toBe('Hypothetical fraud evidence passage.');
    expect(result.retrievalQuery).toContain('fraud cases');
    expect(result.retrievalQuery).toContain('Hypothetical fraud evidence passage.');
    expect(result.plan.useRerank).toBe(true);
  });
});
