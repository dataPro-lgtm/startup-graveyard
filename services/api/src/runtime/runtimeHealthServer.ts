import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import type { RuntimeComponent } from '../repositories/runtimeProcessesRepository.js';

export type RuntimeHealthServer = {
  port: number;
  close: () => Promise<void>;
};

export async function startRuntimeHealthServer(input: {
  component: RuntimeComponent;
  port: number;
  pool: Pool;
  isHeartbeatReady: () => boolean;
}): Promise<RuntimeHealthServer> {
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.url === '/health/live') {
      response.statusCode = 200;
      response.end(JSON.stringify({ ok: true, service: `startup-graveyard-${input.component}` }));
      return;
    }
    if (request.url !== '/health/ready') {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }

    try {
      await input.pool.query('SELECT 1');
      const heartbeat = input.isHeartbeatReady();
      response.statusCode = heartbeat ? 200 : 503;
      response.end(
        JSON.stringify({
          ok: heartbeat,
          service: `startup-graveyard-${input.component}`,
          db: true,
          heartbeat,
        }),
      );
    } catch {
      response.statusCode = 503;
      response.end(
        JSON.stringify({
          ok: false,
          service: `startup-graveyard-${input.component}`,
          db: false,
          heartbeat: input.isHeartbeatReady(),
        }),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(input.port, '0.0.0.0', () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  if (!address) {
    await closeServer(server);
    throw new Error(`Unable to resolve ${input.component} health server address.`);
  }

  return {
    port: address.port,
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
