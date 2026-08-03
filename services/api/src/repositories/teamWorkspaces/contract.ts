import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import type { UserProfile } from '@sg/shared/schemas/auth';
import type { BillingStatus, SubscriptionTier } from '@sg/shared/billing';
import type {
  TeamWorkspaceBilling,
  TeamWorkspaceBillingRecoveryActionCode,
  TeamWorkspaceBillingEventSeverity,
  TeamWorkspaceBillingEventType,
  TeamWorkspaceRecoveryOutreachAudience,
  TeamWorkspaceRecoveryOutreachChannel,
  TeamWorkspaceRecoveryOutreachHandoffChannel,
  TeamWorkspaceRecoveryPlaybookRun,
  TeamWorkspaceRecoveryPlaybookStepName,
  TeamWorkspaceRecoveryPlaybookSteps,
  TeamWorkspaceRecoveryOutreachStatus,
  TeamWorkspace,
  TeamWorkspaceContextResponse,
  TeamWorkspaceInvite,
  TeamWorkspaceRole,
} from '@sg/shared/schemas/teamWorkspace';

export type ManageRole = Exclude<TeamWorkspaceRole, 'owner'>;

export type WorkspaceMembershipRecord = {
  workspaceId: string;
  role: TeamWorkspaceRole;
  joinedAt: string;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
};

export type WorkspaceInviteRecord = TeamWorkspaceInvite;
export type WorkspaceInviteRevocationReason =
  | 'billing_inactive'
  | 'seat_limit_reduced'
  | 'accepted_elsewhere';

export type WorkspaceSharedSavedViewRecord = {
  workspaceId: string;
  savedViewId: string;
  sharedByUserId: string;
  sharedAt: string;
};

export type WorkspaceSharedCaseRecord = {
  workspaceId: string;
  caseId: string;
  sharedByUserId: string;
  sharedAt: string;
};

export type PgWorkspaceMembershipRow = {
  workspace_id: string;
  role: TeamWorkspaceRole;
  joined_at: Date | string;
  name: string;
  created_at: Date | string;
  owner_user_id: string;
};

export type PgWorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: ManageRole;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: Date | string;
  accepted_at: Date | string | null;
  revoked_reason: WorkspaceInviteRevocationReason | null;
  revoked_at: Date | string | null;
};

export type PgWorkspaceMemberRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: TeamWorkspaceRole;
  joined_at: Date | string;
};

export type PgWorkspaceSavedViewRow = {
  id: string;
  name: string;
  filters: string | Record<string, unknown>;
  query_string: string;
  case_count_snapshot: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  source_saved_view_id: string;
  shared_by_user_id: string;
  shared_by_name: string | null;
  shared_at: Date | string;
};

export type PgWorkspaceCaseRow = {
  id: string;
  slug: string;
  company_name: string;
  industry_key: string;
  country_code: string | null;
  closed_year: number | null;
  summary: string;
  business_model_key: string | null;
  founded_year: number | null;
  total_funding_usd: string | number | null;
  primary_failure_reason_key: string | null;
  shared_by_user_id: string;
  shared_by_name: string | null;
  shared_at: Date | string;
};

export type WorkspaceBillingOwner = Pick<
  UserProfile,
  | 'id'
  | 'email'
  | 'displayName'
  | 'subscription'
  | 'billingStatus'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
>;

export type WorkspaceAccessContext = {
  workspaceId: string;
  workspaceName: string;
  role: TeamWorkspaceRole;
  owner: WorkspaceBillingOwner;
  seatsUsed: number;
  pendingInviteCount: number;
};

export type WorkspaceCompensationSummary = {
  revokedInviteCount: number;
};

export type WorkspaceBillingSnapshot = Pick<
  TeamWorkspaceBilling,
  'seatLimit' | 'billingStatus' | 'cancelAtPeriodEnd' | 'reservedSeats' | 'fallbackMemberCount'
>;

export type WorkspaceBillingEventDescriptor = {
  type: TeamWorkspaceBillingEventType;
  severity: TeamWorkspaceBillingEventSeverity;
  title: string;
  detail: string;
  count: number | null;
};

export type WorkspaceRecoveryOutreachDescriptor = {
  audience: TeamWorkspaceRecoveryOutreachAudience;
  channel: TeamWorkspaceRecoveryOutreachChannel;
  title: string;
  detail: string;
  actionCode: TeamWorkspaceBillingRecoveryActionCode | null;
};

export type WorkspaceMemberRecoveryNotificationDescriptor = {
  title: string;
  detail: string;
};

