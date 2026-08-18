import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

const SECRET = 'test-secret-for-middleware-cookie-name';
const PROD_HOST = 'cortex-teal-eight.vercel.app';

/**
 * Regression test for the Vercel login loop: the /api/auth handler ignores
 * NEXTAUTH_URL when process.env.VERCEL is set and issues the session cookie as
 * __Secure-next-auth.session-token, while middleware's getToken picked the cookie
 * name from NEXTAUTH_URL. With NEXTAUTH_URL=http://localhost:3000 the two names
 * disagreed, so a valid session looked absent and /dashboard bounced to login.
 */
function httpsRequest(pathname, cookieName, token) {
  const req = new NextRequest(`https://${PROD_HOST}${pathname}`, {
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': PROD_HOST,
      'accept-language': 'en-US,en;q=0.9',
      cookie: `${cookieName}=${token}`,
    },
  });
  return req;
}

describe('middleware auth on a Vercel-style https request', () => {
  let middleware;
  let sessionToken;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    // Reproduce the deployed environment: VERCEL set, NEXTAUTH_URL still pointing
    // at localhost (the misconfiguration that triggered the loop).
    process.env.VERCEL = '1';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.NEXTAUTH_SECRET = SECRET;

    sessionToken = await encode({
      token: { email: 'admin@example.com', id: '1' },
      secret: SECRET,
    });

    ({ middleware } = await import('../middleware.js'));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows /en/dashboard through when the secure session cookie is present', async () => {
    const res = await middleware(
      httpsRequest('/en/dashboard', '__Secure-next-auth.session-token', sessionToken)
    );

    // withAuth returns undefined (i.e. "continue") when authorized.
    const location = res?.headers?.get('location');
    expect(location ?? null).toBeNull();
  });

  it('redirects /en/dashboard to the localized login page when no session cookie exists', async () => {
    const res = await middleware(
      httpsRequest('/en/dashboard', 'unrelated-cookie', 'nope')
    );

    const location = res?.headers?.get('location');
    expect(location).toBeTruthy();
    expect(new URL(location).pathname).toBe('/en/auth/login');
  });
});
