import { z } from 'zod';
import { billingStatusSchema, subscriptionTierSchema } from './auth.js';
import { caseListItemSchema } from './cases.js';
import { savedViewItemSchema } from './savedViews.js';

export const teamWorkspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export const teamWorkspaceInviteStatusSchema = z.enum(['pending', 'accepted', 'revoked']);
export const teamWorkspaceBillingWarningSchema = z.enum([
  'workspace_plan_inactive',
  'past_due',
  'cancel_at_period_end',
  'seat_limit_reached',
]);
export const teamWorkspaceBillingRecoveryActionCodeSchema = z.enum([
  'upgrade_to_team',
  'resume_team_subscription',
  'update_payment_method',
  'renew_team_subscription',
  'free_up_seats',
]);
export const teamWorkspaceBillingRecoveryActionSurfaceSchema = z.enum([
  'checkout',
  'billing_portal',
  'workspace_members',
]);
export const teamWorkspaceBillingNoticeCodeSchema = z.enum([
  'workspace_plan_inactive',
  'past_due',
  'cancel_at_period_end',
  'seat_limit_reached',
  'invites_restored',
  'team_access_restored',
]);
export const teamWorkspaceRecoveryOutreachAudienceSchema = z.enum(['owner', 'admin']);
export const teamWorkspaceRecoveryOutreachChannelSchema = z.enum(['owner_banner', 'admin_queue']);
export const teamWorkspaceRecoveryOutreachStatusSchema = z.enum([
  'pending',
  'handed_off',
  'resolved',
]);
export const teamWorkspaceRecoveryPlaybookDeliveryStatusSchema = z.enum([
  'completed',
  'skipped',
  'disabled',
  'failed',
]);
export const teamWorkspaceRecoveryPlaybookOutreachStatusSchema = z.enum([
  'completed',
  'skipped',
  'failed',
]);
export const teamWorkspaceRecoveryPlaybookStepNameSchema = z.enum([
  'outreach',
  'ownerEmail',
  'memberEmail',
  'crmSync',
  'webhook',
  'slack',
]);
export const teamWorkspaceRecoveryOutreachHandoffChannelSchema = z.enum([
  'crm',
  'manual_follow_up',
]);
export const teamWorkspaceMemberRecoveryNotificationStatusSchema = z.enum(['pending', 'resolved']);
export const teamWorkspaceBillingEventTypeSchema = z.enum([
  'workspace_plan_inactive',
  'workspace_plan_restored',
  'seat_capacity_reduced',
  'seat_capacity_restored',
  'invites_auto_revoked',
  'invites_auto_restored',
  'members_fallback_started',
  'members_fallback_cleared',
]);
export const teamWorkspaceBillingEventSeveritySchema = z.enum([
  'info',
  'warning',
  'critical',
  'success',
]);

export const teamWorkspaceMemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: teamWorkspaceRoleSchema,
  joinedAt: z.string(),
});

export const teamWorkspaceInviteSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  email: z.string().email(),
  role: teamWorkspaceRoleSchema.exclude(['owner']),
  status: teamWorkspaceInviteStatusSchema,
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
});

export const teamWorkspaceSharedSavedViewSchema = savedViewItemSchema.extend({
  sourceSavedViewId: z.string().uuid(),
  sharedByUserId: z.string().uuid(),
  sharedByName: z.string().nullable(),
  sharedAt: z.string(),
});

export const teamWorkspaceSharedCaseSchema = caseListItemSchema.extend({
  sharedByUserId: z.string().uuid(),
  sharedByName: z.string().nullable(),
  sharedAt: z.string(),
});

export const teamWorkspaceBillingRecoveryActionSchema = z.object({
  code: teamWorkspaceBillingRecoveryActionCodeSchema,
  title: z.string(),
  detail: z.string(),
  surface: teamWorkspaceBillingRecoveryActionSurfaceSchema,
});

export const teamWorkspaceBillingNoticeSchema = z.object({
  code: teamWorkspaceBillingNoticeCodeSchema,
  severity: teamWorkspaceBillingEventSeveritySchema,
  title: z.string(),
  detail: z.string(),
  actionCode: teamWorkspaceBillingRecoveryActionCodeSchema.nullable(),
});