export type AdminBillingEvent = TeamWorkspaceAdminMetrics['recentBillingEvents'][number];
export type AdminRecoveryAction = TeamWorkspaceAdminMetrics['recoveryActions'][number];
export type AdminActionableWorkspace = TeamWorkspaceAdminMetrics['actionableWorkspaces'][number];
export type AdminRecoveryOutreach = TeamWorkspaceAdminMetrics['recoveryOutreach']['recent'][number];
export type AdminRecoveryPlaybookRun =
  TeamWorkspaceAdminMetrics['recoveryPlaybook']['recent'][number];
export type WorkspaceReconcileResult = {
  revokedInviteCount: number;
  restoredInviteCount: number;
};

export type PgWorkspaceBillingEventRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  event_type: TeamWorkspaceBillingEventType;
  severity: TeamWorkspaceBillingEventSeverity;
  title: string;
  detail: string;
  event_count: string | number | null;
  created_at: Date | string;
};

export type PgWorkspaceRecoveryOutreachRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  audience: TeamWorkspaceRecoveryOutreachAudience;
  channel: TeamWorkspaceRecoveryOutreachChannel;
  status: TeamWorkspaceRecoveryOutreachStatus;
  title: string;
  detail: string;
  action_code: TeamWorkspaceBillingRecoveryActionCode | null;
  attempt_count: number;
  created_at: Date | string;
  last_attempt_at: Date | string;
  next_attempt_at: Date | string | null;
  email_attempt_count: number;
  last_email_attempt_at: Date | string | null;
  next_email_attempt_at: Date | string | null;
  last_email_delivered_at: Date | string | null;
  last_email_message_id: string | null;
  last_email_error: string | null;
  export_count: number;
  last_exported_at: Date | string | null;
  crm_sync_count: number;
  last_crm_sync_attempt_at: Date | string | null;
  next_crm_sync_attempt_at: Date | string | null;
  last_crm_synced_at: Date | string | null;
  crm_external_record_id: string | null;
  last_crm_sync_status_code: number | null;
  last_crm_sync_error: string | null;
  webhook_attempt_count: number;
  last_webhook_attempt_at: Date | string | null;
  next_webhook_attempt_at: Date | string | null;
  webhook_exhausted_at: Date | string | null;
  webhook_delivery_count: number;
  last_webhook_delivered_at: Date | string | null;
  last_webhook_status_code: number | null;
  last_webhook_error: string | null;
  slack_alert_count: number;
  last_slack_alert_attempt_at: Date | string | null;
  last_slack_alerted_at: Date | string | null;
  last_slack_alert_status_code: number | null;
  last_slack_alert_error: string | null;
  handoff_channel: TeamWorkspaceRecoveryOutreachHandoffChannel | null;
  handoff_note: string | null;
  handoff_at: Date | string | null;
  resolved_at: Date | string | null;
};

export type PgWorkspaceMemberRecoveryNotificationRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  status: 'pending' | 'resolved';
  title: string;
  detail: string;
  email_attempt_count: number;
  created_at: Date | string;
  last_email_attempt_at: Date | string | null;
  next_email_attempt_at: Date | string | null;
  last_email_delivered_at: Date | string | null;
  last_email_message_id: string | null;
  last_email_error: string | null;
  resolved_at: Date | string | null;
};

export type PgWorkspaceRecoveryPlaybookRunRow = {
  id: string;
  trigger_type: string;
  retry_interval_hours: number;
  force_run: boolean;
  requested_steps: string[] | null;
  rerun_of_run_id: string | null;
  ok: boolean;
  summary: string;
  steps: unknown;
  created_at: Date | string;
};

export type PendingMemberRecoveryNotificationTarget = {
  notificationId: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
  displayName: string | null;
  ownerDisplayName: string | null;
  ownerEmail: string;
  subscription: SubscriptionTier;
  billingStatus: BillingStatus;
  title: string;
  detail: string;
  emailAttemptCount: number;
  lastEmailAttemptAt: string | null;
  nextEmailAttemptAt: string | null;
  lastEmailDeliveredAt: string | null;
  lastEmailMessageId: string | null;
  lastEmailError: string | null;
};

export type PgWorkspaceBillingStateRow = {
  seat_limit: number;
  billing_status: BillingStatus;
  cancel_at_period_end: boolean;
  reserved_seats: number;
  fallback_member_count: number;
};

export type PgWorkspaceAdminRow = {
  workspace_id: string;
  workspace_name: string;
  owner_user_id: string;
  owner_email: string;
  owner_display_name: string | null;
  subscription: SubscriptionTier;
  billing_status: BillingStatus;
  cancel_at_period_end: boolean;
  member_count: string;
  pending_invite_count: string;
  revoked_invite_count: string;
};

