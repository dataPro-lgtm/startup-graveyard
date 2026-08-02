import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  loginBodySchema,
  registerBodySchema,
  refreshBodySchema,
  revokeOtherSessionsResponseSchema,
  revokeSessionResponseSchema,
  userSessionParamsSchema,
  userSessionsResponseSchema,
} from '@sg/shared/schemas/auth';
import { verifyAccessToken } from '../../auth/tokens.js';
import { requireAccessPayload, resolveEffectiveUser } from './authedUser.js';
import { routeRateLimit } from '../../security/requestSecurity.js';
import {
  accessTokenFromRequest,
  authResponseBody,
  clearAuthCookies,
  refreshTokenFromRequest,
  setAuthCookies,
} from '../../auth/cookies.js';

function sessionContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 512) ?? null,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /v1/auth/register ───────────────────────────────────────────────
  app.post(
    '/register',
    { config: { rateLimit: routeRateLimit('auth') } },
    async (request, reply) => {
      const parsed = registerBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
      }

      const result = await app.usersRepo.register(
        parsed.data.email,
        parsed.data.password,
        parsed.data.displayName,
        sessionContext(request),
      );
      if (!result.ok) {
        if (result.code === 'email_taken') {
          return reply.code(409).send({ error: 'email_already_registered' });
        }
        return reply.code(400).send({ error: result.code });
      }

      setAuthCookies(reply, result);
      return reply
        .code(201)
        .send(authResponseBody(request, result, await resolveEffectiveUser(app, result.user)));
    },
  );

  // ── POST /v1/auth/login ──────────────────────────────────────────────────
  app.post('/login', { config: { rateLimit: routeRateLimit('auth') } }, async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const result = await app.usersRepo.login(
      parsed.data.email,
      parsed.data.password,
      sessionContext(request),
    );
    if (!result.ok) {
      // Return 401 for both 'not found' and 'wrong password' — avoid enumeration
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    setAuthCookies(reply, result);
    return reply.send(
      authResponseBody(request, result, await resolveEffectiveUser(app, result.user)),
    );
  });

  // ── POST /v1/auth/refresh ────────────────────────────────────────────────
  app.post(
    '/refresh',
    { config: { rateLimit: routeRateLimit('authRefresh') } },
    async (request, reply) => {
      const parsed = refreshBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      const refreshToken = parsed.data.refreshToken ?? refreshTokenFromRequest(request);
      if (!refreshToken) return reply.code(401).send({ error: 'refresh_token_required' });

      const result = await app.usersRepo.refresh(refreshToken, sessionContext(request));
      if (!result.ok) {
        clearAuthCookies(reply);
        return reply.code(401).send({ error: result.code });
      }

      setAuthCookies(reply, result);
      return reply.send(
        authResponseBody(request, result, await resolveEffectiveUser(app, result.user)),
      );
    },
  );

  // ── POST /v1/auth/logout ─────────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    const token = accessTokenFromRequest(request);
    const payload = token ? verifyAccessToken(token) : null;
    const refreshToken = refreshTokenFromRequest(request);
    if (payload) await app.usersRepo.logout(payload.sub, payload.sid);
    else if (refreshToken) await app.usersRepo.logoutByRefreshToken(refreshToken);
    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  app.get('/sessions', async (request, reply) => {
    const payload = await requireAccessPayload(app, request, reply);
    if (!payload) return reply;

    const sessions = await app.usersRepo.listSessions(payload.sub);
    return userSessionsResponseSchema.parse({
      items: sessions.map((session) => ({
        ...session,
        current: session.id === payload.sid,
      })),
    });
  });

  app.delete('/sessions/:sessionId', async (request, reply) => {
    const payload = await requireAccessPayload(app, request, reply);
    if (!payload) return reply;
    const parsed = userSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_params' });

    const revoked = await app.usersRepo.revokeSession(payload.sub, parsed.data.sessionId);
    if (!revoked) return reply.code(404).send({ error: 'session_not_found' });
    const currentSessionRevoked = parsed.data.sessionId === payload.sid;
    if (currentSessionRevoked) clearAuthCookies(reply);
    await app.auditRepo.record({
      action: 'auth.session_revoked',
      metadata: {
        actorUserId: payload.sub,
        sessionId: parsed.data.sessionId,
        currentSessionRevoked,
      },
    });
    return revokeSessionResponseSchema.parse({ ok: true, currentSessionRevoked });
  });

  app.post('/sessions/revoke-others', async (request, reply) => {
    const payload = await requireAccessPayload(app, request, reply);
    if (!payload) return reply;
    if (!payload.sid) return reply.code(409).send({ error: 'session_context_required' });

    const revokedCount = await app.usersRepo.revokeOtherSessions(payload.sub, payload.sid);
    await app.auditRepo.record({
      action: 'auth.other_sessions_revoked',
      metadata: { actorUserId: payload.sub, currentSessionId: payload.sid, revokedCount },
    });
    return revokeOtherSessionsResponseSchema.parse({ ok: true, revokedCount });
  });

  // ── GET /v1/auth/me ──────────────────────────────────────────────────────
  app.get('/me', async (request, reply) => {
    const payload = await requireAccessPayload(app, request, reply);
    if (!payload) return reply;

    const user = await app.usersRepo.getById(payload.sub);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    return reply.send(await resolveEffectiveUser(app, user));
  });
}
