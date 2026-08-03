import type { AdminStats } from '@/lib/statsApi';

export function deriveDashboardMetrics(stats: AdminStats) {
  const platformStats = stats.platform;
  const subscriptionStats = stats.commercial.subscriptions;
  const billingFunnelStats = stats.commercial.billingFunnel;
  const researchStats = stats.commercial.researchUsage;
  const teamStats = stats.commercial.teamWorkspaces;
  const playbookStats = teamStats.recoveryPlaybook;
  const maxIndustry = Math.max(...stats.byIndustry.map((r) => r.count), 1);
  const maxYear = Math.max(...stats.byYear.map((r) => r.count), 1);
  const maxReason = Math.max(...stats.byFailureReason.map((r) => r.count), 1);
  const maxPromptRuns = Math.max(...stats.copilot.byPromptVersion.map((r) => r.runs), 1);
  const maxFallbackReason = Math.max(...stats.copilot.byFallbackReason.map((r) => r.count), 1);
  const maxEvalBatchCases = Math.max(
    ...stats.copilot.evals.recentBatches.map((r) => r.totalCases),
    1,
  );
  const maxTeamMetric = Math.max(
    teamStats.totalSeatCapacity,
    teamStats.reservedSeats,
    teamStats.pendingInvites,
    teamStats.inheritedMembers,
    teamStats.revokedInvites,
    teamStats.fallbackMembers,
    1,
  );
  const maxSubscriptionMetric = Math.max(
    subscriptionStats.totalUsers,
    subscriptionStats.freeUsers,
    subscriptionStats.proUsers,
    subscriptionStats.teamUsers,
    subscriptionStats.activePaidUsers,
    1,
  );
  const maxResearchMetric = Math.max(
    researchStats.activeResearchUsers,
    researchStats.watchlistUsers,
    researchStats.savedViewUsers,
    researchStats.reportShareUsers,
    researchStats.watchlistEntries,
    researchStats.savedViews,
    researchStats.reportShares,
    1,
  );
  const maxRecoveryActionMetric = Math.max(
    ...teamStats.recoveryActions.map((item) => item.count),
    1,
  );
  const maxRecoveryStageMetric = Math.max(...teamStats.recoveryStages.map((item) => item.count), 1);
  const maxFollowUpStateMetric = Math.max(...teamStats.followUpStates.map((item) => item.count), 1);
  const maxRecoveryOutreachMetric = Math.max(
    teamStats.recoveryOutreach.pendingOwner,
    teamStats.recoveryOutreach.pendingAdmin,
    teamStats.recoveryOutreach.pendingEmail,
    teamStats.recoveryOutreach.retryingEmail,
    teamStats.recoveryOutreach.deliveredEmail,
    teamStats.recoveryOutreach.failedEmail,
    teamStats.recoveryOutreach.pendingMemberEmail,
    teamStats.recoveryOutreach.retryingMemberEmail,
    teamStats.recoveryOutreach.deliveredMemberEmail,
    teamStats.recoveryOutreach.failedMemberEmail,
    teamStats.recoveryOutreach.multiTouchPending,
    teamStats.recoveryOutreach.pendingExport,
    teamStats.recoveryOutreach.pendingCrmSync,
    teamStats.recoveryOutreach.retryingCrmSync,
    teamStats.recoveryOutreach.syncedCrm,
    teamStats.recoveryOutreach.failedCrmSync,
    teamStats.recoveryOutreach.pendingWebhook,
    teamStats.recoveryOutreach.retryingWebhook,
    teamStats.recoveryOutreach.deadLetteredWebhook,
    teamStats.recoveryOutreach.pendingSlackAlert,
    teamStats.recoveryOutreach.alertedSlack,
    teamStats.recoveryOutreach.failedSlackAlert,
    teamStats.recoveryOutreach.deliveredWebhook,
    teamStats.recoveryOutreach.failedWebhook,
    teamStats.recoveryOutreach.handedOff,
    teamStats.recoveryOutreach.resolved,
    1,
  );
  const maxRecoveryPlaybookMetric = Math.max(
    playbookStats.totalRuns,
    playbookStats.successfulRuns,
    playbookStats.failedRuns,
    playbookStats.scheduledRuns,
    playbookStats.manualRuns,
    1,
  );
  const maxPlatformAlertMetric = Math.max(
    platformStats.alertSummary.critical,
    platformStats.alertSummary.warning,
    platformStats.alertSummary.info,
    1,
  );
  const maxBillingFunnelMetric = Math.max(
    billingFunnelStats.checkoutStarts,
    billingFunnelStats.checkoutCompletions,
    billingFunnelStats.portalStarts,
    billingFunnelStats.recoveredSubscriptions,
    1,
  );
  const groundedRate =
    stats.copilot.overview.totalRuns > 0
      ? stats.copilot.overview.groundedRuns / stats.copilot.overview.totalRuns
      : null;

  return {
    platformStats,
    subscriptionStats,
    billingFunnelStats,
    researchStats,
    teamStats,
    playbookStats,
    maxIndustry,
    maxYear,
    maxReason,
    maxPromptRuns,
    maxFallbackReason,
    maxEvalBatchCases,
    maxTeamMetric,
    maxSubscriptionMetric,
    maxResearchMetric,
    maxRecoveryActionMetric,
    maxRecoveryStageMetric,
    maxFollowUpStateMetric,
    maxRecoveryOutreachMetric,
    maxRecoveryPlaybookMetric,
    maxPlatformAlertMetric,
    maxBillingFunnelMetric,
    groundedRate,
  };
}

export type DashboardMetrics = ReturnType<typeof deriveDashboardMetrics>;
