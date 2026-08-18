import { describe, expect, it, vi } from 'vitest';
import { createLogger, isRagDebugEnabled } from '@/services/logger.js';

describe('RAG step logger', () => {
  it('detects DEBUG_RAG truthy values', () => {
    expect(isRagDebugEnabled({ DEBUG_RAG: '1' })).toBe(true);
    expect(isRagDebugEnabled({ DEBUG_RAG: 'true' })).toBe(true);
    expect(isRagDebugEnabled({ DEBUG_RAG: 'off' })).toBe(false);
    expect(isRagDebugEnabled({})).toBe(false);
  });

  it('stays silent for debug logs when DEBUG_RAG is off', () => {
    const consoleLike = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const logger = createLogger('firecrawl', {
      console: consoleLike,
      debugEnabled: () => false,
    });

    logger.debug('parse start', { bytes: 482000 });

    expect(consoleLike.log).not.toHaveBeenCalled();
    expect(consoleLike.error).not.toHaveBeenCalled();
  });

  it('emits namespaced timing logs when DEBUG_RAG is on', () => {
    const consoleLike = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(145);
    const logger = createLogger('chunking', {
      console: consoleLike,
      debugEnabled: () => true,
      now,
    });

    const timer = logger.timer('heading-adaptive', { chars: 6214 });
    timer.result({ chunks: 9 });

    expect(consoleLike.log).toHaveBeenNthCalledWith(
      1,
      '[chunking] heading-adaptive start {"chars":6214}'
    );
    expect(consoleLike.log).toHaveBeenNthCalledWith(
      2,
      '[chunking] heading-adaptive result {"chunks":9,"durationMs":45}'
    );
  });

  it('always emits error logs', () => {
    const consoleLike = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const logger = createLogger('pgvector', {
      console: consoleLike,
      debugEnabled: () => false,
      now: () => 10,
    });

    logger.error('upsert error', new Error('database unavailable'), { chunks: 9 });

    expect(consoleLike.log).not.toHaveBeenCalled();
    expect(consoleLike.error).toHaveBeenCalledWith(
      '[pgvector] upsert error {"chunks":9,"error":{"name":"Error","message":"database unavailable"}}'
    );
  });
});