export const teamWorkspaceRecoveryOutreachSchema = z.object({
  id: z.string().uuid(),
  audience: teamWorkspaceRecoveryOutreachAudienceSchema,
  channel: teamWorkspaceRecoveryOutreachChannelSchema,
  status: teamWorkspaceRecoveryOutreachStatusSchema,
  title: z.string(),
  detail: z.string(),
  actionCode: teamWorkspaceBillingRecoveryActionCodeSchema.nullable(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  lastAttemptAt: z.string(),
  nextAttemptAt: z.string().nullable(),
  emailAttemptCount: z.number().int().nonnegative(),
  lastEmailAttemptAt: z.string().nullable(),
  nextEmailAttemptAt: z.string().nullable(),
  lastEmailDeliveredAt: z.string().nullable(),
  lastEmailMessageId: z.string().nullable(),
  lastEmailError: z.string().nullable(),
  exportCount: z.number().int().nonnegative(),
  lastExportedAt: z.string().nullable(),
  crmSyncCount: z.number().int().nonnegative(),
  lastCrmSyncAttemptAt: z.string().nullable(),
  nextCrmSyncAttemptAt: z.string().nullable(),
  lastCrmSyncedAt: z.string().nullable(),
  crmExternalRecordId: z.string().nullable(),
  lastCrmSyncStatusCode: z.number().int().nullable(),
  lastCrmSyncError: z.string().nullable(),
  webhookAttemptCount: z.number().int().nonnegative(),
  lastWebhookAttemptAt: z.string().nullable(),
  nextWebhookAttemptAt: z.string().nullable(),
  webhookExhaustedAt: z.string().nullable(),
  webhookDeliveryCount: z.number().int().nonnegative(),
  lastWebhookDeliveredAt: z.string().nullable(),
  lastWebhookStatusCode: z.number().int().nullable(),
  lastWebhookError: z.string().nullable(),
  slackAlertCount: z.number().int().nonnegative(),
  lastSlackAlertAttemptAt: z.string().nullable(),
  lastSlackAlertedAt: z.string().nullable(),
  lastSlackAlertStatusCode: z.number().int().nullable(),
  lastSlackAlertError: z.string().nullable(),
  handoffChannel: teamWorkspaceRecoveryOutreachHandoffChannelSchema.nullable(),
  handoffNote: z.string().nullable(),
  handoffAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});

export const teamWorkspaceRecoveryPlaybookDeliveryStepSchema = z.object({
  status: teamWorkspaceRecoveryPlaybookDeliveryStatusSchema,
  attemptedCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedReason: z.string().nullable(),
  error: z.string().nullable(),
  detail: z.string().nullable(),
  statusCode: z.number().int().nullable(),
});

export const teamWorkspaceRecoveryPlaybookOutreachStepSchema = z.object({
  status: teamWorkspaceRecoveryPlaybookOutreachStatusSchema,
  workspaceCount: z.number().int().nonnegative(),
  ownerOutreachCreated: z.number().int().nonnegative(),
  adminOutreachCreated: z.number().int().nonnegative(),
  retriedOutreachCount: z.number().int().nonnegative(),
  resolvedOutreachCount: z.number().int().nonnegative(),
  skippedReason: z.string().nullable(),
  detail: z.string().nullable(),
});

export const teamWorkspaceRecoveryPlaybookStepsSchema = z.object({
  outreach: teamWorkspaceRecoveryPlaybookOutreachStepSchema,
  ownerEmail: teamWorkspaceRecoveryPlaybookDeliveryStepSchema,
  memberEmail: teamWorkspaceRecoveryPlaybookDeliveryStepSchema,
  crmSync: teamWorkspaceRecoveryPlaybookDeliveryStepSchema,
  webhook: teamWorkspaceRecoveryPlaybookDeliveryStepSchema,
  slack: teamWorkspaceRecoveryPlaybookDeliveryStepSchema,
});

export const teamWorkspaceRecoveryPlaybookRunSchema = z.object({
  id: z.string().uuid(),
  triggerType: z.string(),
  retryIntervalHours: z.number().int().nonnegative(),
  force: z.boolean(),
  requestedSteps: z.array(teamWorkspaceRecoveryPlaybookStepNameSchema),
  rerunOfRunId: z.string().uuid().nullable(),
  ok: z.boolean(),
  summary: z.string(),
  steps: teamWorkspaceRecoveryPlaybookStepsSchema,
  createdAt: z.string(),
});

export const teamWorkspaceMemberRecoveryNotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  status: teamWorkspaceMemberRecoveryNotificationStatusSchema,
  title: z.string(),
  detail: z.string(),
  emailAttemptCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  lastEmailAttemptAt: z.string().nullable(),
  nextEmailAttemptAt: z.string().nullable(),
  lastEmailDeliveredAt: z.string().nullable(),
  lastEmailMessageId: z.string().nullable(),
  lastEmailError: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});

