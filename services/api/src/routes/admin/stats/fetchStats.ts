import { RUNTIME_HEARTBEAT_STALE_MS, STALE_RUNNING_THRESHOLD_MINUTES } from './shared.js';
import type { ContentStatsResult } from './shared.js';
import { resolveSchedulerMonitor, resolveWorkerMonitor } from './shared.js';
import {
  emptyContentStats,
  inferPlatformSnapshotSuppressionReason,
  parsePlatformSnapshotMetadata,
  summarizePlatformSnapshotCadence,
  summarizePlatformSnapshotMetricsSurface,
  summarizePlatformSnapshotRegression,
  summarizePlatformSnapshotRollup,
  summarizePlatformSnapshotSuppressionSurface,
  summarizePlatformSnapshotTrend,
} from './platformSnapshot.js';
import { fetchCommercialStats, fetchContentStats } from './commercialContent.js';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../../../db/pool.js';
import type {
  CommercialAdminMetrics,
  PlatformAdminMetrics,
  PlatformSnapshot,
} from '@sg/shared/schemas/adminStats';
import { getRuntimeFeatureFlags } from '../../../env/runtime.js';

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

export async function fetchPlatformStats(
  app: FastifyInstance,
  input: {
    contentStats: Pick<ContentStatsResult, 'ingestionStats'>;
    commercialStats: CommercialAdminMetrics;
  },
): Promise<PlatformAdminMetrics> {
  const features = getRuntimeFeatureFlags();
  const generatedAt = new Date().toISOString();
  const queueStats = input.contentStats.ingestionStats;
  const [
    recentFailedJobs,
    runningJobs,
    queuedJobs,
    oldestQueuedJobs,
    recentSucceededJobs,
    recentSnapshotAuditItems,
    stripeWebhookMetrics,
    workerHeartbeat,
    schedulerHeartbeat,
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
    app.auditRepo.listRecentByAction('platform.snapshot_captured', 72),
    app.stripeWebhookEventsRepo.getMetrics(),
    app.runtimeProcessesRepo.getLatest('worker'),
    app.runtimeProcessesRepo.getLatest('scheduler'),
  ]);
  const worker = resolveWorkerMonitor(app.ingestionWorkerMonitor, workerHeartbeat);
  const scheduler = resolveSchedulerMonitor(schedulerHeartbeat);
  const snapshotSamples = recentSnapshotAuditItems
    .map((item) => parsePlatformSnapshotMetadata(item.metadata))
    .filter((item): item is PlatformSnapshot => item != null);
  const recentSnapshots = snapshotSamples.slice(0, 12);
  const snapshotCadence = summarizePlatformSnapshotCadence(snapshotSamples);
  const snapshotTrend = summarizePlatformSnapshotTrend(snapshotSamples);
  const snapshotRollup = summarizePlatformSnapshotRollup(snapshotSamples);
  const snapshotRegression = summarizePlatformSnapshotRegression(snapshotRollup);
  const snapshotMetrics = summarizePlatformSnapshotMetricsSurface(
    snapshotSamples,
    snapshotCadence,
    snapshotRollup,
  );
  const snapshotSuppression = summarizePlatformSnapshotSuppressionSurface(snapshotRollup);
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
  const lastWorkerTouchAt =
    worker.heartbeatAt ?? worker.lastTickCompletedAt ?? worker.lastTickStartedAt;
  const workerIsStalled =
    worker.enabled &&
    worker.status !== 'stopped' &&
    !!lastWorkerTouchAt &&
    Date.now() - new Date(lastWorkerTouchAt).getTime() >
      Math.min(workerStallThresholdMs, RUNTIME_HEARTBEAT_STALE_MS);
  const workerIsErroring =
    worker.enabled && (worker.status === 'error' || worker.consecutiveErrors > 0);
  const schedulerIsStalled =
    scheduler.enabled &&
    scheduler.status !== 'stopped' &&
    !!scheduler.heartbeatAt &&
    Date.now() - new Date(scheduler.heartbeatAt).getTime() > RUNTIME_HEARTBEAT_STALE_MS;
  const schedulerIsErroring =
    scheduler.enabled && (scheduler.status === 'error' || scheduler.consecutiveErrors > 0);
  const isolatedRuntimeExpected =
    process.env.NODE_ENV === 'production' || process.env.SG_RUNTIME_REQUIRE_BACKGROUND === 'true';
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

  if (stripeWebhookMetrics.failed > 0 || stripeWebhookMetrics.staleProcessing > 0) {
    alerts.push({
      severity:
        stripeWebhookMetrics.failed >= 3 || stripeWebhookMetrics.staleProcessing > 0
          ? 'critical'
          : 'warning',
      code: 'stripe_webhook_failures',
      title: 'Stripe webhook 处理存在失败或过期租约',
      detail: `失败 ${stripeWebhookMetrics.failed} 条，过期 processing ${stripeWebhookMetrics.staleProcessing} 条，已重试事件 ${stripeWebhookMetrics.retried} 条。`,
      href: '/admin/dashboard',
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
      detail: '当前数据库已启用，但没有发现 worker 运行时心跳，队列不会被自动消费。',
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

  if (features.dbConfigured && isolatedRuntimeExpected && !scheduler.enabled) {
    alerts.push({
      severity: 'critical',
      code: 'ingestion_scheduler_inactive',
      title: 'Ingestion scheduler 未启动',
      detail: '没有发现 scheduler 运行时心跳，周期任务不会被自动派发。',
      href: '/admin/dashboard',
    });
  }

  if (features.dbConfigured && isolatedRuntimeExpected && schedulerIsStalled) {
    alerts.push({
      severity: 'warning',
      code: 'ingestion_scheduler_stalled',
      title: 'Ingestion scheduler 心跳已过期',
      detail: `scheduler 实例 ${scheduler.instanceId ?? 'unknown'} 的最近心跳是 ${scheduler.heartbeatAt}。`,
      href: '/admin/dashboard',
    });
  }

  if (features.dbConfigured && isolatedRuntimeExpected && schedulerIsErroring) {
    alerts.push({
      severity: scheduler.consecutiveErrors >= 3 ? 'critical' : 'warning',
      code: 'ingestion_scheduler_erroring',
      title: 'Ingestion scheduler 正在报错',
      detail: scheduler.lastError
        ? `scheduler 已连续报错 ${scheduler.consecutiveErrors} 次：${scheduler.lastError}`
        : `scheduler 状态为 error，连续错误 ${scheduler.consecutiveErrors} 次。`,
      href: '/admin/dashboard',
    });
  }

  if (snapshotCadence.overdue) {
    alerts.push({
      severity: snapshotCadence.missedIntervals >= 2 ? 'critical' : 'warning',
      code: 'snapshot_cadence_overdue',
      title: '平台快照 cadence 已断档',
      detail: snapshotCadence.lastScheduledCapturedAt
        ? `最近一次 scheduled snapshot 是 ${snapshotCadence.lastScheduledCapturedAt}，距今约 ${snapshotCadence.minutesSinceLastScheduledSnapshot} 分钟，已错过 ${snapshotCadence.missedIntervals} 个采样窗口。`
        : '还没有成功写入过 scheduled snapshot，当前无法判断平台趋势是否持续恶化。',
      href: '/admin/dashboard',
    });
  }

  if (
    snapshotMetrics.cadenceAdherenceRate != null &&
    snapshotMetrics.expectedScheduledSnapshotCount >= 4 &&
    snapshotMetrics.cadenceAdherenceRate < 0.75 &&
    !snapshotCadence.overdue
  ) {
    alerts.push({
      severity: snapshotMetrics.cadenceAdherenceRate < 0.5 ? 'critical' : 'warning',
      code: 'snapshot_cadence_adherence_low',
      title: '平台快照 cadence 覆盖率偏低',
      detail: `最近 ${snapshotMetrics.coveredHours} 小时预计应有 ${snapshotMetrics.expectedScheduledSnapshotCount} 次 scheduled snapshot，实际仅记录 ${snapshotMetrics.scheduledSnapshotCount} 次，覆盖率约 ${Math.round(snapshotMetrics.cadenceAdherenceRate * 100)}%。`,
      href: '/admin/dashboard',
    });
  }

  if (snapshotRegression.hasRegression) {
    const regressionCoveredByCurrentAlerts =
      ((snapshotRegression.queuedDelta ?? 0) <= 0 &&
        (snapshotRegression.oldestQueuedAgeDelta ?? 0) <= 0) ||
      alerts.some((alert) => alert.code === 'ingestion_queue_backlog');
    const failedCovered =
      (snapshotRegression.failedCountDelta ?? 0) <= 0 ||
      alerts.some((alert) => alert.code === 'failed_ingestion_jobs');
    const workerCovered =
      (snapshotRegression.workerConsecutiveErrorsDelta ?? 0) <= 0 ||
      alerts.some((alert) => alert.code === 'ingestion_worker_erroring');
    const alertsCovered =
      (snapshotRegression.alertCountDelta ?? 0) <= 0 ||
      alerts.some((alert) =>
        [
          'failed_ingestion_jobs',
          'stale_running_jobs',
          'ingestion_queue_backlog',
          'ingestion_worker_inactive',
          'ingestion_worker_stalled',
          'ingestion_worker_erroring',
          'ingestion_scheduler_inactive',
          'ingestion_scheduler_stalled',
          'ingestion_scheduler_erroring',
          'snapshot_cadence_overdue',
          'snapshot_cadence_adherence_low',
          'stripe_webhook_failures',
        ].includes(alert.code),
      );
    snapshotRegression.suppressed =
      snapshotRegression.severity !== 'critical' &&
      regressionCoveredByCurrentAlerts &&
      failedCovered &&
      workerCovered &&
      alertsCovered;
    snapshotRegression.suppressionReason = snapshotRegression.suppressed
      ? inferPlatformSnapshotSuppressionReason(snapshotRegression)
      : null;
  }

  if (snapshotRegression.hasRegression && !snapshotRegression.suppressed) {
    alerts.push({
      severity: snapshotRegression.severity,
      code: 'snapshot_trend_regressing',
      title: '最近平台窗口出现退化',
      detail: `最近窗口 ${snapshotRegression.latestBucketStart} 相较上一窗口 ${snapshotRegression.previousBucketStart} 出现回升：${snapshotRegression.reasons.join(' · ')}。`,
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
    worker,
    scheduler,
    recentSnapshots,
    snapshotCadence,
    snapshotTrend,
    snapshotRollup,
    snapshotRegression,
    snapshotSuppression: {
      ...snapshotSuppression,
      activeSuppressionReason:
        snapshotRegression.suppressed && snapshotRegression.suppressionReason
          ? snapshotRegression.suppressionReason
          : snapshotSuppression.activeSuppressionReason,
      lastSuppressedBucketStart:
        snapshotRegression.suppressed && snapshotRegression.latestBucketStart
          ? snapshotRegression.latestBucketStart
          : snapshotSuppression.lastSuppressedBucketStart,
    },
    snapshotMetrics,
    stripeWebhooks: stripeWebhookMetrics,
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
