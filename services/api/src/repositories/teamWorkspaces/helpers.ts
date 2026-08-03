import { ALL_RECOVERY_PLAYBOOK_STEP_NAMES } from './contract.js';
import type {
  AdminActionableWorkspace,
  AdminBillingEvent,
  AdminRecoveryAction,
  AdminRecoveryOutreach,
  AdminRecoveryPlaybookRun,
  PgWorkspaceBillingEventRow,
  PgWorkspaceCaseRow,
  PgWorkspaceInviteRow,
  PgWorkspaceMemberRecoveryNotificationRow,
  PgWorkspaceMemberRow,
  PgWorkspaceRecoveryOutreachRow,
  PgWorkspaceRecoveryPlaybookRunRow,
  PgWorkspaceSavedViewRow,
  WorkspaceAccessContext,
  WorkspaceBillingEventDescriptor,
  WorkspaceBillingOwner,
  WorkspaceBillingSnapshot,
  WorkspaceCompensationSummary,
  WorkspaceMemberRecoveryNotificationDescriptor,
  WorkspaceRecoveryOutreachDescriptor,
} from './contract.js';
import type { UserProfile, WorkspaceAccess } from '@sg/shared/schemas/auth';
import {
  resolveEntitlements,
  resolveTeamWorkspaceSeatLimit,
  type BillingStatus,
  type SubscriptionTier,
} from '@sg/shared/billing';
import type {
  TeamWorkspaceBilling,
  TeamWorkspaceBillingRecoveryAction,
  TeamWorkspaceBillingRecoveryActionCode,
  TeamWorkspaceBillingEvent,
  TeamWorkspaceRecoveryPlaybookStepName,
  TeamWorkspaceRecoveryPlaybookSteps,
  TeamWorkspaceBillingWarning,
  TeamWorkspaceInvite,
  TeamWorkspaceMemberRecoveryNotification,
  TeamWorkspaceMember,
  TeamWorkspaceRole,
  TeamWorkspaceSharedCase,
  TeamWorkspaceSharedSavedView,
} from '@sg/shared/schemas/teamWorkspace';
import type { BillingFunnelUserTouch } from '../billingFunnelRepository.js';

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function numberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function rowToInvite(row: PgWorkspaceInviteRow): TeamWorkspaceInvite {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    acceptedAt: row.accepted_at ? toIso(row.accepted_at) : null,
  };
}

export function rowToMember(row: PgWorkspaceMemberRow): TeamWorkspaceMember {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    joinedAt: toIso(row.joined_at),
  };
}

export function rowToSharedSavedView(row: PgWorkspaceSavedViewRow): TeamWorkspaceSharedSavedView {
  return {
    id: row.id,
    name: row.name,
    filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
    queryString: row.query_string,
    caseCount:
      typeof row.case_count_snapshot === 'number'
        ? row.case_count_snapshot
        : Number(row.case_count_snapshot),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    sourceSavedViewId: row.source_saved_view_id,
    sharedByUserId: row.shared_by_user_id,
    sharedByName: row.shared_by_name,
    sharedAt: toIso(row.shared_at),
  };
}

export function rowToSharedCase(row: PgWorkspaceCaseRow): TeamWorkspaceSharedCase {
  return {
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    industry: row.industry_key,
    country: row.country_code,
    closedYear: row.closed_year,
    summary: row.summary,
    businessModelKey: row.business_model_key,
    foundedYear: row.founded_year,
    totalFundingUsd: numberOrNull(row.total_funding_usd),
    primaryFailureReasonKey: row.primary_failure_reason_key,
    sharedByUserId: row.shared_by_user_id,
    sharedByName: row.shared_by_name,
    sharedAt: toIso(row.shared_at),
  };
}

export function buildWorkspaceBilling(input: {
  owner: WorkspaceBillingOwner;
  seatsUsed: number;
  pendingInviteCount: number;
  compensation?: WorkspaceCompensationSummary;
  viewerRole?: TeamWorkspaceRole;
  recentBillingEvents?: Array<Pick<TeamWorkspaceBillingEvent, 'type' | 'count'>>;
}): TeamWorkspaceBilling {
  const seatLimit = resolveTeamWorkspaceSeatLimit({
    subscription: input.owner.subscription,
    billingStatus: input.owner.billingStatus,
  });
  const reservedSeats = input.seatsUsed + input.pendingInviteCount;
  const seatsRemaining = Math.max(0, seatLimit - reservedSeats);
  const fallbackMemberCount = seatLimit === 0 ? Math.max(0, input.seatsUsed - 1) : 0;
  const revokedInviteCount = input.compensation?.revokedInviteCount ?? 0;
  const warningCodes = buildBillingWarnings({
    ownerBillingStatus: input.owner.billingStatus,
    cancelAtPeriodEnd: input.owner.cancelAtPeriodEnd,
    seatLimit,
    reservedSeats,
  });
  const recommendedActions = buildRecoveryActions({
    subscription: input.owner.subscription,
    billingStatus: input.owner.billingStatus,
    warningCodes,
    seatLimit,
    seatsRemaining,
    fallbackMemberCount,
    revokedInviteCount,
  });

  const billing = {
    ownerUserId: input.owner.id,
    ownerDisplayName: input.owner.displayName,
    ownerEmail: input.owner.email,
    subscription: input.owner.subscription,
    billingStatus: input.owner.billingStatus,
    currentPeriodEnd: input.owner.currentPeriodEnd,
    cancelAtPeriodEnd: input.owner.cancelAtPeriodEnd,
    seatLimit,
    seatsUsed: input.seatsUsed,
    reservedSeats,
    seatsRemaining,
    fallbackMemberCount,
    revokedInviteCount,
    canInviteMore: seatLimit > 0 && reservedSeats < seatLimit,
    warningCodes,
    recommendedActions,
  } satisfies Omit<TeamWorkspaceBilling, 'recoveryNotices'>;

  return {
    ...billing,
    recoveryNotices: buildRecoveryNotices({
      viewerRole: input.viewerRole ?? 'owner',
      ownerDisplayName: input.owner.displayName,
      ownerEmail: input.owner.email,
      billing,
      recentBillingEvents: input.recentBillingEvents ?? [],
    }),
  };
}