export const teamWorkspaceBillingSchema = z.object({
  ownerUserId: z.string().uuid(),
  ownerDisplayName: z.string().nullable(),
  ownerEmail: z.string().email(),
  subscription: subscriptionTierSchema,
  billingStatus: billingStatusSchema,
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  seatLimit: z.number().int().nonnegative(),
  seatsUsed: z.number().int().nonnegative(),
  reservedSeats: z.number().int().nonnegative(),
  seatsRemaining: z.number().int().nonnegative(),
  fallbackMemberCount: z.number().int().nonnegative(),
  revokedInviteCount: z.number().int().nonnegative(),
  canInviteMore: z.boolean(),
  warningCodes: z.array(teamWorkspaceBillingWarningSchema),
  recommendedActions: z.array(teamWorkspaceBillingRecoveryActionSchema),
  recoveryNotices: z.array(teamWorkspaceBillingNoticeSchema),
});

export const teamWorkspaceBillingEventSchema = z.object({
  id: z.string().uuid(),
  type: teamWorkspaceBillingEventTypeSchema,
  severity: teamWorkspaceBillingEventSeveritySchema,
  title: z.string(),
  detail: z.string(),
  count: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
});

export const teamWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: teamWorkspaceRoleSchema,
  canManageMembers: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  sharedSavedViewCount: z.number().int().nonnegative(),
  sharedCaseCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  billing: teamWorkspaceBillingSchema,
  recentBillingEvents: z.array(teamWorkspaceBillingEventSchema),
  recentRecoveryOutreach: z.array(teamWorkspaceRecoveryOutreachSchema),
  recentMemberRecoveryNotifications: z.array(teamWorkspaceMemberRecoveryNotificationSchema),
  members: z.array(teamWorkspaceMemberSchema),
  invites: z.array(teamWorkspaceInviteSchema),
  sharedSavedViews: z.array(teamWorkspaceSharedSavedViewSchema),
  sharedCases: z.array(teamWorkspaceSharedCaseSchema),
});

export const teamWorkspaceContextResponseSchema = z.object({
  canCreateWorkspace: z.boolean(),
  hasWorkspace: z.boolean(),
  workspace: teamWorkspaceSchema.nullable(),
  pendingInvites: z.array(teamWorkspaceInviteSchema),
});

export const createTeamWorkspaceBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const inviteTeamWorkspaceMemberBodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: teamWorkspaceRoleSchema.exclude(['owner']).default('member'),
});

export const teamWorkspaceInviteIdParamsSchema = z.object({
  inviteId: z.string().uuid(),
});

export const shareSavedViewToWorkspaceBodySchema = z.object({
  savedViewId: z.string().uuid(),
});

export const shareCaseToWorkspaceBodySchema = z.object({
  caseId: z.string().uuid(),
});

export const teamWorkspaceContextMutationResponseSchema = z.object({
  ok: z.literal(true),
  added: z.boolean().optional(),
  workspace: teamWorkspaceSchema,
});

export const handoffTeamWorkspaceRecoveryOutreachBodySchema = z.object({
  workspaceId: z.string().uuid(),
  channel: teamWorkspaceRecoveryOutreachHandoffChannelSchema.default('crm'),
  snoozeHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14)
    .default(48),
  note: z.string().trim().max(500).optional(),
});