export const COMPENSATION_REASONS: ReadonlySet<WorkspaceInviteRevocationReason> = new Set([
  'billing_inactive',
  'seat_limit_reduced',
]);
export const DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS = 24;
export const ALL_RECOVERY_PLAYBOOK_STEP_NAMES: readonly TeamWorkspaceRecoveryPlaybookStepName[] = [
  'outreach',
  'ownerEmail',
  'memberEmail',
  'crmSync',
  'webhook',
  'slack',
];

export interface TeamWorkspacesRepository {
  resolveEffectiveUserProfile(user: UserProfile): Promise<UserProfile>;
  getContextForUser(user: UserProfile): Promise<TeamWorkspaceContextResponse>;
  getAdminMetrics(): Promise<TeamWorkspaceAdminMetrics>;
  listRecentRecoveryPlaybookRuns(limit: number): Promise<TeamWorkspaceRecoveryPlaybookRun[]>;
  getRecoveryPlaybookRunById(runId: string): Promise<TeamWorkspaceRecoveryPlaybookRun | null>;
  recordRecoveryPlaybookRun(input: {
    triggerType: string;
    retryIntervalHours: number;
    force: boolean;
    requestedSteps: TeamWorkspaceRecoveryPlaybookStepName[];
    rerunOfRunId?: string | null;
    ok: boolean;
    summary: string;
    steps: TeamWorkspaceRecoveryPlaybookSteps;
    createdAt?: string;
  }): Promise<TeamWorkspaceRecoveryPlaybookRun>;
  handoffAdminRecoveryOutreach(input: {
    workspaceId: string;
    channel: TeamWorkspaceRecoveryOutreachHandoffChannel;
    snoozeHours: number;
    note?: string | null;
  }): Promise<'workspace_not_found' | 'outreach_not_found' | { ok: true }>;
  exportHandedOffAdminRecoveryOutreach(): Promise<{ exportedCount: number }>;
  listPendingMemberRecoveryNotifications(): Promise<PendingMemberRecoveryNotificationTarget[]>;
  recordPendingOwnerRecoveryOutreachEmailDelivery(input: {
    workspaceIds: string[];
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    messageIdByWorkspaceId?: Record<string, string | null | undefined>;
  }): Promise<{ deliveredCount: number }>;
  recordPendingMemberRecoveryNotificationEmailDelivery(input: {
    notificationIds: string[];
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    messageIdByNotificationId?: Record<string, string | null | undefined>;
  }): Promise<{ deliveredCount: number }>;
  recordHandedOffAdminRecoveryOutreachCrmSync(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    syncedAt?: string;
    retryIntervalHours?: number;
    externalRecordIdByWorkspaceId?: Record<string, string | null | undefined>;
  }): Promise<{ syncedCount: number }>;
  recordDeadLetteredAdminRecoveryOutreachSlackAlert(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    alertedAt?: string;
  }): Promise<{ alertedCount: number }>;
  recordHandedOffAdminRecoveryOutreachWebhookDelivery(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    maxAttempts?: number;
  }): Promise<{ deliveredCount: number }>;
  runRecoveryOutreachAutomation(options?: { retryIntervalHours?: number }): Promise<{
    workspaceCount: number;
    ownerOutreachCreated: number;
    adminOutreachCreated: number;
    retriedOutreachCount: number;
    resolvedOutreachCount: number;
  }>;
  reconcileAllBilling(): Promise<{
    workspaceCount: number;
    revokedInviteCount: number;
    restoredInviteCount: number;
  }>;
  reconcileBillingForUser(
    userId: string,
  ): Promise<{ workspaceIds: string[]; revokedInviteCount: number }>;
  createWorkspace(
    user: UserProfile,
    name: string,
  ): Promise<TeamWorkspace | 'already_in_workspace' | 'entitlement_required'>;
  inviteMember(
    actorUserId: string,
    email: string,
    role: ManageRole,
  ): Promise<
    | TeamWorkspace
    | 'workspace_not_found'
    | 'forbidden'
    | 'user_already_in_workspace'
    | 'seat_limit_reached'
    | 'workspace_plan_inactive'
  >;
  acceptInvite(
    user: UserProfile,
    inviteId: string,
  ): Promise<
    TeamWorkspace | 'invite_not_found' | 'already_in_workspace' | 'workspace_plan_inactive'
  >;
  shareSavedView(
    actorUserId: string,
    savedViewId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'saved_view_not_found'
  >;
  shareCase(
    actorUserId: string,
    caseId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'case_not_found'
  >;
}
