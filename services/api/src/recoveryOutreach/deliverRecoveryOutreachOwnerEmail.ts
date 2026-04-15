import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import { config } from '../config/index.js';
import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';
import * as recoveryEmailClient from './sendRecoveryOutreachEmail.js';

type OwnerWorkspace = TeamWorkspaceAdminMetrics['actionableWorkspaces'][number];

export type RecoveryOutreachOwnerEmailResult =
  | {
      ok: true;
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
      skipped: 'no_owner_outreach' | 'already_delivered' | 'no_due_owner_outreach' | null;
    }
  | {
      ok: false;
      error: 'recovery_owner_email_disabled' | 'recovery_owner_email_failed';
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
      detail: string;
    };

const ERROR_MAX = 500;

function clipError(detail: string): string {
  return detail.length <= ERROR_MAX ? detail : `${detail.slice(0, ERROR_MAX)}…`;
}

function toEmailInput(item: OwnerWorkspace): recoveryEmailClient.RecoveryOutreachOwnerEmailInput {
  return {
    to: item.ownerEmail,
    workspaceName: item.workspaceName,
    ownerDisplayName: item.ownerDisplayName,
    title: item.lastOutreachTitle ?? `${item.workspaceName} 需要恢复处理`,
    detail:
      item.lastOutreachTitle && item.lastOutreachAt
        ? `${item.lastOutreachTitle}。最近一次系统触达时间：${item.lastOutreachAt}`
        : '当前工作区存在待恢复的账单或席位风险，请尽快处理。',
    subscription: item.subscription,
    billingStatus: item.billingStatus,
    recoveryStage: item.recoveryStage,
    followUpState: item.followUpState,
    warningCodes: item.warningCodes,
    recommendedActions: item.recommendedActions,
  };
}

export async function deliverRecoveryOutreachOwnerEmail(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    retryIntervalHours?: number;
    force?: boolean;
  },
): Promise<RecoveryOutreachOwnerEmailResult> {
  if (!config.hasRecoveryOutreachEmail) {
    return {
      ok: false,
      error: 'recovery_owner_email_disabled',
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      detail: 'TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST / TEAM_WORKSPACE_RECOVERY_EMAIL_FROM 未配置',
    };
  }

  const retryIntervalHours = Math.max(0, options?.retryIntervalHours ?? 24);
  const force = options?.force ?? false;
  const stats = await teamWorkspacesRepo.getAdminMetrics();
  const ownerOutreach = stats.actionableWorkspaces.filter(
    (item) => item.lastOutreachAudience === 'owner' && item.lastOutreachStatus === 'pending',
  );
  if (ownerOutreach.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      skipped: 'no_owner_outreach',
    };
  }

  const unsent = force
    ? ownerOutreach
    : ownerOutreach.filter((item) => item.lastOutreachEmailDeliveredAt == null);
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
          item.lastOutreachEmailAttemptAt == null ||
          item.nextOutreachEmailAttemptAt == null ||
          new Date(item.nextOutreachEmailAttemptAt).getTime() <= Date.now(),
      );
  if (due.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      skipped: 'no_due_owner_outreach',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let lastError = 'owner_email_failed';

  for (const item of due) {
    const attemptedAt = new Date().toISOString();
    try {
      const sent = await recoveryEmailClient.sendRecoveryOutreachEmail(toEmailInput(item));
      const { deliveredCount: delivered } =
        await teamWorkspacesRepo.recordPendingOwnerRecoveryOutreachEmailDelivery({
          workspaceIds: [item.workspaceId],
          attemptedAt,
          deliveredAt: attemptedAt,
          error: null,
          retryIntervalHours,
          messageIdByWorkspaceId: {
            [item.workspaceId]: sent.messageId,
          },
        });
      deliveredCount += delivered;
    } catch (error) {
      const detail =
        error instanceof Error ? clipError(error.message || error.name) : 'owner_email_failed';
      lastError = detail;
      failedCount += 1;
      await teamWorkspacesRepo.recordPendingOwnerRecoveryOutreachEmailDelivery({
        workspaceIds: [item.workspaceId],
        attemptedAt,
        error: detail,
        retryIntervalHours,
      });
    }
  }

  if (deliveredCount === 0 && failedCount > 0) {
    return {
      ok: false,
      error: 'recovery_owner_email_failed',
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
