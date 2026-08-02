import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type {
  RuntimeComponent,
  RuntimeProcessesRepository,
  RuntimeProcessStatus,
} from '../repositories/runtimeProcessesRepository.js';
import type { ObservabilityRuntime } from '../observability/runtime.js';

export const RUNTIME_HEARTBEAT_INTERVAL_MS = 5_000;

type RuntimeMonitorSnapshot = {
  status: string;
  startedAt: string | null;
  lastError: string | null;
  [key: string]: unknown;
};

type RuntimeHeartbeatLogger = {
  error: (message: string, error?: unknown) => void;
};

function normalizeStatus(status: string): RuntimeProcessStatus {
  return ['starting', 'idle', 'processing', 'error', 'stopped'].includes(status)
    ? (status as RuntimeProcessStatus)
    : 'starting';
}

export function createRuntimeInstanceId(component: RuntimeComponent): string {
  return `${component}-${os.hostname()}-${process.pid}-${randomUUID()}`;
}

export function startRuntimeHeartbeat(input: {
  component: RuntimeComponent;
  repository: RuntimeProcessesRepository;
  snapshot: () => RuntimeMonitorSnapshot;
  logger: RuntimeHeartbeatLogger;
  instanceId?: string;
  intervalMs?: number;
  observability?: ObservabilityRuntime;
}) {
  const instanceId = input.instanceId ?? createRuntimeInstanceId(input.component);
  const startedAt = input.snapshot().startedAt ?? new Date().toISOString();
  const intervalMs = input.intervalMs ?? RUNTIME_HEARTBEAT_INTERVAL_MS;
  let lastSuccessfulHeartbeatAt: string | null = null;
  let stopped = false;
  let activeWrite: Promise<void> | null = null;

  const beat = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (activeWrite) return activeWrite;
    activeWrite = (async () => {
      try {
        const snapshot = input.snapshot();
        const heartbeat = await input.repository.recordHeartbeat({
          component: input.component,
          instanceId,
          status: normalizeStatus(snapshot.status),
          startedAt,
          lastError: snapshot.lastError,
          metadata: snapshot,
        });
        lastSuccessfulHeartbeatAt = heartbeat.heartbeatAt;
        input.observability?.recordHeartbeat(input.component, 'ok');
      } catch (error) {
        input.observability?.recordHeartbeat(input.component, 'error');
        input.logger.error(`${input.component}: failed to persist runtime heartbeat`, error);
      }
    })().finally(() => {
      activeWrite = null;
    });
    return activeWrite;
  };

  const initialized = beat();
  const timer = setInterval(() => void beat(), intervalMs);

  return {
    instanceId,
    initialized,
    beat,
    isReady() {
      return (
        lastSuccessfulHeartbeatAt !== null &&
        Date.now() - new Date(lastSuccessfulHeartbeatAt).getTime() <= intervalMs * 3
      );
    },
    lastSuccessfulHeartbeatAt() {
      return lastSuccessfulHeartbeatAt;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await activeWrite;
      await input.repository.markStopped(input.component, instanceId);
    },
  };
}
