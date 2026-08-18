import { vi } from 'vitest';

export function mockFetchJson(responseBody, options = {}) {
  const {
    ok = true,
    status = ok ? 200 : 500,
    headers = { 'content-type': 'application/json' },
  } = options;

  const response = {
    ok,
    status,
    headers,
    json: vi.fn().mockResolvedValue(responseBody),
    text: vi.fn().mockResolvedValue(JSON.stringify(responseBody)),
  };

  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

export function mockFetchError(error) {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
}
