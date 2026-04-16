import { z } from 'zod';
import { copilotFallbackReasonSchema, copilotFeedbackVoteSchema } from './copilot.js';
import { billingStatusSchema, subscriptionTierSchema } from './auth.js';
import {
  teamWorkspaceBillingEventSchema,
  teamWorkspaceBillingRecoveryActionSchema,
  teamWorkspaceBillingRecoveryActionCodeSchema,
  teamWorkspaceRecoveryOutreachAudienceSchema,
  teamWorkspaceRecoveryOutreachChannelSchema,
  teamWorkspaceRecoveryOutreachHandoffChannelSchema,
  teamWorkspaceRecoveryPlaybookRunSchema,
  teamWorkspaceRecoveryOutreachSchema,
  teamWorkspaceRecoveryOutreachStatusSchema,
  teamWorkspaceBillingWarningSchema,
} from './teamWorkspace.js';

const nonnegativeInteger = z.number().int().nonnegative();
const nonnegativeNumber = z.number().nonnegative();
const commercialPlanSchema = z.enum(['pro', 'team']);

export const copilotFeedbackEvalSchema = z.object({
  helpful: nonnegativeInteger,
  needsImprovement: nonnegativeInteger,
  unrated: nonnegativeInteger,
  positiveRate: z.number().min(0).max(1).nullable(),
});

export const copilotOverviewStatsSchema = z.object({
  totalRuns: nonnegativeInteger,
  totalSessions: nonnegativeInteger,
  groundedRuns: nonnegativeInteger,
  fallbackRuns: nonnegativeInteger,
  avgResponseMs: nonnegativeInteger,
  avgTotalTokens: nonnegativeInteger,
  totalEstimatedCostUsd: nonnegativeNumber,
  lastRunAt: z.string().nullable(),
});

export const copilotPromptVersionStatsSchema = z.object({
  promptVersion: z.string(),
  runs: nonnegativeInteger,
  groundedRuns: nonnegativeInteger,
  fallbackRuns: nonnegativeInteger,
  avgResponseMs: nonnegativeInteger,
  avgTotalTokens: nonnegativeInteger,
  totalEstimatedCostUsd: nonnegativeNumber,
  positiveFeedback: nonnegativeInteger,
  negativeFeedback: nonnegativeInteger,
  noFeedback: nonnegativeInteger,
  groundedRate: z.number().min(0).max(1).nullable(),
  positiveRate: z.number().min(0).max(1).nullable(),
  lastRunAt: z.string().nullable(),
});

export const copilotFallbackReasonCountSchema = z.object({
  reason: copilotFallbackReasonSchema,
  count: nonnegativeInteger,
});

export const copilotFlaggedRunSchema = z.object({
  sessionId: z.string().uuid(),
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  promptVersion: z.string(),
  question: z.string(),
  answerPreview: z.string(),
  feedbackVote: copilotFeedbackVoteSchema.nullable(),
  feedbackNote: z.string().nullable(),
  fallbackReason: copilotFallbackReasonSchema.nullable(),
  responseMs: nonnegativeInteger,
  totalTokens: nonnegativeInteger.nullable(),
  estimatedCostUsd: nonnegativeNumber.nullable(),
  createdAt: z.string(),
});

export const copilotRunAdminMetricsSchema = z.object({
  overview: copilotOverviewStatsSchema,
  feedbackEval: copilotFeedbackEvalSchema,
  byPromptVersion: z.array(copilotPromptVersionStatsSchema),
  byFallbackReason: z.array(copilotFallbackReasonCountSchema),
  recentFlags: z.array(copilotFlaggedRunSchema),
});

export const copilotEvalOverviewSchema = z.object({
  activeCases: nonnegativeInteger,
  totalBatches: nonnegativeInteger,
  lastRunAt: z.string().nullable(),
  latestPromptVersion: z.string().nullable(),
  latestPassRate: z.number().min(0).max(1).nullable(),
  latestAvgCitationRecall: z.number().min(0).max(1).nullable(),
  latestAvgCitationPrecision: z.number().min(0).max(1).nullable(),
});

