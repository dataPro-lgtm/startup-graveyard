import { COMPENSATION_REASONS, DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS } from './contract.js';
import type { WorkspaceSharedSavedViewRecord, WorkspaceSharedCaseRecord } from './contract.js';
import type {
  AdminActionableWorkspace,
  AdminBillingEvent,
  AdminRecoveryAction,
  AdminRecoveryOutreach,
  ManageRole,
  PendingMemberRecoveryNotificationTarget,
  TeamWorkspacesRepository,
  WorkspaceBillingEventDescriptor,
  WorkspaceBillingSnapshot,
  WorkspaceCompensationSummary,
  WorkspaceInviteRecord,
  WorkspaceInviteRevocationReason,
  WorkspaceMemberRecoveryNotificationDescriptor,
  WorkspaceMembershipRecord,
  WorkspaceReconcileResult,
  WorkspaceRecord,
  WorkspaceRecoveryOutreachDescriptor,
} from './contract.js';
import {
  accumulateRecoveryActions,
  applyWorkspaceAccess,
  billingSnapshotFromBilling,
  buildBillingEventDescriptors,
  buildMemberRecoveryNotificationDescriptor,
  buildRecoveryOutreachDescriptors,
  buildWorkspaceAccess,
  buildWorkspaceBilling,
  hasOwnerRecoveryEngagement,
  nextRecoveryOutreachAttemptAt,
  summarizeMemberRecoveryNotifications,
  toAdminActionableWorkspace,
} from './helpers.js';
import { randomUUID } from 'node:crypto';
import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import type { UserProfile, WorkspaceAccess } from '@sg/shared/schemas/auth';
import { resolveTeamWorkspaceSeatLimit } from '@sg/shared/billing';
import type {
  TeamWorkspaceBillingRecoveryActionCode,
  TeamWorkspaceBillingEvent,
  TeamWorkspaceRecoveryOutreach,
  TeamWorkspaceRecoveryOutreachAudience,
  TeamWorkspaceRecoveryOutreachHandoffChannel,
  TeamWorkspaceRecoveryPlaybookRun,
  TeamWorkspaceRecoveryPlaybookStepName,
  TeamWorkspaceRecoveryPlaybookSteps,
  TeamWorkspace,
  TeamWorkspaceContextResponse,
  TeamWorkspaceInvite,
  TeamWorkspaceMemberRecoveryNotification,
  TeamWorkspaceMember,
  TeamWorkspaceSharedCase,
  TeamWorkspaceSharedSavedView,
} from '@sg/shared/schemas/teamWorkspace';
import type { CasesRepository } from '../casesRepository.js';
import type { BillingFunnelRepository } from '../billingFunnelRepository.js';
import type { SavedViewsRepository } from '../savedViewsRepository.js';
import type { UsersRepository } from '../usersRepository.js';
import { config } from '../../config/index.js';

