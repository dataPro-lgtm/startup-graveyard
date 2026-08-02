import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { RuntimeComponent } from '../repositories/runtimeProcessesRepository.js';
import { startRuntimeHealthServer } from './runtimeHealthServer.js';
import { startRuntimeHeartbeat } from './runtimeHeartbeat.js';

export async function runBackgroundProcess(input: {
  component: RuntimeComponent;
  app: FastifyInstance;
  pool: Pool;
  healthPort: number;
  snapshot: () => {
    status: string;
    startedAt: string | null;
    lastError: string | null;
    [key: string]: unknown;
  };
  start: () => () => Promise<void>;
}) {
  const stopWork = input.start();
  const heartbeat = startRuntimeHeartbeat({
    component: input.component,
    repository: input.app.runtimeProcessesRepo,
    snapshot: input.snapshot,
    logger: {
      error: (message, error) => input.app.log.error(error, message),
    },
  });
  await heartbeat.initialized;
  const health = await startRuntimeHealthServer({
    component: input.component,
    port: input.healthPort,
    pool: input.pool,
    isHeartbeatReady: heartbeat.isReady,
  });
  input.app.log.info(
    `${input.component}: runtime ready as ${heartbeat.instanceId} on health port ${health.port}`,
  );

  let shuttingDown = false;
  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await stopWork();
    await heartbeat.beat();
    await heartbeat.stop();
    await health.close();
    await input.app.close();
    await input.pool.end();
  };

  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());

  return { stop, instanceId: heartbeat.instanceId };
}