export function billingSnapshotFromBilling(
  billing: TeamWorkspaceBilling,
): WorkspaceBillingSnapshot {
  return {
    seatLimit: billing.seatLimit,
    billingStatus: billing.billingStatus,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    reservedSeats: billing.reservedSeats,
    fallbackMemberCount: billing.fallbackMemberCount,
  };
}

export function buildBillingEventDescriptors(input: {
  previous: WorkspaceBillingSnapshot | null;
  next: WorkspaceBillingSnapshot;
  revokedInviteCount: number;
  restoredInviteCount: number;
}): WorkspaceBillingEventDescriptor[] {
  const events: WorkspaceBillingEventDescriptor[] = [];
  const prev = input.previous;
  const next = input.next;

  if (!prev) {
    if (input.revokedInviteCount > 0) {
      events.push({
        type: 'invites_auto_revoked',
        severity: 'warning',
        title: '工作区邀请已自动撤销',
        detail: `账单或席位收紧后，系统自动撤销了 ${input.revokedInviteCount} 条待接受邀请。`,
        count: input.revokedInviteCount,
      });
    }
    if (input.restoredInviteCount > 0) {
      events.push({
        type: 'invites_auto_restored',
        severity: 'success',
        title: '工作区邀请已自动恢复',
        detail: `账单或席位恢复后，系统自动恢复了 ${input.restoredInviteCount} 条待接受邀请。`,
        count: input.restoredInviteCount,
      });
    }
    return events;
  }

  if (prev.seatLimit > 0 && next.seatLimit === 0) {
    events.push({
      type: 'workspace_plan_inactive',
      severity: 'critical',
      title: 'Team Workspace 已进入降级状态',
      detail: '账单所有者当前不再具备有效 Team entitlement，团队权限已暂停继承。',
      count: null,
    });
  } else if (prev.seatLimit === 0 && next.seatLimit > 0) {
    events.push({
      type: 'workspace_plan_restored',
      severity: 'success',
      title: 'Team Workspace 已恢复可用',
      detail: '账单所有者重新恢复了有效 Team entitlement，团队权限可以重新继承。',
      count: null,
    });
  } else if (next.seatLimit > 0 && prev.seatLimit > next.seatLimit) {
    events.push({
      type: 'seat_capacity_reduced',
      severity: 'warning',
      title: '团队席位上限已收紧',
      detail: `工作区席位上限从 ${prev.seatLimit} 收紧到 ${next.seatLimit}。`,
      count: next.seatLimit,
    });
  } else if (next.seatLimit > prev.seatLimit && prev.seatLimit > 0) {
    events.push({
      type: 'seat_capacity_restored',
      severity: 'success',
      title: '团队席位容量已恢复',
      detail: `工作区席位上限从 ${prev.seatLimit} 恢复到 ${next.seatLimit}。`,
      count: next.seatLimit,
    });
  }

  if (input.revokedInviteCount > 0) {
    events.push({
      type: 'invites_auto_revoked',
      severity: 'warning',
      title: '工作区邀请已自动撤销',
      detail: `账单或席位收紧后，系统自动撤销了 ${input.revokedInviteCount} 条待接受邀请。`,
      count: input.revokedInviteCount,
    });
  }

  if (input.restoredInviteCount > 0) {
    events.push({
      type: 'invites_auto_restored',
      severity: 'success',
      title: '工作区邀请已自动恢复',
      detail: `账单或席位恢复后，系统自动恢复了 ${input.restoredInviteCount} 条待接受邀请。`,
      count: input.restoredInviteCount,
    });
  }

  if (prev.fallbackMemberCount === 0 && next.fallbackMemberCount > 0) {
    events.push({
      type: 'members_fallback_started',
      severity: 'warning',
      title: '成员权限已回退到个人套餐',
      detail: `${next.fallbackMemberCount} 名成员当前不再继承 Team 权限，已自动回退到各自个人套餐。`,
      count: next.fallbackMemberCount,
    });
  } else if (prev.fallbackMemberCount > 0 && next.fallbackMemberCount === 0) {
    events.push({
      type: 'members_fallback_cleared',
      severity: 'success',
      title: '成员 Team 权限已恢复',
      detail: '此前回退到个人套餐的成员，现在已经重新继承 Team 权限。',
      count: prev.fallbackMemberCount,
    });
  }

  return events;
}

export function rowToBillingEvent(row: PgWorkspaceBillingEventRow): AdminBillingEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    type: row.event_type,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    count: numberOrNull(row.event_count),
    createdAt: toIso(row.created_at),
  };
}

