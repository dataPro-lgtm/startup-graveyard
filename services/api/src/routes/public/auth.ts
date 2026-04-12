import type { FastifyInstance } from 'fastify';
import { loginBodySchema, registerBodySchema, refreshBodySchema } from '@sg/shared/schemas/auth';
import { verifyAccessToken } from '../../auth/tokens.js';
import { extractBearer, resolveEffectiveUser } from './authedUser.js';

export async function authRoutes(app: FastifyInstance) {
  // ── POST /v1/auth/register ───────────────────────────────────────────────
  app.post('/register', async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const result = await app.usersRepo.register(
      parsed.data.email,
      parsed.data.password,
      parsed.data.displayName,
    );
    if (!result.ok) {
      if (result.code === 'email_taken') {
        return reply.code(409).send({ error: 'email_already_registered' });
      }
      return reply.code(400).send({ error: result.code });
    }

    return reply.code(201).send({
      ...result,
      user: await resolveEffectiveUser(app, result.user),
    });
  });

  // ── POST /v1/auth/login ──────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const result = await app.usersRepo.login(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      // Return 401 for both 'not found' and 'wrong password' — avoid enumeration
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    return reply.send({
      ...result,
      user: await resolveEffectiveUser(app, result.user),
    });
  });

  // ── POST /v1/auth/refresh ────────────────────────────────────────────────
  app.post('/refresh', async (request, reply) => {
    const parsed = refreshBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const result = await app.usersRepo.refresh(parsed.data.refreshToken);
    if (!result.ok) {
      return reply.code(401).send({ error: result.code });
    }

    return reply.send({
      ...result,
      user: await resolveEffectiveUser(app, result.user),
    });
  });

  // ── POST /v1/auth/logout ─────────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    const token = extractBearer(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: 'unauthorized' });

    const payload = verifyAccessToken(token);
    if (!payload) return reply.code(401).send({ error: 'invalid_token' });

    await app.usersRepo.logout(payload.sub);
    return reply.send({ ok: true });
  });

  // ── GET /v1/auth/me ──────────────────────────────────────────────────────
  app.get('/me', async (request, reply) => {
    const token = extractBearer(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: 'unauthorized' });

    const payload = verifyAccessToken(token);
    if (!payload) return reply.code(401).send({ error: 'invalid_token' });

    const user = await app.usersRepo.getById(payload.sub);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    return reply.send(await resolveEffectiveUser(app, user));
  });
}
