import { z } from 'zod';
import { copilotFallbackReasonSchema, copilotFeedbackVoteSchema } from './copilot.js';
import { teamWorkspaceBillingEventSchema } from './teamWorkspace.js';

const nonnegativeInteger = z.number().int().nonnegative();
const nonnegativeNumber = z.number().nonnegative();

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

export const teamWorkspaceAdminMetricsSchema = z.object({
  totalWorkspaces: nonnegativeInteger,
  activeWorkspaces: nonnegativeInteger,
  atRiskWorkspaces: nonnegativeInteger,
  fullWorkspaces: nonnegativeInteger,
  totalSeatCapacity: nonnegativeInteger,
  seatsUsed: nonnegativeInteger,
  reservedSeats: nonnegativeInteger,
  pendingInvites: nonnegativeInteger,
  inheritedMembers: nonnegativeInteger,
  revokedInvites: nonnegativeInteger,
  fallbackMembers: nonnegativeInteger,
  seatUtilizationRate: z.number().min(0).max(1).nullable(),
  recentBillingEvents: z.array(
    teamWorkspaceBillingEventSchema.extend({
      workspaceId: z.string().uuid(),
      workspaceName: z.string(),
    }),
  ),
});

export const commercialAdminMetricsSchema = z.object({
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
export type TeamWorkspaceAdminMetrics = z.infer<typeof teamWorkspaceAdminMetricsSchema>;
export type CommercialAdminMetrics = z.infer<typeof commercialAdminMetricsSchema>;
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;