export function rowToRecoveryOutreach(row: PgWorkspaceRecoveryOutreachRow): AdminRecoveryOutreach {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    audience: row.audience,
    channel: row.channel,
    status: row.status,
    title: row.title,
    detail: row.detail,
    actionCode: row.action_code,
    attemptCount: row.attempt_count,
    createdAt: toIso(row.created_at),
    lastAttemptAt: toIso(row.last_attempt_at),
    nextAttemptAt: row.next_attempt_at ? toIso(row.next_attempt_at) : null,
    emailAttemptCount: row.email_attempt_count,
    lastEmailAttemptAt: row.last_email_attempt_at ? toIso(row.last_email_attempt_at) : null,
    nextEmailAttemptAt: row.next_email_attempt_at ? toIso(row.next_email_attempt_at) : null,
    lastEmailDeliveredAt: row.last_email_delivered_at ? toIso(row.last_email_delivered_at) : null,
    lastEmailMessageId: row.last_email_message_id,
    lastEmailError: row.last_email_error,
    exportCount: row.export_count,
    lastExportedAt: row.last_exported_at ? toIso(row.last_exported_at) : null,
    crmSyncCount: row.crm_sync_count,
    lastCrmSyncAttemptAt: row.last_crm_sync_attempt_at ? toIso(row.last_crm_sync_attempt_at) : null,
    nextCrmSyncAttemptAt: row.next_crm_sync_attempt_at ? toIso(row.next_crm_sync_attempt_at) : null,
    lastCrmSyncedAt: row.last_crm_synced_at ? toIso(row.last_crm_synced_at) : null,
    crmExternalRecordId: row.crm_external_record_id,
    lastCrmSyncStatusCode: row.last_crm_sync_status_code,
    lastCrmSyncError: row.last_crm_sync_error,
    webhookAttemptCount: row.webhook_attempt_count,
    lastWebhookAttemptAt: row.last_webhook_attempt_at ? toIso(row.last_webhook_attempt_at) : null,
    nextWebhookAttemptAt: row.next_webhook_attempt_at ? toIso(row.next_webhook_attempt_at) : null,
    webhookExhaustedAt: row.webhook_exhausted_at ? toIso(row.webhook_exhausted_at) : null,
    webhookDeliveryCount: row.webhook_delivery_count,
    lastWebhookDeliveredAt: row.last_webhook_delivered_at
      ? toIso(row.last_webhook_delivered_at)
      : null,
    lastWebhookStatusCode: row.last_webhook_status_code,
    lastWebhookError: row.last_webhook_error,
    slackAlertCount: row.slack_alert_count,
    lastSlackAlertAttemptAt: row.last_slack_alert_attempt_at
      ? toIso(row.last_slack_alert_attempt_at)
      : null,
    lastSlackAlertedAt: row.last_slack_alerted_at ? toIso(row.last_slack_alerted_at) : null,
    lastSlackAlertStatusCode: row.last_slack_alert_status_code,
    lastSlackAlertError: row.last_slack_alert_error,
    handoffChannel: row.handoff_channel,
    handoffNote: row.handoff_note,
    handoffAt: row.handoff_at ? toIso(row.handoff_at) : null,
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  };
}

export function rowToRecoveryPlaybookRun(
  row: PgWorkspaceRecoveryPlaybookRunRow,
): AdminRecoveryPlaybookRun {
  const asRecord = (input: unknown): Record<string, unknown> =>
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const asStringOrNull = (input: unknown): string | null =>
    typeof input === 'string' ? input : null;
  const asNumberOrZero = (input: unknown): number =>
    typeof input === 'number' && Number.isFinite(input) ? input : 0;
  const asNumberOrNull = (input: unknown): number | null =>
    typeof input === 'number' && Number.isFinite(input) ? input : null;
  const normalizeDeliveryStatus = (
    input: unknown,
  ): TeamWorkspaceRecoveryPlaybookSteps['ownerEmail']['status'] =>
    input === 'completed' || input === 'skipped' || input === 'disabled' || input === 'failed'
      ? input
      : 'skipped';
  const normalizeOutreachStatus = (
    input: unknown,
  ): TeamWorkspaceRecoveryPlaybookSteps['outreach']['status'] =>
    input === 'completed' || input === 'skipped' || input === 'failed' ? input : 'completed';
  const rawSteps =
    typeof row.steps === 'string' ? (JSON.parse(row.steps) as Record<string, unknown>) : row.steps;
  const stepsRecord = asRecord(rawSteps);
  const normalizeDeliveryStep = (input: unknown) => {
    const step = asRecord(input);
    return {
      status: normalizeDeliveryStatus(step.status),
      attemptedCount: asNumberOrZero(step.attemptedCount),
      successCount: asNumberOrZero(step.successCount),
      failedCount: asNumberOrZero(step.failedCount),
      skippedReason: asStringOrNull(step.skippedReason),
      error: asStringOrNull(step.error),
      detail: asStringOrNull(step.detail),
      statusCode: asNumberOrNull(step.statusCode),
    };
  };
  const outreachStep = asRecord(stepsRecord.outreach);
  const normalizedSteps: TeamWorkspaceRecoveryPlaybookSteps = {
    outreach: {
      status: normalizeOutreachStatus(outreachStep.status),
      workspaceCount: asNumberOrZero(outreachStep.workspaceCount),
      ownerOutreachCreated: asNumberOrZero(outreachStep.ownerOutreachCreated),
      adminOutreachCreated: asNumberOrZero(outreachStep.adminOutreachCreated),
      retriedOutreachCount: asNumberOrZero(outreachStep.retriedOutreachCount),
      resolvedOutreachCount: asNumberOrZero(outreachStep.resolvedOutreachCount),
      skippedReason: asStringOrNull(outreachStep.skippedReason),
      detail: asStringOrNull(outreachStep.detail),
    },
    ownerEmail: normalizeDeliveryStep(stepsRecord.ownerEmail),
    memberEmail: normalizeDeliveryStep(stepsRecord.memberEmail),
    crmSync: normalizeDeliveryStep(stepsRecord.crmSync),
    webhook: normalizeDeliveryStep(stepsRecord.webhook),
    slack: normalizeDeliveryStep(stepsRecord.slack),
  };
  const requestedSteps = Array.isArray(row.requested_steps)
    ? row.requested_steps.filter((step): step is TeamWorkspaceRecoveryPlaybookStepName =>
        ALL_RECOVERY_PLAYBOOK_STEP_NAMES.includes(step as TeamWorkspaceRecoveryPlaybookStepName),
      )
    : ALL_RECOVERY_PLAYBOOK_STEP_NAMES.slice();
  return {
    id: row.id,
    triggerType: row.trigger_type,
    retryIntervalHours: row.retry_interval_hours,
    force: row.force_run,
    requestedSteps,
    rerunOfRunId: row.rerun_of_run_id,
    ok: row.ok,
    summary: row.summary,
    steps: normalizedSteps,
    createdAt: toIso(row.created_at),
  };
}

