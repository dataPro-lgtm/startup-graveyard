import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './buildApp.js';
import { ObservabilityRuntime } from './observability/runtime.js';

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('unable to allocate test port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('observability runtime', () => {
  const previousEnv = {
    tracesExporter: process.env.OTEL_TRACES_EXPORTER,
    logsExporter: process.env.OTEL_LOGS_EXPORTER,
  };

  afterEach(() => {
    if (previousEnv.tracesExporter === undefined) delete process.env.OTEL_TRACES_EXPORTER;
    else process.env.OTEL_TRACES_EXPORTER = previousEnv.tracesExporter;
    if (previousEnv.logsExporter === undefined) delete process.env.OTEL_LOGS_EXPORTER;
    else process.env.OTEL_LOGS_EXPORTER = previousEnv.logsExporter;
  });

  it('exports low-cardinality HTTP metrics and flushes OTLP traces', async () => {
    const metricsPort = await availablePort();
    const otlpPort = await availablePort();
    const traceRequests: Array<{ url: string; bytes: number }> = [];
    const receiver = createHttpServer((request, response) => {
      let bytes = 0;
      request.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
      });
      request.on('end', () => {
        traceRequests.push({ url: request.url ?? '', bytes });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
      });
    });
    await listen(receiver, otlpPort);

    const observability = new ObservabilityRuntime({
      enabled: true,
      role: 'api',
      metricsHost: '127.0.0.1',
      metricsPort,
      metricsPath: '/metrics',
      otlpTraceUrl: `http://127.0.0.1:${otlpPort}/v1/traces`,
      serviceVersion: 'test',
    });
    const app = await buildApp({ logger: false, observability });
    try {
      await observability.start();
      await app.ready();
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);

      await observability.withSpan('test.operation', { operation: 'verification' }, async () => {});
      const scrape = await fetch(`http://127.0.0.1:${metricsPort}/metrics`);
      const body = await scrape.text();
      expect(scrape.status).toBe(200);
      expect(body).toContain('service_name="startup-graveyard-api"');
      expect(body).toMatch(/sg_http_server_requests_total\{/);
      expect(body).toContain('http_route="/health"');
      expect(body).toMatch(/sg_process_uptime\{/);
    } finally {
      await app.close();
      await observability.shutdown();
      await close(receiver);
    }

    expect(traceRequests.some((request) => request.url === '/v1/traces' && request.bytes > 0)).toBe(
      true,
    );
  });
});
