import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserProfile } from '@sg/shared/schemas/auth';
import {
  buildSavedViewQueryString,
  createSavedViewBodySchema,
  createSavedViewResponseSchema,
  deleteSavedViewResponseSchema,
  savedViewIdParamsSchema,
  savedViewListResponseSchema,
  updateSavedViewBodySchema,
  updateSavedViewResponseSchema,
  type SavedViewFilters,
  type SavedViewSummary,
} from '../../schemas/savedViews.js';
import { verifyAccessToken } from '../../auth/tokens.js';

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

function buildSummary(user: UserProfile, savedViewCount: number): SavedViewSummary {
  const savedViewLimit = user.entitlements.savedSearchLimit;
  const remainingSlots = Math.max(0, savedViewLimit - savedViewCount);
  return {
    subscription: user.subscription,
    billingStatus: user.billingStatus,
    savedViewCount,
    savedViewLimit,
    remainingSlots,
    canUseSavedViews: user.entitlements.canUseSavedSearches,
    canAddMore: user.entitlements.canUseSavedSearches && remainingSlots > 0,
    requiredTier: user.entitlements.canUseSavedSearches ? null : 'pro',
  };
}

async function resolveCaseCount(app: FastifyInstance, filters: SavedViewFilters): Promise<number> {
  const result = await app.casesRepo.list({
    q: filters.q,
    industry: filters.industry,
    country: filters.country,
    closedYear: filters.closedYear ? Number(filters.closedYear) : undefined,
    businessModelKey: filters.businessModelKey?.toLowerCase(),
    primaryFailureReasonKey: filters.primaryFailureReasonKey?.toLowerCase(),
    sort: filters.sort,
    page: 1,
    limit: 1,
  });
  return result.total;
}

export async function savedViewsRoutes(app: FastifyInstance) {
  app.get('/me', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const [items, count] = await Promise.all([
      app.savedViewsRepo.listByUserId(user.id),
      app.savedViewsRepo.countByUserId(user.id),
    ]);
    return savedViewListResponseSchema.parse({
      summary: buildSummary(user, count),
      items,
    });
  });

  app.post('/items', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = createSavedViewBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const queryString = buildSavedViewQueryString(parsed.data.filters);
    const existing = await app.savedViewsRepo.findByQueryString(user.id, queryString);
    const countBefore = await app.savedViewsRepo.countByUserId(user.id);
    if (existing) {
      return createSavedViewResponseSchema.parse({
        ok: true,
        created: false,
        summary: buildSummary(user, countBefore),
        item: existing,
      });
    }

    if (!user.entitlements.canUseSavedSearches) {
      return reply.code(403).send({
        error: 'entitlement_required',
        summary: buildSummary(user, countBefore),
      });
    }
    if (countBefore >= user.entitlements.savedSearchLimit) {
      return reply.code(409).send({
        error: 'saved_view_limit_reached',
        summary: buildSummary(user, countBefore),
      });
    }

    const caseCount = await resolveCaseCount(app, parsed.data.filters);
    const created = await app.savedViewsRepo.create(user.id, {
      name: parsed.data.name,
      filters: parsed.data.filters,
      queryString,
      caseCount,
    });
    const countAfter = await app.savedViewsRepo.countByUserId(user.id);
    return createSavedViewResponseSchema.parse({
      ok: true,
      created: created.status === 'created',
      summary: buildSummary(user, countAfter),
      item: created.item,
    });
  });

  app.patch('/items/:savedViewId', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const params = savedViewIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_params', details: params.error.flatten() });
    }
    const body = updateSavedViewBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_body', details: body.error.flatten() });
    }

    const existing = await app.savedViewsRepo.getById(user.id, params.data.savedViewId);
    if (!existing) return reply.code(404).send({ error: 'saved_view_not_found' });

    if (!user.entitlements.canUseSavedSearches) {
      return reply.code(403).send({
        error: 'entitlement_required',
        summary: buildSummary(user, await app.savedViewsRepo.countByUserId(user.id)),
      });
    }

    const nextFilters = body.data.filters ?? existing.filters;
    const nextName = body.data.name ?? existing.name;
    const queryString = buildSavedViewQueryString(nextFilters);
    const caseCount = await resolveCaseCount(app, nextFilters);
    const updated = await app.savedViewsRepo.update(user.id, params.data.savedViewId, {
      name: nextName,
      filters: nextFilters,
      queryString,
      caseCount,
    });
    if (updated === 'duplicate') {
      return reply.code(409).send({ error: 'duplicate_saved_view' });
    }
    if (updated === 'not_found') {
      return reply.code(404).send({ error: 'saved_view_not_found' });
    }

    return updateSavedViewResponseSchema.parse({
      ok: true,
      summary: buildSummary(user, await app.savedViewsRepo.countByUserId(user.id)),
      item: updated,
    });
  });

  app.delete('/items/:savedViewId', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const params = savedViewIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_params', details: params.error.flatten() });
    }

    await app.savedViewsRepo.remove(user.id, params.data.savedViewId);
    const countAfter = await app.savedViewsRepo.countByUserId(user.id);
    return deleteSavedViewResponseSchema.parse({
      ok: true,
      summary: buildSummary(user, countAfter),
      savedViewId: params.data.savedViewId,
    });
  });
}
