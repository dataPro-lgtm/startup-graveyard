import { afterEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { MockRuntimeProcessesRepository } from './repositories/runtimeProcessesRepository.js';
import { startRuntimeHeartbeat } from './runtime/runtimeHeartbeat.js';
import {
  startRuntimeHealthServer,
  type RuntimeHealthServer,
} from './runtime/runtimeHealthServer.js';

describe('isolated runtime process health', () => {
  const servers: RuntimeHealthServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('persists state changes and fences shutdown behind the final write', async () => {
    const repository = new MockRuntimeProcessesRepository();
    const monitor = {
      status: 'idle',
      startedAt: '2026-08-02T00:00:00.000Z',
      lastError: null as string | null,
      processedJobs: 0,
    };
    const heartbeat = startRuntimeHeartbeat({
      component: 'worker',
      repository,
      snapshot: () => ({ ...monitor }),
      logger: { error: () => undefined },
      instanceId: 'worker-test-instance',
      intervalMs: 60_000,
    });

    await heartbeat.initialized;
    expect(heartbeat.isReady()).toBe(true);
    expect(await repository.getLatest('worker')).toMatchObject({
      instanceId: 'worker-test-instance',
      status: 'idle',
      metadata: { processedJobs: 0 },
    });

    monitor.status = 'error';
    monitor.lastError = 'queue lock timeout';
    monitor.processedJobs = 4;
    await heartbeat.beat();
    expect(await repository.getLatest('worker')).toMatchObject({
      status: 'error',
      lastError: 'queue lock timeout',
      metadata: { processedJobs: 4 },
    });

    await heartbeat.stop();
    expect(await repository.getLatest('worker')).toMatchObject({
      status: 'stopped',
      stoppedAt: expect.any(String),
    });
  });

  it('reports liveness separately from database and heartbeat readiness', async () => {
    let dbReady = true;
    let heartbeatReady = false;
    const pool = {
      query: async () => {
        if (!dbReady) throw new Error('database unavailable');
        return { rows: [{ '?column?': 1 }] };
      },
    } as unknown as Pool;
    const server = await startRuntimeHealthServer({
      component: 'scheduler',
      port: 0,
      pool,
      isHeartbeatReady: () => heartbeatReady,
    });
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${server.port}`;

    expect((await fetch(`${baseUrl}/health/live`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/health/ready`)).status).toBe(503);

    heartbeatReady = true;
    expect((await fetch(`${baseUrl}/health/ready`)).status).toBe(200);

    dbReady = false;
    expect((await fetch(`${baseUrl}/health/ready`)).status).toBe(503);
  });
});
