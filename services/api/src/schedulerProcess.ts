import { loadRootEnv } from './env/loadEnv.js';
import { validateRuntimeEnv } from './env/runtime.js';
import { buildApp } from './buildApp.js';
import { getPool } from './db/pool.js';
import { config } from './config/index.js';
import { createSchedulerMonitor } from './ingestion/schedulerMonitor.js';
import { startScheduler } from './ingestion/scheduler.js';
import { runBackgroundProcess } from './runtime/runBackgroundProcess.js';

loadRootEnv();
process.env.SG_RUNTIME_ROLE = 'scheduler';
validateRuntimeEnv();

const pool = getPool();
if (!pool) throw new Error('Scheduler requires DATABASE_URL.');

const app = await buildApp();
await app.ready();
const monitor = createSchedulerMonitor();
await runBackgroundProcess({
  component: 'scheduler',
  app,
  pool,
  healthPort: config.runtime.healthPort,
  snapshot: () => ({ ...monitor }),
  start: () =>
    startScheduler(
      pool,
      app.ingestionJobsRepo,
      {
        info: (message) => app.log.info(message),
        error: (message, error) => app.log.error(error, message),
      },
      monitor,
    ),
});
