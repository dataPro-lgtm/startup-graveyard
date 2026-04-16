import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import type {
  CommercialAdminMetrics,
  PlatformAdminMetrics,
  PlatformSnapshot,
  PlatformSnapshotRollup,
  PlatformSnapshotTrend,
} from '@sg/shared/schemas/adminStats';
import type {
  TeamWorkspaceRecoveryPlaybookRun,
  TeamWorkspaceRecoveryPlaybookStepName,
} from '@sg/shared/schemas/teamWorkspace';
import { adminStatsResponseSchema, platformSnapshotSchema } from '../../schemas/adminStats.js';
import { handoffTeamWorkspaceRecoveryOutreachBodySchema } from '../../schemas/teamWorkspace.js';
import { getRuntimeFeatureFlags } from '../../env/runtime.js';
import { deliverRecoveryOutreachCrmSync } from '../../recoveryOutreach/deliverRecoveryOutreachCrmSync.js';
import { deliverRecoveryFallbackMemberEmail } from '../../recoveryOutreach/deliverRecoveryFallbackMemberEmail.js';
import { deliverRecoveryOutreachOwnerEmail } from '../../recoveryOutreach/deliverRecoveryOutreachOwnerEmail.js';
import { runRecoveryOutreachPlaybook } from '../../recoveryOutreach/runRecoveryOutreachPlaybook.js';
import { deliverRecoveryOutreachWebhook } from '../../recoveryOutreach/deliverRecoveryOutreachWebhook.js';
import { deliverRecoveryOutreachSlackAlert } from '../../recoveryOutreach/deliverRecoveryOutreachSlackAlert.js';

interface ContentStatsResult {
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

const STALE_RUNNING_THRESHOLD_MINUTES = 30;

const recoveryWebhookDeliveryBodySchema = z.object({
  retryIntervalHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14)
    .optional(),
  force: z.boolean().optional(),
});

const recoverySlackDeliveryBodySchema = z.object({
  force: z.boolean().optional(),
});

const recoveryPlaybookRerunBodySchema = z.object({
  runId: z.string().uuid(),
  retryIntervalHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14)
    .optional(),
  force: z.boolean().optional(),
});