export function rowToMemberRecoveryNotification(
  row: PgWorkspaceMemberRecoveryNotificationRow,
): TeamWorkspaceMemberRecoveryNotification {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    title: row.title,
    detail: row.detail,
    emailAttemptCount: row.email_attempt_count,
    createdAt: toIso(row.created_at),
    lastEmailAttemptAt: row.last_email_attempt_at ? toIso(row.last_email_attempt_at) : null,
    nextEmailAttemptAt: row.next_email_attempt_at ? toIso(row.next_email_attempt_at) : null,
    lastEmailDeliveredAt: row.last_email_delivered_at ? toIso(row.last_email_delivered_at) : null,
    lastEmailMessageId: row.last_email_message_id,
    lastEmailError: row.last_email_error,
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  };
}

export function nextRecoveryOutreachAttemptAt(
  lastAttemptAt: string,
  retryIntervalHours: number,
): string {
  return new Date(
    new Date(lastAttemptAt).getTime() + retryIntervalHours * 60 * 60 * 1000,
  ).toISOString();
}

export function buildBillingWarnings(input: {
  ownerBillingStatus: BillingStatus;
  cancelAtPeriodEnd: boolean;
  seatLimit: number;
  reservedSeats: number;
}): TeamWorkspaceBillingWarning[] {
  const warningCodes: TeamWorkspaceBillingWarning[] = [];

  if (input.seatLimit === 0) warningCodes.push('workspace_plan_inactive');
  if (input.ownerBillingStatus === 'past_due') warningCodes.push('past_due');
  if (input.cancelAtPeriodEnd) warningCodes.push('cancel_at_period_end');
  if (input.seatLimit > 0 && input.reservedSeats >= input.seatLimit) {
    warningCodes.push('seat_limit_reached');
  }

  return warningCodes;
}

export function buildRecoveryActions(input: {
  subscription: SubscriptionTier;
  billingStatus: BillingStatus;
  warningCodes: TeamWorkspaceBillingWarning[];
  seatLimit: number;
  seatsRemaining: number;
  fallbackMemberCount: number;
  revokedInviteCount: number;
}): TeamWorkspaceBillingRecoveryAction[] {
  const actions: TeamWorkspaceBillingRecoveryAction[] = [];
  const seenCodes = new Set<TeamWorkspaceBillingRecoveryActionCode>();

  const pushAction = (action: TeamWorkspaceBillingRecoveryAction) => {
    if (seenCodes.has(action.code)) return;
    seenCodes.add(action.code);
    actions.push(action);
  };

  if (input.warningCodes.includes('workspace_plan_inactive')) {
    if (input.subscription === 'team') {
      pushAction({
        code: 'resume_team_subscription',
        title: '恢复 Team 订阅',
        detail:
          input.fallbackMemberCount > 0
            ? `当前已有 ${input.fallbackMemberCount} 名成员回退到个人权限。请尽快通过账单入口恢复 Team 订阅，恢复后成员权限会自动重新继承。`
            : '当前工作区已失去 Team entitlement。请通过账单入口恢复 Team 订阅，恢复后工作区席位和邀请能力会自动恢复。',
        surface: 'billing_portal',
      });
    } else {
      pushAction({
        code: 'upgrade_to_team',
        title: '重新升级到 Team',
        detail:
          input.revokedInviteCount > 0
            ? `当前工作区已不再处于 Team 套餐，系统已经撤销 ${input.revokedInviteCount} 条待接受邀请。重新升级到 Team 后可恢复团队协作能力。`
            : '当前工作区所有者已不再处于 Team 套餐。重新升级到 Team 后，工作区席位、邀请和共享能力会重新生效。',
        surface: 'checkout',
      });
    }
  }

  if (input.warningCodes.includes('past_due') && input.subscription === 'team') {
    pushAction({
      code: 'update_payment_method',
      title: '更新支付方式并完成扣款',
      detail:
        '当前 Team 订阅处于 past due。优先通过 billing portal 更新付款方式并完成补扣，避免工作区继续进入降级补偿流程。',
      surface: 'billing_portal',
    });
  }

  if (input.warningCodes.includes('cancel_at_period_end') && input.subscription === 'team') {
    pushAction({
      code: 'renew_team_subscription',
      title: '续订 Team 套餐',
      detail: '当前订阅已设置到期取消。若希望团队协作持续生效，请在当前周期结束前恢复自动续费。',
      surface: 'billing_portal',
    });
  }

  if (input.warningCodes.includes('seat_limit_reached') && input.seatLimit > 0) {
    pushAction({
      code: 'free_up_seats',
      title: '释放或补充团队席位',
      detail:
        input.seatsRemaining === 0
          ? '当前席位已经用满。请先处理待接受邀请或减少团队成员，再继续邀请新成员。'
          : '当前可用席位已接近耗尽。建议先清理不用的邀请或成员，避免后续团队协作被阻断。',
      surface: 'workspace_members',
    });
  }

  return actions;
}

