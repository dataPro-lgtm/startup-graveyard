export type SchedulerStatus = 'disabled' | 'starting' | 'idle' | 'processing' | 'error' | 'stopped';

export type SchedulerMonitor = {
  enabled: boolean;
  status: SchedulerStatus;
  pollIntervalMs: number;
  startedAt: string | null;
  lastTickStartedAt: string | null;
  lastTickCompletedAt: string | null;
  lastEnqueuedAt: string | null;
  enqueuedJobs: number;
  consecutiveErrors: number;
  lastError: string | null;
  lastStopAt: string | null;
};

export function createSchedulerMonitor(input?: Partial<SchedulerMonitor>): SchedulerMonitor {
  return {
    enabled: false,
    status: 'disabled',
    pollIntervalMs: 0,
    startedAt: null,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    lastEnqueuedAt: null,
    enqueuedJobs: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastStopAt: null,
    ...input,
  };
}
