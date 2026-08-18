/**
 * Centralized OpenAI model configuration for the chat pipeline.
 *
 * NOTE: verify these IDs match the exact model names available on your OpenAI
 * account and adjust here if they differ — every chat call reads from this file.
 *
 * - Query understanding (intent analysis + query transforms) uses a fast, cheap
 *   mini model at minimal reasoning effort: these are classification/rewrite
 *   tasks that don't need deep reasoning, and latency matters most here.
 * - Response generation (conversational answer, suggestions, clarification)
 *   uses the full model at normal reasoning effort for quality.
 */

export const QUERY_UNDERSTANDING_MODEL = 'gpt-5.4-mini';
// gpt-5.4-mini supports: 'none', 'low', 'medium', 'high', 'xhigh' (NOT 'minimal').
// 'low' is the fastest reasoning tier this model accepts.
export const QUERY_UNDERSTANDING_REASONING_EFFORT = 'low';

export const RESPONSE_MODEL = 'gpt-5.5';

export default {
  QUERY_UNDERSTANDING_MODEL,
  QUERY_UNDERSTANDING_REASONING_EFFORT,
  RESPONSE_MODEL,
};