export function buildRecoveryNotices(input: {
  viewerRole: TeamWorkspaceRole;
  ownerDisplayName: string | null;
  ownerEmail: string;
  billing: Omit<TeamWorkspaceBilling, 'recoveryNotices'>;
  recentBillingEvents: Array<Pick<TeamWorkspaceBillingEvent, 'type' | 'count'>>;
}): TeamWorkspaceBilling['recoveryNotices'] {
  const notices: TeamWorkspaceBilling['recoveryNotices'] = [];
  const seenCodes = new Set<TeamWorkspaceBilling['recoveryNotices'][number]['code']>();
  const ownerLabel = input.ownerDisplayName ?? input.ownerEmail;

  const pushNotice = (notice: TeamWorkspaceBilling['recoveryNotices'][number]) => {
    if (seenCodes.has(notice.code)) return;
    seenCodes.add(notice.code);
    notices.push(notice);
  };

  if (input.billing.warningCodes.includes('workspace_plan_inactive')) {
    if (input.viewerRole === 'owner') {
      const primaryAction = input.billing.recommendedActions.find(
        (action) => action.code === 'resume_team_subscription' || action.code === 'upgrade_to_team',
      );
      pushNotice({
        code: 'workspace_plan_inactive',
        severity: 'critical',
        title: 'Team Workspace 已进入恢复期',
        detail:
          input.billing.fallbackMemberCount > 0 || input.billing.revokedInviteCount > 0
            ? `当前已有 ${input.billing.fallbackMemberCount} 名成员回退到个人权限，${input.billing.revokedInviteCount} 条邀请被系统撤销。请优先恢复 Team 订阅，恢复后成员权限和邀请会自动补齐。`
            : '当前工作区已经失去有效 Team entitlement。请优先恢复 Team 订阅，恢复后席位、邀请和共享能力会自动回到正常状态。',
        actionCode: primaryAction?.code ?? null,
      });
    } else {
      pushNotice({
        code: 'workspace_plan_inactive',
        severity: 'warning',
        title: '当前团队权限已暂停继承',
        detail: `你现在按个人套餐权限继续使用。若需要恢复 Team 能力，请联系账单所有者 ${ownerLabel} 处理订阅恢复。`,
        actionCode: null,
      });
    }
  }

  if (input.billing.warningCodes.includes('past_due')) {
    if (input.viewerRole === 'owner') {
      pushNotice({
        code: 'past_due',
        severity: 'warning',
        title: 'Team 订阅付款待处理',
        detail:
          '请尽快通过 billing portal 更新支付方式并完成补扣，避免工作区继续停留在降级风险中。',
        actionCode:
          input.billing.recommendedActions.find((action) => action.code === 'update_payment_method')
            ?.code ?? null,
      });
    } else {
      pushNotice({
        code: 'past_due',
        severity: 'warning',
        title: '团队订阅存在付款风险',
        detail: `账单所有者 ${ownerLabel} 需要完成补款或更新支付方式，否则团队权限可能进一步收紧。`,
        actionCode: null,
      });
    }
  }

  if (input.billing.warningCodes.includes('cancel_at_period_end')) {
    if (input.viewerRole === 'owner') {
      pushNotice({
        code: 'cancel_at_period_end',
        severity: 'warning',
        title: 'Team 订阅已设置到期取消',
        detail: '如果希望团队协作持续生效，请在当前计费周期结束前恢复自动续费。',
        actionCode:
          input.billing.recommendedActions.find(
            (action) => action.code === 'renew_team_subscription',
          )?.code ?? null,
      });
    } else {
      pushNotice({
        code: 'cancel_at_period_end',
        severity: 'info',
        title: '团队订阅将在当前周期结束后取消',
        detail: `如果 ${ownerLabel} 不恢复续费，当前工作区后续会回退到个人套餐权限。`,
        actionCode: null,
      });
    }
  }

  if (
    input.billing.warningCodes.includes('seat_limit_reached') &&
    (input.viewerRole === 'owner' || input.viewerRole === 'admin')
  ) {
    pushNotice({
      code: 'seat_limit_reached',
      severity: 'warning',
      title: '团队席位已满',
      detail:
        input.billing.revokedInviteCount > 0
          ? `当前席位已满，且系统已经撤销 ${input.billing.revokedInviteCount} 条待接受邀请。请先清理成员或邀请，再继续扩展团队。`
          : '当前席位已经用满。请先释放成员或处理待接受邀请，再继续邀请新成员。',
      actionCode:
        input.billing.recommendedActions.find((action) => action.code === 'free_up_seats')?.code ??
        null,
    });
  }

  if (input.recentBillingEvents.some((event) => event.type === 'invites_auto_restored')) {
    const restoredCount =
      input.recentBillingEvents.find((event) => event.type === 'invites_auto_restored')?.count ??
      null;
    pushNotice({
      code: 'invites_restored',
      severity: 'success',
      title: '已恢复被撤销的待接受邀请',
      detail:
        restoredCount && restoredCount > 0
          ? `系统已经恢复 ${restoredCount} 条此前因账单或席位风险被撤销的邀请，你现在可以直接继续跟进成员加入。`
          : '系统已经恢复此前因账单或席位风险被撤销的待接受邀请，你现在可以直接继续跟进成员加入。',
      actionCode: null,
    });
  }

  if (input.recentBillingEvents.some((event) => event.type === 'members_fallback_cleared')) {
    pushNotice({
      code: 'team_access_restored',
      severity: 'success',
      title: 'Team 权限已重新恢复',
      detail:
        input.viewerRole === 'owner'
          ? '此前回退到个人套餐的成员已经重新继承 Team 权限。'
          : '你现在已经重新继承当前 Team Workspace 的团队权限，可继续使用保存视图、导出和协作能力。',
      actionCode: null,
    });
  }

  return notices;
}

