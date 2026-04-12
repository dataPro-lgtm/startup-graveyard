/**
 * Lightweight in-process job scheduler.
 *
 * On startup, polls `scheduled_jobs` every 60 seconds.
 * When a job's `next_run_at <= NOW()` and `enabled = true`, it:
 *   1. Locks the row (SELECT … FOR UPDATE SKIP LOCKED — safe for multi-process)
 *   2. Enqueues an ingestion_job via IngestionJobsRepository
 *   3. Updates next_run_at = NOW() + interval_ms
 *
 * Designed to be cheap — no external dependencies (no pg_cron / BullMQ / Temporal).
 */

import type { Pool } from 'pg';
import type { IngestionJobsRepository } from '../repositories/ingestionJobsRepository.js';

const POLL_INTERVAL_MS = 60_000; // 1 minute

interface ScheduledJobRow {
  id: string;
  name: string;
  source_name: string;
  payload: Record<string, unknown>;
  interval_ms: number;
}

export function startScheduler(
  pool: Pool,
  ingestionRepo: IngestionJobsRepository,
  logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void },
): () => void {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;

  async function tick() {
    if (stopped) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<ScheduledJobRow>(
        `SELECT id, name, source_name, payload, interval_ms
         FROM scheduled_jobs
         WHERE enabled = true AND next_run_at <= NOW()
         FOR UPDATE SKIP LOCKED`,
      );

      for (const job of rows) {
        try {
          await ingestionRepo.enqueue({
            sourceName: job.source_name,
            triggerType: 'scheduled',
            payload: job.payload,
          });

          await client.query(
            `UPDATE scheduled_jobs
             SET last_run_at = NOW(),
                 next_run_at = NOW() + ($1 || ' milliseconds')::INTERVAL
             WHERE id = $2`,
            [job.interval_ms, job.id],
          );

          logger.info(`scheduler: enqueued job "${job.name}" (${job.source_name})`);
        } catch (err) {
          logger.error(`scheduler: failed to enqueue job "${job.name}"`, err);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('scheduler: tick failed', err);
    } finally {
      client.release();
    }

    if (!stopped) {
      timeout = setTimeout(tick, POLL_INTERVAL_MS);
    }
  }

  // Start after 30s so the app has time to finish startup
  timeout = setTimeout(tick, 30_000);

  return () => {
    stopped = true;
    clearTimeout(timeout);
  };
}
