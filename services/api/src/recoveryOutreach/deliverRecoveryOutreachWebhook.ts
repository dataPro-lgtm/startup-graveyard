import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import { config } from '../config/index.js';
import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';

type HandoffWorkspace = TeamWorkspaceAdminMetrics['actionableWorkspaces'][number];

export type RecoveryOutreachWebhookDeliveryResult =
  | {
      ok: true;
      attemptedCount: number;
      deliveredCount: number;
      statusCode: number | null;
      skipped: 'no_handoffs';
    }
  | {
      ok: true;
      attemptedCount: number;
      deliveredCount: number;
      statusCode: number | null;
      skipped: 'no_due_handoffs';
    }
  | {
      ok: true;
      attemptedCount: number;
      deliveredCount: number;
      statusCode: number | null;
      skipped: 'no_retryable_handoffs';
    }
  | {
      ok: true;
      attemptedCount: number;
      deliveredCount: number;
      statusCode: number;
      skipped: null;
    }
  | {
      ok: false;
      error: 'recovery_handoff_webhook_disabled' | 'recovery_handoff_webhook_failed';
      attemptedCount: number;
      deliveredCount: number;
      statusCode: number | null;
      detail: string;
    };

type RecoveryOutreachWebhookPayload = {
  version: '2026-04-15.v1';
  deliveredAt: string;
  workspaceCount: number;
  items: Array<{
    workspaceId: string;
    workspaceName: string;
    ownerUserId: string;
    ownerDisplayName: string | null;
    ownerEmail: string;
    subscription: HandoffWorkspace['subscription'];
    billingStatus: HandoffWorkspace['billingStatus'];
    recoveryStage: HandoffWorkspace['recoveryStage'];
    followUpState: HandoffWorkspace['followUpState'];
    warningCodes: string[];
    recommendedActions: Array<{
      code: string;
      title: string;
      surface: string;
    }>;
    lastOutreach: {
      title: string | null;
      status: HandoffWorkspace['lastOutreachStatus'];
      audience: HandoffWorkspace['lastOutreachAudience'];
      channel: HandoffWorkspace['lastOutreachChannel'];
      attemptCount: number | null;
      exportCount: number | null;
      handoffChannel: HandoffWorkspace['lastOutreachHandoffChannel'];
      handoffAt: string | null;
      handoffNote: string | null;
    };
  }>;
};

const ERROR_MAX = 500;

function clipError(detail: string): string {
  return detail.length <= ERROR_MAX ? detail : `${detail.slice(0, ERROR_MAX)}…`;
}

function toWebhookPayload(
  deliveredAt: string,
  items: HandoffWorkspace[],
): RecoveryOutreachWebhookPayload {
  return {
    version: '2026-04-15.v1',
    deliveredAt,
    workspaceCount: items.length,
    items: items.map((item) => ({
      workspaceId: item.workspaceId,
      workspaceName: item.workspaceName,
      ownerUserId: item.ownerUserId,
      ownerDisplayName: item.ownerDisplayName,
      ownerEmail: item.ownerEmail,
      subscription: item.subscription,
      billingStatus: item.billingStatus,
      recoveryStage: item.recoveryStage,
      followUpState: item.followUpState,
      warningCodes: item.warningCodes,
      recommendedActions: item.recommendedActions.map((action) => ({
        code: action.code,
        title: action.title,
        surface: action.surface,
      })),
      lastOutreach: {
        title: item.lastOutreachTitle,
        status: item.lastOutreachStatus,
        audience: item.lastOutreachAudience,
        channel: item.lastOutreachChannel,
        attemptCount: item.lastOutreachAttemptCount,
        exportCount: item.lastOutreachExportCount,
        handoffChannel: item.lastOutreachHandoffChannel,
        handoffAt: item.lastOutreachHandoffAt,
        handoffNote: item.lastOutreachHandoffNote,
      },
    })),
  };
}