export const copilotEvalBatchSchema = z.object({
  batchId: z.string().uuid(),
  triggerType: z.string(),
  promptVersion: z.string(),
  totalCases: nonnegativeInteger,
  passedCases: nonnegativeInteger,
  groundedCases: nonnegativeInteger,
  fallbackCases: nonnegativeInteger,
  passRate: z.number().min(0).max(1).nullable(),
  avgCitationRecall: z.number().min(0).max(1).nullable(),
  avgCitationPrecision: z.number().min(0).max(1).nullable(),
  avgResponseMs: nonnegativeInteger,
  totalTokens: nonnegativeInteger,
  totalEstimatedCostUsd: nonnegativeNumber,
  createdAt: z.string(),
});

export const copilotEvalFailureSchema = z.object({
  batchId: z.string().uuid(),
  evalCaseSlug: z.string(),
  evalCaseTitle: z.string(),
  question: z.string(),
  promptVersion: z.string(),
  grounded: z.boolean(),
  fallbackReason: copilotFallbackReasonSchema.nullable(),
  expectedCaseSlugs: z.array(z.string()),
  actualCitationSlugs: z.array(z.string()),
  citationRecall: z.number().min(0).max(1).nullable(),
  citationPrecision: z.number().min(0).max(1).nullable(),
  answerPreview: z.string(),
  createdAt: z.string(),
});

export const copilotEvalAdminMetricsSchema = z.object({
  overview: copilotEvalOverviewSchema,
  recentBatches: z.array(copilotEvalBatchSchema),
  latestFailures: z.array(copilotEvalFailureSchema),
});

export const copilotAdminMetricsSchema = copilotRunAdminMetricsSchema.extend({
  evals: copilotEvalAdminMetricsSchema,
});

export const billingFunnelEventTypeSchema = z.enum([
  'checkout_started',
  'checkout_completed',
  'portal_started',
  'subscription_recovered',
]);

export const billingFunnelEventSourceSchema = z.enum(['account_page', 'team_workspace']);

export const billingFunnelEventSchema = z.object({
  id: z.string().uuid(),
  type: billingFunnelEventTypeSchema,
  source: billingFunnelEventSourceSchema,
  plan: commercialPlanSchema.nullable(),
  detail: z.string(),
  createdAt: z.string(),
});

export const teamWorkspaceRecoveryStageSchema = z.enum([
  'needs_outreach',
  'owner_engaged',
  'recovered_followup',
]);

export const teamWorkspaceFollowUpStateSchema = z.enum([
  'needs_initial_touch',
  'awaiting_owner',
  'overdue',
  'owner_engaged',
  'recovered_followup',
]);