function failedRecoveryPlaybookSteps(
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

export async function capturePlatformSnapshot(
  app: FastifyInstance,
  triggerType: PlatformSnapshot['triggerType'],
) {
  const statsPayload = await fetchAdminStatsPayload(app);
  const snapshot = buildPlatformSnapshot(statsPayload.platform, triggerType);
  const auditItem = await app.auditRepo.record({
    action: 'platform.snapshot_captured',
    metadata: {
      snapshot,
    },
  });
  return {
    auditId: auditItem.id,
    snapshot,
  };
}

export async function adminStatsRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    try {
      const statsPayload = await fetchAdminStatsPayload(app);
      return reply.send(adminStatsResponseSchema.parse(statsPayload));
    } catch (err) {
      app.log.error(err, 'Failed to fetch admin stats');
      return reply.code(500).send({ error: 'stats_unavailable' });
    }
  });

  app.post('/platform-snapshot', async (_request, reply) => {
    try {
      const captured = await capturePlatformSnapshot(app, 'manual');
      return reply.send({
        ok: true,
        auditId: captured.auditId,
        snapshot: captured.snapshot,
      });
    } catch (err) {
      app.log.error(err, 'Failed to capture platform snapshot');
      return reply.code(500).send({ error: 'platform_snapshot_unavailable' });
    }
  });

  app.get('/recovery-queue.csv', async (_request, reply) => {
    try {
      const commercialStats = await fetchCommercialStats(app);
      const rows = commercialStats.teamWorkspaces.actionableWorkspaces;
      const csv = renderRecoveryQueueCsv(rows);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="team-workspace-recovery-queue-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return reply.send(csv);
    } catch (err) {
      app.log.error(err, 'Failed to export workspace recovery queue');
      return reply.code(500).send({ error: 'recovery_queue_export_unavailable' });
    }
  });

  app.post('/recovery-handoffs/export', async (_request, reply) => {
    try {
      const { exportedCount } = await app.teamWorkspacesRepo.exportHandedOffAdminRecoveryOutreach();
      const commercialStats = await fetchCommercialStats(app);
      const rows = commercialStats.teamWorkspaces.actionableWorkspaces.filter(
        (item) => item.lastOutreachStatus === 'handed_off',
      );
      const csv = renderRecoveryHandoffCsv(rows);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="team-workspace-recovery-handoffs-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      reply.header('x-recovery-handoff-exported-count', String(exportedCount));
      return reply.send(csv);
    } catch (err) {
      app.log.error(err, 'Failed to export recovery handoff CSV');
      return reply.code(500).send({ error: 'recovery_handoff_export_unavailable' });
    }
  });

  app.post('/recovery-owner-email', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_owner_email_body' });
      }
      const delivered = await deliverRecoveryOutreachOwnerEmail(
        app.teamWorkspacesRepo,
        parsed.data,
      );
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_owner_email_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          deliveredCount: delivered.deliveredCount,
          failedCount: delivered.failedCount,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        deliveredCount: delivered.deliveredCount,
        failedCount: delivered.failedCount,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver recovery owner emails');
      return reply.code(500).send({ error: 'recovery_owner_email_unavailable' });
    }
  });

  app.post('/recovery-member-email', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_member_email_body' });
      }
      const delivered = await deliverRecoveryFallbackMemberEmail(
        app.teamWorkspacesRepo,
        parsed.data,
      );
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_member_email_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          deliveredCount: delivered.deliveredCount,
          failedCount: delivered.failedCount,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        deliveredCount: delivered.deliveredCount,
        failedCount: delivered.failedCount,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver member recovery emails');
      return reply.code(500).send({ error: 'recovery_member_email_unavailable' });
    }
  });

  app.post('/recovery-playbook', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_playbook_body' });
      }
      const played = await runRecoveryOutreachPlaybook(app.teamWorkspacesRepo, {
        ...parsed.data,
        triggerType: 'manual',
      });
      if (!played.ok) {
        return reply.code(502).send({
          error: 'recovery_playbook_failed',
          summary: played.summary,
          steps: played.steps,
        });
      }
      return reply.send({
        ok: true,
        summary: played.summary,
        steps: played.steps,
      });
    } catch (err) {
      app.log.error(err, 'Failed to run recovery playbook');
      return reply.code(500).send({ error: 'recovery_playbook_unavailable' });
    }
  });

  app.post('/recovery-playbook/rerun-failed', async (_request, reply) => {
    try {
      const parsed = recoveryPlaybookRerunBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_playbook_rerun_body' });
      }
      const previousRun = await app.teamWorkspacesRepo.getRecoveryPlaybookRunById(
        parsed.data.runId,
      );
      if (!previousRun) {
        return reply.code(404).send({ error: 'recovery_playbook_run_not_found' });
      }
      const requestedSteps = failedRecoveryPlaybookSteps(previousRun);
      if (requestedSteps.length === 0) {
        return reply.code(409).send({ error: 'recovery_playbook_no_failed_steps' });
      }
      const played = await runRecoveryOutreachPlaybook(app.teamWorkspacesRepo, {
        retryIntervalHours: parsed.data.retryIntervalHours ?? previousRun.retryIntervalHours,
        force: parsed.data.force ?? true,
        triggerType: 'manual_rerun',
        onlySteps: requestedSteps,
        rerunOfRunId: previousRun.id,
      });
      if (!played.ok) {
        return reply.code(502).send({
          error: 'recovery_playbook_rerun_failed',
          summary: played.summary,
          steps: played.steps,
          rerunOfRunId: previousRun.id,
          requestedSteps,
        });
      }
      return reply.send({
        ok: true,
        summary: played.summary,
        steps: played.steps,
        rerunOfRunId: previousRun.id,
        requestedSteps,
      });
    } catch (err) {
      app.log.error(err, 'Failed to rerun failed recovery playbook steps');
      return reply.code(500).send({ error: 'recovery_playbook_rerun_unavailable' });
    }
  });

  app.post('/recovery-handoffs/crm', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_crm_delivery_body' });
      }
      const delivered = await deliverRecoveryOutreachCrmSync(app.teamWorkspacesRepo, parsed.data);
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_handoff_crm_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          syncedCount: delivered.syncedCount,
          failedCount: delivered.failedCount,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        syncedCount: delivered.syncedCount,
        failedCount: delivered.failedCount,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to sync recovery handoffs to CRM API');
      return reply.code(500).send({ error: 'recovery_handoff_crm_unavailable' });
    }
  });

  app.post('/recovery-handoffs/webhook', async (_request, reply) => {
    try {
      const parsed = recoveryWebhookDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_webhook_delivery_body' });
      }
      const delivered = await deliverRecoveryOutreachWebhook(app.teamWorkspacesRepo, parsed.data);
      if (!delivered.ok) {
        return reply
          .code(delivered.error === 'recovery_handoff_webhook_disabled' ? 503 : 502)
          .send({
            error: delivered.error,
            detail: delivered.detail,
            attemptedCount: delivered.attemptedCount,
            deliveredCount: delivered.deliveredCount,
            statusCode: delivered.statusCode,
          });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        deliveredCount: delivered.deliveredCount,
        statusCode: delivered.statusCode,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver recovery handoffs via webhook');
      return reply.code(500).send({ error: 'recovery_handoff_webhook_unavailable' });
    }
  });

  app.post('/recovery-handoffs/slack', async (_request, reply) => {
    try {
      const parsed = recoverySlackDeliveryBodySchema.safeParse(_request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_recovery_slack_delivery_body' });
      }
      const delivered = await deliverRecoveryOutreachSlackAlert(
        app.teamWorkspacesRepo,
        parsed.data,
      );
      if (!delivered.ok) {
        return reply.code(delivered.error === 'recovery_slack_alert_disabled' ? 503 : 502).send({
          error: delivered.error,
          detail: delivered.detail,
          attemptedCount: delivered.attemptedCount,
          alertedCount: delivered.alertedCount,
          statusCode: delivered.statusCode,
        });
      }
      return reply.send({
        ok: true,
        attemptedCount: delivered.attemptedCount,
        alertedCount: delivered.alertedCount,
        statusCode: delivered.statusCode,
        skipped: delivered.skipped,
      });
    } catch (err) {
      app.log.error(err, 'Failed to deliver recovery handoffs to Slack');
      return reply.code(500).send({ error: 'recovery_slack_alert_unavailable' });
    }
  });

  app.post('/recovery-outreach/handoff', async (request, reply) => {
    const parsed = handoffTeamWorkspaceRecoveryOutreachBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_recovery_outreach_handoff_body' });
    }
    const result = await app.teamWorkspacesRepo.handoffAdminRecoveryOutreach(parsed.data);
    if (result === 'workspace_not_found' || result === 'outreach_not_found') {
      return reply.code(404).send({ error: result });
    }
    return reply.send({ ok: true });
  });
}

function emptyContentStats(): ContentStatsResult {
  return {
    totalPublished: 0,
    totalFundingUsd: 0,
    totalDraft: 0,
    avgFundingUsd: 0,
    byIndustry: [],
    byCountry: [],
    byYear: [],
    byFailureReason: [],
    recentlyAdded: [],
    pendingReviews: 0,
    ingestionStats: { pending: 0, running: 0, failed: 0, completed: 0 },
  };
}

