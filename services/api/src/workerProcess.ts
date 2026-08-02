import { loadRootEnv } from './env/loadEnv.js';
import { validateRuntimeEnv } from './env/runtime.js';
import { buildApp } from './buildApp.js';
import { getPool } from './db/pool.js';
import { config } from './config/index.js';
import { startIngestionWorker } from './ingestion/worker.js';
import { runBackgroundProcess } from './runtime/runBackgroundProcess.js';
import { ObservabilityRuntime } from './observability/runtime.js';

loadRootEnv();
process.env.SG_RUNTIME_ROLE = 'worker';
validateRuntimeEnv();

const pool = getPool();
if (!pool) throw new Error('Worker requires DATABASE_URL.');

const observability = new ObservabilityRuntime(config.observability);
await observability.start();
const app = await buildApp({ observability });
await app.ready();
await runBackgroundProcess({
  component: 'worker',
  app,
  pool,
  healthPort: config.runtime.healthPort,
  snapshot: () => ({ ...app.ingestionWorkerMonitor }),
  start: () =>
    startIngestionWorker(
      app.ingestionJobsRepo,
      {
        info: (message) => app.log.info(message),
        error: (message, error) => app.log.error(error, message),
      },
      app.ingestionWorkerMonitor,
      {},
      observability,
    ),
});
