import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getPool } from '../../db/pool.js';
import type { CommercialAdminMetrics } from '@sg/shared/schemas/adminStats';
import { adminStatsResponseSchema } from '../../schemas/adminStats.js';

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
  const actionableWorkspaces = teamWorkspaceStats.actionableWorkspaces.map((workspace) => {
    const latestCommercialTouch = latestCommercialTouchByUserId.get(workspace.ownerUserId);
    return {
      ...workspace,
      lastCommercialEventAt: latestCommercialTouch?.createdAt ?? null,
      lastCommercialEventType: latestCommercialTouch?.type ?? null,
      lastCommercialEventSource: latestCommercialTouch?.source ?? null,
      recoveryStage: recoveryStageFromCommercialTouch(latestCommercialTouch?.type ?? null),
    };
  });
  const recoveryStageCounts = new Map<
    CommercialAdminMetrics['teamWorkspaces']['recoveryStages'][number]['stage'],
    CommercialAdminMetrics['teamWorkspaces']['recoveryStages'][number]
  >();
  for (const workspace of actionableWorkspaces) {
    const existing = recoveryStageCounts.get(workspace.recoveryStage);
    if (existing) {
      existing.count += 1;
      continue;
    }
    recoveryStageCounts.set(workspace.recoveryStage, {
      stage: workspace.recoveryStage,
      title: recoveryStageTitle(workspace.recoveryStage),
      count: 1,
    });
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