export function buildRecoveryOutreachDescriptors(input: {
  workspaceName: string;
  billing: TeamWorkspaceBilling;
}): WorkspaceRecoveryOutreachDescriptor[] {
  if (input.billing.recommendedActions.length === 0) return [];

  const descriptors: WorkspaceRecoveryOutreachDescriptor[] = [];
  const primaryAction = input.billing.recommendedActions[0] ?? null;
  const primaryNotice = input.billing.recoveryNotices[0] ?? null;

  descriptors.push({
    audience: 'owner',
    channel: 'owner_banner',
    title: primaryNotice?.title ?? `请尽快处理 ${input.workspaceName} 的 Team Workspace 账单风险`,
    detail:
      primaryNotice?.detail ??
      primaryAction?.detail ??
      '当前工作区存在待恢复的账单或席位风险，请尽快处理。',
    actionCode: primaryAction?.code ?? null,
  });

  if (
    input.billing.fallbackMemberCount > 0 ||
    input.billing.revokedInviteCount > 0 ||
    input.billing.warningCodes.includes('past_due')
  ) {
    descriptors.push({
      audience: 'admin',
      channel: 'admin_queue',
      title: `${input.workspaceName} 需要运营跟进`,
      detail:
        input.billing.fallbackMemberCount > 0
          ? `${input.billing.fallbackMemberCount} 名成员已回退到个人权限，请关注 owner 是否及时恢复订阅。`
          : input.billing.revokedInviteCount > 0
            ? `${input.billing.revokedInviteCount} 条邀请已被系统撤销，请跟进 owner 恢复 Team 后重新推进成员加入。`
            : '当前 Team 订阅存在付款或续费风险，请关注 owner 的恢复动作是否完成。',
      actionCode: primaryAction?.code ?? null,
    });
  }

  return descriptors;
}

export function buildMemberRecoveryNotificationDescriptor(input: {
  workspaceName: string;
  ownerDisplayName: string | null;
  ownerEmail: string;
  billing: TeamWorkspaceBilling;
}): WorkspaceMemberRecoveryNotificationDescriptor | null {
  if (input.billing.fallbackMemberCount === 0) return null;
  const ownerLabel = input.ownerDisplayName ?? input.ownerEmail;
  const primaryNotice =
    input.billing.recoveryNotices.find((notice) => notice.code === 'workspace_plan_inactive') ??
    input.billing.recoveryNotices[0] ??
    null;

  return {
    title: `${input.workspaceName} 已暂时回退到个人权限`,
    detail: primaryNotice
      ? `${primaryNotice.detail} 当前账单所有者是 ${ownerLabel}。系统会在恢复后自动重新授予 Team 权限。`
      : `你当前在 Team Workspace「${input.workspaceName}」里的团队权限已暂时回退到个人套餐，请联系账单所有者 ${ownerLabel} 恢复订阅。系统会在恢复后自动重新授予 Team 权限。`,
  };
}

export function summarizeMemberRecoveryNotifications(
  notifications: TeamWorkspaceMemberRecoveryNotification[],
): {
  pendingCount: number;
  retryingCount: number;
  deliveredCount: number;
  failedCount: number;
  nextEmailAttemptAt: string | null;
  lastEmailDeliveredAt: string | null;
  lastEmailError: string | null;
} {
  let pendingCount = 0;
  let retryingCount = 0;
  let deliveredCount = 0;
  let failedCount = 0;
  let nextEmailAttemptAt: string | null = null;
  let lastEmailDeliveredAt: string | null = null;
  let lastEmailError: string | null = null;

  for (const notification of notifications) {
    if (notification.status !== 'pending') continue;
    if (notification.lastEmailDeliveredAt) {
      deliveredCount += 1;
      if (
        lastEmailDeliveredAt == null ||
        new Date(notification.lastEmailDeliveredAt).getTime() >
          new Date(lastEmailDeliveredAt).getTime()
      ) {
        lastEmailDeliveredAt = notification.lastEmailDeliveredAt;
      }
      continue;
    }
    if (notification.lastEmailError) {
      if (notification.nextEmailAttemptAt) {
        retryingCount += 1;
        if (
          nextEmailAttemptAt == null ||
          new Date(notification.nextEmailAttemptAt).getTime() <
            new Date(nextEmailAttemptAt).getTime()
        ) {
          nextEmailAttemptAt = notification.nextEmailAttemptAt;
        }
      } else {
        failedCount += 1;
      }
      lastEmailError = notification.lastEmailError;
      continue;
    }
    pendingCount += 1;
    if (
      notification.nextEmailAttemptAt &&
      (nextEmailAttemptAt == null ||
        new Date(notification.nextEmailAttemptAt).getTime() <
          new Date(nextEmailAttemptAt).getTime())
    ) {
      nextEmailAttemptAt = notification.nextEmailAttemptAt;
    }
  }

  return {
    pendingCount,
    retryingCount,
    deliveredCount,
    failedCount,
    nextEmailAttemptAt,
    lastEmailDeliveredAt,
    lastEmailError,
  };
}

