import type { FastifyInstance, FastifyRequest } from 'fastify';
import { adminCaseRoutes } from '../routes/admin/cases.js';
import { auditRoutes } from '../routes/admin/audit.js';
import { ingestionJobRoutes } from '../routes/admin/ingestionJobs.js';
import { reviewRoutes } from '../routes/admin/reviews.js';

function extractAdminKey(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-admin-key'];
  const xKey = Array.isArray(raw) ? raw[0] : raw;
  if (xKey) return xKey;
  const auth = request.headers.authorization;
  if (typeof auth !== 'string') return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1];
}

/** Mounts `/reviews` under caller prefix (use `/v1/admin` → `/v1/admin/reviews`). */
export async function registerAdminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const required = process.env.ADMIN_API_KEY;
    if (!required) return;
    const got = extractAdminKey(request);
    if (got === required) return;
    return reply.code(401).send({ error: 'unauthorized' });
  });
  await app.register(reviewRoutes, { prefix: '/reviews' });
  await app.register(auditRoutes, { prefix: '/audit' });
  await app.register(ingestionJobRoutes, { prefix: '/ingestion-jobs' });
  await app.register(adminCaseRoutes, { prefix: '/cases' });
}