export type TeamWorkspaceRole = z.infer<typeof teamWorkspaceRoleSchema>;
export type TeamWorkspaceInviteStatus = z.infer<typeof teamWorkspaceInviteStatusSchema>;
export type TeamWorkspaceBillingWarning = z.infer<typeof teamWorkspaceBillingWarningSchema>;
export type TeamWorkspaceBillingRecoveryActionCode = z.infer<
  typeof teamWorkspaceBillingRecoveryActionCodeSchema
>;
export type TeamWorkspaceBillingRecoveryActionSurface = z.infer<
  typeof teamWorkspaceBillingRecoveryActionSurfaceSchema
>;
export type TeamWorkspaceBillingNoticeCode = z.infer<typeof teamWorkspaceBillingNoticeCodeSchema>;
export type TeamWorkspaceRecoveryOutreachAudience = z.infer<
  typeof teamWorkspaceRecoveryOutreachAudienceSchema
>;
export type TeamWorkspaceRecoveryOutreachChannel = z.infer<
  typeof teamWorkspaceRecoveryOutreachChannelSchema
>;
export type TeamWorkspaceRecoveryOutreachStatus = z.infer<
  typeof teamWorkspaceRecoveryOutreachStatusSchema
>;
export type TeamWorkspaceRecoveryPlaybookDeliveryStatus = z.infer<
  typeof teamWorkspaceRecoveryPlaybookDeliveryStatusSchema
>;
export type TeamWorkspaceRecoveryPlaybookOutreachStatus = z.infer<
  typeof teamWorkspaceRecoveryPlaybookOutreachStatusSchema
>;
export type TeamWorkspaceRecoveryPlaybookStepName = z.infer<
  typeof teamWorkspaceRecoveryPlaybookStepNameSchema
>;
export type TeamWorkspaceRecoveryOutreachHandoffChannel = z.infer<
  typeof teamWorkspaceRecoveryOutreachHandoffChannelSchema
>;
export type TeamWorkspaceMemberRecoveryNotificationStatus = z.infer<
  typeof teamWorkspaceMemberRecoveryNotificationStatusSchema
>;
export type TeamWorkspaceBillingEventType = z.infer<typeof teamWorkspaceBillingEventTypeSchema>;
export type TeamWorkspaceBillingEventSeverity = z.infer<
  typeof teamWorkspaceBillingEventSeveritySchema
>;
export type TeamWorkspaceMember = z.infer<typeof teamWorkspaceMemberSchema>;
export type TeamWorkspaceInvite = z.infer<typeof teamWorkspaceInviteSchema>;
export type TeamWorkspaceSharedSavedView = z.infer<typeof teamWorkspaceSharedSavedViewSchema>;
export type TeamWorkspaceSharedCase = z.infer<typeof teamWorkspaceSharedCaseSchema>;
export type TeamWorkspaceBilling = z.infer<typeof teamWorkspaceBillingSchema>;
export type TeamWorkspaceBillingRecoveryAction = TeamWorkspaceBilling['recommendedActions'][number];
export type TeamWorkspaceBillingNotice = TeamWorkspaceBilling['recoveryNotices'][number];
export type TeamWorkspaceBillingEvent = z.infer<typeof teamWorkspaceBillingEventSchema>;
export type TeamWorkspaceRecoveryOutreach = z.infer<typeof teamWorkspaceRecoveryOutreachSchema>;
export type TeamWorkspaceRecoveryPlaybookDeliveryStep = z.infer<
  typeof teamWorkspaceRecoveryPlaybookDeliveryStepSchema
>;
export type TeamWorkspaceRecoveryPlaybookOutreachStep = z.infer<
  typeof teamWorkspaceRecoveryPlaybookOutreachStepSchema
>;
export type TeamWorkspaceRecoveryPlaybookSteps = z.infer<
  typeof teamWorkspaceRecoveryPlaybookStepsSchema
>;
export type TeamWorkspaceRecoveryPlaybookRun = z.infer<
  typeof teamWorkspaceRecoveryPlaybookRunSchema
>;
export type TeamWorkspaceMemberRecoveryNotification = z.infer<
  typeof teamWorkspaceMemberRecoveryNotificationSchema
>;
export type TeamWorkspace = z.infer<typeof teamWorkspaceSchema>;
export type TeamWorkspaceContextResponse = z.infer<typeof teamWorkspaceContextResponseSchema>;