export function hasOwnerRecoveryEngagement(
  touch: BillingFunnelUserTouch | null | undefined,
): boolean {
  if (!touch) return false;
  return (
    touch.type === 'checkout_started' ||
    touch.type === 'checkout_completed' ||
    touch.type === 'portal_started' ||
    touch.type === 'subscription_recovered'
  );
}

export function accumulateRecoveryActions(
  actions: TeamWorkspaceBillingRecoveryAction[],
  counts: Map<TeamWorkspaceBillingRecoveryActionCode, AdminRecoveryAction>,
) {
  for (const action of actions) {
    const existing = counts.get(action.code);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(action.code, {
      code: action.code,
      title: action.title,
      count: 1,
    });
  }
}

export function toAdminActionableWorkspace(input: {
  workspaceId: string;
  workspaceName: string;
  owner: WorkspaceBillingOwner;
  billing: TeamWorkspaceBilling;
  pendingInvites: number;
  lastBillingEvent?: Pick<TeamWorkspaceBillingEvent, 'title' | 'createdAt'> | null;
  lastOutreach?: Pick<
    AdminRecoveryOutreach,
    | 'title'
    | 'createdAt'
    | 'lastAttemptAt'
    | 'audience'
    | 'channel'
    | 'status'
    | 'attemptCount'
    | 'nextAttemptAt'
    | 'emailAttemptCount'
    | 'lastEmailAttemptAt'
    | 'nextEmailAttemptAt'
    | 'lastEmailDeliveredAt'
    | 'lastEmailMessageId'
    | 'lastEmailError'
    | 'exportCount'
    | 'lastExportedAt'
    | 'crmSyncCount'
    | 'lastCrmSyncAttemptAt'
    | 'nextCrmSyncAttemptAt'
    | 'lastCrmSyncedAt'
    | 'crmExternalRecordId'
    | 'lastCrmSyncStatusCode'
    | 'lastCrmSyncError'
    | 'webhookAttemptCount'
    | 'lastWebhookAttemptAt'
    | 'nextWebhookAttemptAt'
    | 'webhookExhaustedAt'
    | 'webhookDeliveryCount'
    | 'lastWebhookDeliveredAt'
    | 'lastWebhookStatusCode'
    | 'lastWebhookError'
    | 'slackAlertCount'
    | 'lastSlackAlertAttemptAt'
    | 'lastSlackAlertedAt'
    | 'lastSlackAlertStatusCode'
    | 'lastSlackAlertError'
    | 'handoffChannel'
    | 'handoffAt'
    | 'handoffNote'
  > | null;
  memberRecoveryNotifications?: {
    pendingCount: number;
    retryingCount: number;
    deliveredCount: number;
    failedCount: number;
    nextEmailAttemptAt: string | null;
    lastEmailDeliveredAt: string | null;
    lastEmailError: string | null;
  } | null;
}): AdminActionableWorkspace {
  return {
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    ownerUserId: input.owner.id,
    ownerDisplayName: input.owner.displayName,
    ownerEmail: input.owner.email,
    subscription: input.owner.subscription,
    billingStatus: input.owner.billingStatus,
    seatLimit: input.billing.seatLimit,
    seatsUsed: input.billing.seatsUsed,
    reservedSeats: input.billing.reservedSeats,
    pendingInvites: input.pendingInvites,
    revokedInvites: input.billing.revokedInviteCount,
    fallbackMembers: input.billing.fallbackMemberCount,
    warningCodes: input.billing.warningCodes,
    recommendedActions: input.billing.recommendedActions,
    lastBillingEventAt: input.lastBillingEvent?.createdAt ?? null,
    lastBillingEventTitle: input.lastBillingEvent?.title ?? null,
    lastCommercialEventAt: null,
    lastCommercialEventType: null,
    lastCommercialEventSource: null,
    recoveryStage: 'needs_outreach',
    followUpState: 'needs_initial_touch',
    nextFollowUpAt: null,
    lastOutreachAt: input.lastOutreach?.lastAttemptAt ?? null,
    lastOutreachTitle: input.lastOutreach?.title ?? null,
    lastOutreachAudience: input.lastOutreach?.audience ?? null,
    lastOutreachChannel: input.lastOutreach?.channel ?? null,
    lastOutreachStatus: input.lastOutreach?.status ?? null,
    lastOutreachAttemptCount: input.lastOutreach?.attemptCount ?? null,
    nextOutreachAttemptAt: input.lastOutreach?.nextAttemptAt ?? null,
    lastOutreachEmailAttemptCount: input.lastOutreach?.emailAttemptCount ?? null,
    lastOutreachEmailAttemptAt: input.lastOutreach?.lastEmailAttemptAt ?? null,
    nextOutreachEmailAttemptAt: input.lastOutreach?.nextEmailAttemptAt ?? null,
    lastOutreachEmailDeliveredAt: input.lastOutreach?.lastEmailDeliveredAt ?? null,
    lastOutreachEmailMessageId: input.lastOutreach?.lastEmailMessageId ?? null,
    lastOutreachEmailError: input.lastOutreach?.lastEmailError ?? null,
    lastOutreachExportCount: input.lastOutreach?.exportCount ?? null,
    lastOutreachExportedAt: input.lastOutreach?.lastExportedAt ?? null,
    lastOutreachCrmSyncCount: input.lastOutreach?.crmSyncCount ?? null,
    lastOutreachCrmSyncAttemptAt: input.lastOutreach?.lastCrmSyncAttemptAt ?? null,
    nextOutreachCrmSyncAttemptAt: input.lastOutreach?.nextCrmSyncAttemptAt ?? null,
    lastOutreachCrmSyncedAt: input.lastOutreach?.lastCrmSyncedAt ?? null,
    lastOutreachCrmExternalRecordId: input.lastOutreach?.crmExternalRecordId ?? null,
    lastOutreachCrmSyncStatusCode: input.lastOutreach?.lastCrmSyncStatusCode ?? null,
    lastOutreachCrmSyncError: input.lastOutreach?.lastCrmSyncError ?? null,
    lastOutreachWebhookAttemptCount: input.lastOutreach?.webhookAttemptCount ?? null,
    lastOutreachWebhookAttemptAt: input.lastOutreach?.lastWebhookAttemptAt ?? null,
    nextOutreachWebhookAttemptAt: input.lastOutreach?.nextWebhookAttemptAt ?? null,
    lastOutreachWebhookExhaustedAt: input.lastOutreach?.webhookExhaustedAt ?? null,
    lastOutreachWebhookDeliveryCount: input.lastOutreach?.webhookDeliveryCount ?? null,
    lastOutreachWebhookDeliveredAt: input.lastOutreach?.lastWebhookDeliveredAt ?? null,
    lastOutreachWebhookStatusCode: input.lastOutreach?.lastWebhookStatusCode ?? null,
    lastOutreachWebhookError: input.lastOutreach?.lastWebhookError ?? null,
    lastOutreachSlackAlertCount: input.lastOutreach?.slackAlertCount ?? null,
    lastOutreachSlackAlertAttemptAt: input.lastOutreach?.lastSlackAlertAttemptAt ?? null,
    lastOutreachSlackAlertedAt: input.lastOutreach?.lastSlackAlertedAt ?? null,
    lastOutreachSlackAlertStatusCode: input.lastOutreach?.lastSlackAlertStatusCode ?? null,
    lastOutreachSlackAlertError: input.lastOutreach?.lastSlackAlertError ?? null,
    lastOutreachHandoffChannel: input.lastOutreach?.handoffChannel ?? null,
    lastOutreachHandoffAt: input.lastOutreach?.handoffAt ?? null,
    lastOutreachHandoffNote: input.lastOutreach?.handoffNote ?? null,
    memberRecoveryPendingCount: input.memberRecoveryNotifications?.pendingCount ?? 0,
    memberRecoveryRetryingCount: input.memberRecoveryNotifications?.retryingCount ?? 0,
    memberRecoveryDeliveredCount: input.memberRecoveryNotifications?.deliveredCount ?? 0,
    memberRecoveryFailedCount: input.memberRecoveryNotifications?.failedCount ?? 0,
    memberRecoveryNextEmailAttemptAt: input.memberRecoveryNotifications?.nextEmailAttemptAt ?? null,
    memberRecoveryLastEmailDeliveredAt:
      input.memberRecoveryNotifications?.lastEmailDeliveredAt ?? null,
    memberRecoveryLastEmailError: input.memberRecoveryNotifications?.lastEmailError ?? null,
  };
}

