const DEBUG_RAG_VALUES = new Set(['1', 'true', 'yes', 'on', 'debug']);

function normalizeDebugValue(value) {
  return String(value || '').trim().toLowerCase();
}

export function isRagDebugEnabled(env = process.env) {
  return DEBUG_RAG_VALUES.has(normalizeDebugValue(env.DEBUG_RAG));
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(meta)}`;
}

function getErrorDetails(error) {
  if (!error) {
    return {};
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

/**
 * Always-on performance tracker for latency debugging. Unlike `timer` (gated by
 * DEBUG_RAG), a perf tracker always logs a per-request summary: total wall time
 * plus each step's duration and share, sorted slowest-first so it's obvious
 * which step dominates.
 */
export function createPerfTracker(label, options = {}) {
  const now = options.now || (() => Date.now());
  const consoleLike = options.console || console;
  const startedAt = now();
  const steps = [];

  // Time an async (or sync) step. The duration is recorded even if it throws.
  async function step(name, fn) {
    const stepStart = now();
    try {
      return await fn();
    } finally {
      steps.push({ name, ms: now() - stepStart });
    }
  }

  // Record a duration measured elsewhere.
  function mark(name, ms) {
    steps.push({ name, ms: Math.max(0, Math.round(ms)) });
  }

  // Log the breakdown. Returns the structured summary for callers that want it.
  function summary(meta = {}) {
    const totalMs = now() - startedAt;
    const tracked = steps.reduce((sum, entry) => sum + entry.ms, 0);
    const sorted = [...steps].sort((a, b) => b.ms - a.ms);

    consoleLike.log(`[perf] ${label} total=${totalMs}ms${formatMeta(meta)}`);
    for (const { name, ms } of sorted) {
      const pct = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
      consoleLike.log(`[perf]   ${name}: ${ms}ms (${pct}%)`);
    }

    const untracked = totalMs - tracked;
    if (untracked > 5 && steps.length > 0) {
      const pct = totalMs > 0 ? Math.round((untracked / totalMs) * 100) : 0;
      consoleLike.log(`[perf]   (untracked): ${untracked}ms (${pct}%)`);
    }

    return { label, totalMs, steps: sorted };
  }

  return { step, mark, summary };
}

export function createLogger(namespace, options = {}) {
  const now = options.now || (() => Date.now());
  const debugEnabled = options.debugEnabled || (() => isRagDebugEnabled());
  const consoleLike = options.console || console;
  const prefix = `[${namespace}]`;

  function debug(message, meta = {}) {
    if (!debugEnabled()) {
      return;
    }

    consoleLike.log(`${prefix} ${message}${formatMeta(meta)}`);
  }

  function error(message, err, meta = {}) {
    consoleLike.error(`${prefix} ${message}${formatMeta({
      ...meta,
      error: getErrorDetails(err),
    })}`);
  }

  function timer(step, meta = {}) {
    const startedAt = now();
    debug(`${step} start`, meta);

    return {
      result(resultMeta = {}) {
        const durationMs = now() - startedAt;
        debug(`${step} result`, {
          ...resultMeta,
          durationMs,
        });
      },
      error(err, errorMeta = {}) {
        const durationMs = now() - startedAt;
        error(`${step} error`, err, {
          ...errorMeta,
          durationMs,
        });
      },
    };
  }

  async function timed(step, meta, fn) {
    const stepTimer = timer(step, meta);

    try {
      const result = await fn();
      stepTimer.result();
      return result;
    } catch (err) {
      stepTimer.error(err);
      throw err;
    }
  }

  return {
    debug,
    error,
    timer,
    timed,
  };
}

export default createLogger;