function parsePlatformSnapshotMetadata(metadata: Record<string, unknown>): PlatformSnapshot | null {
  const candidate =
    metadata.snapshot && typeof metadata.snapshot === 'object' && !Array.isArray(metadata.snapshot)
      ? metadata.snapshot
      : metadata;
  const parsed = platformSnapshotSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function summarizePlatformSnapshotTrend(
  recentSnapshots: PlatformSnapshot[],
): PlatformSnapshotTrend {
  if (recentSnapshots.length === 0) {
    return {
      sampleCount: 0,
      oldestCapturedAt: null,
      latestCapturedAt: null,
      queuedCountDelta: null,
      oldestQueuedAgeDelta: null,
      alertCountDelta: null,
      failedCountDelta: null,
      workerConsecutiveErrorsDelta: null,
      maxQueuedCount: 0,
      maxOldestQueuedAgeMinutes: null,
      maxAlertCount: 0,
      maxFailedCount: 0,
      maxWorkerConsecutiveErrors: 0,
    };
  }

  const latest = recentSnapshots[0]!;
  const oldest = recentSnapshots[recentSnapshots.length - 1]!;
  return {
    sampleCount: recentSnapshots.length,
    oldestCapturedAt: oldest.createdAt,
    latestCapturedAt: latest.createdAt,
    queuedCountDelta: latest.queuedCount - oldest.queuedCount,
    oldestQueuedAgeDelta:
      latest.oldestQueuedAgeMinutes == null || oldest.oldestQueuedAgeMinutes == null
        ? null
        : latest.oldestQueuedAgeMinutes - oldest.oldestQueuedAgeMinutes,
    alertCountDelta: latest.alertCount - oldest.alertCount,
    failedCountDelta: latest.failedCount - oldest.failedCount,
    workerConsecutiveErrorsDelta: latest.workerConsecutiveErrors - oldest.workerConsecutiveErrors,
    maxQueuedCount: Math.max(...recentSnapshots.map((snapshot) => snapshot.queuedCount)),
    maxOldestQueuedAgeMinutes: recentSnapshots
      .map((snapshot) => snapshot.oldestQueuedAgeMinutes)
      .filter((value): value is number => value != null)
      .reduce<number | null>((max, value) => (max == null || value > max ? value : max), null),
    maxAlertCount: Math.max(...recentSnapshots.map((snapshot) => snapshot.alertCount)),
    maxFailedCount: Math.max(...recentSnapshots.map((snapshot) => snapshot.failedCount)),
    maxWorkerConsecutiveErrors: Math.max(
      ...recentSnapshots.map((snapshot) => snapshot.workerConsecutiveErrors),
    ),
  };
}

function summarizePlatformSnapshotRollup(
  recentSnapshots: PlatformSnapshot[],
  bucketSizeMinutes = 60,
): PlatformSnapshotRollup {
  if (recentSnapshots.length === 0) {
    return {
      bucketSizeMinutes,
      bucketCount: 0,
      buckets: [],
    };
  }

  const bucketSizeMs = bucketSizeMinutes * 60_000;
  const buckets = new Map<number, PlatformSnapshot[]>();

  recentSnapshots.forEach((snapshot) => {
    const capturedAt = new Date(snapshot.createdAt).getTime();
    const bucketStartMs = Math.floor(capturedAt / bucketSizeMs) * bucketSizeMs;
    const bucket = buckets.get(bucketStartMs);
    if (bucket) {
      bucket.push(snapshot);
      return;
    }
    buckets.set(bucketStartMs, [snapshot]);
  });

  const rollupBuckets = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStartMs, samples]) => {
      const queuedTotal = samples.reduce((sum, snapshot) => sum + snapshot.queuedCount, 0);
      const oldestQueuedAges = samples
        .map((snapshot) => snapshot.oldestQueuedAgeMinutes)
        .filter((value): value is number => value != null);

      return {
        bucketStart: new Date(bucketStartMs).toISOString(),
        bucketEnd: new Date(bucketStartMs + bucketSizeMs).toISOString(),
        sampleCount: samples.length,
        avgQueuedCount:
          samples.length === 0 ? 0 : Number((queuedTotal / samples.length).toFixed(2)),
        maxQueuedCount: Math.max(...samples.map((snapshot) => snapshot.queuedCount)),
        maxOldestQueuedAgeMinutes:
          oldestQueuedAges.length === 0 ? null : Math.max(...oldestQueuedAges),
        maxAlertCount: Math.max(...samples.map((snapshot) => snapshot.alertCount)),
        maxFailedCount: Math.max(...samples.map((snapshot) => snapshot.failedCount)),
        maxWorkerConsecutiveErrors: Math.max(
          ...samples.map((snapshot) => snapshot.workerConsecutiveErrors),
        ),
      };
    });

  return {
    bucketSizeMinutes,
    bucketCount: rollupBuckets.length,
    buckets: rollupBuckets,
  };
}

export function buildPlatformSnapshot(
  platformStats: PlatformAdminMetrics,
  triggerType: PlatformSnapshot['triggerType'],
): PlatformSnapshot {
  return {
    createdAt: new Date().toISOString(),
    triggerType,
    mockMode: platformStats.runtime.features.mockMode,
    queuedCount: platformStats.ingestion.queuedCount,
    oldestQueuedAgeMinutes: platformStats.ingestion.oldestQueuedAgeMinutes,
    runningCount: platformStats.ingestion.runningCount,
    staleRunningCount: platformStats.ingestion.staleRunningCount,
    failedCount: platformStats.ingestion.recentFailedCount,
    completedLastHour: platformStats.ingestion.completedLastHour,
    alertCount: platformStats.alerts.length,
    criticalAlertCount: platformStats.alertSummary.critical,
    warningAlertCount: platformStats.alertSummary.warning,
    infoAlertCount: platformStats.alertSummary.info,
    workerStatus: platformStats.worker.status,
    workerConsecutiveErrors: platformStats.worker.consecutiveErrors,
    workerLastProcessedAt: platformStats.worker.lastProcessedAt,
  };
}

export async function fetchAdminStatsPayload(app: FastifyInstance) {
  const pool = getPool();
  const contentStats = pool ? await fetchContentStats(pool) : emptyContentStats();
  const [copilotRunStats, copilotEvalStats, commercialStats] = await Promise.all([
    app.copilotSessionsRepo.getAdminMetrics(),
    app.copilotEvalsRepo.getAdminMetrics(),
    fetchCommercialStats(app),
  ]);
  const platformStats = await fetchPlatformStats(app, {
    contentStats,
    commercialStats,
  });
  return {
    ...contentStats,
    platform: platformStats,
    commercial: commercialStats,
    copilot: {
      ...copilotRunStats,
      evals: copilotEvalStats,
    },
  };
}

