import { loadRootEnv } from './env/loadEnv.js';
import { validateRuntimeEnv } from './env/runtime.js';
import { buildApp } from './buildApp.js';
import { getPool } from './db/pool.js';
import { config } from './config/index.js';

loadRootEnv();
validateRuntimeEnv();

const server = await buildApp();

const pool = getPool();
if (pool) {
  const stop = async () => {
    await server.close();
    await pool.end();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

await server.listen({ port: config.server.port, host: '0.0.0.0' });