export class MockTeamWorkspacesRepository implements TeamWorkspacesRepository {
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly membershipByUserId = new Map<string, WorkspaceMembershipRecord>();
  private readonly invites = new Map<
    string,
    WorkspaceInviteRecord & {
      revokedReason?: WorkspaceInviteRevocationReason | null;
      revokedAt?: string | null;
    }
  >();
  private readonly billingEvents: AdminBillingEvent[] = [];
  private readonly recoveryOutreach: AdminRecoveryOutreach[] = [];
  private readonly recoveryPlaybookRuns: TeamWorkspaceRecoveryPlaybookRun[] = [];
  private readonly memberRecoveryNotifications: Array<
    TeamWorkspaceMemberRecoveryNotification & { workspaceId: string; workspaceName: string }
  > = [];
  private readonly billingStateByWorkspaceId = new Map<string, WorkspaceBillingSnapshot>();
  private readonly sharedSavedViews: WorkspaceSharedSavedViewRecord[] = [];
  private readonly sharedCases: WorkspaceSharedCaseRecord[] = [];

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly savedViewsRepo: SavedViewsRepository,
    private readonly casesRepo: CasesRepository,
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
      pendingInvites: workspace ? [] : this.getPendingInvitesForEmail(user.email),
    };
  }

  async reconcileBillingForUser(
    userId: string,
  ): Promise<{ workspaceIds: string[]; revokedInviteCount: number }> {
    const workspaceIds = [...this.workspaces.values()]
      .filter((workspace) => workspace.ownerUserId === userId)
      .map((workspace) => workspace.id);
    let revokedInviteCount = 0;
    for (const workspaceId of workspaceIds) {
      const result = await this.reconcileWorkspaceBillingState(workspaceId);
      revokedInviteCount += result.revokedInviteCount;
    }
    return { workspaceIds, revokedInviteCount };
  }

  async reconcileAllBilling(): Promise<{
    workspaceCount: number;
    revokedInviteCount: number;
    restoredInviteCount: number;
  }> {
    const workspaceIds = [...this.workspaces.values()].map((workspace) => workspace.id);
    let revokedInviteCount = 0;
    let restoredInviteCount = 0;
    for (const workspaceId of workspaceIds) {
      const result = await this.reconcileWorkspaceBillingState(workspaceId);
      revokedInviteCount += result.revokedInviteCount;
      restoredInviteCount += result.restoredInviteCount;
    }
    return {
      workspaceCount: workspaceIds.length,
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
    const workspaces = [...this.workspaces.values()];
    const workspaceIds = workspaces.map((workspace) => workspace.id);
    const latestCommercialTouches = await this.billingFunnelRepo.getLatestEventsByUserIds(
      workspaces.map((workspace) => workspace.ownerUserId),
    );
    const latestCommercialTouchByOwnerId = new Map(
      latestCommercialTouches.map((touch) => [touch.userId, touch]),
    );
    let ownerOutreachCreated = 0;
    let adminOutreachCreated = 0;
    let retriedOutreachCount = 0;
    let resolvedOutreachCount = 0;

    for (const workspaceId of workspaceIds) {
      await this.reconcileWorkspaceBillingState(workspaceId);
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) continue;
      const owner = await this.usersRepo.getById(workspace.ownerUserId);
      if (!owner) continue;
      const seatsUsed = [...this.membershipByUserId.values()].filter(
        (item) => item.workspaceId === workspaceId,
      ).length;
      const pendingInviteCount = [...this.invites.values()].filter(
        (invite) => invite.workspaceId === workspaceId && invite.status === 'pending',
      ).length;
      const compensation = this.getCompensationSummary(workspaceId);
      const billing = buildWorkspaceBilling({
        owner,
        seatsUsed,
        pendingInviteCount,
        compensation,
        viewerRole: 'owner',
        recentBillingEvents: this.getRecentBillingEvents(workspaceId),
      });
      const descriptors = buildRecoveryOutreachDescriptors({
        workspaceName: workspace.name,
        billing,
      });
      const memberDescriptor = buildMemberRecoveryNotificationDescriptor({
        workspaceName: workspace.name,
        ownerDisplayName: owner.displayName,
        ownerEmail: owner.email,
        billing,
      });
      const fallbackMembers = (
        await Promise.all(
          [...this.membershipByUserId.entries()]
            .filter(
              ([, membership]) =>
                membership.workspaceId === workspaceId && membership.role !== 'owner',
            )
            .map(async ([userId]) => {
              const user = await this.usersRepo.getById(userId);
              if (!user) return null;
              return {
                userId,
                email: user.email,
                displayName: user.displayName,
              };
            }),
        )
      ).filter(
        (
          item,
        ): item is {
          userId: string;
          email: string;
          displayName: string | null;
        } => item !== null,
      );
      const ownerDescriptor = descriptors.find((item) => item.audience === 'owner') ?? null;
      const adminDescriptor = descriptors.find((item) => item.audience === 'admin') ?? null;
      const ownerTouch = latestCommercialTouchByOwnerId.get(workspace.ownerUserId);
      if (hasOwnerRecoveryEngagement(ownerTouch)) {
        resolvedOutreachCount += this.resolvePendingRecoveryOutreach(workspaceId, 'owner');
      } else {
        ownerOutreachCreated += this.ensurePendingRecoveryOutreach(
          workspaceId,
          workspace.name,
          ownerDescriptor,
          retryIntervalHours,
        );
        retriedOutreachCount += this.retryPendingRecoveryOutreach(
          workspaceId,
          ownerDescriptor,
          retryIntervalHours,
        );
      }
      adminOutreachCreated += this.ensurePendingRecoveryOutreach(
        workspaceId,
        workspace.name,
        adminDescriptor,
        retryIntervalHours,
      );
      retriedOutreachCount += this.retryPendingRecoveryOutreach(
        workspaceId,
        adminDescriptor,
        retryIntervalHours,
      );
      if (!ownerDescriptor) {
        resolvedOutreachCount += this.resolvePendingRecoveryOutreach(workspaceId, 'owner');
      }
      if (!adminDescriptor) {
        resolvedOutreachCount += this.resolvePendingRecoveryOutreach(workspaceId, 'admin');
      }
      this.syncPendingMemberRecoveryNotifications(
        workspaceId,
        workspace.name,
        fallbackMembers,
        memberDescriptor,
      );
    }

    return {
      workspaceCount: workspaceIds.length,
      ownerOutreachCreated,
      adminOutreachCreated,
      retriedOutreachCount,
      resolvedOutreachCount,
    };
  }

  async getAdminMetrics(): Promise<TeamWorkspaceAdminMetrics> {
    const workspaces = [...this.workspaces.values()];
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
    const actionableWorkspaces: AdminActionableWorkspace[] = [];
    const recoveryActionCounts = new Map<
      TeamWorkspaceBillingRecoveryActionCode,
      AdminRecoveryAction
    >();

    for (const workspace of workspaces) {
      await this.reconcileWorkspaceBillingState(workspace.id);
      const owner = await this.usersRepo.getById(workspace.ownerUserId);
      if (!owner) continue;
      const workspaceSeatsUsed = [...this.membershipByUserId.values()].filter(
        (item) => item.workspaceId === workspace.id,
      ).length;
      const workspacePendingInvites = [...this.invites.values()].filter(
        (invite) => invite.workspaceId === workspace.id && invite.status === 'pending',
      ).length;
      const compensation = this.getCompensationSummary(workspace.id);
      const billing = buildWorkspaceBilling({
        owner,
        seatsUsed: workspaceSeatsUsed,
        pendingInviteCount: workspacePendingInvites,
        compensation,
      });
      const memberNotificationSummary = summarizeMemberRecoveryNotifications(
        this.memberRecoveryNotifications.filter(
          (notification) => notification.workspaceId === workspace.id,
        ),
      );

      totalSeatCapacity += billing.seatLimit;
      seatsUsed += billing.seatsUsed;
      reservedSeats += billing.reservedSeats;
      pendingInvites += workspacePendingInvites;
      revokedInvites += compensation.revokedInviteCount;
      fallbackMembers += billing.fallbackMemberCount;
      const latestOutreach =
        this.recoveryOutreach.find((event) => event.workspaceId === workspace.id) ?? null;
      if (billing.recommendedActions.length > 0) {
        workspacesRequiringAction += 1;
        accumulateRecoveryActions(billing.recommendedActions, recoveryActionCounts);
        actionableWorkspaces.push(
          toAdminActionableWorkspace({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            owner,
            billing,
            pendingInvites: workspacePendingInvites,
            lastBillingEvent: this.getRecentBillingEvents(workspace.id)[0] ?? null,
            lastOutreach: latestOutreach,
            memberRecoveryNotifications: memberNotificationSummary,
          }),
        );
      }
      if (billing.seatLimit > 0) {
        activeWorkspaces += 1;
        inheritedMembers += Math.max(0, billing.seatsUsed - 1);
      }
      if (billing.warningCodes.includes('seat_limit_reached')) fullWorkspaces += 1;
      if (
        billing.warningCodes.some(
          (code) =>
            code === 'workspace_plan_inactive' ||
            code === 'past_due' ||
            code === 'cancel_at_period_end',
        )
      ) {
        atRiskWorkspaces += 1;
      }

      pendingMemberEmail += memberNotificationSummary.pendingCount;
      retryingMemberEmail += memberNotificationSummary.retryingCount;
      deliveredMemberEmail += memberNotificationSummary.deliveredCount;
      failedMemberEmail += memberNotificationSummary.failedCount;
    }

    for (const event of this.recoveryOutreach) {
      if (event.status === 'pending') {
        if (event.attemptCount > 1) multiTouchPending += 1;
        if (event.audience === 'owner') pendingOwnerOutreach += 1;
        else pendingAdminOutreach += 1;
        if (event.audience === 'owner') {
          if (event.lastEmailDeliveredAt) deliveredEmail += 1;
          else if (event.lastEmailError) {
            if (event.nextEmailAttemptAt) retryingEmail += 1;
            else failedEmail += 1;
          } else {
            pendingEmail += 1;
          }
        }
      } else if (event.status === 'handed_off') {
        if (event.exportCount === 0) pendingExport += 1;
        if (event.handoffChannel === 'crm') {
          if (event.lastCrmSyncedAt) syncedCrm += 1;
          else if (event.lastCrmSyncError) {
            failedCrmSync += 1;
            if (event.nextCrmSyncAttemptAt) retryingCrmSync += 1;
          } else {
            pendingCrmSync += 1;
          }
        }
        if (event.webhookDeliveryCount > 0) deliveredWebhook += 1;
        else if (event.webhookExhaustedAt) deadLetteredWebhook += 1;
        else if (event.lastWebhookError) {
          failedWebhook += 1;
          if (event.nextWebhookAttemptAt) retryingWebhook += 1;
        } else pendingWebhook += 1;
        if (event.webhookExhaustedAt) {
          if (event.lastSlackAlertedAt) alertedSlack += 1;
          else if (event.lastSlackAlertError) failedSlackAlert += 1;
          else pendingSlackAlert += 1;
        }
        handedOffOutreach += 1;
      } else {
        resolvedOutreach += 1;
      }
    }

    return {
      totalWorkspaces: workspaces.length,
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
        recent: this.recoveryOutreach.slice(0, 8),
      },
      recoveryPlaybook: {
        totalRuns: this.recoveryPlaybookRuns.length,
        successfulRuns: this.recoveryPlaybookRuns.filter((run) => run.ok).length,
        failedRuns: this.recoveryPlaybookRuns.filter((run) => !run.ok).length,
        scheduledRuns: this.recoveryPlaybookRuns.filter((run) => run.triggerType === 'scheduled')
          .length,
        manualRuns: this.recoveryPlaybookRuns.filter((run) => run.triggerType !== 'scheduled')
          .length,
        lastRunAt: this.recoveryPlaybookRuns[0]?.createdAt ?? null,
        lastRunOk: this.recoveryPlaybookRuns[0]?.ok ?? null,
        recent: this.recoveryPlaybookRuns.slice(0, 8),
      },
      recentBillingEvents: this.billingEvents.slice(0, 8),
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
    return this.recoveryPlaybookRuns.slice(0, limit);
  }

  async getRecoveryPlaybookRunById(
    runId: string,
  ): Promise<TeamWorkspaceRecoveryPlaybookRun | null> {
    return this.recoveryPlaybookRuns.find((run) => run.id === runId) ?? null;
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
    const run: TeamWorkspaceRecoveryPlaybookRun = {
      id: randomUUID(),
      triggerType: input.triggerType,
      retryIntervalHours: input.retryIntervalHours,
      force: input.force,
      requestedSteps: [...input.requestedSteps],
      rerunOfRunId: input.rerunOfRunId ?? null,
      ok: input.ok,
      summary: input.summary,
      steps: input.steps,
      createdAt,
    };
    this.recoveryPlaybookRuns.unshift(run);
    return run;
  }

  async handoffAdminRecoveryOutreach(input: {
    workspaceId: string;
    channel: TeamWorkspaceRecoveryOutreachHandoffChannel;
    snoozeHours: number;
    note?: string | null;
  }): Promise<'workspace_not_found' | 'outreach_not_found' | { ok: true }> {
    const workspace = this.workspaces.get(input.workspaceId);
    if (!workspace) return 'workspace_not_found';
    const now = new Date().toISOString();
    const nextAttemptAt = nextRecoveryOutreachAttemptAt(now, input.snoozeHours);
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (event.workspaceId !== input.workspaceId || event.audience !== 'admin') continue;
      if (event.status === 'resolved') continue;
      this.recoveryOutreach[index] = {
        ...event,
        status: 'handed_off',
        lastAttemptAt: now,
        nextAttemptAt,
        emailAttemptCount: 0,
        lastEmailAttemptAt: null,
        nextEmailAttemptAt: now,
        lastEmailDeliveredAt: null,
        lastEmailMessageId: null,
        lastEmailError: null,
        exportCount: 0,
        lastExportedAt: null,
        crmSyncCount: 0,
        lastCrmSyncAttemptAt: null,
        nextCrmSyncAttemptAt: now,
        lastCrmSyncedAt: null,
        crmExternalRecordId: null,
        lastCrmSyncStatusCode: null,
        lastCrmSyncError: null,
        webhookAttemptCount: 0,
        lastWebhookAttemptAt: null,
        nextWebhookAttemptAt: now,
        webhookExhaustedAt: null,
        webhookDeliveryCount: 0,
        lastWebhookDeliveredAt: null,
        lastWebhookStatusCode: null,
        lastWebhookError: null,
        slackAlertCount: 0,
        lastSlackAlertAttemptAt: null,
        lastSlackAlertedAt: null,
        lastSlackAlertStatusCode: null,
        lastSlackAlertError: null,
        handoffChannel: input.channel,
        handoffNote: input.note?.trim() || null,
        handoffAt: now,
      };
      return { ok: true };
    }
    return 'outreach_not_found';
  }

  async exportHandedOffAdminRecoveryOutreach(): Promise<{ exportedCount: number }> {
    const now = new Date().toISOString();
    let exportedCount = 0;
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (event.audience !== 'admin' || event.status !== 'handed_off') continue;
      this.recoveryOutreach[index] = {
        ...event,
        exportCount: event.exportCount + 1,
        lastExportedAt: now,
      };
      exportedCount += 1;
    }
    return { exportedCount };
  }

  async listPendingMemberRecoveryNotifications(): Promise<
    PendingMemberRecoveryNotificationTarget[]
  > {
    const targets = await Promise.all(
      this.memberRecoveryNotifications.map(async (notification) => {
        if (notification.status !== 'pending') return null;
        const workspace = this.workspaces.get(notification.workspaceId);
        if (!workspace) return null;
        const owner = await this.usersRepo.getById(workspace.ownerUserId);
        if (!owner) return null;
        return {
          notificationId: notification.id,
          workspaceId: notification.workspaceId,
          workspaceName: notification.workspaceName,
          userId: notification.userId,
          email: notification.email,
          displayName: notification.displayName,
          ownerDisplayName: owner.displayName,
          ownerEmail: owner.email,
          subscription: owner.subscription,
          billingStatus: owner.billingStatus,
          title: notification.title,
          detail: notification.detail,
          emailAttemptCount: notification.emailAttemptCount,
          lastEmailAttemptAt: notification.lastEmailAttemptAt,
          nextEmailAttemptAt: notification.nextEmailAttemptAt,
          lastEmailDeliveredAt: notification.lastEmailDeliveredAt,
          lastEmailMessageId: notification.lastEmailMessageId,
          lastEmailError: notification.lastEmailError,
        } satisfies PendingMemberRecoveryNotificationTarget;
      }),
    );
    return targets.filter((item): item is PendingMemberRecoveryNotificationTarget => item !== null);
  }

  async recordPendingOwnerRecoveryOutreachEmailDelivery(input: {
    workspaceIds: string[];
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    messageIdByWorkspaceId?: Record<string, string | null | undefined>;
  }): Promise<{ deliveredCount: number }> {
    const workspaceIds = new Set(input.workspaceIds);
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const deliveredAt = input.deliveredAt ?? attemptedAt;
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    let deliveredCount = 0;
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (!workspaceIds.has(event.workspaceId)) continue;
      if (event.audience !== 'owner' || event.status !== 'pending') continue;
      this.recoveryOutreach[index] = input.error
        ? {
            ...event,
            emailAttemptCount: event.emailAttemptCount + 1,
            lastEmailAttemptAt: attemptedAt,
            nextEmailAttemptAt: nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            lastEmailError: input.error,
          }
        : {
            ...event,
            emailAttemptCount: event.emailAttemptCount + 1,
            lastEmailAttemptAt: attemptedAt,
            nextEmailAttemptAt: null,
            lastEmailDeliveredAt: deliveredAt,
            lastEmailMessageId:
              input.messageIdByWorkspaceId?.[event.workspaceId] ?? event.lastEmailMessageId,
            lastEmailError: null,
          };
      if (!input.error) deliveredCount += 1;
    }
    return { deliveredCount };
  }

  async recordPendingMemberRecoveryNotificationEmailDelivery(input: {
    notificationIds: string[];
    error: string | null;
    attemptedAt?: string;
    deliveredAt?: string;
    retryIntervalHours?: number;
    messageIdByNotificationId?: Record<string, string | null | undefined>;
  }): Promise<{ deliveredCount: number }> {
    const notificationIds = new Set(input.notificationIds);
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const deliveredAt = input.deliveredAt ?? attemptedAt;
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    let deliveredCount = 0;
    for (let index = 0; index < this.memberRecoveryNotifications.length; index += 1) {
      const notification = this.memberRecoveryNotifications[index]!;
      if (!notificationIds.has(notification.id) || notification.status !== 'pending') continue;
      this.memberRecoveryNotifications[index] = input.error
        ? {
            ...notification,
            emailAttemptCount: notification.emailAttemptCount + 1,
            lastEmailAttemptAt: attemptedAt,
            nextEmailAttemptAt: nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            lastEmailError: input.error,
          }
        : {
            ...notification,
            emailAttemptCount: notification.emailAttemptCount + 1,
            lastEmailAttemptAt: attemptedAt,
            nextEmailAttemptAt: null,
            lastEmailDeliveredAt: deliveredAt,
            lastEmailMessageId:
              input.messageIdByNotificationId?.[notification.id] ?? notification.lastEmailMessageId,
            lastEmailError: null,
          };
      if (!input.error) deliveredCount += 1;
    }
    return { deliveredCount };
  }

  async recordDeadLetteredAdminRecoveryOutreachSlackAlert(input: {
    workspaceIds: string[];
    statusCode: number | null;
    error: string | null;
    attemptedAt?: string;
    alertedAt?: string;
  }): Promise<{ alertedCount: number }> {
    const workspaceIds = new Set(input.workspaceIds);
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const alertedAt = input.alertedAt ?? attemptedAt;
    let alertedCount = 0;
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (!workspaceIds.has(event.workspaceId)) continue;
      if (
        event.audience !== 'admin' ||
        event.status !== 'handed_off' ||
        event.webhookExhaustedAt == null
      ) {
        continue;
      }
      this.recoveryOutreach[index] = input.error
        ? {
            ...event,
            slackAlertCount: event.slackAlertCount + 1,
            lastSlackAlertAttemptAt: attemptedAt,
            lastSlackAlertStatusCode: input.statusCode,
            lastSlackAlertError: input.error,
          }
        : {
            ...event,
            slackAlertCount: event.slackAlertCount + 1,
            lastSlackAlertAttemptAt: attemptedAt,
            lastSlackAlertedAt: alertedAt,
            lastSlackAlertStatusCode: input.statusCode,
            lastSlackAlertError: null,
          };
      if (!input.error) alertedCount += 1;
    }
    return { alertedCount };
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
    const workspaceIds = new Set(input.workspaceIds);
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const syncedAt = input.syncedAt ?? attemptedAt;
    const retryIntervalHours = Math.max(
      0,
      input.retryIntervalHours ?? DEFAULT_RECOVERY_OUTREACH_RETRY_HOURS,
    );
    let syncedCount = 0;
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (!workspaceIds.has(event.workspaceId)) continue;
      if (
        event.audience !== 'admin' ||
        event.status !== 'handed_off' ||
        event.handoffChannel !== 'crm'
      ) {
        continue;
      }
      this.recoveryOutreach[index] = input.error
        ? {
            ...event,
            crmSyncCount: event.crmSyncCount + 1,
            lastCrmSyncAttemptAt: attemptedAt,
            nextCrmSyncAttemptAt: nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            lastCrmSyncStatusCode: input.statusCode,
            lastCrmSyncError: input.error,
          }
        : {
            ...event,
            crmSyncCount: event.crmSyncCount + 1,
            lastCrmSyncAttemptAt: attemptedAt,
            nextCrmSyncAttemptAt: null,
            lastCrmSyncedAt: syncedAt,
            crmExternalRecordId:
              input.externalRecordIdByWorkspaceId?.[event.workspaceId] ?? event.crmExternalRecordId,
            lastCrmSyncStatusCode: input.statusCode,
            lastCrmSyncError: null,
          };
      if (!input.error) syncedCount += 1;
    }
    return { syncedCount };
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
    const workspaceIds = new Set(input.workspaceIds);
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
    let deliveredCount = 0;
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (!workspaceIds.has(event.workspaceId)) continue;
      if (event.audience !== 'admin' || event.status !== 'handed_off') continue;
      const nextWebhookAttemptCount = event.webhookAttemptCount + 1;
      const webhookExhaustedAt =
        input.error && nextWebhookAttemptCount >= maxAttempts ? attemptedAt : null;
      this.recoveryOutreach[index] = input.error
        ? {
            ...event,
            webhookAttemptCount: nextWebhookAttemptCount,
            lastWebhookAttemptAt: attemptedAt,
            nextWebhookAttemptAt: webhookExhaustedAt
              ? null
              : nextRecoveryOutreachAttemptAt(attemptedAt, retryIntervalHours),
            webhookExhaustedAt,
            lastWebhookStatusCode: input.statusCode,
            lastWebhookError: input.error,
          }
        : {
            ...event,
            webhookAttemptCount: nextWebhookAttemptCount,
            lastWebhookAttemptAt: attemptedAt,
            nextWebhookAttemptAt: null,
            webhookExhaustedAt: null,
            webhookDeliveryCount: event.webhookDeliveryCount + 1,
            lastWebhookDeliveredAt: deliveredAt,
            lastWebhookStatusCode: input.statusCode,
            lastWebhookError: null,
            slackAlertCount: 0,
            lastSlackAlertAttemptAt: null,
            lastSlackAlertedAt: null,
            lastSlackAlertStatusCode: null,
            lastSlackAlertError: null,
          };
      if (!input.error) deliveredCount += 1;
    }
    return { deliveredCount };
  }

  async createWorkspace(
    user: UserProfile,
    name: string,
  ): Promise<TeamWorkspace | 'already_in_workspace' | 'entitlement_required'> {
    if (!user.entitlements.canUseTeamWorkspace) return 'entitlement_required';
    if (this.membershipByUserId.has(user.id)) return 'already_in_workspace';

    const workspaceId = randomUUID();
    const createdAt = new Date().toISOString();
    this.workspaces.set(workspaceId, {
      id: workspaceId,
      name,
      ownerUserId: user.id,
      createdAt,
    });
    this.membershipByUserId.set(user.id, {
      workspaceId,
      role: 'owner',
      joinedAt: createdAt,
    });
    return (await this.buildWorkspaceForUser(user.id))!;
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
    const actorMembership = this.membershipByUserId.get(actorUserId);
    if (!actorMembership) return 'workspace_not_found';
    if (actorMembership.role === 'member') return 'forbidden';

    const normalizedEmail = email.trim().toLowerCase();
    const workspaceView = await this.buildWorkspaceForUser(actorUserId);
    if (!workspaceView) return 'workspace_not_found';

    const usersToCheck = await Promise.all(
      [...this.membershipByUserId.keys()].map(async (userId) => this.usersRepo.getById(userId)),
    );
    if (usersToCheck.some((user) => user?.email === normalizedEmail)) {
      return 'user_already_in_workspace';
    }

    if (workspaceView.billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    const workspace = this.workspaces.get(actorMembership.workspaceId)!;
    const existing = [...this.invites.values()].find(
      (invite) =>
        invite.workspaceId === workspace.id &&
        invite.email === normalizedEmail &&
        invite.status === 'pending',
    );
    if (!existing && !workspaceView.billing.canInviteMore) {
      return 'seat_limit_reached';
    }

    const invite: WorkspaceInviteRecord = {
      id: existing?.id ?? randomUUID(),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      email: normalizedEmail,
      role,
      status: 'pending',
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    };
    this.invites.set(invite.id, invite);
    return (await this.buildWorkspaceForUser(actorUserId))!;
  }

  async acceptInvite(
    user: UserProfile,
    inviteId: string,
  ): Promise<
    TeamWorkspace | 'invite_not_found' | 'already_in_workspace' | 'workspace_plan_inactive'
  > {
    if (this.membershipByUserId.has(user.id)) return 'already_in_workspace';
    const invite = this.invites.get(inviteId);
    if (!invite) return 'invite_not_found';
    if (invite.email !== user.email.toLowerCase()) return 'invite_not_found';
    if (invite.status !== 'pending') {
      return invite.revokedReason === 'billing_inactive'
        ? 'workspace_plan_inactive'
        : 'invite_not_found';
    }
    const workspace = this.workspaces.get(invite.workspaceId);
    if (!workspace) return 'invite_not_found';
    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return 'invite_not_found';
    const seatsUsed = [...this.membershipByUserId.values()].filter(
      (item) => item.workspaceId === invite.workspaceId,
    ).length;
    const pendingInviteCount = [...this.invites.values()].filter(
      (item) => item.workspaceId === invite.workspaceId && item.status === 'pending',
    ).length;
    const billing = buildWorkspaceBilling({
      owner,
      seatsUsed,
      pendingInviteCount,
    });
    if (billing.warningCodes.includes('workspace_plan_inactive')) {
      await this.reconcileWorkspaceBillingState(invite.workspaceId);
      return 'workspace_plan_inactive';
    }

    const acceptedAt = new Date().toISOString();
    this.membershipByUserId.set(user.id, {
      workspaceId: invite.workspaceId,
      role: invite.role,
      joinedAt: acceptedAt,
    });

    for (const [id, item] of this.invites.entries()) {
      if (item.email !== user.email.toLowerCase() || item.status !== 'pending') continue;
      this.invites.set(id, {
        ...item,
        status: id === inviteId ? 'accepted' : 'revoked',
        acceptedAt: id === inviteId ? acceptedAt : item.acceptedAt,
        revokedReason: id === inviteId ? null : 'accepted_elsewhere',
        revokedAt: id === inviteId ? null : acceptedAt,
      });
    }

    return (await this.buildWorkspaceForUser(user.id))!;
  }

  async shareSavedView(
    actorUserId: string,
    savedViewId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'saved_view_not_found'
  > {
    const membership = this.membershipByUserId.get(actorUserId);
    if (!membership) return 'workspace_not_found';
    const savedView = await this.savedViewsRepo.getById(actorUserId, savedViewId);
    if (!savedView) return 'saved_view_not_found';

    const exists = this.sharedSavedViews.some(
      (item) => item.workspaceId === membership.workspaceId && item.savedViewId === savedViewId,
    );
    if (!exists) {
      this.sharedSavedViews.unshift({
        workspaceId: membership.workspaceId,
        savedViewId,
        sharedByUserId: actorUserId,
        sharedAt: new Date().toISOString(),
      });
    }
    return {
      status: exists ? 'exists' : 'added',
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
    const membership = this.membershipByUserId.get(actorUserId);
    if (!membership) return 'workspace_not_found';
    if (!(await this.casesRepo.caseExists(caseId))) return 'case_not_found';

    const exists = this.sharedCases.some(
      (item) => item.workspaceId === membership.workspaceId && item.caseId === caseId,
    );
    if (!exists) {
      this.sharedCases.unshift({
        workspaceId: membership.workspaceId,
        caseId,
        sharedByUserId: actorUserId,
        sharedAt: new Date().toISOString(),
      });
    }
    return {
      status: exists ? 'exists' : 'added',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  private getPendingInvitesForEmail(email: string): TeamWorkspaceInvite[] {
    return [...this.invites.values()]
      .filter((invite) => invite.email === email.toLowerCase() && invite.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async reconcilePendingInvitesForEmail(email: string): Promise<void> {
    const workspaceIds = new Set(
      [...this.invites.values()]
        .filter((invite) => invite.email === email.toLowerCase() && invite.status === 'pending')
        .map((invite) => invite.workspaceId),
    );
    for (const workspaceId of workspaceIds) {
      await this.reconcileWorkspaceBillingState(workspaceId);
    }
  }

  private getCompensationSummary(workspaceId: string): WorkspaceCompensationSummary {
    const revokedInviteCount = [...this.invites.values()].filter(
      (invite) =>
        invite.workspaceId === workspaceId &&
        invite.status === 'revoked' &&
        invite.revokedReason != null &&
        COMPENSATION_REASONS.has(invite.revokedReason),
    ).length;
    return { revokedInviteCount };
  }

  private getRecentBillingEvents(workspaceId: string): TeamWorkspaceBillingEvent[] {
    return this.billingEvents
      .filter((event) => event.workspaceId === workspaceId)
      .slice(0, 6)
      .map(({ workspaceId: _workspaceId, workspaceName: _workspaceName, ...event }) => event);
  }

  private getRecentRecoveryOutreach(
    workspaceId: string,
    audience?: TeamWorkspaceRecoveryOutreachAudience,
  ): TeamWorkspaceRecoveryOutreach[] {
    return this.recoveryOutreach
      .filter(
        (event) =>
          event.workspaceId === workspaceId && (audience == null || event.audience === audience),
      )
      .slice(0, 6)
      .map(({ workspaceId: _workspaceId, workspaceName: _workspaceName, ...event }) => event);
  }

  private getRecentMemberRecoveryNotifications(
    workspaceId: string,
  ): TeamWorkspaceMemberRecoveryNotification[] {
    return this.memberRecoveryNotifications
      .filter((notification) => notification.workspaceId === workspaceId)
      .slice(0, 6)
      .map(
        ({ workspaceId: _workspaceId, workspaceName: _workspaceName, ...notification }) =>
          notification,
      );
  }

  private ensurePendingRecoveryOutreach(
    workspaceId: string,
    workspaceName: string,
    descriptor: WorkspaceRecoveryOutreachDescriptor | null,
    retryIntervalHours: number,
  ): number {
    if (!descriptor) return 0;
    const exists = this.recoveryOutreach.some(
      (event) =>
        event.workspaceId === workspaceId &&
        event.audience === descriptor.audience &&
        (event.status === 'pending' ||
          (event.status === 'handed_off' &&
            event.nextAttemptAt != null &&
            new Date(event.nextAttemptAt).getTime() > Date.now())),
    );
    if (exists) return 0;
    this.recoveryOutreach.unshift({
      id: randomUUID(),
      workspaceId,
      workspaceName,
      audience: descriptor.audience,
      channel: descriptor.channel,
      status: 'pending',
      title: descriptor.title,
      detail: descriptor.detail,
      actionCode: descriptor.actionCode,
      attemptCount: 1,
      createdAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      nextAttemptAt: nextRecoveryOutreachAttemptAt(new Date().toISOString(), retryIntervalHours),
      emailAttemptCount: 0,
      lastEmailAttemptAt: null,
      nextEmailAttemptAt: new Date().toISOString(),
      lastEmailDeliveredAt: null,
      lastEmailMessageId: null,
      lastEmailError: null,
      exportCount: 0,
      lastExportedAt: null,
      crmSyncCount: 0,
      lastCrmSyncAttemptAt: null,
      nextCrmSyncAttemptAt: new Date().toISOString(),
      lastCrmSyncedAt: null,
      crmExternalRecordId: null,
      lastCrmSyncStatusCode: null,
      lastCrmSyncError: null,
      webhookAttemptCount: 0,
      lastWebhookAttemptAt: null,
      nextWebhookAttemptAt: new Date().toISOString(),
      webhookExhaustedAt: null,
      webhookDeliveryCount: 0,
      lastWebhookDeliveredAt: null,
      lastWebhookStatusCode: null,
      lastWebhookError: null,
      slackAlertCount: 0,
      lastSlackAlertAttemptAt: null,
      lastSlackAlertedAt: null,
      lastSlackAlertStatusCode: null,
      lastSlackAlertError: null,
      handoffChannel: null,
      handoffNote: null,
      handoffAt: null,
      resolvedAt: null,
    });
    if (this.recoveryOutreach.length > 64) {
      this.recoveryOutreach.length = 64;
    }
    return 1;
  }

  private retryPendingRecoveryOutreach(
    workspaceId: string,
    descriptor: WorkspaceRecoveryOutreachDescriptor | null,
    retryIntervalHours: number,
  ): number {
    if (!descriptor) return 0;
    const now = new Date().toISOString();
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (event.workspaceId !== workspaceId || event.audience !== descriptor.audience) continue;
      if (event.status !== 'pending') return 0;
      const dueAt = nextRecoveryOutreachAttemptAt(event.lastAttemptAt, retryIntervalHours);
      if (new Date(dueAt).getTime() > Date.now()) return 0;
      this.recoveryOutreach[index] = {
        ...event,
        channel: descriptor.channel,
        status: 'pending',
        title: descriptor.title,
        detail: descriptor.detail,
        actionCode: descriptor.actionCode,
        attemptCount: event.attemptCount + 1,
        lastAttemptAt: now,
        nextAttemptAt: nextRecoveryOutreachAttemptAt(now, retryIntervalHours),
        emailAttemptCount: 0,
        lastEmailAttemptAt: null,
        nextEmailAttemptAt: now,
        lastEmailDeliveredAt: null,
        lastEmailMessageId: null,
        lastEmailError: null,
        exportCount: 0,
        lastExportedAt: null,
        crmSyncCount: 0,
        lastCrmSyncAttemptAt: null,
        nextCrmSyncAttemptAt: now,
        lastCrmSyncedAt: null,
        crmExternalRecordId: null,
        lastCrmSyncStatusCode: null,
        lastCrmSyncError: null,
        webhookAttemptCount: 0,
        lastWebhookAttemptAt: null,
        nextWebhookAttemptAt: now,
        webhookExhaustedAt: null,
        webhookDeliveryCount: 0,
        lastWebhookDeliveredAt: null,
        lastWebhookStatusCode: null,
        lastWebhookError: null,
        slackAlertCount: 0,
        lastSlackAlertAttemptAt: null,
        lastSlackAlertedAt: null,
        lastSlackAlertStatusCode: null,
        lastSlackAlertError: null,
        handoffChannel: null,
        handoffNote: null,
        handoffAt: null,
      };
      return 1;
    }
    return 0;
  }

  private resolvePendingRecoveryOutreach(
    workspaceId: string,
    audience?: TeamWorkspaceRecoveryOutreachAudience,
  ): number {
    let resolved = 0;
    const resolvedAt = new Date().toISOString();
    for (let index = 0; index < this.recoveryOutreach.length; index += 1) {
      const event = this.recoveryOutreach[index]!;
      if (event.workspaceId !== workspaceId || event.status === 'resolved') continue;
      if (audience != null && event.audience !== audience) continue;
      this.recoveryOutreach[index] = {
        ...event,
        status: 'resolved',
        nextAttemptAt: null,
        nextEmailAttemptAt: null,
        nextWebhookAttemptAt: null,
        webhookExhaustedAt: null,
        lastSlackAlertError: null,
        resolvedAt,
      };
      resolved += 1;
    }
    return resolved;
  }

  private syncPendingMemberRecoveryNotifications(
    workspaceId: string,
    workspaceName: string,
    members: Array<{ userId: string; email: string; displayName: string | null }>,
    descriptor: WorkspaceMemberRecoveryNotificationDescriptor | null,
  ) {
    const resolvedAt = new Date().toISOString();
    const activeUserIds = descriptor
      ? new Set(members.map((member) => member.userId))
      : new Set<string>();
    for (let index = 0; index < this.memberRecoveryNotifications.length; index += 1) {
      const notification = this.memberRecoveryNotifications[index]!;
      if (notification.workspaceId !== workspaceId || notification.status !== 'pending') continue;
      const member = members.find((item) => item.userId === notification.userId) ?? null;
      if (!descriptor || !activeUserIds.has(notification.userId) || !member) {
        this.memberRecoveryNotifications[index] = {
          ...notification,
          status: 'resolved',
          nextEmailAttemptAt: null,
          resolvedAt,
        };
        continue;
      }
      this.memberRecoveryNotifications[index] = {
        ...notification,
        workspaceName,
        email: member.email,
        displayName: member.displayName,
        title: descriptor.title,
        detail: descriptor.detail,
      };
    }
    if (!descriptor) return;
    for (const member of members) {
      const exists = this.memberRecoveryNotifications.some(
        (notification) =>
          notification.workspaceId === workspaceId &&
          notification.userId === member.userId &&
          notification.status === 'pending',
      );
      if (exists) continue;
      this.memberRecoveryNotifications.unshift({
        id: randomUUID(),
        workspaceId,
        workspaceName,
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
        status: 'pending',
        title: descriptor.title,
        detail: descriptor.detail,
        emailAttemptCount: 0,
        createdAt: resolvedAt,
        lastEmailAttemptAt: null,
        nextEmailAttemptAt: resolvedAt,
        lastEmailDeliveredAt: null,
        lastEmailMessageId: null,
        lastEmailError: null,
        resolvedAt: null,
      });
    }
    if (this.memberRecoveryNotifications.length > 128) {
      this.memberRecoveryNotifications.length = 128;
    }
  }

  private recordBillingEvents(
    workspaceId: string,
    workspaceName: string,
    descriptors: WorkspaceBillingEventDescriptor[],
  ) {
    const createdAt = new Date().toISOString();
    for (const descriptor of descriptors) {
      this.billingEvents.unshift({
        id: randomUUID(),
        workspaceId,
        workspaceName,
        ...descriptor,
        createdAt,
      });
    }
    if (this.billingEvents.length > 64) {
      this.billingEvents.length = 64;
    }
  }

  private async reconcileWorkspaceBillingState(
    workspaceId: string,
  ): Promise<WorkspaceReconcileResult> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return { revokedInviteCount: 0, restoredInviteCount: 0 };
    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return { revokedInviteCount: 0, restoredInviteCount: 0 };

    const seatsUsed = [...this.membershipByUserId.values()].filter(
      (item) => item.workspaceId === workspaceId,
    ).length;
    const pendingInvites = [...this.invites.values()]
      .filter((invite) => invite.workspaceId === workspaceId && invite.status === 'pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const seatLimit = resolveTeamWorkspaceSeatLimit({
      subscription: owner.subscription,
      billingStatus: owner.billingStatus,
    });
    const allowedPendingInvites = Math.max(0, seatLimit - seatsUsed);
    const revokeReason: WorkspaceInviteRevocationReason =
      seatLimit === 0 ? 'billing_inactive' : 'seat_limit_reduced';
    const invitesToRevoke = pendingInvites.slice(allowedPendingInvites);
    const revokedAt = new Date().toISOString();
    if (invitesToRevoke.length > 0) {
      for (const invite of invitesToRevoke) {
        this.invites.set(invite.id, {
          ...invite,
          status: 'revoked',
          revokedReason: revokeReason,
          revokedAt,
          acceptedAt: null,
        });
      }
    }
    const remainingPendingInvites = Math.max(0, pendingInvites.length - invitesToRevoke.length);
    const recoverableInvites = [...this.invites.values()]
      .filter(
        (invite) =>
          invite.workspaceId === workspaceId &&
          invite.status === 'revoked' &&
          invite.revokedReason != null &&
          COMPENSATION_REASONS.has(invite.revokedReason),
      )
      .sort((a, b) => {
        const revokedAtCompare = (a.revokedAt ?? a.createdAt).localeCompare(
          b.revokedAt ?? b.createdAt,
        );
        return revokedAtCompare !== 0 ? revokedAtCompare : a.createdAt.localeCompare(b.createdAt);
      });
    const invitesToRestore =
      seatLimit > 0
        ? recoverableInvites.slice(0, Math.max(0, allowedPendingInvites - remainingPendingInvites))
        : [];
    if (invitesToRestore.length > 0) {
      for (const invite of invitesToRestore) {
        this.invites.set(invite.id, {
          ...invite,
          status: 'pending',
          revokedReason: null,
          revokedAt: null,
          acceptedAt: null,
        });
      }
    }

    const compensation = this.getCompensationSummary(workspaceId);
    const nextBilling = buildWorkspaceBilling({
      owner,
      seatsUsed,
      pendingInviteCount: remainingPendingInvites + invitesToRestore.length,
      compensation,
    });
    const previousSnapshot = this.billingStateByWorkspaceId.get(workspaceId) ?? null;
    const nextSnapshot = billingSnapshotFromBilling(nextBilling);
    const descriptors = buildBillingEventDescriptors({
      previous: previousSnapshot,
      next: nextSnapshot,
      revokedInviteCount: invitesToRevoke.length,
      restoredInviteCount: invitesToRestore.length,
    });
    this.billingStateByWorkspaceId.set(workspaceId, nextSnapshot);
    if (descriptors.length > 0) {
      this.recordBillingEvents(workspaceId, workspace.name, descriptors);
    }
    return {
      revokedInviteCount: invitesToRevoke.length,
      restoredInviteCount: invitesToRestore.length,
    };
  }

  private async buildWorkspaceAccessForUser(user: UserProfile): Promise<WorkspaceAccess | null> {
    const membership = this.membershipByUserId.get(user.id);
    if (!membership) return null;
    const workspace = this.workspaces.get(membership.workspaceId);
    if (!workspace) return null;
    await this.reconcileWorkspaceBillingState(workspace.id);
    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return null;
    const seatsUsed = [...this.membershipByUserId.values()].filter(
      (item) => item.workspaceId === workspace.id,
    ).length;
    const pendingInviteCount = [...this.invites.values()].filter(
      (invite) => invite.workspaceId === workspace.id && invite.status === 'pending',
    ).length;

    return buildWorkspaceAccess({
      user,
      context: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        role: membership.role,
        owner,
        seatsUsed,
        pendingInviteCount,
      },
    });
  }

  private async buildWorkspaceForUser(userId: string): Promise<TeamWorkspace | null> {
    const membership = this.membershipByUserId.get(userId);
    if (!membership) return null;
    const workspace = this.workspaces.get(membership.workspaceId);
    if (!workspace) return null;
    await this.reconcileWorkspaceBillingState(workspace.id);

    const memberEntries = [...this.membershipByUserId.entries()].filter(
      ([, item]) => item.workspaceId === workspace.id,
    );
    const members = (
      await Promise.all(
        memberEntries.map(async ([memberUserId, item]) => {
          const user = await this.usersRepo.getById(memberUserId);
          if (!user) return null;
          return {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
            role: item.role,
            joinedAt: item.joinedAt,
          } satisfies TeamWorkspaceMember;
        }),
      )
    ).filter((item): item is TeamWorkspaceMember => item !== null);

    const invites = [...this.invites.values()]
      .filter((invite) => invite.workspaceId === workspace.id && invite.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const sharedSavedViews = (
      await Promise.all(
        this.sharedSavedViews
          .filter((item) => item.workspaceId === workspace.id)
          .map(async (entry) => {
            const [savedView, sharedBy] = await Promise.all([
              this.savedViewsRepo.getById(entry.sharedByUserId, entry.savedViewId),
              this.usersRepo.getById(entry.sharedByUserId),
            ]);
            if (!savedView) return null;
            return {
              ...savedView,
              sourceSavedViewId: entry.savedViewId,
              sharedByUserId: entry.sharedByUserId,
              sharedByName: sharedBy?.displayName ?? sharedBy?.email ?? null,
              sharedAt: entry.sharedAt,
            } satisfies TeamWorkspaceSharedSavedView;
          }),
      )
    ).filter((item): item is TeamWorkspaceSharedSavedView => item !== null);

    const caseEntries = this.sharedCases.filter((item) => item.workspaceId === workspace.id);
    const cases = await this.casesRepo.getByIds(caseEntries.map((item) => item.caseId));
    const casesById = new Map(cases.map((item) => [item.id, item]));
    const sharedCases = (
      await Promise.all(
        caseEntries.map(async (entry) => {
          const item = casesById.get(entry.caseId);
          if (!item) return null;
          const sharedBy = await this.usersRepo.getById(entry.sharedByUserId);
          return {
            id: item.id,
            slug: item.slug,
            companyName: item.companyName,
            industry: item.industry,
            country: item.country,
            closedYear: item.closedYear,
            summary: item.summary,
            businessModelKey: item.businessModelKey,
            foundedYear: item.foundedYear,
            totalFundingUsd: item.totalFundingUsd,
            primaryFailureReasonKey: item.primaryFailureReasonKey,
            sharedByUserId: entry.sharedByUserId,
            sharedByName: sharedBy?.displayName ?? sharedBy?.email ?? null,
            sharedAt: entry.sharedAt,
          } satisfies TeamWorkspaceSharedCase;
        }),
      )
    ).filter((item): item is TeamWorkspaceSharedCase => item !== null);

    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return null;
    const compensation = this.getCompensationSummary(workspace.id);

    const recentBillingEvents = this.getRecentBillingEvents(workspace.id);
    const recentRecoveryOutreach =
      membership.role === 'owner' ? this.getRecentRecoveryOutreach(workspace.id, 'owner') : [];
    const recentMemberRecoveryNotifications =
      membership.role === 'owner' ? this.getRecentMemberRecoveryNotifications(workspace.id) : [];

    return {
      id: workspace.id,
      name: workspace.name,
      role: membership.role,
      canManageMembers: membership.role === 'owner' || membership.role === 'admin',
      memberCount: members.length,
      sharedSavedViewCount: sharedSavedViews.length,
      sharedCaseCount: sharedCases.length,
      createdAt: workspace.createdAt,
      billing: buildWorkspaceBilling({
        owner,
        seatsUsed: members.length,
        pendingInviteCount: invites.length,
        compensation,
        viewerRole: membership.role,
        recentBillingEvents,
      }),
      recentBillingEvents,
      recentRecoveryOutreach,
      recentMemberRecoveryNotifications,
      members,
      invites,
      sharedSavedViews,
      sharedCases,
    };
  }
}
