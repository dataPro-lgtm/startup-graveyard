import { config } from '../config/index.js';
import type {
  PendingMemberRecoveryNotificationTarget,
  TeamWorkspacesRepository,
} from '../repositories/teamWorkspacesRepository.js';
import * as memberEmailClient from './sendRecoveryFallbackMemberEmail.js';

export type RecoveryFallbackMemberEmailResult =
  | {
      ok: true;
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
      skipped:
        | 'no_member_notifications'
        | 'already_delivered'
        | 'no_due_member_notifications'
        | null;
    }
  | {
      ok: false;
      error: 'recovery_member_email_disabled' | 'recovery_member_email_failed';
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
      detail: string;
    };

const ERROR_MAX = 500;

function clipError(detail: string): string {
  return detail.length <= ERROR_MAX ? detail : `${detail.slice(0, ERROR_MAX)}…`;
}

function toEmailInput(
  item: PendingMemberRecoveryNotificationTarget,
): memberEmailClient.RecoveryFallbackMemberEmailInput {
  return {
    to: item.email,
    memberDisplayName: item.displayName,
    workspaceName: item.workspaceName,
    ownerDisplayName: item.ownerDisplayName,
    ownerEmail: item.ownerEmail,
    title: item.title,
    detail: item.detail,
    subscription: item.subscription,
    billingStatus: item.billingStatus,
  };
}

export async function deliverRecoveryFallbackMemberEmail(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    retryIntervalHours?: number;
    force?: boolean;
  },
): Promise<RecoveryFallbackMemberEmailResult> {
  if (!config.hasRecoveryOutreachEmail) {
    return {
      ok: false,
      error: 'recovery_member_email_disabled',
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      detail: 'TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST / TEAM_WORKSPACE_RECOVERY_EMAIL_FROM 未配置',
    };
  }

  const retryIntervalHours = Math.max(0, options?.retryIntervalHours ?? 24);
  const force = options?.force ?? false;
  const notifications = await teamWorkspacesRepo.listPendingMemberRecoveryNotifications();
  if (notifications.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      skipped: 'no_member_notifications',
    };
  }

  const unsent = force
    ? notifications
    : notifications.filter((item) => item.lastEmailDeliveredAt == null);
  if (unsent.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      skipped: 'already_delivered',
    };
  }

  const due = force
    ? unsent
    : unsent.filter(
        (item) =>
          item.lastEmailAttemptAt == null ||
          item.nextEmailAttemptAt == null ||
          new Date(item.nextEmailAttemptAt).getTime() <= Date.now(),
      );
  if (due.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      skipped: 'no_due_member_notifications',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let lastError = 'member_email_failed';

  for (const item of due) {
    const attemptedAt = new Date().toISOString();
    try {
      const sent = await memberEmailClient.sendRecoveryFallbackMemberEmail(toEmailInput(item));
      const { deliveredCount: delivered } =
        await teamWorkspacesRepo.recordPendingMemberRecoveryNotificationEmailDelivery({
          notificationIds: [item.notificationId],
          attemptedAt,
          deliveredAt: attemptedAt,
          error: null,
          retryIntervalHours,
          messageIdByNotificationId: {
            [item.notificationId]: sent.messageId,
          },
        });
      deliveredCount += delivered;
    } catch (error) {
      const detail =
        error instanceof Error ? clipError(error.message || error.name) : 'member_email_failed';
      lastError = detail;
      failedCount += 1;
      await teamWorkspacesRepo.recordPendingMemberRecoveryNotificationEmailDelivery({
        notificationIds: [item.notificationId],
        attemptedAt,
        error: detail,
        retryIntervalHours,
      });
    }
  }

  if (deliveredCount === 0 && failedCount > 0) {
    return {
      ok: false,
      error: 'recovery_member_email_failed',
      attemptedCount: due.length,
      deliveredCount,
      failedCount,
      detail: lastError,
    };
  }

  return {
    ok: true,
    attemptedCount: due.length,
    deliveredCount,
    failedCount,
    skipped: null,
  };
}