export async function deliverRecoveryOutreachWebhook(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    retryIntervalHours?: number;
    force?: boolean;
  },
): Promise<RecoveryOutreachWebhookDeliveryResult> {
  const retryIntervalHours = Math.max(0, options?.retryIntervalHours ?? 24);
  const maxAttempts = config.recoveryOutreach.webhookMaxAttempts;
  const force = options?.force ?? false;
  if (!config.recoveryOutreach.webhookUrl) {
    return {
      ok: false,
      error: 'recovery_handoff_webhook_disabled',
      attemptedCount: 0,
      deliveredCount: 0,
      statusCode: null,
      detail: 'TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL 未配置',
    };
  }

  const stats = await teamWorkspacesRepo.getAdminMetrics();
  const handedOff = stats.actionableWorkspaces.filter(
    (item) => item.lastOutreachStatus === 'handed_off' && !item.lastOutreachWebhookDeliveredAt,
  );
  if (handedOff.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      statusCode: null,
      skipped: 'no_handoffs',
    };
  }

  const attemptedAt = new Date().toISOString();
  const retryableHandedOff = force
    ? handedOff
    : handedOff.filter((item) => item.lastOutreachWebhookExhaustedAt == null);
  if (retryableHandedOff.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      statusCode: null,
      skipped: 'no_retryable_handoffs',
    };
  }
  const dueHandedOff = force
    ? retryableHandedOff
    : retryableHandedOff.filter(
        (item) =>
          item.nextOutreachWebhookAttemptAt == null ||
          new Date(item.nextOutreachWebhookAttemptAt).getTime() <= Date.now(),
      );
  if (dueHandedOff.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      statusCode: null,
      skipped: 'no_due_handoffs',
    };
  }

  const deliveredAt = attemptedAt;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.recoveryOutreach.webhookTimeoutMs);
  const headers = new Headers({
    'content-type': 'application/json',
    'user-agent': 'startup-graveyard/recovery-outreach-webhook',
  });
  if (config.recoveryOutreach.webhookBearerToken) {
    headers.set('authorization', `Bearer ${config.recoveryOutreach.webhookBearerToken}`);
  }

  try {
    const response = await fetch(config.recoveryOutreach.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(toWebhookPayload(deliveredAt, dueHandedOff)),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const detail = clipError((await response.text()) || response.statusText || 'webhook_failed');
      await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachWebhookDelivery({
        workspaceIds: dueHandedOff.map((item) => item.workspaceId),
        statusCode: response.status,
        error: `HTTP ${response.status}: ${detail}`,
        attemptedAt,
        retryIntervalHours,
        maxAttempts,
      });
      return {
        ok: false,
        error: 'recovery_handoff_webhook_failed',
        attemptedCount: dueHandedOff.length,
        deliveredCount: 0,
        statusCode: response.status,
        detail,
      };
    }

    const { deliveredCount } =
      await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachWebhookDelivery({
        workspaceIds: dueHandedOff.map((item) => item.workspaceId),
        statusCode: response.status,
        error: null,
        attemptedAt,
        deliveredAt,
        retryIntervalHours,
        maxAttempts,
      });
    return {
      ok: true,
      attemptedCount: dueHandedOff.length,
      deliveredCount,
      statusCode: response.status,
      skipped: null,
    };
  } catch (error) {
    clearTimeout(timeout);
    const detail =
      error instanceof Error ? clipError(error.message || error.name) : 'webhook_request_failed';
    await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachWebhookDelivery({
      workspaceIds: dueHandedOff.map((item) => item.workspaceId),
      statusCode: null,
      error: detail,
      attemptedAt,
      retryIntervalHours,
      maxAttempts,
    });
    return {
      ok: false,
      error: 'recovery_handoff_webhook_failed',
      attemptedCount: dueHandedOff.length,
      deliveredCount: 0,
      statusCode: null,
      detail,
    };
  }
}
