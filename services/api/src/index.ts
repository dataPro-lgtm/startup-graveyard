import { loadRootEnv } from './env/loadEnv.js';
import { validateRuntimeEnv } from './env/runtime.js';
import { buildApp } from './buildApp.js';
import { getPool } from './db/pool.js';
import { PgIngestionJobsRepository } from './repositories/ingestionJobsRepository.js';
import { PgAdminWriteRepository } from './repositories/adminWriteRepository.js';
import { startScheduler } from './ingestion/scheduler.js';
import { config } from './config/index.js';

loadRootEnv();
validateRuntimeEnv();

const server = await buildApp();

const pool = getPool();
if (pool) {
  const adminWriteRepo = new PgAdminWriteRepository(pool);
  const ingestionRepo = new PgIngestionJobsRepository(pool, adminWriteRepo);

  const stopScheduler = startScheduler(pool, ingestionRepo, {
    info: (msg) => server.log.info(msg),
    error: (msg, err) => server.log.error(err, msg),
  });

  // Graceful shutdown
  const stop = async () => {
    stopScheduler();
    await server.close();
    await pool.end();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

await server.listen({ port: config.server.port, host: '0.0.0.0' });
