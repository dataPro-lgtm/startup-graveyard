import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CommercialAdminMetrics, PlatformAdminMetrics } from '@sg/shared/schemas/adminStats';
import {
  platformSchedulerMonitorSchema,
  platformWorkerMonitorSchema,
} from '@sg/shared/schemas/adminStats';
import { createSchedulerMonitor } from '../../../ingestion/schedulerMonitor.js';
import type {
  TeamWorkspaceRecoveryPlaybookRun,
  TeamWorkspaceRecoveryPlaybookStepName,
} from '@sg/shared/schemas/teamWorkspace';

export const STALE_RUNNING_THRESHOLD_MINUTES = 30;
export const DEFAULT_PLATFORM_SNAPSHOT_INTERVAL_MINUTES = 30;
export const PLATFORM_SNAPSHOT_METRICS_WINDOW_HOURS = 24;
export const RUNTIME_HEARTBEAT_STALE_MS = 20_000;

export function resolveWorkerMonitor(
  local: FastifyInstance['ingestionWorkerMonitor'],
  heartbeat: Awaited<ReturnType<FastifyInstance['runtimeProcessesRepo']['getLatest']>>,
): PlatformAdminMetrics['worker'] {
  const fallback = platformWorkerMonitorSchema.parse({
    ...local,
    source: 'local',
    instanceId: null,
    heartbeatAt: local.lastTickCompletedAt ?? local.lastTickStartedAt,
  });
  if (!heartbeat) return fallback;
  const parsed = platformWorkerMonitorSchema.safeParse({
    ...local,
    ...heartbeat.metadata,
    enabled: heartbeat.status !== 'stopped',
    status: heartbeat.status,
    lastError: heartbeat.lastError,
    lastStopAt: heartbeat.stoppedAt,
    source: 'runtime_heartbeat',
    instanceId: heartbeat.instanceId,
    heartbeatAt: heartbeat.heartbeatAt,
  });
  return parsed.success ? parsed.data : fallback;
}

export function resolveSchedulerMonitor(
  heartbeat: Awaited<ReturnType<FastifyInstance['runtimeProcessesRepo']['getLatest']>>,
): PlatformAdminMetrics['scheduler'] {
  const local = createSchedulerMonitor();
  const fallback = platformSchedulerMonitorSchema.parse({
    ...local,
    source: 'local',
    instanceId: null,
    heartbeatAt: null,
  });
  if (!heartbeat) return fallback;
  const parsed = platformSchedulerMonitorSchema.safeParse({
    ...local,
    ...heartbeat.metadata,
    enabled: heartbeat.status !== 'stopped',
    status: heartbeat.status,
    lastError: heartbeat.lastError,
    lastStopAt: heartbeat.stoppedAt,
    source: 'runtime_heartbeat',
    instanceId: heartbeat.instanceId,
    heartbeatAt: heartbeat.heartbeatAt,
  });
  return parsed.success ? parsed.data : fallback;
}

export const recoveryWebhookDeliveryBodySchema = z.object({
  retryIntervalHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14)
    .optional(),
  force: z.boolean().optional(),
});

export const recoverySlackDeliveryBodySchema = z.object({
  force: z.boolean().optional(),
});

export const recoveryPlaybookRerunBodySchema = z.object({
  runId: z.string().uuid(),
  retryIntervalHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14)
    .optional(),
  force: z.boolean().optional(),
});

export function failedRecoveryPlaybookSteps(
  run: TeamWorkspaceRecoveryPlaybookRun,
): TeamWorkspaceRecoveryPlaybookStepName[] {
  const failed: TeamWorkspaceRecoveryPlaybookStepName[] = [];
  if (run.steps.outreach.status === 'failed') failed.push('outreach');
  if (run.steps.ownerEmail.status === 'failed') failed.push('ownerEmail');
  if (run.steps.memberEmail.status === 'failed') failed.push('memberEmail');
  if (run.steps.crmSync.status === 'failed') failed.push('crmSync');
  if (run.steps.webhook.status === 'failed') failed.push('webhook');
  if (run.steps.slack.status === 'failed') failed.push('slack');
  return failed;
}

export interface ContentStatsResult {
  totalPublished: number;
  totalFundingUsd: number;
  totalDraft: number;
  avgFundingUsd: number;
  byIndustry: Array<{ industry: string; count: number; totalFunding: number }>;
  byCountry: Array<{ country: string; count: number }>;
  byYear: Array<{ year: number; count: number }>;
  byFailureReason: Array<{ reason: string; count: number }>;
  recentlyAdded: Array<{ id: string; slug: string; companyName: string; createdAt: string }>;
  pendingReviews: number;
  ingestionStats: { pending: number; running: number; failed: number; completed: number };
}

export function recoveryStageFromCommercialTouch(
  type: CommercialAdminMetrics['billingFunnel']['recentEvents'][number]['type'] | null,
): CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['recoveryStage'] {
  if (type === 'subscription_recovered') return 'recovered_followup';
  if (type === 'checkout_started' || type === 'checkout_completed' || type === 'portal_started') {
    return 'owner_engaged';
  }
  return 'needs_outreach';
}

export function recoveryStageTitle(
  stage: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['recoveryStage'],
) {
  if (stage === 'needs_outreach') return '尚未触达';
  if (stage === 'owner_engaged') return 'Owner 已开始恢复';
  return '已恢复待收尾';
}

export const RECOVERY_FOLLOW_UP_HOURS = 24;

export function nextFollowUpAt(
  input: Pick<
    CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number],
    'recoveryStage' | 'lastOutreachAt' | 'nextOutreachAttemptAt'
  >,
): string | null {
  if (input.recoveryStage !== 'needs_outreach') return null;
  if (input.nextOutreachAttemptAt) return input.nextOutreachAttemptAt;
  if (!input.lastOutreachAt) return null;
  return new Date(
    new Date(input.lastOutreachAt).getTime() + RECOVERY_FOLLOW_UP_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

export function followUpStateFromWorkspace(
  input: Pick<
    CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number],
    'recoveryStage' | 'lastOutreachAt' | 'nextOutreachAttemptAt'
  >,
): CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['followUpState'] {
  if (input.recoveryStage === 'owner_engaged') return 'owner_engaged';
  if (input.recoveryStage === 'recovered_followup') return 'recovered_followup';
  if (!input.lastOutreachAt) return 'needs_initial_touch';
  const dueAt = nextFollowUpAt(input);
  if (!dueAt) return 'awaiting_owner';
  return new Date(dueAt).getTime() <= Date.now() ? 'overdue' : 'awaiting_owner';
}

export function followUpStateTitle(
  state: CommercialAdminMetrics['teamWorkspaces']['followUpStates'][number]['state'],
) {
  if (state === 'needs_initial_touch') return '待首次触达';
  if (state === 'awaiting_owner') return '等待 Owner 响应';
  if (state === 'overdue') return '已逾期待跟进';
  if (state === 'owner_engaged') return 'Owner 已响应';
  return '恢复待收尾';
}

export function followUpStatePriority(
  state: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['followUpState'],
) {
  if (state === 'overdue') return 0;
  if (state === 'needs_initial_touch') return 1;
  if (state === 'awaiting_owner') return 2;
  if (state === 'owner_engaged') return 3;
  return 4;
}
