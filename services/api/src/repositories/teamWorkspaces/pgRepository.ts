import { DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS } from './contract.js';
import type {
  AdminActionableWorkspace,
  AdminBillingEvent,
  AdminRecoveryAction,
  AdminRecoveryOutreach,
  ManageRole,
  PendingMemberRecoveryNotificationTarget,
  PgWorkspaceAdminRow,
  PgWorkspaceBillingEventRow,
  PgWorkspaceBillingStateRow,
  PgWorkspaceCaseRow,
  PgWorkspaceInviteRow,
  PgWorkspaceMemberRecoveryNotificationRow,
  PgWorkspaceMemberRow,
  PgWorkspaceMembershipRow,
  PgWorkspaceRecoveryOutreachRow,
  PgWorkspaceRecoveryPlaybookRunRow,
  PgWorkspaceSavedViewRow,
  TeamWorkspacesRepository,
  WorkspaceBillingEventDescriptor,
  WorkspaceBillingSnapshot,
  WorkspaceCompensationSummary,
  WorkspaceInviteRevocationReason,
  WorkspaceMemberRecoveryNotificationDescriptor,
  WorkspaceMembershipRecord,
  WorkspaceReconcileResult,
  WorkspaceRecoveryOutreachDescriptor,
} from './contract.js';
import {
  accumulateRecoveryActions,
  applyWorkspaceAccess,
  buildBillingEventDescriptors,
  buildBillingWarnings,
  buildMemberRecoveryNotificationDescriptor,
  buildRecoveryActions,
  buildRecoveryOutreachDescriptors,
  buildWorkspaceAccess,
  buildWorkspaceBilling,
  hasOwnerRecoveryEngagement,
  nextRecoveryOutreachAttemptAt,
  rowToBillingEvent,
  rowToInvite,
  rowToMember,
  rowToMemberRecoveryNotification,
  rowToRecoveryOutreach,
  rowToRecoveryPlaybookRun,
  rowToSharedCase,
  rowToSharedSavedView,
  toAdminActionableWorkspace,
  toIso,
} from './helpers.js';
import type { Pool } from 'pg';
import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import type { UserProfile, WorkspaceAccess } from '@sg/shared/schemas/auth';
import {
  resolveTeamWorkspaceSeatLimit,
  type BillingStatus,
  type SubscriptionTier,
} from '@sg/shared/billing';
import type {
  TeamWorkspaceBillingRecoveryActionCode,
  TeamWorkspaceRecoveryOutreachAudience,
  TeamWorkspaceRecoveryOutreachHandoffChannel,
  TeamWorkspaceRecoveryPlaybookRun,
  TeamWorkspaceRecoveryPlaybookStepName,
  TeamWorkspaceRecoveryPlaybookSteps,
  TeamWorkspaceRecoveryOutreachStatus,
  TeamWorkspace,
  TeamWorkspaceContextResponse,
  TeamWorkspaceInvite,
  TeamWorkspaceMemberRecoveryNotification,
} from '@sg/shared/schemas/teamWorkspace';
import type { BillingFunnelRepository } from '../billingFunnelRepository.js';
import { config } from '../../config/index.js';

export class PgTeamWorkspacesRepository implements TeamWorkspacesRepository {
  constructor(
    private readonly pool: Pool,
    private readonly billingFunnelRepo: BillingFunnelRepository,
  ) {}

  async resolveEffectiveUserProfile(user: UserProfile): Promise<UserProfile> {
    return applyWorkspaceAccess(user, await this.buildWorkspaceAccessForUser(user));
  }

  async getContextForUser(user: UserProfile): Promise<TeamWorkspaceContextResponse> {
    await this.reconcileBillingForUser(user.id);
    await this.reconcilePendingInvitesForEmail(user.email);
    const workspace = await this.buildWorkspaceForUser(user.id);
    return {
      canCreateWorkspace: user.entitlements.canUseTeamWorkspace && workspace === null,
      hasWorkspace: workspace !== null,
      workspace,
      pendingInvites: workspace ? [] : await this.getPendingInvitesForEmail(user.email),
    };
  }

