import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getPool } from '../../db/pool.js';
import type { CommercialAdminMetrics } from '@sg/shared/schemas/adminStats';
import { adminStatsResponseSchema } from '../../schemas/adminStats.js';
import { handoffTeamWorkspaceRecoveryOutreachBodySchema } from '../../schemas/teamWorkspace.js';
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

export async function adminStatsRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    const pool = getPool();
    if (!pool) {
      const [copilotRunStats, copilotEvalStats, commercialStats] = await Promise.all([
        app.copilotSessionsRepo.getAdminMetrics(),
        app.copilotEvalsRepo.getAdminMetrics(),
        fetchCommercialStats(app),
      ]);
      return reply.send(
        adminStatsResponseSchema.parse({
          ...emptyContentStats(),
          commercial: commercialStats,
          copilot: {
            ...copilotRunStats,
            evals: copilotEvalStats,
          },
        }),
      );
    }
    try {
      const [contentStats, copilotRunStats, copilotEvalStats, commercialStats] = await Promise.all([
        fetchContentStats(pool),
        app.copilotSessionsRepo.getAdminMetrics(),
        app.copilotEvalsRepo.getAdminMetrics(),
        fetchCommercialStats(app),
      ]);
      return reply.send(
        adminStatsResponseSchema.parse({
          ...contentStats,
          commercial: commercialStats,
          copilot: {
            ...copilotRunStats,
            evals: copilotEvalStats,
          },
        }),
      );
    } catch (err) {
      app.log.error(err, 'Failed to fetch admin stats');
      return reply.code(500).send({ error: 'stats_unavailable' });
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
    'last_outreach_export_count',
    'last_outreach_exported_at',
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
        item.lastOutreachExportCount,
        item.lastOutreachExportedAt,
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
    'last_outreach_export_count',
    'last_outreach_exported_at',
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
        item.lastOutreachExportCount,
        item.lastOutreachExportedAt,
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