async function fetchPlatformStats(
  app: FastifyInstance,
  input: {
    contentStats: Pick<ContentStatsResult, 'ingestionStats'>;
    commercialStats: CommercialAdminMetrics;
  },
): Promise<PlatformAdminMetrics> {
  const features = getRuntimeFeatureFlags();
  const generatedAt = new Date().toISOString();
  const queueStats = input.contentStats.ingestionStats;
  const worker = app.ingestionWorkerMonitor;
  const [
    recentFailedJobs,
    runningJobs,
    queuedJobs,
    oldestQueuedJobs,
    recentSucceededJobs,
    recentSnapshotAuditItems,
  ] = await Promise.all([
    app.ingestionJobsRepo.listRecent({
      limit: 25,
      status: 'failed',
    }),
    app.ingestionJobsRepo.listRecent({
      limit: 50,
      status: 'running',
    }),
    app.ingestionJobsRepo.listRecent({
      limit: 50,
      status: 'queued',
    }),
    app.ingestionJobsRepo.listRecent({
      limit: 1,
      status: 'queued',
      order: 'asc',
    }),
    app.ingestionJobsRepo.listRecent({
      limit: 50,
      status: 'succeeded',
    }),
    app.auditRepo.listRecentByAction('platform.snapshot_captured', 12),
  ]);
  const recentSnapshots = recentSnapshotAuditItems
    .map((item) => parsePlatformSnapshotMetadata(item.metadata))
    .filter((item): item is PlatformSnapshot => item != null);
  const snapshotTrend = summarizePlatformSnapshotTrend(recentSnapshots);
  const snapshotRollup = summarizePlatformSnapshotRollup(recentSnapshots);
  const oldestQueuedJob = oldestQueuedJobs[0] ?? null;
  const oldestQueuedAgeMinutes = oldestQueuedJob
    ? Math.max(0, Math.floor((Date.now() - new Date(oldestQueuedJob.createdAt).getTime()) / 60_000))
    : null;
  const completedLastHour = recentSucceededJobs.filter((job) => {
    const completedAt = job.finishedAt ?? job.createdAt;
    return Date.now() - new Date(completedAt).getTime() <= 60 * 60_000;
  }).length;
  const queuedCount = Math.max(queueStats.pending, queuedJobs.length);
  const failedIngestionCount = Math.max(recentFailedJobs.length, queueStats.failed);
  const recentStaleJobs = runningJobs
    .filter((job) => job.startedAt)
    .map((job) => ({
      job,
      runningMinutes: Math.max(
        0,
        Math.floor((Date.now() - new Date(job.startedAt as string).getTime()) / 60_000),
      ),
    }))
    .filter((item) => item.runningMinutes >= STALE_RUNNING_THRESHOLD_MINUTES)
    .sort((a, b) => b.runningMinutes - a.runningMinutes);
  const staleRunningCount = recentStaleJobs.length;
  const workerStallThresholdMs = Math.max(
    worker.pollIntervalMs * 3,
    worker.startDelayMs + worker.pollIntervalMs,
  );
  const lastWorkerTouchAt = worker.lastTickCompletedAt ?? worker.lastTickStartedAt;
  const workerIsStalled =
    worker.enabled &&
    worker.status !== 'stopped' &&
    !!lastWorkerTouchAt &&
    Date.now() - new Date(lastWorkerTouchAt).getTime() > workerStallThresholdMs;
  const workerIsErroring =
    worker.enabled && (worker.status === 'error' || worker.consecutiveErrors > 0);
  const recoveryOutreach = input.commercialStats.teamWorkspaces.recoveryOutreach;
  const deliveryFailures =
    recoveryOutreach.failedEmail +
    recoveryOutreach.failedMemberEmail +
    recoveryOutreach.failedCrmSync +
    recoveryOutreach.failedWebhook +
    recoveryOutreach.failedSlackAlert;
  const alerts: PlatformAdminMetrics['alerts'] = [];

  if (features.mockMode) {
    alerts.push({
      severity: 'warning',
      code: 'mock_mode_active',
      title: 'API 仍在 mock mode',
      detail: 'DATABASE_URL 未配置，当前后台诊断与公开数据不代表真实生产库状态。',
      href: null,
    });
  }

  if (features.aiProvider === 'none') {
    alerts.push({
      severity: 'warning',
      code: 'ai_provider_unconfigured',
      title: 'Copilot 未配置 LLM provider',
      detail: '当前回答会回退到规则模式，研究体验和回放评测都不完整。',
      href: null,
    });
  }

  if (!features.stripeEnabled) {
    alerts.push({
      severity: 'warning',
      code: 'stripe_disabled',
      title: 'Stripe 未配置',
      detail: '商业化 checkout / portal 入口会被关闭，付费恢复链无法在本环境完整验证。',
      href: null,
    });
  }

  if (failedIngestionCount > 0) {
    const latestFailedJob = recentFailedJobs[0]!;
    alerts.push({
      severity: failedIngestionCount >= 3 ? 'critical' : 'warning',
      code: 'failed_ingestion_jobs',
      title: '近期存在失败的 ingestion jobs',
      detail: latestFailedJob
        ? `当前累计失败任务约 ${failedIngestionCount} 条，最新一条是 ${latestFailedJob.sourceName} / ${latestFailedJob.triggerType}。`
        : `当前累计失败任务约 ${failedIngestionCount} 条，但最近失败详情暂时不可用。`,
      href: '/admin/reviews',
    });
  }

  if (staleRunningCount > 0) {
    const stalestJob = recentStaleJobs[0]!;
    alerts.push({
      severity: staleRunningCount >= 3 ? 'critical' : 'warning',
      code: 'stale_running_jobs',
      title: '存在卡住的 running ingestion jobs',
      detail: `最近检测到 ${staleRunningCount} 条 running 任务超过 ${STALE_RUNNING_THRESHOLD_MINUTES} 分钟未结束，最久的是 ${stalestJob.job.sourceName} / ${stalestJob.job.triggerType}（${stalestJob.runningMinutes} 分钟）。`,
      href: '/admin/dashboard',
    });
  }

  if (queuedCount > 0 && oldestQueuedAgeMinutes != null && oldestQueuedAgeMinutes >= 15) {
    alerts.push({
      severity: oldestQueuedAgeMinutes >= 60 || queuedCount >= 20 ? 'critical' : 'warning',
      code: 'ingestion_queue_backlog',
      title: 'Ingestion queue 已出现积压',
      detail: oldestQueuedJob
        ? `当前 queued 任务 ${queuedCount} 条，最早一条 ${oldestQueuedJob.sourceName} / ${oldestQueuedJob.triggerType} 已等待 ${oldestQueuedAgeMinutes} 分钟。`
        : `当前 queued 任务 ${queuedCount} 条，最老任务已等待 ${oldestQueuedAgeMinutes} 分钟。`,
      href: '/admin/dashboard',
    });
  }

  if (features.dbConfigured && !worker.enabled) {
    alerts.push({
      severity: 'critical',
      code: 'ingestion_worker_inactive',
      title: 'Ingestion worker 未启动',
      detail:
        '当前数据库已启用，但 API 进程没有挂载 ingestion worker，队列只能依赖人工 process-next。',
      href: '/admin/dashboard',
    });
  }

  if (features.dbConfigured && workerIsStalled) {
    alerts.push({
      severity: 'warning',
      code: 'ingestion_worker_stalled',
      title: 'Ingestion worker 可能已卡住',
      detail: `最近一次 worker tick 停留在 ${lastWorkerTouchAt}，已经超过 ${Math.round(workerStallThresholdMs / 60_000)} 分钟未更新。`,
      href: '/admin/dashboard',
    });
  }

  if (features.dbConfigured && workerIsErroring) {
    alerts.push({
      severity: worker.consecutiveErrors >= 3 ? 'critical' : 'warning',
      code: 'ingestion_worker_erroring',
      title: 'Ingestion worker 正在连续报错',
      detail: worker.lastError
        ? `当前 worker 已连续报错 ${worker.consecutiveErrors} 次，最近错误是：${worker.lastError}`
        : `当前 worker 状态为 error，且最近已累计连续报错 ${worker.consecutiveErrors} 次。`,
      href: '/admin/dashboard',
    });
  }

  if (recoveryOutreach.deadLetteredWebhook > 0) {
    alerts.push({
      severity: 'critical',
      code: 'recovery_dead_letters',
      title: '存在 recovery webhook dead-letter',
      detail: `${recoveryOutreach.deadLetteredWebhook} 条恢复交接已耗尽自动重试，需要人工接管或修复外部通道。`,
      href: '/admin/dashboard',
    });
  }

  if (deliveryFailures > 0) {
    alerts.push({
      severity: deliveryFailures >= 3 ? 'critical' : 'warning',
      code: 'recovery_delivery_failures',
      title: '恢复触达链存在失败通道',
      detail: `owner/member 邮件、CRM、webhook 或 Slack 告警最近共有 ${deliveryFailures} 条失败，恢复闭环目前不稳定。`,
      href: '/admin/dashboard',
    });
  }

  if (
    input.commercialStats.teamWorkspaces.recoveryPlaybook.lastRunOk === false &&
    input.commercialStats.teamWorkspaces.recoveryPlaybook.lastRunAt
  ) {
    alerts.push({
      severity: 'warning',
      code: 'recovery_playbook_failed',
      title: '最近一次 recovery playbook 失败',
      detail: `最近一次 playbook 运行时间是 ${input.commercialStats.teamWorkspaces.recoveryPlaybook.lastRunAt}，建议先补跑失败步骤再继续处理风险 workspace。`,
      href: '/admin/dashboard',
    });
  }

  const alertSummary = alerts.reduce(
    (summary, alert) => {
      summary[alert.severity] += 1;
      return summary;
    },
    { critical: 0, warning: 0, info: 0 } as PlatformAdminMetrics['alertSummary'],
  );

  return {
    runtime: {
      service: 'startup-graveyard-api',
      env: process.env.NODE_ENV ?? 'development',
      nodeVersion: process.version,
      generatedAt,
      uptimeSeconds: Math.max(0, Math.round(process.uptime())),
      features,
    },
    worker: {
      enabled: worker.enabled,
      status: worker.status,
      startDelayMs: worker.startDelayMs,
      pollIntervalMs: worker.pollIntervalMs,
      maxJobsPerTick: worker.maxJobsPerTick,
      startedAt: worker.startedAt,
      lastTickStartedAt: worker.lastTickStartedAt,
      lastTickCompletedAt: worker.lastTickCompletedAt,
      lastProcessedAt: worker.lastProcessedAt,
      lastProcessedJobId: worker.lastProcessedJobId,
      lastProcessedSourceName: worker.lastProcessedSourceName,
      lastProcessedJobStatus: worker.lastProcessedJobStatus,
      processedJobs: worker.processedJobs,
      consecutiveErrors: worker.consecutiveErrors,
      lastError: worker.lastError,
      lastStopAt: worker.lastStopAt,
      recentTicks: worker.recentTicks,
    },
    recentSnapshots,
    snapshotTrend,
    snapshotRollup,
    ingestion: {
      queuedCount,
      oldestQueuedAgeMinutes,
      oldestQueuedSourceName: oldestQueuedJob?.sourceName ?? null,
      oldestQueuedTriggerType: oldestQueuedJob?.triggerType ?? null,
      completedLastHour,
      runningCount: Math.max(queueStats.running, runningJobs.length),
      staleRunningCount,
      staleThresholdMinutes: STALE_RUNNING_THRESHOLD_MINUTES,
      recentFailedCount: failedIngestionCount,
      recentFailed: recentFailedJobs.slice(0, 5).map((job) => ({
        id: job.id,
        sourceName: job.sourceName,
        triggerType: job.triggerType,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      })),
      recentStale: recentStaleJobs.slice(0, 5).map(({ job, runningMinutes }) => ({
        id: job.id,
        sourceName: job.sourceName,
        triggerType: job.triggerType,
        createdAt: job.createdAt,
        startedAt: job.startedAt as string,
        runningMinutes,
      })),
      recentSucceeded: recentSucceededJobs.slice(0, 5).map((job) => ({
        id: job.id,
        sourceName: job.sourceName,
        triggerType: job.triggerType,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt ?? job.createdAt,
      })),
    },
    alertSummary,
    alerts,
  };
}