export const teamWorkspaceAdminMetricsSchema = z.object({
  totalWorkspaces: nonnegativeInteger,
  activeWorkspaces: nonnegativeInteger,
  atRiskWorkspaces: nonnegativeInteger,
  workspacesRequiringAction: nonnegativeInteger,
  fullWorkspaces: nonnegativeInteger,
  totalSeatCapacity: nonnegativeInteger,
  seatsUsed: nonnegativeInteger,
  reservedSeats: nonnegativeInteger,
  pendingInvites: nonnegativeInteger,
  inheritedMembers: nonnegativeInteger,
  revokedInvites: nonnegativeInteger,
  fallbackMembers: nonnegativeInteger,
  seatUtilizationRate: z.number().min(0).max(1).nullable(),
  recoveryActions: z.array(
    z.object({
      code: teamWorkspaceBillingRecoveryActionCodeSchema,
      title: z.string(),
      count: nonnegativeInteger,
    }),
  ),
  recoveryStages: z.array(
    z.object({
      stage: teamWorkspaceRecoveryStageSchema,
      title: z.string(),
      count: nonnegativeInteger,
    }),
  ),
  followUpStates: z.array(
    z.object({
      state: teamWorkspaceFollowUpStateSchema,
      title: z.string(),
      count: nonnegativeInteger,
    }),
  ),
  recoveryOutreach: z.object({
    pendingOwner: nonnegativeInteger,
    pendingAdmin: nonnegativeInteger,
    pendingEmail: nonnegativeInteger,
    retryingEmail: nonnegativeInteger,
    deliveredEmail: nonnegativeInteger,
    failedEmail: nonnegativeInteger,
    pendingMemberEmail: nonnegativeInteger,
    retryingMemberEmail: nonnegativeInteger,
    deliveredMemberEmail: nonnegativeInteger,
    failedMemberEmail: nonnegativeInteger,
    multiTouchPending: nonnegativeInteger,
    pendingExport: nonnegativeInteger,
    pendingCrmSync: nonnegativeInteger,
    retryingCrmSync: nonnegativeInteger,
    syncedCrm: nonnegativeInteger,
    failedCrmSync: nonnegativeInteger,
    pendingWebhook: nonnegativeInteger,
    retryingWebhook: nonnegativeInteger,
    deadLetteredWebhook: nonnegativeInteger,
    pendingSlackAlert: nonnegativeInteger,
    alertedSlack: nonnegativeInteger,
    failedSlackAlert: nonnegativeInteger,
    deliveredWebhook: nonnegativeInteger,
    failedWebhook: nonnegativeInteger,
    handedOff: nonnegativeInteger,
    resolved: nonnegativeInteger,
    recent: z.array(
      teamWorkspaceRecoveryOutreachSchema.extend({
        workspaceId: z.string().uuid(),
        workspaceName: z.string(),
      }),
    ),
  }),
  recoveryPlaybook: z.object({
    totalRuns: nonnegativeInteger,
    successfulRuns: nonnegativeInteger,
    failedRuns: nonnegativeInteger,
    scheduledRuns: nonnegativeInteger,
    manualRuns: nonnegativeInteger,
    lastRunAt: z.string().nullable(),
    lastRunOk: z.boolean().nullable(),
    recent: z.array(teamWorkspaceRecoveryPlaybookRunSchema),
  }),
  recentBillingEvents: z.array(
    teamWorkspaceBillingEventSchema.extend({
      workspaceId: z.string().uuid(),
      workspaceName: z.string(),
    }),
  ),
  actionableWorkspaces: z.array(
    z.object({
      workspaceId: z.string().uuid(),
      workspaceName: z.string(),
      ownerUserId: z.string().uuid(),
      ownerDisplayName: z.string().nullable(),
      ownerEmail: z.string().email(),
      subscription: subscriptionTierSchema,
      billingStatus: billingStatusSchema,
      seatLimit: nonnegativeInteger,
      seatsUsed: nonnegativeInteger,
      reservedSeats: nonnegativeInteger,
      pendingInvites: nonnegativeInteger,
      revokedInvites: nonnegativeInteger,
      fallbackMembers: nonnegativeInteger,
      warningCodes: z.array(teamWorkspaceBillingWarningSchema),
      recommendedActions: z.array(teamWorkspaceBillingRecoveryActionSchema),
      lastBillingEventAt: z.string().nullable(),
      lastBillingEventTitle: z.string().nullable(),
      lastCommercialEventAt: z.string().nullable(),
      lastCommercialEventType: billingFunnelEventTypeSchema.nullable(),
      lastCommercialEventSource: billingFunnelEventSourceSchema.nullable(),
      recoveryStage: teamWorkspaceRecoveryStageSchema,
      followUpState: teamWorkspaceFollowUpStateSchema,
      nextFollowUpAt: z.string().nullable(),
      lastOutreachAt: z.string().nullable(),
      lastOutreachTitle: z.string().nullable(),
      lastOutreachAudience: teamWorkspaceRecoveryOutreachAudienceSchema.nullable(),
      lastOutreachChannel: teamWorkspaceRecoveryOutreachChannelSchema.nullable(),
      lastOutreachStatus: teamWorkspaceRecoveryOutreachStatusSchema.nullable(),
      lastOutreachAttemptCount: nonnegativeInteger.nullable(),
      nextOutreachAttemptAt: z.string().nullable(),
      lastOutreachEmailAttemptCount: nonnegativeInteger.nullable(),
      lastOutreachEmailAttemptAt: z.string().nullable(),
      nextOutreachEmailAttemptAt: z.string().nullable(),
      lastOutreachEmailDeliveredAt: z.string().nullable(),
      lastOutreachEmailMessageId: z.string().nullable(),
      lastOutreachEmailError: z.string().nullable(),
      lastOutreachExportCount: nonnegativeInteger.nullable(),
      lastOutreachExportedAt: z.string().nullable(),
      lastOutreachCrmSyncCount: nonnegativeInteger.nullable(),
      lastOutreachCrmSyncAttemptAt: z.string().nullable(),
      nextOutreachCrmSyncAttemptAt: z.string().nullable(),
      lastOutreachCrmSyncedAt: z.string().nullable(),
      lastOutreachCrmExternalRecordId: z.string().nullable(),
      lastOutreachCrmSyncStatusCode: z.number().int().nullable(),
      lastOutreachCrmSyncError: z.string().nullable(),
      lastOutreachWebhookAttemptCount: nonnegativeInteger.nullable(),
      lastOutreachWebhookAttemptAt: z.string().nullable(),
      nextOutreachWebhookAttemptAt: z.string().nullable(),
      lastOutreachWebhookExhaustedAt: z.string().nullable(),
      lastOutreachWebhookDeliveryCount: nonnegativeInteger.nullable(),
      lastOutreachWebhookDeliveredAt: z.string().nullable(),
      lastOutreachWebhookStatusCode: z.number().int().nullable(),
      lastOutreachWebhookError: z.string().nullable(),
      lastOutreachSlackAlertCount: nonnegativeInteger.nullable(),
      lastOutreachSlackAlertAttemptAt: z.string().nullable(),
      lastOutreachSlackAlertedAt: z.string().nullable(),
      lastOutreachSlackAlertStatusCode: z.number().int().nullable(),
      lastOutreachSlackAlertError: z.string().nullable(),
      lastOutreachHandoffChannel: teamWorkspaceRecoveryOutreachHandoffChannelSchema.nullable(),
      lastOutreachHandoffAt: z.string().nullable(),
      lastOutreachHandoffNote: z.string().nullable(),
      memberRecoveryPendingCount: nonnegativeInteger,
      memberRecoveryRetryingCount: nonnegativeInteger,
      memberRecoveryDeliveredCount: nonnegativeInteger,
      memberRecoveryFailedCount: nonnegativeInteger,
      memberRecoveryNextEmailAttemptAt: z.string().nullable(),
      memberRecoveryLastEmailDeliveredAt: z.string().nullable(),
      memberRecoveryLastEmailError: z.string().nullable(),
    }),
  ),
});

