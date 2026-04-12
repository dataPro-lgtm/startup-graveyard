import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async () => ({
    ok: true,
    service: 'startup-graveyard-api',
    time: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply) => {
    const pool = getPool();
    if (!pool) {
      return {
        ok: true,
        db: false,
        note: 'DATABASE_URL unset',
      };
    }
    try {
      await pool.query('SELECT 1');
      return { ok: true, db: true };
    } catch {
      return reply.code(503).send({ ok: false, db: false });
    }
  });
}