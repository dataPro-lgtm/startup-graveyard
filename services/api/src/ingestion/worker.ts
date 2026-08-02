import type { IngestionJobsRepository } from '../repositories/ingestionJobsRepository.js';
import type { ObservabilityRuntime } from '../observability/runtime.js';
import { pushIngestionWorkerTick, type IngestionWorkerMonitor } from './workerMonitor.js';

export const INGESTION_WORKER_START_DELAY_MS = 5_000;
export const INGESTION_WORKER_POLL_INTERVAL_MS = 5_000;
export const INGESTION_WORKER_MAX_JOBS_PER_TICK = 8;

export type IngestionWorkerOptions = {
  startDelayMs?: number;
  pollIntervalMs?: number;
  maxJobsPerTick?: number;
};

export function startIngestionWorker(
  ingestionRepo: IngestionJobsRepository,
  logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void },
  monitor?: IngestionWorkerMonitor,
  options: IngestionWorkerOptions = {},
  observability?: ObservabilityRuntime,
): () => Promise<void> {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  let activeTick: Promise<void> | null = null;
  const workerMonitor = monitor;
  const startDelayMs = options.startDelayMs ?? INGESTION_WORKER_START_DELAY_MS;
  const pollIntervalMs = options.pollIntervalMs ?? INGESTION_WORKER_POLL_INTERVAL_MS;
  const maxJobsPerTick = options.maxJobsPerTick ?? INGESTION_WORKER_MAX_JOBS_PER_TICK;

  if (workerMonitor) {
    workerMonitor.enabled = true;
    workerMonitor.status = 'idle';
    workerMonitor.startDelayMs = startDelayMs;
    workerMonitor.pollIntervalMs = pollIntervalMs;
    workerMonitor.maxJobsPerTick = maxJobsPerTick;
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
      for (let i = 0; i < maxJobsPerTick; i++) {
        if (stopped) break;
        const processStartedAt = process.hrtime.bigint();
        const processNext = () => ingestionRepo.processNext();
        const out = observability
          ? await observability.withSpan(
              'ingestion.queue.process_next',
              { 'messaging.operation.type': 'process' },
              processNext,
            )
          : await processNext();
        if (!out.ok) break;
        observability?.recordIngestionJob({
          sourceName: out.job.sourceName,
          status: out.job.status,
          durationMs: Number(process.hrtime.bigint() - processStartedAt) / 1_000_000,
        });
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
      if (!stopped) schedule(pollIntervalMs);
    }
  }

  function schedule(delayMs: number) {
    timeout = setTimeout(() => {
      activeTick = tick().finally(() => {
        activeTick = null;
      });
    }, delayMs);
  }

  schedule(startDelayMs);

  return async () => {
    stopped = true;
    clearTimeout(timeout);
    await activeTick;
    if (workerMonitor) {
      workerMonitor.status = 'stopped';
      workerMonitor.lastStopAt = new Date().toISOString();
    }
  };
}