export function personalWorkspaceAccess(user: UserProfile): WorkspaceAccess {
  return {
    source: 'personal',
    workspaceId: null,
    workspaceName: null,
    workspaceRole: null,
    inheritedFromUserId: null,
    inheritedFromName: null,
    effectiveSubscription: user.subscription,
    effectiveBillingStatus: user.billingStatus,
    warningCodes: [],
  };
}

export function buildWorkspaceAccess(input: {
  user: UserProfile;
  context: WorkspaceAccessContext;
}): WorkspaceAccess {
  const seatLimit = resolveTeamWorkspaceSeatLimit({
    subscription: input.context.owner.subscription,
    billingStatus: input.context.owner.billingStatus,
  });
  const reservedSeats = input.context.seatsUsed + input.context.pendingInviteCount;
  const warningCodes = buildBillingWarnings({
    ownerBillingStatus: input.context.owner.billingStatus,
    cancelAtPeriodEnd: input.context.owner.cancelAtPeriodEnd,
    seatLimit,
    reservedSeats,
  });
  const inheritsWorkspaceAccess =
    input.context.owner.subscription === 'team' && input.context.owner.billingStatus !== 'inactive'
      ? seatLimit > 0
      : false;

  return {
    source: inheritsWorkspaceAccess ? 'team_workspace' : 'personal',
    workspaceId: input.context.workspaceId,
    workspaceName: input.context.workspaceName,
    workspaceRole: input.context.role,
    inheritedFromUserId: inheritsWorkspaceAccess ? input.context.owner.id : null,
    inheritedFromName: inheritsWorkspaceAccess
      ? (input.context.owner.displayName ?? input.context.owner.email)
      : null,
    effectiveSubscription: inheritsWorkspaceAccess ? 'team' : input.user.subscription,
    effectiveBillingStatus: inheritsWorkspaceAccess
      ? input.context.owner.billingStatus
      : input.user.billingStatus,
    warningCodes,
  };
}

export function applyWorkspaceAccess(
  user: UserProfile,
  access: WorkspaceAccess | null,
): UserProfile {
  const resolvedAccess = access ?? personalWorkspaceAccess(user);
  return {
    ...user,
    effectiveSubscription: resolvedAccess.effectiveSubscription,
    effectiveBillingStatus: resolvedAccess.effectiveBillingStatus,
    entitlements: resolveEntitlements({
      subscription: resolvedAccess.effectiveSubscription,
      billingStatus: resolvedAccess.effectiveBillingStatus,
    }),
    workspaceAccess: resolvedAccess,
  };
}
