import type { FastifyInstance } from 'fastify';
import { listAuditQuerySchema, listAuditResponseSchema } from '../../schemas/audit.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const parsed = listAuditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const items = await app.auditRepo.listRecent(parsed.data.limit);
    return listAuditResponseSchema.parse({ items });
  });
}
