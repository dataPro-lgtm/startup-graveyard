import { loadRootEnv } from './env/loadEnv.js';
import { validateRuntimeEnv } from './env/runtime.js';
import { buildApp } from './buildApp.js';
import { getPool } from './db/pool.js';
import { config } from './config/index.js';
import { ObservabilityRuntime } from './observability/runtime.js';

loadRootEnv();
validateRuntimeEnv();

const observability = new ObservabilityRuntime(config.observability);
await observability.start();
const server = await buildApp({ observability });

const pool = getPool();
if (pool) {
  const stop = async () => {
    await server.close();
    await observability.shutdown();
    await pool.end();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

if (!pool) {
  const stop = async () => {
    await server.close();
    await observability.shutdown();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

await server.listen({ port: config.server.port, host: '0.0.0.0' });
