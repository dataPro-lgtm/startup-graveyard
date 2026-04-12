import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';
import { getRuntimeFeatureFlags } from '../env/runtime.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const features = getRuntimeFeatureFlags();
    return {
      ok: true,
      service: 'startup-graveyard-api',
      env: process.env.NODE_ENV ?? 'development',
      time: new Date().toISOString(),
      features,
    };
  });

  app.get('/ready', async (_request, reply) => {
    const pool = getPool();
    const features = getRuntimeFeatureFlags();
    if (!pool) {
      return {
        ok: true,
        db: false,
        note: 'DATABASE_URL unset',
        features,
      };
    }
    try {
      await pool.query('SELECT 1');
      return { ok: true, db: true, features };
    } catch {
      return reply.code(503).send({ ok: false, db: false, features });
    }
  });
}
