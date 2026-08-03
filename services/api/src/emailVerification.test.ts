import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';
import type { MockUsersRepository } from './repositories/usersRepository.js';

const ORIGINAL_ENV = { ...process.env };

type AuthPayload = {
  user: { id: string; emailVerifiedAt: string | null };
  accessToken: string;
};

describe('email verification flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'email-verification-test-secret';
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

  async function registerUser(email: string): Promise<AuthPayload> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'secure-password-123' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as AuthPayload;
  }

  it('reports unverified state on registration and exposes it on /me', async () => {
    const email = `verify-state-${Date.now()}@example.com`;
    const registered = await registerUser(email);
    expect(registered.user.emailVerifiedAt).toBeNull();

    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect((meRes.json() as { emailVerifiedAt: string | null }).emailVerifiedAt).toBeNull();
  });

  it('verifies the email with a valid token exactly once', async () => {
    const email = `verify-${Date.now()}@example.com`;
    const registered = await registerUser(email);

    const usersRepo = app.usersRepo as MockUsersRepository;
    const issued = await usersRepo.createEmailVerificationToken(registered.user.id, 60);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/verify',
      payload: { token: issued.token },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json()).toEqual({ ok: true });

    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect((meRes.json() as { emailVerifiedAt: string | null }).emailVerifiedAt).not.toBeNull();

    // Single use: the same token is rejected afterwards.
    const replayRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/verify',
      payload: { token: issued.token },
    });
    expect(replayRes.statusCode).toBe(400);
    expect(replayRes.json()).toMatchObject({ error: 'invalid_or_expired_token' });
  });

  it('rejects expired tokens', async () => {
    const email = `verify-expired-${Date.now()}@example.com`;
    const registered = await registerUser(email);

    const usersRepo = app.usersRepo as MockUsersRepository;
    const issued = await usersRepo.createEmailVerificationToken(registered.user.id, 0);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/verify',
      payload: { token: issued.token },
    });
    expect(verifyRes.statusCode).toBe(400);
  });

  it('requires auth for resend and reports already-verified accounts', async () => {
    const anonRes = await app.inject({ method: 'POST', url: '/v1/auth/email/resend', payload: {} });
    expect(anonRes.statusCode).toBe(401);

    const email = `verify-resend-${Date.now()}@example.com`;
    const registered = await registerUser(email);

    const resendRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/resend',
      headers: { authorization: `Bearer ${registered.accessToken}` },
      payload: {},
    });
    expect(resendRes.statusCode).toBe(200);
    expect(resendRes.json()).toEqual({ ok: true, alreadyVerified: false });

    const usersRepo = app.usersRepo as MockUsersRepository;
    const issued = await usersRepo.createEmailVerificationToken(registered.user.id, 60);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    await app.inject({
      method: 'POST',
      url: '/v1/auth/email/verify',
      payload: { token: issued.token },
    });

    const verifiedResend = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/resend',
      headers: { authorization: `Bearer ${registered.accessToken}` },
      payload: {},
    });
    expect(verifiedResend.statusCode).toBe(200);
    expect(verifiedResend.json()).toEqual({ ok: true, alreadyVerified: true });

    // Token issuance also refuses verified accounts.
    const reissue = await usersRepo.createEmailVerificationToken(registered.user.id, 60);
    expect(reissue).toEqual({ ok: false, code: 'already_verified' });
  });

  it('invalidates the previous token when a new one is issued', async () => {
    const email = `verify-rotate-${Date.now()}@example.com`;
    const registered = await registerUser(email);

    const usersRepo = app.usersRepo as MockUsersRepository;
    const first = await usersRepo.createEmailVerificationToken(registered.user.id, 60);
    const second = await usersRepo.createEmailVerificationToken(registered.user.id, 60);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const staleRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/verify',
      payload: { token: first.token },
    });
    expect(staleRes.statusCode).toBe(400);

    const freshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/email/verify',
      payload: { token: second.token },
    });
    expect(freshRes.statusCode).toBe(200);
  });
});
