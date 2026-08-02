import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AdminRole } from '@sg/shared/schemas/auth';
import { accessTokenFromRequest } from '../auth/cookies.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { adminCaseRoutes } from '../routes/admin/cases.js';
import { auditRoutes } from '../routes/admin/audit.js';
import { ingestionJobRoutes } from '../routes/admin/ingestionJobs.js';
import { reviewRoutes } from '../routes/admin/reviews.js';
import { adminStatsRoutes } from '../routes/admin/stats.js';
import { adminSchedulerRoutes } from '../routes/admin/scheduler.js';
import { sourceSnapshotRoutes } from '../routes/admin/sourceSnapshots.js';

export type AdminCapability = 'read' | 'content_write' | 'operations_write';

export type AdminPrincipal = {
  authType: 'user_session' | 'service_key';
  userId: string | null;
  email: string | null;
  role: AdminRole;
};

const ROLE_CAPABILITIES: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  viewer: new Set(['read']),
  editor: new Set(['read', 'content_write']),
  operator: new Set(['read', 'operations_write']),
  owner: new Set(['read', 'content_write', 'operations_write']),
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function secretsEqual(got: string, required: string): boolean {
  const left = Buffer.from(got);
  const right = Buffer.from(required);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requiredAdminCapability(method: string, url: string): AdminCapability {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  const path = url.split('?')[0] ?? url;
  if (path.startsWith('/v1/admin/cases') || path.startsWith('/v1/admin/reviews')) {
    return 'content_write';
  }
  return 'operations_write';
}

async function authenticateAdmin(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AdminPrincipal | null> {
  const suppliedKey = headerValue(request.headers['x-admin-key']);
  if (suppliedKey !== undefined) {
    const requiredKey = process.env.ADMIN_API_KEY?.trim();
    if (requiredKey && secretsEqual(suppliedKey, requiredKey)) {
      return {
        authType: 'service_key',
        userId: null,
        email: null,
        role: 'owner',
      };
    }
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const token = accessTokenFromRequest(request);
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  if (!payload.sid || !(await app.usersRepo.isSessionActive(payload.sub, payload.sid))) {
    reply.code(401).send({ error: 'session_revoked' });
    return null;
  }

  const user = await app.usersRepo.getById(payload.sub);
  if (!user || user.role !== 'admin' || !user.adminRole) {
    reply.code(403).send({ error: 'admin_access_required' });
    return null;
  }
  return {
    authType: 'user_session',
    userId: user.id,
    email: user.email,
    role: user.adminRole,
  };
}

/** Mounts `/reviews` under caller prefix (use `/v1/admin` -> `/v1/admin/reviews`). */
export async function registerAdminRoutes(app: FastifyInstance) {
  app.decorateRequest('adminPrincipal', null);

  app.addHook('onRequest', async (request, reply) => {
    const principal = await authenticateAdmin(app, request, reply);
    if (!principal) return reply;
    request.adminPrincipal = principal;

    const capability = requiredAdminCapability(request.method, request.url);
    if (!ROLE_CAPABILITIES[principal.role].has(capability)) {
      await app.auditRepo.record({
        action: 'admin.authorization_denied',
        actorUserId: principal.userId,
        actorEmail: principal.email,
        actorAdminRole: principal.role,
        actorAuthType: principal.authType,
        metadata: {
          requestId: request.id,
          method: request.method,
          route: request.url.split('?')[0],
          requiredCapability: capability,
        },
      });
      return reply.code(403).send({
        error: 'admin_role_forbidden',
        requiredCapability: capability,
      });
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const principal = request.adminPrincipal;
    if (!principal || requiredAdminCapability(request.method, request.url) === 'read') return;
    try {
      await app.auditRepo.record({
        action: 'admin.request',
        actorUserId: principal.userId,
        actorEmail: principal.email,
        actorAdminRole: principal.role,
        actorAuthType: principal.authType,
        metadata: {
          requestId: request.id,
          method: request.method,
          route: request.routeOptions.url,
          statusCode: reply.statusCode,
        },
      });
    } catch (error) {
      request.log.error({ err: error, requestId: request.id }, 'Failed to record admin request');
    }
  });

  await app.register(reviewRoutes, { prefix: '/reviews' });
  await app.register(auditRoutes, { prefix: '/audit' });
  await app.register(sourceSnapshotRoutes, { prefix: '/source-snapshots' });
  await app.register(ingestionJobRoutes, { prefix: '/ingestion-jobs' });
  await app.register(adminCaseRoutes, { prefix: '/cases' });
  await app.register(adminStatsRoutes, { prefix: '/stats' });
  await app.register(adminSchedulerRoutes, { prefix: '/scheduler' });
}
