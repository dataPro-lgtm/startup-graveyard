import type { IngestionJobsRepository } from '../repositories/ingestionJobsRepository.js';

const START_DELAY_MS = 5_000;
const POLL_INTERVAL_MS = 5_000;
const MAX_JOBS_PER_TICK = 8;

export function startIngestionWorker(
  ingestionRepo: IngestionJobsRepository,
  logger: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void },
): () => void {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;

  async function tick() {
    if (stopped) return;
    try {
      for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
        const out = await ingestionRepo.processNext();
        if (!out.ok) break;
        logger.info(
          `ingestion-worker: processed ${out.job.id} (${out.job.sourceName}) => ${out.job.status}`,
        );
      }
    } catch (err) {
      logger.error('ingestion-worker: tick failed', err);
    } finally {
      if (!stopped) timeout = setTimeout(tick, POLL_INTERVAL_MS);
    }
  }

  timeout = setTimeout(tick, START_DELAY_MS);

  return () => {
    stopped = true;
    clearTimeout(timeout);
  };
}
