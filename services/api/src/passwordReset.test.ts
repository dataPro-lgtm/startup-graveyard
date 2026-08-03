import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';
import type { MockUsersRepository } from './repositories/usersRepository.js';

const ORIGINAL_ENV = { ...process.env };

type AuthPayload = {
  user: { id: string };
  accessToken: string;
  refreshToken: string;
};

describe('password reset flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'password-reset-test-secret';
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

  async function registerUser(email: string, password: string): Promise<AuthPayload> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as AuthPayload;
  }

  it('returns ok for unknown emails without leaking account existence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: `nobody-${Date.now()}@example.com` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('resets the password with a valid token and revokes existing sessions', async () => {
    const email = `reset-${Date.now()}@example.com`;
    const registered = await registerUser(email, 'original-password-1');

    const forgotRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email },
    });
    expect(forgotRes.statusCode).toBe(200);

    // The token only leaves the API by email; read it through the repository
    // like the mailer does so the HTTP surface stays enumeration-safe.
    const usersRepo = app.usersRepo as MockUsersRepository;
    const issued = await usersRepo.createPasswordResetToken(email, 30);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const resetRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: issued.token, password: 'brand-new-password-2' },
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json()).toEqual({ ok: true });

    // Old refresh session is revoked after the credential reset.
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: registered.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);

    // Old password no longer works; the new one does.
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'original-password-1' },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'brand-new-password-2' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('rejects token reuse after a successful reset', async () => {
    const email = `reuse-${Date.now()}@example.com`;
    await registerUser(email, 'original-password-1');

    const usersRepo = app.usersRepo as MockUsersRepository;
    const issued = await usersRepo.createPasswordResetToken(email, 30);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const firstReset = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: issued.token, password: 'brand-new-password-2' },
    });
    expect(firstReset.statusCode).toBe(200);

    const secondReset = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: issued.token, password: 'another-password-3' },
    });
    expect(secondReset.statusCode).toBe(400);
    expect(secondReset.json()).toMatchObject({ error: 'invalid_or_expired_token' });
  });

  it('rejects expired tokens', async () => {
    const email = `expired-${Date.now()}@example.com`;
    await registerUser(email, 'original-password-1');

    const usersRepo = app.usersRepo as MockUsersRepository;
    const issued = await usersRepo.createPasswordResetToken(email, 0);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const resetRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: issued.token, password: 'brand-new-password-2' },
    });
    expect(resetRes.statusCode).toBe(400);
    expect(resetRes.json()).toMatchObject({ error: 'invalid_or_expired_token' });
  });

  it('invalidates the previous token when a new one is requested', async () => {
    const email = `rotate-${Date.now()}@example.com`;
    await registerUser(email, 'original-password-1');

    const usersRepo = app.usersRepo as MockUsersRepository;
    const first = await usersRepo.createPasswordResetToken(email, 30);
    const second = await usersRepo.createPasswordResetToken(email, 30);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const staleReset = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: first.token, password: 'brand-new-password-2' },
    });
    expect(staleReset.statusCode).toBe(400);

    const freshReset = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: second.token, password: 'brand-new-password-2' },
    });
    expect(freshReset.statusCode).toBe(200);
  });

  it('rejects malformed reset payloads', async () => {
    const shortToken = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: 'short', password: 'brand-new-password-2' },
    });
    expect(shortToken.statusCode).toBe(400);

    const weakPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: 'a'.repeat(64), password: 'short' },
    });
    expect(weakPassword.statusCode).toBe(400);
  });
});
