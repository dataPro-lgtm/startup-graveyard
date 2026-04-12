import type { FastifyInstance } from 'fastify';
import {
  listSourceSnapshotsQuerySchema,
  listSourceSnapshotsResponseSchema,
} from '../../schemas/sourceSnapshots.js';

export async function sourceSnapshotRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const parsed = listSourceSnapshotsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const items = await app.sourceSnapshotsRepo.listRecent(parsed.data);
    return listSourceSnapshotsResponseSchema.parse({ items });
  });
}
