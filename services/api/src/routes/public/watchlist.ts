import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserProfile } from '@sg/shared/schemas/auth';
import {
  watchlistListResponseSchema,
  watchlistMutationBodySchema,
  watchlistMutationResponseSchema,
  watchlistStatusQuerySchema,
  watchlistStatusResponseSchema,
  type WatchlistSummary,
} from '@sg/shared/schemas/watchlist';
import { verifyAccessToken } from '../../auth/tokens.js';

const watchlistCaseIdParamSchema = watchlistMutationBodySchema.pick({ caseId: true });

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

async function requireUser(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const token = extractBearer(request.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
  const user = await app.usersRepo.getById(payload.sub);
  if (!user) {
    reply.code(404).send({ error: 'user_not_found' });
    return null;
  }
  return user;
}

function buildSummary(user: UserProfile, watchlistCount: number): WatchlistSummary {
  const watchlistLimit = user.entitlements.watchlistLimit;
  const remainingSlots = Math.max(0, watchlistLimit - watchlistCount);
  return {
    subscription: user.subscription,
    billingStatus: user.billingStatus,
    watchlistCount,
    watchlistLimit,
    remainingSlots,
    canUseWatchlist: user.entitlements.canUseWatchlist,
    canAddMore: user.entitlements.canUseWatchlist && remainingSlots > 0,
    requiredTier: user.entitlements.canUseWatchlist ? null : 'pro',
  };
}

export async function watchlistRoutes(app: FastifyInstance) {
  app.get('/me', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const [items, count] = await Promise.all([
      app.watchlistsRepo.listByUserId(user.id),
      app.watchlistsRepo.countByUserId(user.id),
    ]);
    return watchlistListResponseSchema.parse({
      summary: buildSummary(user, count),
      items,
    });
  });

  app.get('/me/status', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = watchlistStatusQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }

    const [saved, count] = await Promise.all([
      app.watchlistsRepo.has(user.id, parsed.data.caseId),
      app.watchlistsRepo.countByUserId(user.id),
    ]);

    return watchlistStatusResponseSchema.parse({
      summary: buildSummary(user, count),
      caseId: parsed.data.caseId,
      saved,
    });
  });

  app.post('/items', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = watchlistMutationBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const countBefore = await app.watchlistsRepo.countByUserId(user.id);
    if (!user.entitlements.canUseWatchlist) {
      return reply.code(403).send({
        error: 'entitlement_required',
        summary: buildSummary(user, countBefore),
      });
    }
    if (countBefore >= user.entitlements.watchlistLimit) {
      return reply.code(409).send({
        error: 'watchlist_limit_reached',
        summary: buildSummary(user, countBefore),
      });
    }

    const result = await app.watchlistsRepo.add(user.id, parsed.data.caseId);
    if (result === 'case_not_found') {
      return reply.code(404).send({ error: 'case_not_found' });
    }

    const countAfter = await app.watchlistsRepo.countByUserId(user.id);
    return watchlistMutationResponseSchema.parse({
      ok: true,
      summary: buildSummary(user, countAfter),
      caseId: parsed.data.caseId,
      saved: result === 'added' || result === 'exists',
    });
  });

  app.delete('/items/:caseId', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = watchlistCaseIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_params', details: parsed.error.flatten() });
    }

    await app.watchlistsRepo.remove(user.id, parsed.data.caseId);
    const countAfter = await app.watchlistsRepo.countByUserId(user.id);
    return watchlistMutationResponseSchema.parse({
      ok: true,
      summary: buildSummary(user, countAfter),
      caseId: parsed.data.caseId,
      saved: false,
    });
  });
}
