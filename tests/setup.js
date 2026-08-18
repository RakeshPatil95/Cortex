import { afterEach, vi } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (process.env.TEST_DIRECT_URL) {
  process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
