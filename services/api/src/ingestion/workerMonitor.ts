export type IngestionWorkerStatus = 'disabled' | 'idle' | 'processing' | 'error' | 'stopped';

export type IngestionWorkerTickOutcome = 'processed' | 'empty_queue' | 'error';

export type IngestionWorkerTick = {
  startedAt: string;
  completedAt: string;
  outcome: IngestionWorkerTickOutcome;
  processedCount: number;
  lastJobSourceName: string | null;
  lastJobStatus: string | null;
  error: string | null;
};

export type IngestionWorkerMonitor = {
  enabled: boolean;
  status: IngestionWorkerStatus;
  startDelayMs: number;
  pollIntervalMs: number;
  maxJobsPerTick: number;
  startedAt: string | null;
  lastTickStartedAt: string | null;
  lastTickCompletedAt: string | null;
  lastProcessedAt: string | null;
  lastProcessedJobId: string | null;
  lastProcessedSourceName: string | null;
  lastProcessedJobStatus: string | null;
  processedJobs: number;
  consecutiveErrors: number;
  lastError: string | null;
  lastStopAt: string | null;
  recentTicks: IngestionWorkerTick[];
};

export function createIngestionWorkerMonitor(
  input?: Partial<IngestionWorkerMonitor>,
): IngestionWorkerMonitor {
  return {
    enabled: false,
    status: 'disabled',
    startDelayMs: 0,
    pollIntervalMs: 0,
    maxJobsPerTick: 0,
    startedAt: null,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    lastProcessedAt: null,
    lastProcessedJobId: null,
    lastProcessedSourceName: null,
    lastProcessedJobStatus: null,
    processedJobs: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastStopAt: null,
    recentTicks: [],
    ...input,
  };
}

export function pushIngestionWorkerTick(
  monitor: IngestionWorkerMonitor,
  tick: IngestionWorkerTick,
  maxTicks = 8,
) {
  monitor.recentTicks = [tick, ...monitor.recentTicks].slice(0, maxTicks);
}