export const billingFunnelAdminMetricsSchema = z.object({
  checkoutStarts: nonnegativeInteger,
  checkoutCompletions: nonnegativeInteger,
  proCheckoutStarts: nonnegativeInteger,
  teamCheckoutStarts: nonnegativeInteger,
  portalStarts: nonnegativeInteger,
  recoveredSubscriptions: nonnegativeInteger,
  checkoutCompletionRate: z.number().min(0).max(1).nullable(),
  teamCheckoutShare: z.number().min(0).max(1).nullable(),
  recentEvents: z.array(billingFunnelEventSchema),
});

export const subscriptionAdminMetricsSchema = z.object({
  totalUsers: nonnegativeInteger,
  freeUsers: nonnegativeInteger,
  proUsers: nonnegativeInteger,
  teamUsers: nonnegativeInteger,
  activePaidUsers: nonnegativeInteger,
  pastDueUsers: nonnegativeInteger,
  cancelingUsers: nonnegativeInteger,
  paidConversionRate: z.number().min(0).max(1).nullable(),
  teamMixRate: z.number().min(0).max(1).nullable(),
});

export const researchUsageAdminMetricsSchema = z.object({
  activeResearchUsers: nonnegativeInteger,
  watchlistUsers: nonnegativeInteger,
  watchlistEntries: nonnegativeInteger,
  avgWatchlistEntriesPerUser: z.number().min(0).nullable(),
  savedViewUsers: nonnegativeInteger,
  savedViews: nonnegativeInteger,
  avgSavedViewsPerUser: z.number().min(0).nullable(),
  reportShareUsers: nonnegativeInteger,
  reportShares: nonnegativeInteger,
  accessedReportShares: nonnegativeInteger,
  researchActivationRate: z.number().min(0).max(1).nullable(),
  reportShareActivationRate: z.number().min(0).max(1).nullable(),
});

