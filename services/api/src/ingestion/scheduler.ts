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
import type { SchedulerMonitor } from './schedulerMonitor.js';

export const SCHEDULER_START_DELAY_MS = 30_000;
export const SCHEDULER_POLL_INTERVAL_MS = 60_000;

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
  monitor?: SchedulerMonitor,
): () => Promise<void> {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  let activeTick: Promise<void> | null = null;

  if (monitor) {
    monitor.enabled = true;
    monitor.status = 'starting';
    monitor.pollIntervalMs = SCHEDULER_POLL_INTERVAL_MS;
    monitor.startedAt = new Date().toISOString();
    monitor.lastStopAt = null;
    monitor.lastError = null;
    monitor.consecutiveErrors = 0;
  }

  async function tick() {
    if (stopped) return;
    let tickErrors = 0;
    if (monitor) {
      monitor.status = 'processing';
      monitor.lastTickStartedAt = new Date().toISOString();
    }
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
        if (stopped) break;
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
          if (monitor) {
            monitor.lastEnqueuedAt = new Date().toISOString();
            monitor.enqueuedJobs += 1;
          }
        } catch (err) {
          logger.error(`scheduler: failed to enqueue job "${job.name}"`, err);
          if (monitor) {
            monitor.lastError = err instanceof Error ? err.message : String(err);
            monitor.consecutiveErrors += 1;
          }
          tickErrors += 1;
        }
      }

      await client.query('COMMIT');
      if (monitor) {
        monitor.status = tickErrors > 0 ? 'error' : 'idle';
        monitor.lastTickCompletedAt = new Date().toISOString();
        if (tickErrors === 0) {
          monitor.lastError = null;
          monitor.consecutiveErrors = 0;
        }
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('scheduler: tick failed', err);
      if (monitor) {
        monitor.status = 'error';
        monitor.lastTickCompletedAt = new Date().toISOString();
        monitor.lastError = err instanceof Error ? err.message : String(err);
        monitor.consecutiveErrors += 1;
      }
    } finally {
      client.release();
    }

    if (!stopped) {
      schedule(SCHEDULER_POLL_INTERVAL_MS);
    }
  }

  function schedule(delayMs: number) {
    timeout = setTimeout(() => {
      activeTick = tick().finally(() => {
        activeTick = null;
      });
    }, delayMs);
  }

  // Start after 30s so the app has time to finish startup.
  schedule(SCHEDULER_START_DELAY_MS);

  return async () => {
    stopped = true;
    clearTimeout(timeout);
    await activeTick;
    if (monitor) {
      monitor.status = 'stopped';
      monitor.lastStopAt = new Date().toISOString();
    }
  };
}
