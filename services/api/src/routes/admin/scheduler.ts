import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import { runIngestionJob } from '../../ingestion/runIngestionJob.js';

const triggerBodySchema = z.object({
  jobName: z.string().min(1).optional(),
  sourceName: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
});

export async function adminSchedulerRoutes(app: FastifyInstance) {
  // GET /v1/admin/scheduler — list scheduled jobs with status
  app.get('/', async (_request, reply) => {
    const pool = getPool();
    if (!pool) return reply.send({ jobs: [] });

    const { rows } = await pool.query(`
      SELECT id, name, source_name, cron_expr, enabled, last_run_at, next_run_at
      FROM scheduled_jobs
      ORDER BY name
    `);
    return reply.send({ jobs: rows });
  });

  // POST /v1/admin/scheduler/trigger — manually trigger a job by name or source
  app.post('/trigger', async (request, reply) => {
    const parsed = triggerBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const pool = getPool();
    const { jobName, sourceName, payload } = parsed.data;

    let resolvedSource = sourceName;
    let resolvedPayload = payload ?? {};

    if (jobName && pool) {
      const { rows } = await pool.query<{ source_name: string; payload: Record<string, unknown> }>(
        `SELECT source_name, payload FROM scheduled_jobs WHERE name = $1`,
        [jobName],
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'job_not_found' });
      resolvedSource = rows[0].source_name;
      resolvedPayload = { ...rows[0].payload, ...resolvedPayload };
    }

    if (!resolvedSource) {
      return reply.code(400).send({ error: 'provide jobName or sourceName' });
    }

    const result = await runIngestionJob(
      { sourceName: resolvedSource, triggerType: 'manual', payload: resolvedPayload },
      {
        pool: pool ?? undefined,
        adminWrite: app.adminWriteRepo,
        adminAttachments: app.adminAttachmentsRepo,
        sourceSnapshots: app.sourceSnapshotsRepo,
      },
    );
    return reply.send(result);
  });

  // PATCH /v1/admin/scheduler/:id/toggle — enable/disable a job
  app.patch('/:id/toggle', async (request, reply) => {
    const pool = getPool();
    if (!pool) return reply.code(503).send({ error: 'database_unavailable' });

    const { id } = request.params as { id: string };
    const { rows } = await pool.query<{ enabled: boolean }>(
      `UPDATE scheduled_jobs SET enabled = NOT enabled WHERE id = $1 RETURNING enabled`,
      [id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ enabled: rows[0].enabled });
  });
}
