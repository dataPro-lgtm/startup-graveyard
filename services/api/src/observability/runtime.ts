import os from 'node:os';
import {
  context,
  isSpanContextValid,
  metrics,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Counter,
  type Histogram,
  type Span,
  type TextMapGetter,
  type UpDownCounter,
} from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PlatformSnapshot } from '@sg/shared/schemas/adminStats';

export type ObservabilityRuntimeRole = 'api' | 'worker' | 'scheduler';

export type ObservabilityConfig = {
  enabled: boolean;
  role: ObservabilityRuntimeRole;
  metricsHost: string;
  metricsPort: number;
  metricsPath: string;
  otlpTraceUrl: string | null;
  serviceVersion: string;
};

type HttpRequestState = {
  span: Span;
  startedAt: bigint;
};

const requestHeaderGetter: TextMapGetter<FastifyRequest['headers']> = {
  keys(carrier) {
    return Object.keys(carrier);
  },
  get(carrier, key) {
    const value = carrier[key.toLowerCase()];
    return Array.isArray(value) ? value : value == null ? undefined : String(value);
  },
};

function normalizeRoute(request: FastifyRequest): string {
  return request.routeOptions.url || 'unmatched';
}

function elapsedMilliseconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function statusClass(statusCode: number): string {
  return `${Math.floor(statusCode / 100)}xx`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ObservabilityRuntime {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly metricsPort: number;
  readonly metricsPath: string;

  private sdk: NodeSDK | null = null;
  private started = false;
  private readonly requestStates = new WeakMap<FastifyRequest, HttpRequestState>();
  private httpRequests?: Counter;
  private httpDuration?: Histogram;
  private httpActive?: UpDownCounter;
  private ingestionJobs?: Counter;
  private ingestionDuration?: Histogram;
  private schedulerEnqueues?: Counter;
  private schedulerTicks?: Counter;
  private heartbeatWrites?: Counter;
  private alertDeliveries?: Counter;
  private platformSnapshotValues: PlatformSnapshot | null = null;

  constructor(private readonly config: ObservabilityConfig) {
    this.enabled = config.enabled;
    this.serviceName = `startup-graveyard-${config.role}`;
    this.metricsPort = config.metricsPort;
    this.metricsPath = config.metricsPath;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.started) return;

    const metricsReady = new Promise<void>((resolve, reject) => {
      const metricReader = new PrometheusExporter(
        {
          host: this.config.metricsHost,
          port: this.config.metricsPort,
          endpoint: this.config.metricsPath,
          withoutScopeInfo: true,
          withResourceConstantLabels: /^service\./,
        },
        (error) => (error ? reject(error) : resolve()),
      );
      const traceExporter = this.config.otlpTraceUrl
        ? new OTLPTraceExporter({ url: this.config.otlpTraceUrl })
        : null;
      if (!traceExporter) {
        process.env.OTEL_TRACES_EXPORTER = 'none';
      }
      process.env.OTEL_LOGS_EXPORTER ??= 'none';

      this.sdk = new NodeSDK({
        resource: defaultResource().merge(
          resourceFromAttributes({
            [ATTR_SERVICE_NAMESPACE]: 'startup-graveyard',
            [ATTR_SERVICE_NAME]: this.serviceName,
            [ATTR_SERVICE_INSTANCE_ID]: `${os.hostname()}-${process.pid}`,
            [ATTR_SERVICE_VERSION]: this.config.serviceVersion,
            'deployment.environment.name': process.env.NODE_ENV ?? 'development',
            'service.runtime.role': this.config.role,
          }),
        ),
        metricReaders: [metricReader],
        ...(traceExporter ? { traceExporter } : {}),
      });
      this.sdk.start();
    });

    try {
      await metricsReady;
      this.initializeMetrics();
      this.started = true;
    } catch (error) {
      await this.sdk?.shutdown().catch(() => undefined);
      this.sdk = null;
      throw new Error(`Unable to start observability runtime: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  registerHttpInstrumentation(app: FastifyInstance): void {
    if (!this.enabled) return;

    app.addHook('onRequest', async (request, reply) => {
      const parentContext = propagation.extract(
        context.active(),
        request.headers,
        requestHeaderGetter,
      );
      const span = trace.getTracer('startup-graveyard').startSpan(
        `${request.method} request`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            'http.request.method': request.method,
            'server.address': request.hostname,
          },
        },
        parentContext,
      );
      this.requestStates.set(request, { span, startedAt: process.hrtime.bigint() });
      this.httpActive?.add(1, { 'http.request.method': request.method });
      const spanContext = span.spanContext();
      if (isSpanContextValid(spanContext)) {
        request.log = request.log.child({
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
        });
        reply.header('x-trace-id', spanContext.traceId);
      }
    });

    app.addHook('onError', async (request, _reply, error) => {
      const state = this.requestStates.get(request);
      if (!state) return;
      state.span.recordException(error);
      state.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    });

    app.addHook('onResponse', async (request, reply) => {
      const state = this.requestStates.get(request);
      if (!state) return;
      const route = normalizeRoute(request);
      const attributes = {
        'http.request.method': request.method,
        'http.route': route,
        'http.response.status_code': reply.statusCode,
        'http.response.status_class': statusClass(reply.statusCode),
      };
      const durationMs = elapsedMilliseconds(state.startedAt);
      this.httpRequests?.add(1, attributes);
      this.httpDuration?.record(durationMs, attributes);
      this.httpActive?.add(-1, { 'http.request.method': request.method });
      state.span.updateName(`${request.method} ${route}`);
      state.span.setAttributes(attributes);
      if (reply.statusCode >= 500) {
        state.span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        state.span.setStatus({ code: SpanStatusCode.OK });
      }
      state.span.end();
      this.requestStates.delete(request);
    });
  }

  async withSpan<T>(name: string, attributes: Attributes, work: () => Promise<T>): Promise<T> {
    if (!this.enabled) return work();
    const span = trace
      .getTracer('startup-graveyard')
      .startSpan(name, { kind: SpanKind.INTERNAL, attributes });
    try {
      const result = await context.with(trace.setSpan(context.active(), span), work);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : errorMessage(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) });
      throw error;
    } finally {
      span.end();
    }
  }

  recordIngestionJob(input: { sourceName: string; status: string; durationMs: number }): void {
    const attributes = { source_name: input.sourceName, status: input.status };
    this.ingestionJobs?.add(1, attributes);
    this.ingestionDuration?.record(input.durationMs, attributes);
  }

  recordSchedulerTick(outcome: 'ok' | 'error'): void {
    this.schedulerTicks?.add(1, { outcome });
  }

  recordSchedulerEnqueue(sourceName: string): void {
    this.schedulerEnqueues?.add(1, { source_name: sourceName });
  }

  recordHeartbeat(component: 'worker' | 'scheduler', outcome: 'ok' | 'error'): void {
    this.heartbeatWrites?.add(1, { component, outcome });
  }

  recordAlertDelivery(input: {
    channel: 'webhook' | 'slack';
    severity: string;
    outcome: 'delivered' | 'failed' | 'suppressed' | 'resolved';
  }): void {
    this.alertDeliveries?.add(1, input);
  }

  recordPlatformSnapshot(snapshot: PlatformSnapshot): void {
    this.platformSnapshotValues = snapshot;
  }

  async shutdown(): Promise<void> {
    if (!this.sdk) return;
    const sdk = this.sdk;
    this.sdk = null;
    this.started = false;
    await sdk.shutdown();
  }

  private initializeMetrics(): void {
    const meter = metrics.getMeter('startup-graveyard');
    this.httpRequests = meter.createCounter('sg.http.server.requests', {
      description: 'Completed Startup Graveyard HTTP requests.',
      unit: '{request}',
    });
    this.httpDuration = meter.createHistogram('sg.http.server.duration', {
      description: 'Startup Graveyard HTTP request latency.',
      unit: 'ms',
    });
    this.httpActive = meter.createUpDownCounter('sg.http.server.active_requests', {
      description: 'Currently active Startup Graveyard HTTP requests.',
      unit: '{request}',
    });
    this.ingestionJobs = meter.createCounter('sg.ingestion.jobs', {
      description: 'Processed ingestion jobs by source and final status.',
      unit: '{job}',
    });
    this.ingestionDuration = meter.createHistogram('sg.ingestion.job.duration', {
      description: 'Ingestion job processing latency.',
      unit: 'ms',
    });
    this.schedulerEnqueues = meter.createCounter('sg.scheduler.enqueues', {
      description: 'Scheduled jobs enqueued by source.',
      unit: '{job}',
    });
    this.schedulerTicks = meter.createCounter('sg.scheduler.ticks', {
      description: 'Scheduler polling ticks by outcome.',
      unit: '{tick}',
    });
    this.heartbeatWrites = meter.createCounter('sg.runtime.heartbeat.writes', {
      description: 'Persisted runtime heartbeat attempts.',
      unit: '{write}',
    });
    this.alertDeliveries = meter.createCounter('sg.platform.alert.deliveries', {
      description: 'Platform alert delivery decisions by channel and outcome.',
      unit: '{delivery}',
    });

    meter
      .createObservableGauge('sg.process.uptime', {
        description: 'Process uptime.',
        unit: 's',
      })
      .addCallback((result) => result.observe(process.uptime()));
    meter
      .createObservableGauge('sg.process.memory.rss', {
        description: 'Resident memory size.',
        unit: 'By',
      })
      .addCallback((result) => result.observe(process.memoryUsage().rss));
    meter
      .createObservableGauge('sg.platform.ingestion.queued', {
        description: 'Queued ingestion jobs from the latest platform snapshot.',
        unit: '{job}',
      })
      .addCallback((result) => {
        if (this.platformSnapshotValues) {
          result.observe(this.platformSnapshotValues.queuedCount);
        }
      });
    meter
      .createObservableGauge('sg.platform.alerts', {
        description: 'Active platform alerts from the latest platform snapshot.',
        unit: '{alert}',
      })
      .addCallback((result) => {
        const snapshot = this.platformSnapshotValues;
        if (!snapshot) return;
        result.observe(snapshot.criticalAlertCount, { severity: 'critical' });
        result.observe(snapshot.warningAlertCount, { severity: 'warning' });
      });
  }
}

export function createDisabledObservability(
  role: ObservabilityRuntimeRole = 'api',
): ObservabilityRuntime {
  return new ObservabilityRuntime({
    enabled: false,
    role,
    metricsHost: '127.0.0.1',
    metricsPort: 9464,
    metricsPath: '/metrics',
    otlpTraceUrl: null,
    serviceVersion: 'test',
  });
}