  async reconcileBillingForUser(
    userId: string,
  ): Promise<{ workspaceIds: string[]; revokedInviteCount: number }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM team_workspaces
       WHERE owner_user_id = $1`,
      [userId],
    );
    let revokedInviteCount = 0;
    for (const row of rows) {
      const result = await this.reconcileWorkspaceBillingState(row.id);
      revokedInviteCount += result.revokedInviteCount;
    }
    return {
      workspaceIds: rows.map((row) => row.id),
      revokedInviteCount,
    };
  }

  async reconcileAllBilling(): Promise<{
    workspaceCount: number;
    revokedInviteCount: number;
    restoredInviteCount: number;
  }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM team_workspaces`,
    );
    let revokedInviteCount = 0;
    let restoredInviteCount = 0;
    for (const row of rows) {
      const result = await this.reconcileWorkspaceBillingState(row.id);
      revokedInviteCount += result.revokedInviteCount;
      restoredInviteCount += result.restoredInviteCount;
    }
    return {
      workspaceCount: rows.length,
      revokedInviteCount,
      restoredInviteCount,
    };
  }

  async runRecoveryOutreachAutomation(options?: { retryIntervalHours?: number }): Promise<{
    workspaceCount: number;
    ownerOutreachCreated: number;
    adminOutreachCreated: number;
    retriedOutreachCount: number;
    resolvedOutreachCount: number;
  }> {
    const retryIntervalHours = Math.max(
      0,
      options?.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    await this.reconcileAllWorkspaces();
    const { rows } = await this.pool.query<PgWorkspaceAdminRow>(
      `WITH member_counts AS (
         SELECT workspace_id, COUNT(*)::int AS member_count
         FROM team_workspace_members
         GROUP BY workspace_id
       ),
       invite_counts AS (
         SELECT workspace_id, COUNT(*)::int AS pending_invite_count
         FROM team_workspace_invites
         WHERE status = 'pending'
         GROUP BY workspace_id
       ),
       compensation_counts AS (
         SELECT workspace_id, COUNT(*)::int AS revoked_invite_count
         FROM team_workspace_invites
         WHERE status = 'revoked'
           AND revoked_reason IN ('billing_inactive', 'seat_limit_reduced')
         GROUP BY workspace_id
       )
       SELECT
         w.id AS workspace_id,
         w.name AS workspace_name,
         owner.id AS owner_user_id,
         owner.email AS owner_email,
         owner.display_name AS owner_display_name,
         owner.subscription,
         owner.billing_status,
         owner.cancel_at_period_end,
         COALESCE(m.member_count, 0)::text AS member_count,
         COALESCE(i.pending_invite_count, 0)::text AS pending_invite_count,
         COALESCE(c.revoked_invite_count, 0)::text AS revoked_invite_count
       FROM team_workspaces w
       JOIN users owner ON owner.id = w.owner_user_id
       LEFT JOIN member_counts m ON m.workspace_id = w.id
       LEFT JOIN invite_counts i ON i.workspace_id = w.id
       LEFT JOIN compensation_counts c ON c.workspace_id = w.id`,
    );
    const latestCommercialTouches = await this.billingFunnelRepo.getLatestEventsByUserIds(
      rows.map((row) => row.owner_user_id),
    );
    const latestCommercialTouchByOwnerId = new Map(
      latestCommercialTouches.map((touch) => [touch.userId, touch]),
    );
    let ownerOutreachCreated = 0;
    let adminOutreachCreated = 0;
    let retriedOutreachCount = 0;
    let resolvedOutreachCount = 0;

    for (const row of rows) {
      const recentBillingEvents = (await this.getRecentBillingEvents(row.workspace_id)).map(
        ({ workspaceId: _workspaceId, workspaceName: _workspaceName, ...event }) => event,
      );
      const workspaceSeatsUsed = Number(row.member_count);
      const workspacePendingInvites = Number(row.pending_invite_count);
      const billing = buildWorkspaceBilling({
        owner: {
          id: row.owner_user_id,
          email: row.owner_email,
          displayName: row.owner_display_name,
          subscription: row.subscription,
          billingStatus: row.billing_status,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: row.cancel_at_period_end,
        },
        seatsUsed: workspaceSeatsUsed,
        pendingInviteCount: workspacePendingInvites,
        compensation: {
          revokedInviteCount: Number(row.revoked_invite_count),
        },
        viewerRole: 'owner',
        recentBillingEvents,
      });
      const descriptors = buildRecoveryOutreachDescriptors({
        workspaceName: row.workspace_name,
        billing,
      });
      const memberDescriptor = buildMemberRecoveryNotificationDescriptor({
        workspaceName: row.workspace_name,
        ownerDisplayName: row.owner_display_name,
        ownerEmail: row.owner_email,
        billing,
      });
      const fallbackMembersRes =
        memberDescriptor == null
          ? { rows: [] as Array<{ user_id: string; email: string; display_name: string | null }> }
          : await this.pool.query<{
              user_id: string;
              email: string;
              display_name: string | null;
            }>(
              `SELECT u.id AS user_id, u.email, u.display_name
               FROM team_workspace_members m
               JOIN users u ON u.id = m.user_id
               WHERE m.workspace_id = $1
                 AND m.role <> 'owner'`,
              [row.workspace_id],
            );
      const ownerDescriptor = descriptors.find((item) => item.audience === 'owner') ?? null;
      const adminDescriptor = descriptors.find((item) => item.audience === 'admin') ?? null;
      const ownerTouch = latestCommercialTouchByOwnerId.get(row.owner_user_id);
      if (hasOwnerRecoveryEngagement(ownerTouch)) {
        resolvedOutreachCount += await this.resolvePendingRecoveryOutreach(
          row.workspace_id,
          'owner',
        );
      } else {
        ownerOutreachCreated += await this.ensurePendingRecoveryOutreach(
          row.workspace_id,
          ownerDescriptor,
          retryIntervalHours,
        );
        retriedOutreachCount += await this.retryPendingRecoveryOutreach(
          row.workspace_id,
          ownerDescriptor,
          retryIntervalHours,
        );
      }
      adminOutreachCreated += await this.ensurePendingRecoveryOutreach(
        row.workspace_id,
        adminDescriptor,
        retryIntervalHours,
      );
      retriedOutreachCount += await this.retryPendingRecoveryOutreach(
        row.workspace_id,
        adminDescriptor,
        retryIntervalHours,
      );
      if (!ownerDescriptor) {
        resolvedOutreachCount += await this.resolvePendingRecoveryOutreach(
          row.workspace_id,
          'owner',
        );
      }
      if (!adminDescriptor) {
        resolvedOutreachCount += await this.resolvePendingRecoveryOutreach(
          row.workspace_id,
          'admin',
        );
      }
      await this.syncPendingMemberRecoveryNotifications(
        row.workspace_id,
        row.workspace_name,
        fallbackMembersRes.rows.map((member) => ({
          userId: member.user_id,
          email: member.email,
          displayName: member.display_name,
        })),
        memberDescriptor,
      );
    }

    return {
      workspaceCount: rows.length,
      ownerOutreachCreated,
      adminOutreachCreated,
      retriedOutreachCount,
      resolvedOutreachCount,
    };
  }

  async getAdminMetrics(): Promise<TeamWorkspaceAdminMetrics> {
    await this.reconcileAllWorkspaces();
    const { rows } = await this.pool.query<PgWorkspaceAdminRow>(
      `WITH member_counts AS (
         SELECT workspace_id, COUNT(*)::int AS member_count
         FROM team_workspace_members
         GROUP BY workspace_id
       ),
       invite_counts AS (
         SELECT workspace_id, COUNT(*)::int AS pending_invite_count
         FROM team_workspace_invites
         WHERE status = 'pending'
         GROUP BY workspace_id
       ),
       compensation_counts AS (
         SELECT workspace_id, COUNT(*)::int AS revoked_invite_count
         FROM team_workspace_invites
         WHERE status = 'revoked'
           AND revoked_reason IN ('billing_inactive', 'seat_limit_reduced')
         GROUP BY workspace_id
       )
       SELECT
         w.id AS workspace_id,
         w.name AS workspace_name,
         owner.id AS owner_user_id,
         owner.email AS owner_email,
         owner.display_name AS owner_display_name,
         owner.subscription,
         owner.billing_status,
         owner.cancel_at_period_end,
         COALESCE(m.member_count, 0)::text AS member_count,
         COALESCE(i.pending_invite_count, 0)::text AS pending_invite_count,
         COALESCE(c.revoked_invite_count, 0)::text AS revoked_invite_count
       FROM team_workspaces w
       JOIN users owner ON owner.id = w.owner_user_id
       LEFT JOIN member_counts m ON m.workspace_id = w.id
       LEFT JOIN invite_counts i ON i.workspace_id = w.id
       LEFT JOIN compensation_counts c ON c.workspace_id = w.id`,
    );
    const latestBillingEventsRes =
      rows.length === 0
        ? { rows: [] as PgWorkspaceBillingEventRow[] }
        : await this.pool.query<PgWorkspaceBillingEventRow>(
            `SELECT DISTINCT ON (e.workspace_id)
               e.id,
               e.workspace_id,
               w.name AS workspace_name,
               e.event_type,
               e.severity,
               e.title,
               e.detail,
               e.event_count,
               e.created_at
             FROM team_workspace_billing_events e
             JOIN team_workspaces w ON w.id = e.workspace_id
             WHERE e.workspace_id = ANY($1::uuid[])
             ORDER BY e.workspace_id, e.created_at DESC`,
            [rows.map((row) => row.workspace_id)],
          );
    const latestBillingEventsByWorkspaceId = new Map(
      latestBillingEventsRes.rows.map((row) => [row.workspace_id, rowToBillingEvent(row)]),
    );
    const latestRecoveryOutreachByWorkspaceId = await this.getLatestRecoveryOutreachByWorkspaceIds(
      rows.map((row) => row.workspace_id),
    );
    const recoveryOutreachRecent = await this.getRecentRecoveryOutreach();
    const memberRecoveryNotificationCountsRes = await this.pool.query<{
      email_bucket:
        | 'pending_member_email'
        | 'retrying_member_email'
        | 'delivered_member_email'
        | 'failed_member_email'
        | 'member_email_na';
      count: string;
    }>(
      `SELECT
         CASE
           WHEN status = 'pending'
             AND last_email_delivered_at IS NOT NULL THEN 'delivered_member_email'
           WHEN status = 'pending'
             AND last_email_error IS NOT NULL
             AND next_email_attempt_at IS NOT NULL THEN 'retrying_member_email'
           WHEN status = 'pending'
             AND last_email_error IS NOT NULL THEN 'failed_member_email'
           WHEN status = 'pending' THEN 'pending_member_email'
           ELSE 'member_email_na'
         END AS email_bucket,
         COUNT(*)::text AS count
       FROM team_workspace_member_recovery_notifications
       GROUP BY email_bucket`,
    );
    const memberRecoverySummaryRes =
      rows.length === 0
        ? {
            rows: [] as Array<{
              workspace_id: string;
              pending_count: string;
              retrying_count: string;
              delivered_count: string;
              failed_count: string;
              next_email_attempt_at: Date | string | null;
              last_email_delivered_at: Date | string | null;
              last_email_error: string | null;
            }>,
          }
        : await this.pool.query<{
            workspace_id: string;
            pending_count: string;
            retrying_count: string;
            delivered_count: string;
            failed_count: string;
            next_email_attempt_at: Date | string | null;
            last_email_delivered_at: Date | string | null;
            last_email_error: string | null;
          }>(
            `SELECT
               workspace_id,
               COUNT(*) FILTER (
                 WHERE status = 'pending'
                   AND last_email_delivered_at IS NULL
                   AND last_email_error IS NULL
               )::text AS pending_count,
               COUNT(*) FILTER (
                 WHERE status = 'pending'
                   AND last_email_error IS NOT NULL
                   AND next_email_attempt_at IS NOT NULL
               )::text AS retrying_count,
               COUNT(*) FILTER (
                 WHERE status = 'pending'
                   AND last_email_delivered_at IS NOT NULL
               )::text AS delivered_count,
               COUNT(*) FILTER (
                 WHERE status = 'pending'
                   AND last_email_error IS NOT NULL
                   AND next_email_attempt_at IS NULL
               )::text AS failed_count,
               MIN(next_email_attempt_at) FILTER (
                 WHERE status = 'pending'
                   AND next_email_attempt_at IS NOT NULL
               ) AS next_email_attempt_at,
               MAX(last_email_delivered_at) FILTER (
                 WHERE last_email_delivered_at IS NOT NULL
               ) AS last_email_delivered_at,
               (
                 ARRAY_AGG(last_email_error ORDER BY COALESCE(last_email_attempt_at, created_at) DESC)
                 FILTER (WHERE last_email_error IS NOT NULL)
               )[1] AS last_email_error
             FROM team_workspace_member_recovery_notifications
             WHERE workspace_id = ANY($1::uuid[])
             GROUP BY workspace_id`,
            [rows.map((row) => row.workspace_id)],
          );
    const memberRecoverySummaryByWorkspaceId = new Map(
      memberRecoverySummaryRes.rows.map((row) => [
        row.workspace_id,
        {
          pendingCount: Number(row.pending_count),
          retryingCount: Number(row.retrying_count),
          deliveredCount: Number(row.delivered_count),
          failedCount: Number(row.failed_count),
          nextEmailAttemptAt: row.next_email_attempt_at ? toIso(row.next_email_attempt_at) : null,
          lastEmailDeliveredAt: row.last_email_delivered_at
            ? toIso(row.last_email_delivered_at)
            : null,
          lastEmailError: row.last_email_error,
        },
      ]),
    );
    const recoveryOutreachCountsRes = await this.pool.query<{
      audience: TeamWorkspaceRecoveryOutreachAudience;
      status: TeamWorkspaceRecoveryOutreachStatus;
      attempt_bucket: 'single' | 'multi';
      email_bucket:
        | 'pending_email'
        | 'retrying_email'
        | 'delivered_email'
        | 'failed_email'
        | 'email_na';
      export_bucket: 'pending_export' | 'exported_or_na';
      crm_bucket:
        | 'pending_crm_sync'
        | 'retrying_crm_sync'
        | 'synced_crm'
        | 'failed_crm_sync'
        | 'crm_na';
      webhook_bucket:
        | 'pending_webhook'
        | 'retrying_webhook'
        | 'dead_lettered_webhook'
        | 'delivered_webhook'
        | 'failed_webhook'
        | 'webhook_na';
      slack_bucket: 'pending_slack_alert' | 'alerted_slack' | 'failed_slack_alert' | 'slack_na';
      count: string;
    }>(
      `SELECT
         audience,
         status,
         CASE WHEN attempt_count > 1 THEN 'multi' ELSE 'single' END AS attempt_bucket,
         CASE
           WHEN audience = 'owner'
             AND status = 'pending'
             AND last_email_delivered_at IS NOT NULL THEN 'delivered_email'
           WHEN audience = 'owner'
             AND status = 'pending'
             AND last_email_error IS NOT NULL
             AND next_email_attempt_at IS NOT NULL THEN 'retrying_email'
           WHEN audience = 'owner'
             AND status = 'pending'
             AND last_email_error IS NOT NULL THEN 'failed_email'
           WHEN audience = 'owner'
             AND status = 'pending' THEN 'pending_email'
           ELSE 'email_na'
         END AS email_bucket,
         CASE
           WHEN status = 'handed_off' AND export_count = 0 THEN 'pending_export'
           ELSE 'exported_or_na'
         END AS export_bucket,
         CASE
           WHEN status = 'handed_off'
             AND handoff_channel = 'crm'
             AND last_crm_synced_at IS NOT NULL THEN 'synced_crm'
           WHEN status = 'handed_off'
             AND handoff_channel = 'crm'
             AND last_crm_sync_error IS NOT NULL
             AND next_crm_sync_attempt_at IS NOT NULL THEN 'retrying_crm_sync'
           WHEN status = 'handed_off'
             AND handoff_channel = 'crm'
             AND last_crm_sync_error IS NOT NULL THEN 'failed_crm_sync'
           WHEN status = 'handed_off'
             AND handoff_channel = 'crm' THEN 'pending_crm_sync'
           ELSE 'crm_na'
         END AS crm_bucket,
         CASE
           WHEN status = 'handed_off' AND webhook_delivery_count > 0 THEN 'delivered_webhook'
           WHEN status = 'handed_off' AND webhook_exhausted_at IS NOT NULL THEN 'dead_lettered_webhook'
           WHEN status = 'handed_off'
             AND last_webhook_error IS NOT NULL
             AND next_webhook_attempt_at IS NOT NULL THEN 'retrying_webhook'
           WHEN status = 'handed_off' AND last_webhook_error IS NOT NULL THEN 'failed_webhook'
           WHEN status = 'handed_off' THEN 'pending_webhook'
           ELSE 'webhook_na'
         END AS webhook_bucket,
         CASE
           WHEN status = 'handed_off'
             AND webhook_exhausted_at IS NOT NULL
             AND last_slack_alerted_at IS NOT NULL THEN 'alerted_slack'
           WHEN status = 'handed_off'
             AND webhook_exhausted_at IS NOT NULL
             AND last_slack_alert_error IS NOT NULL THEN 'failed_slack_alert'
           WHEN status = 'handed_off'
             AND webhook_exhausted_at IS NOT NULL THEN 'pending_slack_alert'
           ELSE 'slack_na'
         END AS slack_bucket,
         COUNT(*)::text AS count
       FROM team_workspace_recovery_outreach_events
       GROUP BY
         audience,
         status,
         attempt_bucket,
         email_bucket,
         export_bucket,
         crm_bucket,
         webhook_bucket,
         slack_bucket`,
    );
    let pendingOwnerOutreach = 0;
    let pendingAdminOutreach = 0;
    let pendingEmail = 0;
    let retryingEmail = 0;
    let deliveredEmail = 0;
    let failedEmail = 0;
    let pendingMemberEmail = 0;
    let retryingMemberEmail = 0;
    let deliveredMemberEmail = 0;
    let failedMemberEmail = 0;
    let multiTouchPending = 0;
    let pendingExport = 0;
    let pendingCrmSync = 0;
    let retryingCrmSync = 0;
    let syncedCrm = 0;
    let failedCrmSync = 0;
    let pendingWebhook = 0;
    let retryingWebhook = 0;
    let deadLetteredWebhook = 0;
    let pendingSlackAlert = 0;
    let alertedSlack = 0;
    let failedSlackAlert = 0;
    let deliveredWebhook = 0;
    let failedWebhook = 0;
    let handedOffOutreach = 0;
    let resolvedOutreach = 0;
    for (const row of recoveryOutreachCountsRes.rows) {
      const count = Number(row.count);
      if (row.status === 'pending') {
        if (row.attempt_bucket === 'multi') multiTouchPending += count;
        if (row.audience === 'owner') pendingOwnerOutreach += count;
        else pendingAdminOutreach += count;
        if (row.email_bucket === 'pending_email') pendingEmail += count;
        else if (row.email_bucket === 'retrying_email') retryingEmail += count;
        else if (row.email_bucket === 'delivered_email') deliveredEmail += count;
        else if (row.email_bucket === 'failed_email') failedEmail += count;
      } else if (row.status === 'handed_off') {
        if (row.export_bucket === 'pending_export') pendingExport += count;
        if (row.crm_bucket === 'pending_crm_sync') pendingCrmSync += count;
        else if (row.crm_bucket === 'retrying_crm_sync') retryingCrmSync += count;
        else if (row.crm_bucket === 'synced_crm') syncedCrm += count;
        else if (row.crm_bucket === 'failed_crm_sync') failedCrmSync += count;
        if (row.webhook_bucket === 'pending_webhook') pendingWebhook += count;
        else if (row.webhook_bucket === 'retrying_webhook') retryingWebhook += count;
        else if (row.webhook_bucket === 'dead_lettered_webhook') deadLetteredWebhook += count;
        else if (row.webhook_bucket === 'delivered_webhook') deliveredWebhook += count;
        else if (row.webhook_bucket === 'failed_webhook') failedWebhook += count;
        if (row.slack_bucket === 'pending_slack_alert') pendingSlackAlert += count;
        else if (row.slack_bucket === 'alerted_slack') alertedSlack += count;
        else if (row.slack_bucket === 'failed_slack_alert') failedSlackAlert += count;
        handedOffOutreach += count;
      } else {
        resolvedOutreach += count;
      }
    }
    for (const row of memberRecoveryNotificationCountsRes.rows) {
      const count = Number(row.count);
      if (row.email_bucket === 'pending_member_email') pendingMemberEmail += count;
      else if (row.email_bucket === 'retrying_member_email') retryingMemberEmail += count;
      else if (row.email_bucket === 'delivered_member_email') deliveredMemberEmail += count;
      else if (row.email_bucket === 'failed_member_email') failedMemberEmail += count;
    }
    const recoveryPlaybookSummaryRes = await this.pool.query<{
      total_runs: string;
      successful_runs: string;
      failed_runs: string;
      scheduled_runs: string;
      manual_runs: string;
      last_run_at: Date | string | null;
      last_run_ok: boolean | null;
    }>(
      `SELECT
         COUNT(*)::text AS total_runs,
         COUNT(*) FILTER (WHERE ok = TRUE)::text AS successful_runs,
         COUNT(*) FILTER (WHERE ok = FALSE)::text AS failed_runs,
         COUNT(*) FILTER (WHERE trigger_type = 'scheduled')::text AS scheduled_runs,
         COUNT(*) FILTER (WHERE trigger_type <> 'scheduled')::text AS manual_runs,
         MAX(created_at) AS last_run_at,
         (
           ARRAY_AGG(ok ORDER BY created_at DESC)
         )[1] AS last_run_ok
       FROM team_workspace_recovery_playbook_runs`,
    );
    const recoveryPlaybookRunsRes = await this.pool.query<PgWorkspaceRecoveryPlaybookRunRow>(
      `SELECT
         id,
         trigger_type,
         retry_interval_hours,
         force_run,
         requested_steps,
         rerun_of_run_id,
         ok,
         summary,
         steps,
         created_at
       FROM team_workspace_recovery_playbook_runs
       ORDER BY created_at DESC
       LIMIT 8`,
    );
    const recoveryPlaybookSummary = recoveryPlaybookSummaryRes.rows[0];

    let activeWorkspaces = 0;
    let atRiskWorkspaces = 0;
    let workspacesRequiringAction = 0;
    let fullWorkspaces = 0;
    let totalSeatCapacity = 0;
    let seatsUsed = 0;
    let reservedSeats = 0;
    let pendingInvites = 0;
    let inheritedMembers = 0;
    let revokedInvites = 0;
    let fallbackMembers = 0;
    const actionableWorkspaces: AdminActionableWorkspace[] = [];
    const recoveryActionCounts = new Map<
      TeamWorkspaceBillingRecoveryActionCode,
      AdminRecoveryAction
    >();

    for (const row of rows) {
      const workspaceSeatsUsed = Number(row.member_count);
      const workspacePendingInvites = Number(row.pending_invite_count);
      const seatLimit = resolveTeamWorkspaceSeatLimit({
        subscription: row.subscription,
        billingStatus: row.billing_status,
      });
      const workspaceReservedSeats = workspaceSeatsUsed + workspacePendingInvites;
      const warningCodes = buildBillingWarnings({
        ownerBillingStatus: row.billing_status,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        seatLimit,
        reservedSeats: workspaceReservedSeats,
      });

      totalSeatCapacity += seatLimit;
      seatsUsed += workspaceSeatsUsed;
      reservedSeats += workspaceReservedSeats;
      pendingInvites += workspacePendingInvites;
      revokedInvites += Number(row.revoked_invite_count);
      const workspaceFallbackMembers = seatLimit === 0 ? Math.max(0, workspaceSeatsUsed - 1) : 0;
      fallbackMembers += workspaceFallbackMembers;
      const latestOutreach = latestRecoveryOutreachByWorkspaceId.get(row.workspace_id) ?? null;
      const memberRecoveryNotifications =
        memberRecoverySummaryByWorkspaceId.get(row.workspace_id) ?? null;
      const recommendedActions = buildRecoveryActions({
        subscription: row.subscription,
        billingStatus: row.billing_status,
        warningCodes,
        seatLimit,
        seatsRemaining: Math.max(0, seatLimit - workspaceReservedSeats),
        fallbackMemberCount: workspaceFallbackMembers,
        revokedInviteCount: Number(row.revoked_invite_count),
      });
      if (recommendedActions.length > 0) {
        workspacesRequiringAction += 1;
        accumulateRecoveryActions(recommendedActions, recoveryActionCounts);
        actionableWorkspaces.push(
          toAdminActionableWorkspace({
            workspaceId: row.workspace_id,
            workspaceName: row.workspace_name,
            owner: {
              id: row.owner_user_id,
              email: row.owner_email,
              displayName: row.owner_display_name,
              subscription: row.subscription,
              billingStatus: row.billing_status,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: row.cancel_at_period_end,
            },
            billing: {
              ownerUserId: row.owner_user_id,
              ownerDisplayName: row.owner_display_name,
              ownerEmail: row.owner_email,
              subscription: row.subscription,
              billingStatus: row.billing_status,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: row.cancel_at_period_end,
              seatLimit,
              seatsUsed: workspaceSeatsUsed,
              reservedSeats: workspaceReservedSeats,
              seatsRemaining: Math.max(0, seatLimit - workspaceReservedSeats),
              fallbackMemberCount: workspaceFallbackMembers,
              revokedInviteCount: Number(row.revoked_invite_count),
              canInviteMore: seatLimit > 0 && workspaceReservedSeats < seatLimit,
              warningCodes,
              recommendedActions,
              recoveryNotices: [],
            },
            pendingInvites: workspacePendingInvites,
            lastBillingEvent: latestBillingEventsByWorkspaceId.get(row.workspace_id) ?? null,
            lastOutreach: latestOutreach,
            memberRecoveryNotifications,
          }),
        );
      }
      if (seatLimit > 0) {
        activeWorkspaces += 1;
        inheritedMembers += Math.max(0, workspaceSeatsUsed - 1);
      }
      if (warningCodes.includes('seat_limit_reached')) fullWorkspaces += 1;
      if (
        warningCodes.some(
          (code) =>
            code === 'workspace_plan_inactive' ||
            code === 'past_due' ||
            code === 'cancel_at_period_end',
        )
      ) {
        atRiskWorkspaces += 1;
      }
    }

    return {
      totalWorkspaces: rows.length,
      activeWorkspaces,
      atRiskWorkspaces,
      workspacesRequiringAction,
      fullWorkspaces,
      totalSeatCapacity,
      seatsUsed,
      reservedSeats,
      pendingInvites,
      inheritedMembers,
      revokedInvites,
      fallbackMembers,
      seatUtilizationRate: totalSeatCapacity > 0 ? reservedSeats / totalSeatCapacity : null,
      recoveryActions: [...recoveryActionCounts.values()].sort((a, b) => b.count - a.count),
      recoveryStages: [],
      followUpStates: [],
      recoveryOutreach: {
        pendingOwner: pendingOwnerOutreach,
        pendingAdmin: pendingAdminOutreach,
        pendingEmail,
        retryingEmail,
        deliveredEmail,
        failedEmail,
        pendingMemberEmail,
        retryingMemberEmail,
        deliveredMemberEmail,
        failedMemberEmail,
        multiTouchPending,
        pendingExport,
        pendingCrmSync,
        retryingCrmSync,
        syncedCrm,
        failedCrmSync,
        pendingWebhook,
        retryingWebhook,
        deadLetteredWebhook,
        pendingSlackAlert,
        alertedSlack,
        failedSlackAlert,
        deliveredWebhook,
        failedWebhook,
        handedOff: handedOffOutreach,
        resolved: resolvedOutreach,
        recent: recoveryOutreachRecent,
      },
      recoveryPlaybook: {
        totalRuns: Number(recoveryPlaybookSummary?.total_runs ?? 0),
        successfulRuns: Number(recoveryPlaybookSummary?.successful_runs ?? 0),
        failedRuns: Number(recoveryPlaybookSummary?.failed_runs ?? 0),
        scheduledRuns: Number(recoveryPlaybookSummary?.scheduled_runs ?? 0),
        manualRuns: Number(recoveryPlaybookSummary?.manual_runs ?? 0),
        lastRunAt: recoveryPlaybookSummary?.last_run_at
          ? toIso(recoveryPlaybookSummary.last_run_at)
          : null,
        lastRunOk: recoveryPlaybookSummary?.last_run_ok ?? null,
        recent: recoveryPlaybookRunsRes.rows.map(rowToRecoveryPlaybookRun),
      },
      recentBillingEvents: await this.getRecentBillingEvents(),
      actionableWorkspaces: actionableWorkspaces.sort((a, b) => {
        const warningDelta = b.warningCodes.length - a.warningCodes.length;
        if (warningDelta !== 0) return warningDelta;
        return (
          new Date(b.lastBillingEventAt ?? 0).getTime() -
          new Date(a.lastBillingEventAt ?? 0).getTime()
        );
      }),
    };
  }

  async listRecentRecoveryPlaybookRuns(limit: number): Promise<TeamWorkspaceRecoveryPlaybookRun[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const { rows } = await this.pool.query<PgWorkspaceRecoveryPlaybookRunRow>(
      `SELECT
         id,
         trigger_type,
         retry_interval_hours,
         force_run,
         requested_steps,
         rerun_of_run_id,
         ok,
         summary,
         steps,
         created_at
       FROM team_workspace_recovery_playbook_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return rows.map(rowToRecoveryPlaybookRun);
  }

  async getRecoveryPlaybookRunById(
    runId: string,
  ): Promise<TeamWorkspaceRecoveryPlaybookRun | null> {
    const { rows } = await this.pool.query<PgWorkspaceRecoveryPlaybookRunRow>(
      `SELECT
         id,
         trigger_type,
         retry_interval_hours,
         force_run,
         requested_steps,
         rerun_of_run_id,
         ok,
         summary,
         steps,
         created_at
       FROM team_workspace_recovery_playbook_runs
       WHERE id = $1
       LIMIT 1`,
      [runId],
    );
    return rows[0] ? rowToRecoveryPlaybookRun(rows[0]) : null;
  }

  async recordRecoveryPlaybookRun(input: {
    triggerType: string;
    retryIntervalHours: number;
    force: boolean;
    requestedSteps: TeamWorkspaceRecoveryPlaybookStepName[];
    rerunOfRunId?: string | null;
    ok: boolean;
    summary: string;
    steps: TeamWorkspaceRecoveryPlaybookSteps;
    createdAt?: string;
  }): Promise<TeamWorkspaceRecoveryPlaybookRun> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const { rows } = await this.pool.query<PgWorkspaceRecoveryPlaybookRunRow>(
      `INSERT INTO team_workspace_recovery_playbook_runs (
         trigger_type,
         retry_interval_hours,
         force_run,
         requested_steps,
         rerun_of_run_id,
         ok,
         summary,
         steps,
         created_at
       )
       VALUES ($1, $2, $3, $4::text[], $5::uuid, $6, $7, $8::jsonb, $9::timestamptz)
       RETURNING
         id,
         trigger_type,
         retry_interval_hours,
         force_run,
         requested_steps,
         rerun_of_run_id,
         ok,
         summary,
         steps,
         created_at`,
      [
        input.triggerType,
        input.retryIntervalHours,
        input.force,
        input.requestedSteps,
        input.rerunOfRunId ?? null,
        input.ok,
        input.summary,
        JSON.stringify(input.steps),
        createdAt,
      ],
    );
    return rowToRecoveryPlaybookRun(rows[0]!);
  }

  async handoffAdminRecoveryOutreach(input: {
    workspaceId: string;
    channel: TeamWorkspaceRecoveryOutreachHandoffChannel;
    snoozeHours: number;
    note?: string | null;
  }): Promise<'workspace_not_found' | 'outreach_not_found' | { ok: true }> {
    const { rowCount: workspaceCount } = await this.pool.query(
      `SELECT 1
       FROM team_workspaces
       WHERE id = $1
       LIMIT 1`,
      [input.workspaceId],
    );
    if ((workspaceCount ?? 0) === 0) return 'workspace_not_found';

    const { rowCount } = await this.pool.query(
      `UPDATE team_workspace_recovery_outreach_events
       SET status = 'handed_off',
           last_attempt_at = NOW(),
           next_attempt_at = NOW() + ($2 * INTERVAL '1 hour'),
           export_count = 0,
           last_exported_at = NULL,
           crm_sync_count = 0,
           last_crm_sync_attempt_at = NULL,
           next_crm_sync_attempt_at = NOW(),
           last_crm_synced_at = NULL,
           crm_external_record_id = NULL,
           last_crm_sync_status_code = NULL,
           last_crm_sync_error = NULL,
           webhook_attempt_count = 0,
           last_webhook_attempt_at = NULL,
           next_webhook_attempt_at = NOW(),
           webhook_exhausted_at = NULL,
           webhook_delivery_count = 0,
           last_webhook_delivered_at = NULL,
           last_webhook_status_code = NULL,
           last_webhook_error = NULL,
           slack_alert_count = 0,
           last_slack_alert_attempt_at = NULL,
           last_slack_alerted_at = NULL,
           last_slack_alert_status_code = NULL,
           last_slack_alert_error = NULL,
           handoff_channel = $3,
           handoff_note = $4,
           handoff_at = NOW()
       WHERE id = (
         SELECT id
         FROM team_workspace_recovery_outreach_events
         WHERE workspace_id = $1
           AND audience = 'admin'
           AND status <> 'resolved'
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [input.workspaceId, input.snoozeHours, input.channel, input.note?.trim() || null],
    );
    if ((rowCount ?? 0) === 0) return 'outreach_not_found';
    return { ok: true };
  }

  async exportHandedOffAdminRecoveryOutreach(): Promise<{ exportedCount: number }> {
    const { rowCount } = await this.pool.query(
      `UPDATE team_workspace_recovery_outreach_events
       SET export_count = export_count + 1,
           last_exported_at = NOW()
       WHERE audience = 'admin'
         AND status = 'handed_off'`,
    );
    return { exportedCount: rowCount ?? 0 };
  }

  async listPendingMemberRecoveryNotifications(): Promise<
    PendingMemberRecoveryNotificationTarget[]
  > {
    const { rows } = await this.pool.query<{
      notification_id: string;
      workspace_id: string;
      workspace_name: string;
      user_id: string;
      email: string;
      display_name: string | null;
      owner_display_name: string | null;
      owner_email: string;
      subscription: SubscriptionTier;
      billing_status: BillingStatus;
      title: string;
      detail: string;
      email_attempt_count: number;
      last_email_attempt_at: Date | string | null;
      next_email_attempt_at: Date | string | null;
      last_email_delivered_at: Date | string | null;
      last_email_message_id: string | null;
      last_email_error: string | null;
    }>(
      `SELECT
         n.id AS notification_id,
         n.workspace_id,
         w.name AS workspace_name,
         n.user_id,
         u.email,
         u.display_name,
         owner.display_name AS owner_display_name,
         owner.email AS owner_email,
         owner.subscription,
         owner.billing_status,
         n.title,
         n.detail,
         n.email_attempt_count,
         n.last_email_attempt_at,
         n.next_email_attempt_at,
         n.last_email_delivered_at,
         n.last_email_message_id,
         n.last_email_error
       FROM team_workspace_member_recovery_notifications n
       JOIN team_workspaces w ON w.id = n.workspace_id
       JOIN users u ON u.id = n.user_id
       JOIN users owner ON owner.id = w.owner_user_id
       WHERE n.status = 'pending'
       ORDER BY n.created_at DESC`,
    );
    return rows.map((row) => ({
      notificationId: row.notification_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      ownerDisplayName: row.owner_display_name,
      ownerEmail: row.owner_email,
      subscription: row.subscription,
      billingStatus: row.billing_status,
      title: row.title,
      detail: row.detail,
      emailAttemptCount: row.email_attempt_count,
      lastEmailAttemptAt: row.last_email_attempt_at ? toIso(row.last_email_attempt_at) : null,
      nextEmailAttemptAt: row.next_email_attempt_at ? toIso(row.next_email_attempt_at) : null,
      lastEmailDeliveredAt: row.last_email_delivered_at ? toIso(row.last_email_delivered_at) : null,
      lastEmailMessageId: row.last_email_message_id,
      lastEmailError: row.last_email_error,
    }));
  }

  async recordPendingOwnerRecoveryOutreachEmailDelivery(input: {
    workspaceIds: string[];
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    messageIdByWorkspaceId?: Record<string, string | null | undefined>;
  }): Promise<{ deliveredCount: number }> {
    if (input.workspaceIds.length === 0) return { deliveredCount: 0 };
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const deliveredAt = input.deliveredAt ?? attemptedAt;
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    const messageIdByWorkspaceId = input.messageIdByWorkspaceId ?? {};
    const messageIds = input.workspaceIds.map(
      (workspaceId) => messageIdByWorkspaceId[workspaceId] ?? null,
    );
    const { rowCount } = await this.pool.query(
      input.error
        ? `UPDATE team_workspace_recovery_outreach_events
           SET email_attempt_count = email_attempt_count + 1,
               last_email_attempt_at = $2,
               next_email_attempt_at = $3,
               last_email_error = $4
           WHERE id IN (
             SELECT DISTINCT ON (workspace_id) id
             FROM team_workspace_recovery_outreach_events
             WHERE workspace_id = ANY($1::uuid[])
               AND audience = 'owner'
               AND status = 'pending'
             ORDER BY workspace_id, created_at DESC
           )`
        : `UPDATE team_workspace_recovery_outreach_events AS o
           SET email_attempt_count = o.email_attempt_count + 1,
               last_email_attempt_at = $2,
               next_email_attempt_at = NULL,
               last_email_delivered_at = $3,
               last_email_message_id = mapped.message_id,
               last_email_error = NULL
           FROM (
             SELECT UNNEST($1::uuid[]) AS workspace_id, UNNEST($4::text[]) AS message_id
           ) AS mapped
           WHERE o.workspace_id = mapped.workspace_id
             AND o.id IN (
               SELECT DISTINCT ON (workspace_id) id
               FROM team_workspace_recovery_outreach_events
               WHERE workspace_id = ANY($1::uuid[])
                 AND audience = 'owner'
                 AND status = 'pending'
               ORDER BY workspace_id, created_at DESC
             )`,
      input.error
        ? [
            input.workspaceIds,
            attemptedAt,
            nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            input.error,
          ]
        : [input.workspaceIds, attemptedAt, deliveredAt, messageIds],
    );
    return { deliveredCount: input.error ? 0 : (rowCount ?? 0) };
  }

  async recordPendingMemberRecoveryNotificationEmailDelivery(input: {
    notificationIds: string[];
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    messageIdByNotificationId?: Record<string, string | null | undefined>;
  }): Promise<{ deliveredCount: number }> {
    if (input.notificationIds.length === 0) return { deliveredCount: 0 };
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const deliveredAt = input.deliveredAt ?? attemptedAt;
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    const messageIdByNotificationId = input.messageIdByNotificationId ?? {};
    const messageIds = input.notificationIds.map(
      (notificationId) => messageIdByNotificationId[notificationId] ?? null,
    );
    const { rowCount } = await this.pool.query(
      input.error
        ? `UPDATE team_workspace_member_recovery_notifications
           SET email_attempt_count = email_attempt_count + 1,
               last_email_attempt_at = $2,
               next_email_attempt_at = $3,
               last_email_error = $4
           WHERE id = ANY($1::uuid[])
             AND status = 'pending'`
        : `UPDATE team_workspace_member_recovery_notifications AS n
           SET email_attempt_count = n.email_attempt_count + 1,
               last_email_attempt_at = $2,
               next_email_attempt_at = NULL,
               last_email_delivered_at = $3,
               last_email_message_id = mapped.message_id,
               last_email_error = NULL
           FROM (
             SELECT UNNEST($1::uuid[]) AS notification_id, UNNEST($4::text[]) AS message_id
           ) AS mapped
           WHERE n.id = mapped.notification_id
             AND n.status = 'pending'`,
      input.error
        ? [
            input.notificationIds,
            attemptedAt,
            nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            input.error,
          ]
        : [input.notificationIds, attemptedAt, deliveredAt, messageIds],
    );
    return { deliveredCount: input.error ? 0 : (rowCount ?? 0) };
  }

  async recordHandedOffAdminRecoveryOutreachCrmSync(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    syncedAt?: string;
    retryIntervalHours?: number;
    externalRecordIdByWorkspaceId?: Record<string, string | null | undefined>;
  }): Promise<{ syncedCount: number }> {
    if (input.workspaceIds.length === 0) return { syncedCount: 0 };
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const syncedAt = input.syncedAt ?? attemptedAt;
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    const externalRecordIdByWorkspaceId = input.externalRecordIdByWorkspaceId ?? {};
    const externalRecordIds = input.workspaceIds.map(
      (workspaceId) => externalRecordIdByWorkspaceId[workspaceId] ?? null,
    );
    const { rowCount } = await this.pool.query(
      input.error
        ? `UPDATE team_workspace_recovery_outreach_events
           SET crm_sync_count = crm_sync_count + 1,
               last_crm_sync_attempt_at = $2,
               next_crm_sync_attempt_at = $3,
               last_crm_sync_status_code = $4,
               last_crm_sync_error = $5
           WHERE id IN (
             SELECT DISTINCT ON (workspace_id) id
             FROM team_workspace_recovery_outreach_events
             WHERE workspace_id = ANY($1::uuid[])
               AND audience = 'admin'
               AND status = 'handed_off'
               AND handoff_channel = 'crm'
             ORDER BY workspace_id, created_at DESC
           )`
        : `UPDATE team_workspace_recovery_outreach_events AS o
           SET crm_sync_count = o.crm_sync_count + 1,
               last_crm_sync_attempt_at = $2,
               next_crm_sync_attempt_at = NULL,
               last_crm_synced_at = $3,
               crm_external_record_id = mapped.external_record_id,
               last_crm_sync_status_code = $4,
               last_crm_sync_error = NULL
           FROM (
             SELECT UNNEST($1::uuid[]) AS workspace_id, UNNEST($5::text[]) AS external_record_id
           ) AS mapped
           WHERE o.workspace_id = mapped.workspace_id
             AND o.id IN (
               SELECT DISTINCT ON (workspace_id) id
               FROM team_workspace_recovery_outreach_events
               WHERE workspace_id = ANY($1::uuid[])
                 AND audience = 'admin'
                 AND status = 'handed_off'
                 AND handoff_channel = 'crm'
               ORDER BY workspace_id, created_at DESC
             )`,
      input.error
        ? [
            input.workspaceIds,
            attemptedAt,
            nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            input.statusCode,
            input.error,
          ]
        : [input.workspaceIds, attemptedAt, syncedAt, input.statusCode, externalRecordIds],
    );
    return { syncedCount: input.error ? 0 : (rowCount ?? 0) };
  }

  async recordDeadLetteredAdminRecoveryOutreachSlackAlert(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    alertedAt?: string;
  }): Promise<{ alertedCount: number }> {
    if (input.workspaceIds.length === 0) return { alertedCount: 0 };
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const alertedAt = input.alertedAt ?? attemptedAt;
    const { rowCount } = await this.pool.query(
      input.error
        ? `UPDATE team_workspace_recovery_outreach_events
           SET slack_alert_count = slack_alert_count + 1,
               last_slack_alert_attempt_at = $2,
               last_slack_alert_status_code = $3,
               last_slack_alert_error = $4
           WHERE workspace_id = ANY($1::uuid[])
             AND audience = 'admin'
             AND status = 'handed_off'
             AND webhook_exhausted_at IS NOT NULL`
        : `UPDATE team_workspace_recovery_outreach_events
           SET slack_alert_count = slack_alert_count + 1,
               last_slack_alert_attempt_at = $2,
               last_slack_alerted_at = $3,
               last_slack_alert_status_code = $4,
               last_slack_alert_error = NULL
           WHERE workspace_id = ANY($1::uuid[])
             AND audience = 'admin'
             AND status = 'handed_off'
             AND webhook_exhausted_at IS NOT NULL`,
      input.error
        ? [input.workspaceIds, attemptedAt, input.statusCode, input.error]
        : [input.workspaceIds, attemptedAt, alertedAt, input.statusCode],
    );
    return { alertedCount: input.error ? 0 : (rowCount ?? 0) };
  }

  async recordHandedOffAdminRecoveryOutreachWebhookDelivery(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    maxAttempts?: number;
  }): Promise<{ deliveredCount: number }> {
    if (input.workspaceIds.length === 0) return { deliveredCount: 0 };
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const deliveredAt = input.deliveredAt ?? new Date().toISOString();
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    const maxAttempts = Math.max(
      1,
      input.maxAttempts ?? config.recoveryOutreach.webhookMaxAttempts,
    );
    const { rowCount } = await this.pool.query(
      input.error
        ? `UPDATE team_workspace_recovery_outreach_events
           SET webhook_attempt_count = webhook_attempt_count + 1,
               last_webhook_attempt_at = $2,
               next_webhook_attempt_at = CASE
                 WHEN webhook_attempt_count + 1 >= $6 THEN NULL
                 ELSE $3
               END,
               webhook_exhausted_at = CASE
                 WHEN webhook_attempt_count + 1 >= $6 THEN $2
                 ELSE NULL
               END,
               last_webhook_status_code = $4,
               last_webhook_error = $5
           WHERE id IN (
             SELECT DISTINCT ON (workspace_id) id
             FROM team_workspace_recovery_outreach_events
             WHERE workspace_id = ANY($1::uuid[])
               AND audience = 'admin'
               AND status = 'handed_off'
             ORDER BY workspace_id, created_at DESC
           )`
        : `UPDATE team_workspace_recovery_outreach_events
           SET webhook_attempt_count = webhook_attempt_count + 1,
               last_webhook_attempt_at = $2,
               next_webhook_attempt_at = NULL,
               webhook_exhausted_at = NULL,
               webhook_delivery_count = webhook_delivery_count + 1,
               last_webhook_delivered_at = $3,
               last_webhook_status_code = $4,
               last_webhook_error = NULL,
               slack_alert_count = 0,
               last_slack_alert_attempt_at = NULL,
               last_slack_alerted_at = NULL,
               last_slack_alert_status_code = NULL,
               last_slack_alert_error = NULL
           WHERE id IN (
             SELECT DISTINCT ON (workspace_id) id
             FROM team_workspace_recovery_outreach_events
             WHERE workspace_id = ANY($1::uuid[])
               AND audience = 'admin'
               AND status = 'handed_off'
             ORDER BY workspace_id, created_at DESC
           )`,
      input.error
        ? [
            input.workspaceIds,
            attemptedAt,
            nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            input.statusCode,
            input.error,
            maxAttempts,
          ]
        : [input.workspaceIds, attemptedAt, deliveredAt, input.statusCode],
    );
    return { deliveredCount: input.error ? 0 : (rowCount ?? 0) };
  }

  async createWorkspace(
    user: UserProfile,
    name: string,
  ): Promise<TeamWorkspace | 'already_in_workspace' | 'entitlement_required'> {
    if (!user.entitlements.canUseTeamWorkspace) return 'entitlement_required';
    if (await this.findMembership(user.id)) return 'already_in_workspace';

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO team_workspaces (name, owner_user_id)
         VALUES ($1, $2)
         RETURNING id`,
        [name, user.id],
      );
      await client.query(
        `INSERT INTO team_workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [rows[0]!.id, user.id],
      );
      await client.query('COMMIT');
      return (await this.buildWorkspaceForUser(user.id))!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async inviteMember(
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
  > {
    const membership = await this.findMembership(actorUserId);
    if (!membership) return 'workspace_not_found';
    if (membership.role === 'member') return 'forbidden';

    const workspace = await this.buildWorkspaceForUser(actorUserId);
    if (!workspace) return 'workspace_not_found';

    const { rowCount: memberCount } = await this.pool.query(
      `SELECT 1
       FROM team_workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [email],
    );
    if ((memberCount ?? 0) > 0) return 'user_already_in_workspace';

    if (workspace.billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingInvite = workspace.invites.find(
      (invite) => invite.email.toLowerCase() === normalizedEmail,
    );
    if (!existingInvite && !workspace.billing.canInviteMore) {
      return 'seat_limit_reached';
    }

    await this.pool.query(
      `INSERT INTO team_workspace_invites (workspace_id, email, role, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, email)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = 'pending',
         created_by_user_id = EXCLUDED.created_by_user_id,
         accepted_by_user_id = NULL,
         accepted_at = NULL,
         revoked_reason = NULL,
         revoked_at = NULL,
         created_at = NOW()`,
      [membership.workspaceId, normalizedEmail, role, actorUserId],
    );
    return (await this.buildWorkspaceForUser(actorUserId))!;
  }

  async acceptInvite(
    user: UserProfile,
    inviteId: string,
  ): Promise<
    TeamWorkspace | 'invite_not_found' | 'already_in_workspace' | 'workspace_plan_inactive'
  > {
    if (await this.findMembership(user.id)) return 'already_in_workspace';

    const { rows } = await this.pool.query<PgWorkspaceInviteRow>(
      `SELECT
         i.id,
         i.workspace_id,
         w.name AS workspace_name,
         i.email,
         i.role,
         i.status,
         i.created_at,
         i.accepted_at,
         i.revoked_reason,
         i.revoked_at
       FROM team_workspace_invites i
       JOIN team_workspaces w ON w.id = i.workspace_id
       WHERE i.id = $1
       LIMIT 1`,
      [inviteId],
    );
    const invite = rows[0];
    if (!invite) return 'invite_not_found';
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) return 'invite_not_found';
    if (invite.status !== 'pending') {
      return invite.revoked_reason === 'billing_inactive'
        ? 'workspace_plan_inactive'
        : 'invite_not_found';
    }
    await this.reconcileWorkspaceBillingState(invite.workspace_id);
    const refreshedInviteRes = await this.pool.query<PgWorkspaceInviteRow>(
      `SELECT
         i.id,
         i.workspace_id,
         w.name AS workspace_name,
         i.email,
         i.role,
         i.status,
         i.created_at,
         i.accepted_at,
         i.revoked_reason,
         i.revoked_at
       FROM team_workspace_invites i
       JOIN team_workspaces w ON w.id = i.workspace_id
       WHERE i.id = $1
       LIMIT 1`,
      [inviteId],
    );
    const refreshedInvite = refreshedInviteRes.rows[0];
    if (!refreshedInvite || refreshedInvite.status !== 'pending') {
      return refreshedInvite?.revoked_reason === 'billing_inactive'
        ? 'workspace_plan_inactive'
        : 'invite_not_found';
    }

    const [ownerRows, memberCountRows, pendingInviteCountRows] = await Promise.all([
      this.pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        subscription: SubscriptionTier;
        billing_status: BillingStatus;
        current_period_end: Date | string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT
           u.id,
           u.email,
           u.display_name,
           u.subscription,
           u.billing_status,
           u.current_period_end,
           u.cancel_at_period_end
         FROM team_workspaces w
         JOIN users u ON u.id = w.owner_user_id
         WHERE w.id = $1
         LIMIT 1`,
        [invite.workspace_id],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_members
         WHERE workspace_id = $1`,
        [invite.workspace_id],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_invites
         WHERE workspace_id = $1
           AND status = 'pending'`,
        [invite.workspace_id],
      ),
    ]);
    const owner = ownerRows.rows[0];
    if (!owner) return 'invite_not_found';
    const billing = buildWorkspaceBilling({
      owner: {
        id: owner.id,
        email: owner.email,
        displayName: owner.display_name,
        subscription: owner.subscription,
        billingStatus: owner.billing_status,
        currentPeriodEnd: owner.current_period_end ? toIso(owner.current_period_end) : null,
        cancelAtPeriodEnd: owner.cancel_at_period_end,
      },
      seatsUsed: Number(memberCountRows.rows[0]?.count ?? 0),
      pendingInviteCount: Number(pendingInviteCountRows.rows[0]?.count ?? 0),
    });
    if (billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO team_workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [invite.workspace_id, user.id, refreshedInvite.role],
      );
      await client.query(
        `UPDATE team_workspace_invites
         SET status = CASE WHEN id = $1 THEN 'accepted' ELSE 'revoked' END,
             accepted_by_user_id = CASE WHEN id = $1 THEN $2 ELSE accepted_by_user_id END,
             accepted_at = CASE WHEN id = $1 THEN NOW() ELSE accepted_at END
             , revoked_reason = CASE WHEN id = $1 THEN NULL ELSE 'accepted_elsewhere' END
             , revoked_at = CASE WHEN id = $1 THEN NULL ELSE NOW() END
         WHERE lower(email) = lower($3)
           AND status = 'pending'`,
        [inviteId, user.id, user.email],
      );
      await client.query('COMMIT');
      return (await this.buildWorkspaceForUser(user.id))!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async shareSavedView(
    actorUserId: string,
    savedViewId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'saved_view_not_found'
  > {
    const membership = await this.findMembership(actorUserId);
    if (!membership) return 'workspace_not_found';

    const { rowCount: savedViewCount } = await this.pool.query(
      `SELECT 1
       FROM user_saved_views
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [savedViewId, actorUserId],
    );
    if ((savedViewCount ?? 0) === 0) return 'saved_view_not_found';

    const { rowCount } = await this.pool.query(
      `INSERT INTO team_workspace_saved_views (workspace_id, saved_view_id, shared_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, saved_view_id) DO NOTHING`,
      [membership.workspaceId, savedViewId, actorUserId],
    );
    return {
      status: (rowCount ?? 0) > 0 ? 'added' : 'exists',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  async shareCase(
    actorUserId: string,
    caseId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'case_not_found'
  > {
    const membership = await this.findMembership(actorUserId);
    if (!membership) return 'workspace_not_found';

    const { rowCount: caseCount } = await this.pool.query(
      `SELECT 1
       FROM cases
       WHERE id = $1 AND published_at IS NOT NULL
       LIMIT 1`,
      [caseId],
    );
    if ((caseCount ?? 0) === 0) return 'case_not_found';

    const { rowCount } = await this.pool.query(
      `INSERT INTO team_workspace_cases (workspace_id, case_id, shared_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, case_id) DO NOTHING`,
      [membership.workspaceId, caseId, actorUserId],
    );
    return {
      status: (rowCount ?? 0) > 0 ? 'added' : 'exists',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  private async findMembership(userId: string): Promise<WorkspaceMembershipRecord | null> {
    const { rows } = await this.pool.query<PgWorkspaceMembershipRow>(
      `SELECT m.workspace_id, m.role, m.joined_at, w.name, w.created_at, w.owner_user_id
       FROM team_workspace_members m
       JOIN team_workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       LIMIT 1`,
      [userId],
    );
    if (!rows[0]) return null;
    return {
      workspaceId: rows[0].workspace_id,
      role: rows[0].role,
      joinedAt: toIso(rows[0].joined_at),
    };
  }

  private async getPendingInvitesForEmail(email: string): Promise<TeamWorkspaceInvite[]> {
    const { rows } = await this.pool.query<PgWorkspaceInviteRow>(
      `SELECT
         i.id,
         i.workspace_id,
         w.name AS workspace_name,
         i.email,
         i.role,
         i.status,
         i.created_at,
         i.accepted_at,
         i.revoked_reason,
         i.revoked_at
       FROM team_workspace_invites i
       JOIN team_workspaces w ON w.id = i.workspace_id
       WHERE lower(i.email) = lower($1)
         AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [email],
    );
    return rows.map(rowToInvite);
  }

  private async reconcilePendingInvitesForEmail(email: string): Promise<void> {
    const { rows } = await this.pool.query<{ workspace_id: string }>(
      `SELECT DISTINCT workspace_id
       FROM team_workspace_invites
       WHERE lower(email) = lower($1)
         AND status = 'pending'`,
      [email],
    );
    for (const row of rows) {
      await this.reconcileWorkspaceBillingState(row.workspace_id);
    }
  }

  private async getRecentBillingEvents(workspaceId?: string): Promise<AdminBillingEvent[]> {
    const query = workspaceId
      ? `SELECT
           e.id,
           e.workspace_id,
           w.name AS workspace_name,
           e.event_type,
           e.severity,
           e.title,
           e.detail,
           e.event_count,
           e.created_at
         FROM team_workspace_billing_events e
         JOIN team_workspaces w ON w.id = e.workspace_id
         WHERE e.workspace_id = $1
         ORDER BY e.created_at DESC
         LIMIT 6`
      : `SELECT
           e.id,
           e.workspace_id,
           w.name AS workspace_name,
           e.event_type,
           e.severity,
           e.title,
           e.detail,
           e.event_count,
           e.created_at
         FROM team_workspace_billing_events e
         JOIN team_workspaces w ON w.id = e.workspace_id
         ORDER BY e.created_at DESC
         LIMIT 8`;
    const { rows } = await this.pool.query<PgWorkspaceBillingEventRow>(
      query,
      workspaceId ? [workspaceId] : [],
    );
    return rows.map(rowToBillingEvent);
  }

  private async getStoredBillingState(
    workspaceId: string,
  ): Promise<WorkspaceBillingSnapshot | null> {
    const { rows } = await this.pool.query<PgWorkspaceBillingStateRow>(
      `SELECT
         seat_limit,
         billing_status,
         cancel_at_period_end,
         reserved_seats,
         fallback_member_count
       FROM team_workspace_billing_states
       WHERE workspace_id = $1
       LIMIT 1`,
      [workspaceId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      seatLimit: row.seat_limit,
      billingStatus: row.billing_status,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      reservedSeats: row.reserved_seats,
      fallbackMemberCount: row.fallback_member_count,
    };
  }

  private async persistBillingState(workspaceId: string, snapshot: WorkspaceBillingSnapshot) {
    await this.pool.query(
      `INSERT INTO team_workspace_billing_states (
         workspace_id,
         seat_limit,
         billing_status,
         cancel_at_period_end,
         reserved_seats,
         fallback_member_count,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET
         seat_limit = EXCLUDED.seat_limit,
         billing_status = EXCLUDED.billing_status,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         reserved_seats = EXCLUDED.reserved_seats,
         fallback_member_count = EXCLUDED.fallback_member_count,
         updated_at = NOW()`,
      [
        workspaceId,
        snapshot.seatLimit,
        snapshot.billingStatus,
        snapshot.cancelAtPeriodEnd,
        snapshot.reservedSeats,
        snapshot.fallbackMemberCount,
      ],
    );
  }

  private async recordBillingEvents(
    workspaceId: string,
    descriptors: WorkspaceBillingEventDescriptor[],
  ) {
    for (const descriptor of descriptors) {
      await this.pool.query(
        `INSERT INTO team_workspace_billing_events (
           workspace_id,
           event_type,
           severity,
           title,
           detail,
           event_count
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          descriptor.type,
          descriptor.severity,
          descriptor.title,
          descriptor.detail,
          descriptor.count,
        ],
      );
    }
  }

  private async getRecentRecoveryOutreach(
    workspaceId?: string,
    audience?: TeamWorkspaceRecoveryOutreachAudience,
  ): Promise<AdminRecoveryOutreach[]> {
    const clauses: string[] = [];
    const values: Array<string> = [];
    if (workspaceId) {
      values.push(workspaceId);
      clauses.push(`o.workspace_id = $${values.length}`);
    }
    if (audience) {
      values.push(audience);
      clauses.push(`o.audience = $${values.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = workspaceId ? 6 : 8;
    const { rows } = await this.pool.query<PgWorkspaceRecoveryOutreachRow>(
      `SELECT
         o.id,
         o.workspace_id,
         w.name AS workspace_name,
         o.audience,
         o.channel,
         o.status,
         o.title,
         o.detail,
         o.action_code,
         o.attempt_count,
         o.created_at,
         o.last_attempt_at,
         o.next_attempt_at,
         o.email_attempt_count,
         o.last_email_attempt_at,
         o.next_email_attempt_at,
         o.last_email_delivered_at,
         o.last_email_message_id,
         o.last_email_error,
         o.export_count,
         o.last_exported_at,
         o.crm_sync_count,
         o.last_crm_sync_attempt_at,
         o.next_crm_sync_attempt_at,
         o.last_crm_synced_at,
         o.crm_external_record_id,
         o.last_crm_sync_status_code,
         o.last_crm_sync_error,
         o.webhook_attempt_count,
         o.last_webhook_attempt_at,
         o.next_webhook_attempt_at,
         o.webhook_exhausted_at,
         o.webhook_delivery_count,
         o.last_webhook_delivered_at,
         o.last_webhook_status_code,
         o.last_webhook_error,
         o.slack_alert_count,
         o.last_slack_alert_attempt_at,
         o.last_slack_alerted_at,
         o.last_slack_alert_status_code,
         o.last_slack_alert_error,
         o.handoff_channel,
         o.handoff_note,
         o.handoff_at,
         o.resolved_at
       FROM team_workspace_recovery_outreach_events o
       JOIN team_workspaces w ON w.id = o.workspace_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT ${limit}`,
      values,
    );
    return rows.map(rowToRecoveryOutreach);
  }

  private async getLatestRecoveryOutreachByWorkspaceIds(
    workspaceIds: string[],
  ): Promise<Map<string, AdminRecoveryOutreach>> {
    if (workspaceIds.length === 0) return new Map();
    const { rows } = await this.pool.query<PgWorkspaceRecoveryOutreachRow>(
      `SELECT DISTINCT ON (o.workspace_id)
         o.id,
         o.workspace_id,
         w.name AS workspace_name,
         o.audience,
         o.channel,
         o.status,
         o.title,
         o.detail,
         o.action_code,
         o.attempt_count,
         o.created_at,
         o.last_attempt_at,
         o.next_attempt_at,
         o.email_attempt_count,
         o.last_email_attempt_at,
         o.next_email_attempt_at,
         o.last_email_delivered_at,
         o.last_email_message_id,
         o.last_email_error,
         o.export_count,
         o.last_exported_at,
         o.crm_sync_count,
         o.last_crm_sync_attempt_at,
         o.next_crm_sync_attempt_at,
         o.last_crm_synced_at,
         o.crm_external_record_id,
         o.last_crm_sync_status_code,
         o.last_crm_sync_error,
         o.webhook_attempt_count,
         o.last_webhook_attempt_at,
         o.next_webhook_attempt_at,
         o.webhook_exhausted_at,
         o.webhook_delivery_count,
         o.last_webhook_delivered_at,
         o.last_webhook_status_code,
         o.last_webhook_error,
         o.slack_alert_count,
         o.last_slack_alert_attempt_at,
         o.last_slack_alerted_at,
         o.last_slack_alert_status_code,
         o.last_slack_alert_error,
         o.handoff_channel,
         o.handoff_note,
         o.handoff_at,
         o.resolved_at
       FROM team_workspace_recovery_outreach_events o
       JOIN team_workspaces w ON w.id = o.workspace_id
       WHERE o.workspace_id = ANY($1::uuid[])
       ORDER BY o.workspace_id, o.created_at DESC`,
      [workspaceIds],
    );
    return new Map(rows.map((row) => [row.workspace_id, rowToRecoveryOutreach(row)]));
  }

  private async getRecentMemberRecoveryNotifications(
    workspaceId: string,
  ): Promise<TeamWorkspaceMemberRecoveryNotification[]> {
    const { rows } = await this.pool.query<PgWorkspaceMemberRecoveryNotificationRow>(
      `SELECT
         n.id,
         n.workspace_id,
         n.user_id,
         u.email,
         u.display_name,
         n.status,
         n.title,
         n.detail,
         n.email_attempt_count,
         n.created_at,
         n.last_email_attempt_at,
         n.next_email_attempt_at,
         n.last_email_delivered_at,
         n.last_email_message_id,
         n.last_email_error,
         n.resolved_at
       FROM team_workspace_member_recovery_notifications n
       JOIN users u ON u.id = n.user_id
       WHERE n.workspace_id = $1
       ORDER BY n.created_at DESC
       LIMIT 6`,
      [workspaceId],
    );
    return rows.map(rowToMemberRecoveryNotification);
  }

  private async syncPendingMemberRecoveryNotifications(
    workspaceId: string,
    _workspaceName: string,
    members: Array<{ userId: string; email: string; displayName: string | null }>,
    descriptor: WorkspaceMemberRecoveryNotificationDescriptor | null,
  ): Promise<void> {
    if (!descriptor || members.length === 0) {
      await this.pool.query(
        `UPDATE team_workspace_member_recovery_notifications
         SET status = 'resolved',
             next_email_attempt_at = NULL,
             resolved_at = NOW()
         WHERE workspace_id = $1
           AND status = 'pending'`,
        [workspaceId],
      );
      return;
    }
    await this.pool.query(
      `UPDATE team_workspace_member_recovery_notifications
       SET status = 'resolved',
           next_email_attempt_at = NULL,
           resolved_at = NOW()
       WHERE workspace_id = $1
         AND status = 'pending'
         AND user_id <> ALL($2::uuid[])`,
      [workspaceId, members.map((member) => member.userId)],
    );
    for (const member of members) {
      const updated = await this.pool.query(
        `UPDATE team_workspace_member_recovery_notifications
         SET email = $3,
             display_name = $4,
             title = $5,
             detail = $6
         WHERE workspace_id = $1
           AND user_id = $2
           AND status = 'pending'`,
        [
          workspaceId,
          member.userId,
          member.email,
          member.displayName,
          descriptor.title,
          descriptor.detail,
        ],
      );
      if ((updated.rowCount ?? 0) > 0) continue;
      await this.pool.query(
        `INSERT INTO team_workspace_member_recovery_notifications (
           workspace_id,
           user_id,
           email,
           display_name,
           status,
           title,
           detail,
           email_attempt_count,
           next_email_attempt_at
         )
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, 0, NOW())`,
        [
          workspaceId,
          member.userId,
          member.email,
          member.displayName,
          descriptor.title,
          descriptor.detail,
        ],
      );
    }
  }

  private async ensurePendingRecoveryOutreach(
    workspaceId: string,
    descriptor: WorkspaceRecoveryOutreachDescriptor | null,
    retryIntervalHours: number,
  ): Promise<number> {
    if (!descriptor) return 0;
    const { rowCount } = await this.pool.query(
      `INSERT INTO team_workspace_recovery_outreach_events (
         workspace_id,
         audience,
         channel,
         status,
         title,
         detail,
         action_code,
         attempt_count,
         last_attempt_at,
         next_attempt_at,
         email_attempt_count,
         last_email_attempt_at,
         next_email_attempt_at,
         last_email_delivered_at,
         last_email_message_id,
         last_email_error,
         export_count,
         last_exported_at,
         crm_sync_count,
         last_crm_sync_attempt_at,
         next_crm_sync_attempt_at,
         last_crm_synced_at,
         crm_external_record_id,
         last_crm_sync_status_code,
         last_crm_sync_error,
         webhook_attempt_count,
         last_webhook_attempt_at,
         next_webhook_attempt_at,
         webhook_exhausted_at,
         webhook_delivery_count,
         last_webhook_delivered_at,
         last_webhook_status_code,
         last_webhook_error,
         slack_alert_count,
         last_slack_alert_attempt_at,
         last_slack_alerted_at,
         last_slack_alert_status_code,
         last_slack_alert_error
       )
       SELECT
         $1, $2, $3, 'pending', $4, $5, $6, 1, NOW(), NOW() + ($7 * INTERVAL '1 hour'), 0, NULL, NOW(), NULL, NULL, NULL, 0, NULL, 0, NULL, NOW(), NULL, NULL, NULL, NULL, 0, NULL, NOW(), NULL, 0, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL
       WHERE NOT EXISTS (
         SELECT 1
         FROM team_workspace_recovery_outreach_events
         WHERE workspace_id = $1
           AND audience = $2
           AND (
             status = 'pending'
             OR (
               status = 'handed_off'
               AND next_attempt_at IS NOT NULL
               AND next_attempt_at > NOW()
             )
           )
       )`,
      [
        workspaceId,
        descriptor.audience,
        descriptor.channel,
        descriptor.title,
        descriptor.detail,
        descriptor.actionCode,
        retryIntervalHours,
      ],
    );
    return rowCount ?? 0;
  }

  private async retryPendingRecoveryOutreach(
    workspaceId: string,
    descriptor: WorkspaceRecoveryOutreachDescriptor | null,
    retryIntervalHours: number,
  ): Promise<number> {
    if (!descriptor) return 0;
    const { rowCount } = await this.pool.query(
      `UPDATE team_workspace_recovery_outreach_events
       SET channel = $3,
           status = 'pending',
           title = $4,
           detail = $5,
           action_code = $6,
           attempt_count = attempt_count + 1,
           last_attempt_at = NOW(),
           next_attempt_at = NOW() + ($7 * INTERVAL '1 hour'),
           email_attempt_count = 0,
           last_email_attempt_at = NULL,
           next_email_attempt_at = NOW(),
           last_email_delivered_at = NULL,
           last_email_message_id = NULL,
           last_email_error = NULL,
           export_count = 0,
           last_exported_at = NULL,
           crm_sync_count = 0,
           last_crm_sync_attempt_at = NULL,
           next_crm_sync_attempt_at = NOW(),
           last_crm_synced_at = NULL,
           crm_external_record_id = NULL,
           last_crm_sync_status_code = NULL,
           last_crm_sync_error = NULL,
           webhook_attempt_count = 0,
           last_webhook_attempt_at = NULL,
           next_webhook_attempt_at = NOW(),
           webhook_exhausted_at = NULL,
           webhook_delivery_count = 0,
           last_webhook_delivered_at = NULL,
           last_webhook_status_code = NULL,
           last_webhook_error = NULL,
           slack_alert_count = 0,
           last_slack_alert_attempt_at = NULL,
           last_slack_alerted_at = NULL,
           last_slack_alert_status_code = NULL,
           last_slack_alert_error = NULL,
           handoff_channel = NULL,
           handoff_note = NULL,
           handoff_at = NULL
       WHERE workspace_id = $1
         AND audience = $2
         AND status = 'pending'
         AND (last_attempt_at + ($7 * INTERVAL '1 hour')) <= NOW()`,
      [
        workspaceId,
        descriptor.audience,
        descriptor.channel,
        descriptor.title,
        descriptor.detail,
        descriptor.actionCode,
        retryIntervalHours,
      ],
    );
    return rowCount ?? 0;
  }

  private async resolvePendingRecoveryOutreach(
    workspaceId: string,
    audience?: TeamWorkspaceRecoveryOutreachAudience,
  ): Promise<number> {
    const values: Array<string> = [workspaceId];
    let audienceClause = '';
    if (audience) {
      values.push(audience);
      audienceClause = `AND audience = $${values.length}`;
    }
    const { rowCount } = await this.pool.query(
      `UPDATE team_workspace_recovery_outreach_events
       SET status = 'resolved',
           next_attempt_at = NULL,
           next_email_attempt_at = NULL,
           next_webhook_attempt_at = NULL,
           webhook_exhausted_at = NULL,
           last_slack_alert_error = NULL,
           resolved_at = NOW()
       WHERE workspace_id = $1
         ${audienceClause}
         AND status <> 'resolved'`,
      values,
    );
    return rowCount ?? 0;
  }

  private async reconcileAllWorkspaces(): Promise<void> {
    await this.reconcileAllBilling();
  }

  private async reconcileWorkspaceBillingState(
    workspaceId: string,
  ): Promise<WorkspaceReconcileResult> {
    const [ownerRows, memberCountRows, inviteRows, previousSnapshot] = await Promise.all([
      this.pool.query<{
        subscription: SubscriptionTier;
        billing_status: BillingStatus;
        cancel_at_period_end: boolean;
      }>(
        `SELECT u.subscription, u.billing_status, u.cancel_at_period_end
         FROM team_workspaces w
         JOIN users u ON u.id = w.owner_user_id
         WHERE w.id = $1
         LIMIT 1`,
        [workspaceId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_members
         WHERE workspace_id = $1`,
        [workspaceId],
      ),
      this.pool.query<{ id: string }>(
        `SELECT id
         FROM team_workspace_invites
        WHERE workspace_id = $1
           AND status = 'pending'
         ORDER BY created_at ASC`,
        [workspaceId],
      ),
      this.getStoredBillingState(workspaceId),
    ]);

    const owner = ownerRows.rows[0];
    if (!owner) return { revokedInviteCount: 0, restoredInviteCount: 0 };
    const seatLimit = resolveTeamWorkspaceSeatLimit({
      subscription: owner.subscription,
      billingStatus: owner.billing_status,
    });
    const seatsUsed = Number(memberCountRows.rows[0]?.count ?? 0);
    const allowedPendingInvites = Math.max(0, seatLimit - seatsUsed);
    const inviteIdsToRevoke = inviteRows.rows.slice(allowedPendingInvites).map((row) => row.id);
    const revokeReason: WorkspaceInviteRevocationReason =
      seatLimit === 0 ? 'billing_inactive' : 'seat_limit_reduced';
    const revokedInviteCount =
      inviteIdsToRevoke.length === 0
        ? 0
        : ((
            await this.pool.query(
              `UPDATE team_workspace_invites
             SET status = 'revoked',
                 revoked_reason = $2,
                 revoked_at = NOW(),
                 accepted_by_user_id = NULL,
                 accepted_at = NULL
             WHERE id = ANY($1::uuid[])
               AND status = 'pending'`,
              [inviteIdsToRevoke, revokeReason],
            )
          ).rowCount ?? 0);
    const remainingPendingInvites = Math.max(0, inviteRows.rows.length - revokedInviteCount);
    let restoredInviteCount = 0;
    if (seatLimit > 0 && remainingPendingInvites < allowedPendingInvites) {
      const recoverableInviteIdsRes = await this.pool.query<{ id: string }>(
        `SELECT id
         FROM team_workspace_invites
         WHERE workspace_id = $1
           AND status = 'revoked'
           AND revoked_reason IN ('billing_inactive', 'seat_limit_reduced')
         ORDER BY revoked_at ASC NULLS LAST, created_at ASC
         LIMIT $2`,
        [workspaceId, Math.max(0, allowedPendingInvites - remainingPendingInvites)],
      );
      const recoverableInviteIds = recoverableInviteIdsRes.rows.map((row) => row.id);
      restoredInviteCount =
        recoverableInviteIds.length === 0
          ? 0
          : ((
              await this.pool.query(
                `UPDATE team_workspace_invites
                 SET status = 'pending',
                     revoked_reason = NULL,
                     revoked_at = NULL,
                     accepted_by_user_id = NULL,
                     accepted_at = NULL
                 WHERE id = ANY($1::uuid[])
                   AND status = 'revoked'`,
                [recoverableInviteIds],
              )
            ).rowCount ?? 0);
    }

    const nextSnapshot: WorkspaceBillingSnapshot = {
      seatLimit,
      billingStatus: owner.billing_status,
      cancelAtPeriodEnd: owner.cancel_at_period_end,
      reservedSeats: seatsUsed + remainingPendingInvites + restoredInviteCount,
      fallbackMemberCount: seatLimit === 0 ? Math.max(0, seatsUsed - 1) : 0,
    };
    const descriptors = buildBillingEventDescriptors({
      previous: previousSnapshot,
      next: nextSnapshot,
      revokedInviteCount,
      restoredInviteCount,
    });
    await this.persistBillingState(workspaceId, nextSnapshot);
    if (descriptors.length > 0) {
      await this.recordBillingEvents(workspaceId, descriptors);
    }
    return {
      revokedInviteCount,
      restoredInviteCount,
    };
  }

  private async getCompensationSummary(workspaceId: string): Promise<WorkspaceCompensationSummary> {
    const { rows } = await this.pool.query<{
      revoked_invite_count: string;
    }>(
      `SELECT COUNT(*)::text AS revoked_invite_count
       FROM team_workspace_invites
       WHERE workspace_id = $1
         AND status = 'revoked'
         AND revoked_reason IN ('billing_inactive', 'seat_limit_reduced')`,
      [workspaceId],
    );
    return {
      revokedInviteCount: Number(rows[0]?.revoked_invite_count ?? 0),
    };
  }

  private async buildWorkspaceAccessForUser(user: UserProfile): Promise<WorkspaceAccess | null> {
    const membership = await this.findMembership(user.id);
    if (!membership) return null;
    await this.reconcileWorkspaceBillingState(membership.workspaceId);

    const [workspaceRows, ownerRows, memberCountRows, inviteCountRows] = await Promise.all([
      this.pool.query<{ id: string; name: string; owner_user_id: string }>(
        `SELECT id, name, owner_user_id
         FROM team_workspaces
         WHERE id = $1
         LIMIT 1`,
        [membership.workspaceId],
      ),
      this.pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        subscription: SubscriptionTier;
        billing_status: BillingStatus;
        current_period_end: Date | string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT
           id,
           email,
           display_name,
           subscription,
           billing_status,
           current_period_end,
           cancel_at_period_end
         FROM users
         WHERE id = (
           SELECT owner_user_id
           FROM team_workspaces
           WHERE id = $1
         )
         LIMIT 1`,
        [membership.workspaceId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_members
         WHERE workspace_id = $1`,
        [membership.workspaceId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_invites
         WHERE workspace_id = $1
           AND status = 'pending'`,
        [membership.workspaceId],
      ),
    ]);

    const workspace = workspaceRows.rows[0];
    const owner = ownerRows.rows[0];
    if (!workspace || !owner) return null;

    return buildWorkspaceAccess({
      user,
      context: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        role: membership.role,
        owner: {
          id: owner.id,
          email: owner.email,
          displayName: owner.display_name,
          subscription: owner.subscription,
          billingStatus: owner.billing_status,
          currentPeriodEnd: owner.current_period_end ? toIso(owner.current_period_end) : null,
          cancelAtPeriodEnd: owner.cancel_at_period_end,
        },
        seatsUsed: Number(memberCountRows.rows[0]?.count ?? 0),
        pendingInviteCount: Number(inviteCountRows.rows[0]?.count ?? 0),
      },
    });
  }

  private async buildWorkspaceForUser(userId: string): Promise<TeamWorkspace | null> {
    const { rows } = await this.pool.query<PgWorkspaceMembershipRow>(
      `SELECT m.workspace_id, m.role, m.joined_at, w.name, w.created_at, w.owner_user_id
       FROM team_workspace_members m
       JOIN team_workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       LIMIT 1`,
      [userId],
    );
    const membership = rows[0];
    if (!membership) return null;

    const workspaceId = membership.workspace_id;
    await this.reconcileWorkspaceBillingState(workspaceId);
    const [
      memberRows,
      inviteRows,
      sharedSavedViewRows,
      sharedCaseRows,
      ownerRows,
      compensation,
      recentBillingEvents,
      recentRecoveryOutreach,
      recentMemberRecoveryNotifications,
    ] = await Promise.all([
      this.pool.query<PgWorkspaceMemberRow>(
        `SELECT
           u.id AS user_id,
           u.email,
           u.display_name,
           m.role,
           m.joined_at
         FROM team_workspace_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1
         ORDER BY
           CASE m.role
             WHEN 'owner' THEN 0
             WHEN 'admin' THEN 1
             ELSE 2
           END,
           m.joined_at ASC`,
        [workspaceId],
      ),
      this.pool.query<PgWorkspaceInviteRow>(
        `SELECT
           i.id,
           i.workspace_id,
           w.name AS workspace_name,
           i.email,
         i.role,
         i.status,
         i.created_at,
         i.accepted_at,
         i.revoked_reason,
         i.revoked_at
         FROM team_workspace_invites i
         JOIN team_workspaces w ON w.id = i.workspace_id
         WHERE i.workspace_id = $1
           AND i.status = 'pending'
         ORDER BY i.created_at DESC`,
        [workspaceId],
      ),
      this.pool.query<PgWorkspaceSavedViewRow>(
        `SELECT
           v.id,
           v.name,
           v.filters,
           v.query_string,
           v.case_count_snapshot,
           v.created_at,
           v.updated_at,
           s.saved_view_id AS source_saved_view_id,
           s.shared_by_user_id,
           u.display_name AS shared_by_name,
           s.created_at AS shared_at
         FROM team_workspace_saved_views s
         JOIN user_saved_views v ON v.id = s.saved_view_id
         JOIN users u ON u.id = s.shared_by_user_id
         WHERE s.workspace_id = $1
         ORDER BY s.created_at DESC`,
        [workspaceId],
      ),
      this.pool.query<PgWorkspaceCaseRow>(
        `SELECT
           c.id,
           c.slug,
           c.company_name,
           c.industry_key,
           c.country_code,
           c.closed_year,
           c.summary,
           c.business_model_key,
           c.founded_year,
           c.total_funding_usd,
           c.primary_failure_reason_key,
           tc.shared_by_user_id,
           u.display_name AS shared_by_name,
           tc.created_at AS shared_at
         FROM team_workspace_cases tc
         JOIN cases c
           ON c.id = tc.case_id
          AND c.published_at IS NOT NULL
         JOIN users u ON u.id = tc.shared_by_user_id
         WHERE tc.workspace_id = $1
         ORDER BY tc.created_at DESC`,
        [workspaceId],
      ),
      this.pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        subscription: UserProfile['subscription'];
        billing_status: UserProfile['billingStatus'];
        current_period_end: Date | string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT
           id,
           email,
           display_name,
           subscription,
           billing_status,
           current_period_end,
           cancel_at_period_end
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [membership.owner_user_id],
      ),
      this.getCompensationSummary(workspaceId),
      this.getRecentBillingEvents(workspaceId),
      membership.role === 'owner' ? this.getRecentRecoveryOutreach(workspaceId, 'owner') : [],
      membership.role === 'owner' ? this.getRecentMemberRecoveryNotifications(workspaceId) : [],
    ]);

    const owner = ownerRows.rows[0];
    if (!owner) return null;

    const mappedRecentBillingEvents = recentBillingEvents.map(
      ({ workspaceId: _workspaceId, workspaceName: _workspaceName, ...event }) => event,
    );

    return {
      id: workspaceId,
      name: membership.name,
      role: membership.role,
      canManageMembers: membership.role === 'owner' || membership.role === 'admin',
      memberCount: memberRows.rows.length,
      sharedSavedViewCount: sharedSavedViewRows.rows.length,
      sharedCaseCount: sharedCaseRows.rows.length,
      createdAt: toIso(membership.created_at),
      billing: buildWorkspaceBilling({
        owner: {
          id: owner.id,
          email: owner.email,
          displayName: owner.display_name,
          subscription: owner.subscription,
          billingStatus: owner.billing_status,
          currentPeriodEnd: owner.current_period_end ? toIso(owner.current_period_end) : null,
          cancelAtPeriodEnd: owner.cancel_at_period_end,
        },
        seatsUsed: memberRows.rows.length,
        pendingInviteCount: inviteRows.rows.length,
        compensation,
        viewerRole: membership.role,
        recentBillingEvents: mappedRecentBillingEvents,
      }),
      recentBillingEvents: mappedRecentBillingEvents,
      recentRecoveryOutreach:
        membership.role === 'owner'
          ? recentRecoveryOutreach.map(
              ({ workspaceId: _workspaceId, workspaceName: _workspaceName, ...event }) => event,
            )
          : [],
      recentMemberRecoveryNotifications,
      members: memberRows.rows.map(rowToMember),
      invites: inviteRows.rows.map(rowToInvite),
      sharedSavedViews: sharedSavedViewRows.rows.map(rowToSharedSavedView),
      sharedCases: sharedCaseRows.rows.map(rowToSharedCase),
    };
  }
}
