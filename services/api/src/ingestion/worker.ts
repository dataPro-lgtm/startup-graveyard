import type { IngestionJobsRepository } from '../repositories/ingestionJobsRepository.js';
import { pushIngestionWorkerTick, type IngestionWorkerMonitor } from './workerMonitor.js';

export const INGESTION_WORKER_START_DELAY_MS = 5_000;
export const INGESTION_WORKER_POLL_INTERVAL_MS = 5_000;
export const INGESTION_WORKER_MAX_JOBS_PER_TICK = 8;

export function startIngestionWorker(
  ingestionRepo: IngestionJobsRepository,
  logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void },
  monitor?: IngestionWorkerMonitor,
): () => void {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  const workerMonitor = monitor;

  if (workerMonitor) {
    workerMonitor.enabled = true;
    workerMonitor.status = 'idle';
    workerMonitor.startDelayMs = INGESTION_WORKER_START_DELAY_MS;
    workerMonitor.pollIntervalMs = INGESTION_WORKER_POLL_INTERVAL_MS;
    workerMonitor.maxJobsPerTick = INGESTION_WORKER_MAX_JOBS_PER_TICK;
    workerMonitor.startedAt = new Date().toISOString();
    workerMonitor.lastStopAt = null;
    workerMonitor.lastError = null;
    workerMonitor.consecutiveErrors = 0;
  }

  async function tick() {
    if (stopped) return;
    const tickStartedAt = new Date().toISOString();
    let processed = 0;
    let lastJobSourceName: string | null = null;
    let lastJobStatus: string | null = null;
    if (workerMonitor) {
      workerMonitor.status = 'processing';
      workerMonitor.lastTickStartedAt = tickStartedAt;
    }
    try {
      for (let i = 0; i < INGESTION_WORKER_MAX_JOBS_PER_TICK; i++) {
        const out = await ingestionRepo.processNext();
        if (!out.ok) break;
        processed += 1;
        lastJobSourceName = out.job.sourceName;
        lastJobStatus = out.job.status;
        logger.info(
          `ingestion-worker: processed ${out.job.id} (${out.job.sourceName}) => ${out.job.status}`,
        );
        if (workerMonitor) {
          workerMonitor.lastProcessedAt = new Date().toISOString();
          workerMonitor.lastProcessedJobId = out.job.id;
          workerMonitor.lastProcessedSourceName = lastJobSourceName;
          workerMonitor.lastProcessedJobStatus = lastJobStatus;
          workerMonitor.processedJobs += 1;
        }
      }
      if (workerMonitor) {
        const tickCompletedAt = new Date().toISOString();
        workerMonitor.status = 'idle';
        workerMonitor.lastTickCompletedAt = tickCompletedAt;
        workerMonitor.lastError = null;
        workerMonitor.consecutiveErrors = 0;
        if (processed === 0 && !workerMonitor.lastProcessedAt) {
          workerMonitor.lastProcessedJobStatus = 'empty_queue';
        }
        pushIngestionWorkerTick(workerMonitor, {
          startedAt: tickStartedAt,
          completedAt: tickCompletedAt,
          outcome: processed > 0 ? 'processed' : 'empty_queue',
          processedCount: processed,
          lastJobSourceName,
          lastJobStatus,
          error: null,
        });
      }
    } catch (err) {
      if (workerMonitor) {
        const tickCompletedAt = new Date().toISOString();
        workerMonitor.status = 'error';
        workerMonitor.lastTickCompletedAt = tickCompletedAt;
        workerMonitor.lastError = err instanceof Error ? err.message : String(err);
        workerMonitor.consecutiveErrors += 1;
        pushIngestionWorkerTick(workerMonitor, {
          startedAt: tickStartedAt,
          completedAt: tickCompletedAt,
          outcome: 'error',
          processedCount: processed,
          lastJobSourceName,
          lastJobStatus,
          error: workerMonitor.lastError,
        });
      }
      logger.error('ingestion-worker: tick failed', err);
    } finally {
      if (!stopped) timeout = setTimeout(tick, INGESTION_WORKER_POLL_INTERVAL_MS);
    }
  }

  timeout = setTimeout(tick, INGESTION_WORKER_START_DELAY_MS);

  return () => {
    stopped = true;
    if (workerMonitor) {
      workerMonitor.status = 'stopped';
      workerMonitor.lastStopAt = new Date().toISOString();
    }
    clearTimeout(timeout);
  };
}
