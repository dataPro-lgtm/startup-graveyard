import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../buildApp.js';

const ORIGINAL_ENV = { ...process.env };

function setCookieHeaders(response: { headers: Record<string, unknown> }): string[] {
  const value = response.headers['set-cookie'];
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function cookieRequestHeader(setCookies: string[]): string {
  return setCookies.map((value) => value.split(';', 1)[0]).join('; ');
}

describe('browser cookie authentication', () => {
  let app: FastifyInstance;
  let cookieHeader: string;
  let accessToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'cookie-auth-test-secret';
    process.env.WEB_BASE_URL = 'https://app.example.com';
    process.env.RATE_LIMIT_ENABLED = 'false';
    app = await buildApp({ logger: false });

    const registered = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'cookie-user@example.com', password: 'secure-password-123' },
    });
    expect(registered.statusCode).toBe(201);
    const setCookies = setCookieHeaders(registered);
    expect(setCookies).toHaveLength(2);
    expect(setCookies.every((value) => /HttpOnly/i.test(value))).toBe(true);
    expect(setCookies.every((value) => /SameSite=Lax/i.test(value))).toBe(true);
    cookieHeader = cookieRequestHeader(setCookies);
    accessToken = (registered.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('authenticates reads with the HttpOnly access cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: 'cookie-user@example.com' });
  });

  it('does not expose bearer credentials to browser-origin responses', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'https://app.example.com' },
      payload: { email: 'cookie-user@example.com', password: 'secure-password-123' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('accessToken');
    expect(response.json()).not.toHaveProperty('refreshToken');
    cookieHeader = cookieRequestHeader(setCookieHeaders(response));
  });

  it('rejects cookie-authenticated mutations without a trusted origin', async () => {
    const missingOrigin = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: { cookie: cookieHeader },
      payload: { caseId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(missingOrigin.statusCode).toBe(403);
    expect(missingOrigin.json()).toEqual({ error: 'invalid_request_origin' });

    const untrustedOrigin = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: { cookie: cookieHeader, origin: 'https://attacker.example' },
      payload: { caseId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(untrustedOrigin.statusCode).toBe(403);
  });

  it('allows trusted browser origins and valid bearer clients', async () => {
    const cookieRequest = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: { cookie: cookieHeader, origin: 'https://app.example.com' },
      payload: { caseId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(cookieRequest.json()).not.toMatchObject({ error: 'invalid_request_origin' });

    const bearerRequest = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: { authorization: `Bearer ${accessToken}`, cookie: cookieHeader },
      payload: { caseId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(bearerRequest.json()).not.toMatchObject({ error: 'invalid_request_origin' });
  });

  it('rotates the session using only the refresh cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: cookieHeader, origin: 'https://app.example.com' },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const rotatedCookies = setCookieHeaders(response);
    expect(rotatedCookies).toHaveLength(2);
    cookieHeader = cookieRequestHeader(rotatedCookies);
  });

  it('clears cookies and revokes the server refresh session on logout', async () => {
    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: cookieHeader, origin: 'https://app.example.com' },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(setCookieHeaders(logout).every((value) => /Max-Age=0/i.test(value))).toBe(true);

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: cookieHeader, origin: 'https://app.example.com' },
      payload: {},
    });
    expect(replay.statusCode).toBe(401);
  });
});