export const commercialAdminMetricsSchema = z.object({
  subscriptions: subscriptionAdminMetricsSchema,
  billingFunnel: billingFunnelAdminMetricsSchema,
  researchUsage: researchUsageAdminMetricsSchema,
  teamWorkspaces: teamWorkspaceAdminMetricsSchema,
});

export const adminStatsResponseSchema = z.object({
  totalPublished: nonnegativeInteger,
  totalFundingUsd: nonnegativeNumber,
  totalDraft: nonnegativeInteger,
  avgFundingUsd: nonnegativeNumber,
  byIndustry: z.array(
    z.object({
      industry: z.string(),
      count: nonnegativeInteger,
      totalFunding: nonnegativeNumber,
    }),
  ),
  byCountry: z.array(
    z.object({
      country: z.string(),
      count: nonnegativeInteger,
    }),
  ),
  byYear: z.array(
    z.object({
      year: z.number().int(),
      count: nonnegativeInteger,
    }),
  ),
  byFailureReason: z.array(
    z.object({
      reason: z.string(),
      count: nonnegativeInteger,
    }),
  ),
  recentlyAdded: z.array(
    z.object({
      id: z.string().uuid(),
      slug: z.string(),
      companyName: z.string(),
      createdAt: z.string(),
    }),
  ),
  pendingReviews: nonnegativeInteger,
  ingestionStats: z.object({
    pending: nonnegativeInteger,
    running: nonnegativeInteger,
    failed: nonnegativeInteger,
    completed: nonnegativeInteger,
  }),
  commercial: commercialAdminMetricsSchema,
  copilot: copilotAdminMetricsSchema,
});

export type CopilotFeedbackEval = z.infer<typeof copilotFeedbackEvalSchema>;
export type CopilotOverviewStats = z.infer<typeof copilotOverviewStatsSchema>;
export type CopilotPromptVersionStats = z.infer<typeof copilotPromptVersionStatsSchema>;
export type CopilotFallbackReasonCount = z.infer<typeof copilotFallbackReasonCountSchema>;
export type CopilotFlaggedRun = z.infer<typeof copilotFlaggedRunSchema>;
export type CopilotRunAdminMetrics = z.infer<typeof copilotRunAdminMetricsSchema>;
export type CopilotEvalOverview = z.infer<typeof copilotEvalOverviewSchema>;
export type CopilotEvalBatch = z.infer<typeof copilotEvalBatchSchema>;
export type CopilotEvalFailure = z.infer<typeof copilotEvalFailureSchema>;
export type CopilotEvalAdminMetrics = z.infer<typeof copilotEvalAdminMetricsSchema>;
export type CopilotAdminMetrics = z.infer<typeof copilotAdminMetricsSchema>;
export type BillingFunnelEventType = z.infer<typeof billingFunnelEventTypeSchema>;
export type BillingFunnelEventSource = z.infer<typeof billingFunnelEventSourceSchema>;
export type BillingFunnelEvent = z.infer<typeof billingFunnelEventSchema>;
export type BillingFunnelAdminMetrics = z.infer<typeof billingFunnelAdminMetricsSchema>;
export type TeamWorkspaceAdminMetrics = z.infer<typeof teamWorkspaceAdminMetricsSchema>;
export type SubscriptionAdminMetrics = z.infer<typeof subscriptionAdminMetricsSchema>;
export type ResearchUsageAdminMetrics = z.infer<typeof researchUsageAdminMetricsSchema>;
export type CommercialAdminMetrics = z.infer<typeof commercialAdminMetricsSchema>;
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;
