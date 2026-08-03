import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

const ORIGINAL_ENV = { ...process.env };

type AuthPayload = {
  user: { id: string };
  sessionId: string;
  accessToken: string;
  refreshToken: string;
};

describe('device session security', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'device-session-test-secret';
    process.env.RATE_LIMIT_ENABLED = 'false';
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('lists devices and immediately rejects selectively revoked access and refresh tokens', async () => {
    const email = `sessions-${Date.now()}@example.com`;
    const registeredRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { 'user-agent': 'Device A Safari' },
      payload: { email, password: 'secure-password-123' },
    });
    expect(registeredRes.statusCode).toBe(201);
    const deviceA = registeredRes.json() as AuthPayload;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'user-agent': 'Device B Chrome' },
      payload: { email, password: 'secure-password-123' },
    });
    expect(loginRes.statusCode).toBe(200);
    const deviceB = loginRes.json() as AuthPayload;

    const sessionsRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/sessions',
      headers: { authorization: `Bearer ${deviceB.accessToken}` },
    });
    expect(sessionsRes.statusCode).toBe(200);
    expect(sessionsRes.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: deviceA.sessionId,
          current: false,
          userAgent: 'Device A Safari',
        }),
        expect.objectContaining({
          id: deviceB.sessionId,
          current: true,
          userAgent: 'Device B Chrome',
        }),
      ]),
    });

    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/v1/auth/sessions/${deviceA.sessionId}`,
      headers: { authorization: `Bearer ${deviceB.accessToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json()).toEqual({ ok: true, currentSessionRevoked: false });

    const revokedAccessRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${deviceA.accessToken}` },
    });
    expect(revokedAccessRes.statusCode).toBe(401);
    expect(revokedAccessRes.json()).toEqual({ error: 'session_revoked' });

    const revokedRefreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: deviceA.refreshToken },
    });
    expect(revokedRefreshRes.statusCode).toBe(401);

    const unknownRes = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/sessions/00000000-0000-4000-8000-000000000099',
      headers: { authorization: `Bearer ${deviceB.accessToken}` },
    });
    expect(unknownRes.statusCode).toBe(404);
    expect(unknownRes.json()).toEqual({ error: 'session_not_found' });
  });

  it('revokes every other device while preserving the current session', async () => {
    const email = `session-others-${Date.now()}@example.com`;
    const registered = (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email, password: 'secure-password-123' },
      })
    ).json() as AuthPayload;
    const current = (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: 'secure-password-123' },
      })
    ).json() as AuthPayload;

    const revokeOthersRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/sessions/revoke-others',
      headers: { authorization: `Bearer ${current.accessToken}` },
      payload: {},
    });
    expect(revokeOthersRes.statusCode).toBe(200);
    expect(revokeOthersRes.json()).toEqual({ ok: true, revokedCount: 1 });

    const oldSessionRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(oldSessionRes.statusCode).toBe(401);

    const currentSessionRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${current.accessToken}` },
    });
    expect(currentSessionRes.statusCode).toBe(200);

    const sessionsRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/sessions',
      headers: { authorization: `Bearer ${current.accessToken}` },
    });
    expect(sessionsRes.json()).toMatchObject({
      items: [{ id: current.sessionId, current: true }],
    });
  });

  // 1 register + 10 logins hash bcrypt at 12 rounds each; slow CI runners can
  // exceed the default 5s test timeout, so give this test a CPU-bound budget.
  it('caps active devices and revokes the oldest session', { timeout: 30_000 }, async () => {
    const email = `session-cap-${Date.now()}@example.com`;
    const oldest = (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email, password: 'secure-password-123' },
      })
    ).json() as AuthPayload;
    let newest = oldest;
    for (let index = 0; index < 10; index += 1) {
      newest = (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: { 'user-agent': `Device ${index + 2}` },
          payload: { email, password: 'secure-password-123' },
        })
      ).json() as AuthPayload;
    }

    const sessionsRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/sessions',
      headers: { authorization: `Bearer ${newest.accessToken}` },
    });
    expect((sessionsRes.json() as { items: unknown[] }).items).toHaveLength(10);

    const oldestRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${oldest.accessToken}` },
    });
    expect(oldestRes.statusCode).toBe(401);
    expect(oldestRes.json()).toEqual({ error: 'session_revoked' });
  });
});