function recoveryStageFromCommercialTouch(
  type: CommercialAdminMetrics['billingFunnel']['recentEvents'][number]['type'] | null,
): CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['recoveryStage'] {
  if (type === 'subscription_recovered') return 'recovered_followup';
  if (type === 'checkout_started' || type === 'checkout_completed' || type === 'portal_started') {
    return 'owner_engaged';
  }
  return 'needs_outreach';
}

function recoveryStageTitle(
  stage: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['recoveryStage'],
) {
  if (stage === 'needs_outreach') return '尚未触达';
  if (stage === 'owner_engaged') return 'Owner 已开始恢复';
  return '已恢复待收尾';
}

const RECOVERY_FOLLOW_UP_HOURS = 24;

function nextFollowUpAt(
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

function followUpStateFromWorkspace(
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

function followUpStateTitle(
  state: CommercialAdminMetrics['teamWorkspaces']['followUpStates'][number]['state'],
) {
  if (state === 'needs_initial_touch') return '待首次触达';
  if (state === 'awaiting_owner') return '等待 Owner 响应';
  if (state === 'overdue') return '已逾期待跟进';
  if (state === 'owner_engaged') return 'Owner 已响应';
  return '恢复待收尾';
}

function followUpStatePriority(
  state: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'][number]['followUpState'],
) {
  if (state === 'overdue') return 0;
  if (state === 'needs_initial_touch') return 1;
  if (state === 'awaiting_owner') return 2;
  if (state === 'owner_engaged') return 3;
  return 4;
}

function csvCell(value: string | number | null): string {
  if (value == null) return '';
  const raw = String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function renderRecoveryQueueCsv(
  items: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'],
): string {
  const header = [
    'workspace_name',
    'owner_email',
    'subscription',
    'billing_status',
    'recovery_stage',
    'follow_up_state',
    'next_follow_up_at',
    'seat_limit',
    'seats_used',
    'reserved_seats',
    'pending_invites',
    'revoked_invites',
    'fallback_members',
    'warning_codes',
    'recommended_actions',
    'last_commercial_event_type',
    'last_commercial_event_at',
    'last_outreach_title',
    'last_outreach_at',
    'last_outreach_attempt_count',
    'next_outreach_attempt_at',
    'last_outreach_email_attempt_count',
    'last_outreach_email_attempt_at',
    'next_outreach_email_attempt_at',
    'last_outreach_email_delivered_at',
    'last_outreach_email_message_id',
    'last_outreach_email_error',
    'last_outreach_export_count',
    'last_outreach_exported_at',
    'last_outreach_crm_sync_count',
    'last_outreach_crm_sync_attempt_at',
    'next_outreach_crm_sync_attempt_at',
    'last_outreach_crm_synced_at',
    'last_outreach_crm_external_record_id',
    'last_outreach_crm_sync_status_code',
    'last_outreach_crm_sync_error',
    'last_outreach_webhook_attempt_count',
    'last_outreach_webhook_attempt_at',
    'next_outreach_webhook_attempt_at',
    'last_outreach_webhook_exhausted_at',
    'last_outreach_webhook_delivery_count',
    'last_outreach_webhook_delivered_at',
    'last_outreach_webhook_status_code',
    'last_outreach_webhook_error',
    'last_outreach_slack_alert_count',
    'last_outreach_slack_alert_attempt_at',
    'last_outreach_slack_alerted_at',
    'last_outreach_slack_alert_status_code',
    'last_outreach_slack_alert_error',
    'last_outreach_handoff_channel',
    'last_outreach_handoff_at',
    'last_outreach_handoff_note',
    'member_recovery_pending_count',
    'member_recovery_retrying_count',
    'member_recovery_delivered_count',
    'member_recovery_failed_count',
    'member_recovery_next_email_attempt_at',
    'member_recovery_last_email_delivered_at',
    'member_recovery_last_email_error',
    'last_outreach_status',
  ];
  const lines = [header.join(',')];
  for (const item of items) {
    lines.push(
      [
        item.workspaceName,
        item.ownerEmail,
        item.subscription,
        item.billingStatus,
        item.recoveryStage,
        item.followUpState,
        item.nextFollowUpAt,
        item.seatLimit,
        item.seatsUsed,
        item.reservedSeats,
        item.pendingInvites,
        item.revokedInvites,
        item.fallbackMembers,
        item.warningCodes.join(' | '),
        item.recommendedActions.map((action) => action.title).join(' | '),
        item.lastCommercialEventType,
        item.lastCommercialEventAt,
        item.lastOutreachTitle,
        item.lastOutreachAt,
        item.lastOutreachAttemptCount,
        item.nextOutreachAttemptAt,
        item.lastOutreachEmailAttemptCount,
        item.lastOutreachEmailAttemptAt,
        item.nextOutreachEmailAttemptAt,
        item.lastOutreachEmailDeliveredAt,
        item.lastOutreachEmailMessageId,
        item.lastOutreachEmailError,
        item.lastOutreachExportCount,
        item.lastOutreachExportedAt,
        item.lastOutreachCrmSyncCount,
        item.lastOutreachCrmSyncAttemptAt,
        item.nextOutreachCrmSyncAttemptAt,
        item.lastOutreachCrmSyncedAt,
        item.lastOutreachCrmExternalRecordId,
        item.lastOutreachCrmSyncStatusCode,
        item.lastOutreachCrmSyncError,
        item.lastOutreachWebhookAttemptCount,
        item.lastOutreachWebhookAttemptAt,
        item.nextOutreachWebhookAttemptAt,
        item.lastOutreachWebhookExhaustedAt,
        item.lastOutreachWebhookDeliveryCount,
        item.lastOutreachWebhookDeliveredAt,
        item.lastOutreachWebhookStatusCode,
        item.lastOutreachWebhookError,
        item.lastOutreachSlackAlertCount,
        item.lastOutreachSlackAlertAttemptAt,
        item.lastOutreachSlackAlertedAt,
        item.lastOutreachSlackAlertStatusCode,
        item.lastOutreachSlackAlertError,
        item.lastOutreachHandoffChannel,
        item.lastOutreachHandoffAt,
        item.lastOutreachHandoffNote,
        item.memberRecoveryPendingCount,
        item.memberRecoveryRetryingCount,
        item.memberRecoveryDeliveredCount,
        item.memberRecoveryFailedCount,
        item.memberRecoveryNextEmailAttemptAt,
        item.memberRecoveryLastEmailDeliveredAt,
        item.memberRecoveryLastEmailError,
        item.lastOutreachStatus,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function renderRecoveryHandoffCsv(
  items: CommercialAdminMetrics['teamWorkspaces']['actionableWorkspaces'],
): string {
  const header = [
    'workspace_name',
    'owner_email',
    'subscription',
    'billing_status',
    'recovery_stage',
    'follow_up_state',
    'warning_codes',
    'recommended_actions',
    'last_outreach_title',
    'last_outreach_handoff_channel',
    'last_outreach_handoff_note',
    'last_outreach_handoff_at',
    'last_outreach_email_attempt_count',
    'last_outreach_email_attempt_at',
    'next_outreach_email_attempt_at',
    'last_outreach_email_delivered_at',
    'last_outreach_email_message_id',
    'last_outreach_email_error',
    'last_outreach_export_count',
    'last_outreach_exported_at',
    'last_outreach_crm_sync_count',
    'last_outreach_crm_sync_attempt_at',
    'next_outreach_crm_sync_attempt_at',
    'last_outreach_crm_synced_at',
    'last_outreach_crm_external_record_id',
    'last_outreach_crm_sync_status_code',
    'last_outreach_crm_sync_error',
    'last_outreach_webhook_attempt_count',
    'last_outreach_webhook_attempt_at',
    'next_outreach_webhook_attempt_at',
    'last_outreach_webhook_exhausted_at',
    'last_outreach_webhook_delivery_count',
    'last_outreach_webhook_delivered_at',
    'last_outreach_webhook_status_code',
    'last_outreach_webhook_error',
    'last_outreach_slack_alert_count',
    'last_outreach_slack_alert_attempt_at',
    'last_outreach_slack_alerted_at',
    'last_outreach_slack_alert_status_code',
    'last_outreach_slack_alert_error',
  ];
  const lines = [header.join(',')];
  for (const item of items) {
    lines.push(
      [
        item.workspaceName,
        item.ownerEmail,
        item.subscription,
        item.billingStatus,
        item.recoveryStage,
        item.followUpState,
        item.warningCodes.join(' | '),
        item.recommendedActions.map((action) => action.title).join(' | '),
        item.lastOutreachTitle,
        item.lastOutreachHandoffChannel,
        item.lastOutreachHandoffNote,
        item.lastOutreachHandoffAt,
        item.lastOutreachEmailAttemptCount,
        item.lastOutreachEmailAttemptAt,
        item.nextOutreachEmailAttemptAt,
        item.lastOutreachEmailDeliveredAt,
        item.lastOutreachEmailMessageId,
        item.lastOutreachEmailError,
        item.lastOutreachExportCount,
        item.lastOutreachExportedAt,
        item.lastOutreachCrmSyncCount,
        item.lastOutreachCrmSyncAttemptAt,
        item.nextOutreachCrmSyncAttemptAt,
        item.lastOutreachCrmSyncedAt,
        item.lastOutreachCrmExternalRecordId,
        item.lastOutreachCrmSyncStatusCode,
        item.lastOutreachCrmSyncError,
        item.lastOutreachWebhookAttemptCount,
        item.lastOutreachWebhookAttemptAt,
        item.nextOutreachWebhookAttemptAt,
        item.lastOutreachWebhookExhaustedAt,
        item.lastOutreachWebhookDeliveryCount,
        item.lastOutreachWebhookDeliveredAt,
        item.lastOutreachWebhookStatusCode,
        item.lastOutreachWebhookError,
        item.lastOutreachSlackAlertCount,
        item.lastOutreachSlackAlertAttemptAt,
        item.lastOutreachSlackAlertedAt,
        item.lastOutreachSlackAlertStatusCode,
        item.lastOutreachSlackAlertError,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

async function fetchCommercialStats(app: FastifyInstance): Promise<CommercialAdminMetrics> {
  const [
    subscriptionStats,
    billingFunnelStats,
    watchlistStats,
    savedViewStats,
    reportShareStats,
    teamWorkspaceStats,
  ] = await Promise.all([
    app.usersRepo.getAdminMetrics(),
    app.billingFunnelRepo.getAdminMetrics(),
    app.watchlistsRepo.getAdminMetrics(),
    app.savedViewsRepo.getAdminMetrics(),
    app.reportSharesRepo.getAdminMetrics(),
    app.teamWorkspacesRepo.getAdminMetrics(),
  ]);

  const activeResearchUsers = new Set<string>([
    ...watchlistStats.userIds,
    ...savedViewStats.userIds,
    ...reportShareStats.userIds,
  ]).size;
  const latestCommercialTouches = await app.billingFunnelRepo.getLatestEventsByUserIds(
    teamWorkspaceStats.actionableWorkspaces.map((workspace) => workspace.ownerUserId),
  );
  const latestCommercialTouchByUserId = new Map(
    latestCommercialTouches.map((touch) => [touch.userId, touch]),
  );
  const actionableWorkspaces = teamWorkspaceStats.actionableWorkspaces
    .map((workspace) => {
      const latestCommercialTouch = latestCommercialTouchByUserId.get(workspace.ownerUserId);
      const nextWorkspace = {
        ...workspace,
        lastCommercialEventAt: latestCommercialTouch?.createdAt ?? null,
        lastCommercialEventType: latestCommercialTouch?.type ?? null,
        lastCommercialEventSource: latestCommercialTouch?.source ?? null,
        recoveryStage: recoveryStageFromCommercialTouch(latestCommercialTouch?.type ?? null),
      };
      return {
        ...nextWorkspace,
        followUpState: followUpStateFromWorkspace(nextWorkspace),
        nextFollowUpAt: nextFollowUpAt(nextWorkspace),
      };
    })
    .sort((a, b) => {
      const exhaustionDelta =
        Number(Boolean(b.lastOutreachWebhookExhaustedAt)) -
        Number(Boolean(a.lastOutreachWebhookExhaustedAt));
      if (exhaustionDelta !== 0) return exhaustionDelta;
      const priorityDelta =
        followUpStatePriority(a.followUpState) - followUpStatePriority(b.followUpState);
      if (priorityDelta !== 0) return priorityDelta;
      return (
        new Date(b.lastBillingEventAt ?? 0).getTime() -
        new Date(a.lastBillingEventAt ?? 0).getTime()
      );
    });
  const recoveryStageCounts = new Map<
    CommercialAdminMetrics['teamWorkspaces']['recoveryStages'][number]['stage'],
    CommercialAdminMetrics['teamWorkspaces']['recoveryStages'][number]
  >();
  const followUpStateCounts = new Map<
    CommercialAdminMetrics['teamWorkspaces']['followUpStates'][number]['state'],
    CommercialAdminMetrics['teamWorkspaces']['followUpStates'][number]
  >();
  for (const workspace of actionableWorkspaces) {
    const existing = recoveryStageCounts.get(workspace.recoveryStage);
    if (existing) {
      existing.count += 1;
    } else {
      recoveryStageCounts.set(workspace.recoveryStage, {
        stage: workspace.recoveryStage,
        title: recoveryStageTitle(workspace.recoveryStage),
        count: 1,
      });
    }
    const existingFollowUp = followUpStateCounts.get(workspace.followUpState);
    if (existingFollowUp) {
      existingFollowUp.count += 1;
    } else {
      followUpStateCounts.set(workspace.followUpState, {
        state: workspace.followUpState,
        title: followUpStateTitle(workspace.followUpState),
        count: 1,
      });
    }
  }

  return {
    subscriptions: subscriptionStats,
    billingFunnel: billingFunnelStats,
    researchUsage: {
      activeResearchUsers,
      watchlistUsers: watchlistStats.users,
      watchlistEntries: watchlistStats.entries,
      avgWatchlistEntriesPerUser: watchlistStats.avgEntriesPerUser,
      savedViewUsers: savedViewStats.users,
      savedViews: savedViewStats.savedViews,
      avgSavedViewsPerUser: savedViewStats.avgSavedViewsPerUser,
      reportShareUsers: reportShareStats.users,
      reportShares: reportShareStats.reportShares,
      accessedReportShares: reportShareStats.accessedReportShares,
      researchActivationRate:
        subscriptionStats.activePaidUsers > 0
          ? activeResearchUsers / subscriptionStats.activePaidUsers
          : null,
      reportShareActivationRate:
        subscriptionStats.activePaidUsers > 0
          ? reportShareStats.users / subscriptionStats.activePaidUsers
          : null,
    },
    teamWorkspaces: {
      ...teamWorkspaceStats,
      recoveryStages: [...recoveryStageCounts.values()].sort((a, b) => b.count - a.count),
      followUpStates: [...followUpStateCounts.values()].sort((a, b) => b.count - a.count),
      actionableWorkspaces,
    },
  };
}

async function fetchContentStats(pool: Pool): Promise<ContentStatsResult> {
  const [
    summaryRes,
    industryRes,
    countryRes,
    yearRes,
    failureRes,
    recentRes,
    reviewsRes,
    ingestionRes,
  ] = await Promise.all([
    pool.query<{
      total_published: string;
      total_funding: string;
      total_draft: string;
      avg_funding: string;
    }>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'published')                                       AS total_published,
          COALESCE(SUM(total_funding_usd) FILTER (WHERE status = 'published'), 0)            AS total_funding,
          COUNT(*) FILTER (WHERE status = 'draft')                                           AS total_draft,
          COALESCE(AVG(total_funding_usd) FILTER (WHERE status = 'published' AND total_funding_usd IS NOT NULL), 0)
                                                                                             AS avg_funding
        FROM cases
      `),

    pool.query<{ industry_key: string; cnt: string; total_funding: string }>(`
        SELECT
          COALESCE(industry_key, 'unknown') AS industry_key,
          COUNT(*)                          AS cnt,
          COALESCE(SUM(total_funding_usd), 0) AS total_funding
        FROM cases WHERE status = 'published'
        GROUP BY industry_key ORDER BY cnt DESC LIMIT 15
      `),

    pool.query<{ country_code: string; cnt: string }>(`
        SELECT
          COALESCE(country_code::text, 'unknown') AS country_code,
          COUNT(*) AS cnt
        FROM cases WHERE status = 'published'
        GROUP BY country_code ORDER BY cnt DESC LIMIT 15
      `),

    pool.query<{ closed_year: number; cnt: string }>(`
        SELECT closed_year, COUNT(*) AS cnt
        FROM cases WHERE status = 'published' AND closed_year IS NOT NULL
        GROUP BY closed_year ORDER BY closed_year DESC LIMIT 20
      `),

    pool.query<{ primary_failure_reason_key: string; cnt: string }>(`
        SELECT
          COALESCE(primary_failure_reason_key, 'unknown') AS primary_failure_reason_key,
          COUNT(*) AS cnt
        FROM cases WHERE status = 'published'
        GROUP BY primary_failure_reason_key ORDER BY cnt DESC LIMIT 10
      `),

    pool.query<{ id: string; slug: string; company_name: string; created_at: string }>(`
        SELECT id, slug::text AS slug, company_name, created_at
        FROM cases WHERE status = 'published'
        ORDER BY created_at DESC LIMIT 8
      `),

    pool.query<{ pending: string }>(`
        SELECT COUNT(*) AS pending FROM reviews WHERE review_status = 'pending'
      `),

    pool.query<{ status: string; cnt: string }>(`
        SELECT status, COUNT(*) AS cnt FROM ingestion_jobs GROUP BY status
      `),
  ]);

  const s = summaryRes.rows[0];
  const ingestionMap: Record<string, number> = {};
  for (const row of ingestionRes.rows) ingestionMap[row.status] = Number(row.cnt);
  const toIsoString = (value: string | Date) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();

  return {
    totalPublished: Number(s.total_published),
    totalFundingUsd: Number(s.total_funding),
    totalDraft: Number(s.total_draft),
    avgFundingUsd: Number(s.avg_funding),
    byIndustry: industryRes.rows.map((r) => ({
      industry: r.industry_key,
      count: Number(r.cnt),
      totalFunding: Number(r.total_funding),
    })),
    byCountry: countryRes.rows.map((r) => ({ country: r.country_code, count: Number(r.cnt) })),
    byYear: yearRes.rows.map((r) => ({ year: r.closed_year, count: Number(r.cnt) })),
    byFailureReason: failureRes.rows.map((r) => ({
      reason: r.primary_failure_reason_key,
      count: Number(r.cnt),
    })),
    recentlyAdded: recentRes.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      companyName: r.company_name,
      createdAt: toIsoString(r.created_at),
    })),
    pendingReviews: Number(reviewsRes.rows[0]?.pending ?? 0),
    ingestionStats: {
      pending: ingestionMap['pending'] ?? 0,
      running: ingestionMap['running'] ?? 0,
      failed: ingestionMap['failed'] ?? 0,
      completed: ingestionMap['succeeded'] ?? ingestionMap['completed'] ?? 0,
    },
  };
}
