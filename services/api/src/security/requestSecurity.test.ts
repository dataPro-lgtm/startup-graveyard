import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../buildApp.js';

const ORIGINAL_ENV = { ...process.env };

describe('request security baseline', () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'request-security-test-secret';
    process.env.WEB_BASE_URL = 'https://app.example.com';
    process.env.CORS_ALLOWED_ORIGINS = 'https://research.example.com';
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_AUTH_MAX = '2';
    process.env.RATE_LIMIT_AUTH_REFRESH_MAX = '1';
    process.env.RATE_LIMIT_COPILOT_MAX = '1';
    process.env.RATE_LIMIT_EXPORT_MAX = '1';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';

    app = await buildApp({ logger: false });
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'security@example.com',
        password: 'correct-horse-battery-staple',
      },
    });
    expect(registered.statusCode).toBe(201);
    accessToken = (registered.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('returns CORS headers only for exact allowed origins', async () => {
    const primary = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.example.com' },
    });
    expect(primary.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(primary.headers['access-control-allow-credentials']).toBe('true');

    const additional = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://research.example.com' },
    });
    expect(additional.headers['access-control-allow-origin']).toBe('https://research.example.com');

    const rejected = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://attacker.example' },
    });
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('limits login attempts per client IP', async () => {
    const firstLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'missing@example.com', password: 'invalid-password' },
    });
    expect(firstLogin.statusCode).toBe(401);
    expect(firstLogin.headers['x-ratelimit-limit']).toBe('2');
    expect(firstLogin.headers['x-ratelimit-remaining']).toBe('1');

    const secondLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'missing@example.com', password: 'invalid-password' },
    });
    expect(secondLogin.statusCode).toBe(401);
    expect(secondLogin.headers['x-ratelimit-remaining']).toBe('0');

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'missing@example.com', password: 'invalid-password' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.json()).toMatchObject({ error: 'rate_limit_exceeded' });
  });

  it('applies an independent refresh budget', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'invalid-refresh-token-that-is-long-enough' },
    });
    expect(invalid.statusCode).toBe(401);

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'another-invalid-refresh-token-value' },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('limits expensive Copilot answers by client IP', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/copilot/answer',
      payload: {
        visitorId: 'security-visitor',
        question: 'Why did Airlift fail?',
        topK: 1,
      },
    });
    expect(first.statusCode).toBe(200);

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/copilot/answer',
      payload: {
        visitorId: 'security-visitor',
        question: 'Explain that again.',
        topK: 1,
      },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('limits report generation by authenticated principal', async () => {
    const request = () =>
      app.inject({
        method: 'POST',
        url: '/v1/reports/exports/markdown',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Security report', filters: {} },
      });

    const first = await request();
    expect(first.statusCode).toBe(403);

    const blocked = await request();
    expect(blocked.statusCode).toBe(429);
  });
});
