import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import { config } from '../config/index.js';
import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';

type CrmWorkspace = TeamWorkspaceAdminMetrics['actionableWorkspaces'][number];

export type RecoveryOutreachCrmSyncResult =
  | {
      ok: true;
      attemptedCount: number;
      syncedCount: number;
      failedCount: number;
      skipped: 'no_crm_handoffs' | 'already_synced' | 'no_due_crm_handoffs' | null;
    }
  | {
      ok: false;
      error: 'recovery_handoff_crm_disabled' | 'recovery_handoff_crm_failed';
      attemptedCount: number;
      syncedCount: number;
      failedCount: number;
      detail: string;
    };

type RecoveryOutreachCrmPayload = {
  version: '2026-04-15.v1';
  syncedAt: string;
  workspace: {
    id: string;
    name: string;
  };
  owner: {
    userId: string;
    displayName: string | null;
    email: string;
  };
  billing: {
    subscription: CrmWorkspace['subscription'];
    billingStatus: CrmWorkspace['billingStatus'];
    warningCodes: string[];
  };
  recovery: {
    stage: CrmWorkspace['recoveryStage'];
    followUpState: CrmWorkspace['followUpState'];
    recommendedActions: Array<{
      code: string;
      title: string;
      surface: string;
    }>;
  };
  lastOutreach: {
    title: string | null;
    handoffAt: string | null;
    handoffNote: string | null;
    exportCount: number | null;
    webhookDeliveryCount: number | null;
    slackAlertedAt: string | null;
  };
};

const ERROR_MAX = 500;

function clipError(detail: string): string {
  return detail.length <= ERROR_MAX ? detail : `${detail.slice(0, ERROR_MAX)}…`;
}

function toCrmPayload(syncedAt: string, item: CrmWorkspace): RecoveryOutreachCrmPayload {
  return {
    version: '2026-04-15.v1',
    syncedAt,
    workspace: {
      id: item.workspaceId,
      name: item.workspaceName,
    },
    owner: {
      userId: item.ownerUserId,
      displayName: item.ownerDisplayName,
      email: item.ownerEmail,
    },
    billing: {
      subscription: item.subscription,
      billingStatus: item.billingStatus,
      warningCodes: item.warningCodes,
    },
    recovery: {
      stage: item.recoveryStage,
      followUpState: item.followUpState,
      recommendedActions: item.recommendedActions.map((action) => ({
        code: action.code,
        title: action.title,
        surface: action.surface,
      })),
    },
    lastOutreach: {
      title: item.lastOutreachTitle,
      handoffAt: item.lastOutreachHandoffAt,
      handoffNote: item.lastOutreachHandoffNote,
      exportCount: item.lastOutreachExportCount,
      webhookDeliveryCount: item.lastOutreachWebhookDeliveryCount,
      slackAlertedAt: item.lastOutreachSlackAlertedAt,
    },
  };
}

function maybeRecordId(candidate: unknown): string | null {
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  return null;
}

function extractCrmRecordId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  return (
    maybeRecordId(record.recordId) ??
    maybeRecordId(record.ticketId) ??
    maybeRecordId(record.externalId) ??
    maybeRecordId(record.id) ??
    (record.result && typeof record.result === 'object'
      ? (maybeRecordId((record.result as Record<string, unknown>).recordId) ??
        maybeRecordId((record.result as Record<string, unknown>).ticketId) ??
        maybeRecordId((record.result as Record<string, unknown>).externalId) ??
        maybeRecordId((record.result as Record<string, unknown>).id))
      : null) ??
    (record.data && typeof record.data === 'object'
      ? (maybeRecordId((record.data as Record<string, unknown>).recordId) ??
        maybeRecordId((record.data as Record<string, unknown>).ticketId) ??
        maybeRecordId((record.data as Record<string, unknown>).externalId) ??
        maybeRecordId((record.data as Record<string, unknown>).id))
      : null)
  );
}

export async function deliverRecoveryOutreachCrmSync(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    retryIntervalHours?: number;
    force?: boolean;
  },
): Promise<RecoveryOutreachCrmSyncResult> {
  if (!config.recoveryOutreach.crmApiUrl) {
    return {
      ok: false,
      error: 'recovery_handoff_crm_disabled',
      attemptedCount: 0,
      syncedCount: 0,
      failedCount: 0,
      detail: 'TEAM_WORKSPACE_RECOVERY_CRM_API_URL 未配置',
    };
  }

  const retryIntervalHours = Math.max(0, options?.retryIntervalHours ?? 24);
  const force = options?.force ?? false;
  const stats = await teamWorkspacesRepo.getAdminMetrics();
  const handedOff = stats.actionableWorkspaces.filter(
    (item) => item.lastOutreachStatus === 'handed_off' && item.lastOutreachHandoffChannel === 'crm',
  );
  if (handedOff.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      syncedCount: 0,
      failedCount: 0,
      skipped: 'no_crm_handoffs',
    };
  }

  const unsynced = force
    ? handedOff
    : handedOff.filter((item) => item.lastOutreachCrmSyncedAt == null);
  if (unsynced.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      syncedCount: 0,
      failedCount: 0,
      skipped: 'already_synced',
    };
  }

  const due = force
    ? unsynced
    : unsynced.filter(
        (item) =>
          item.nextOutreachCrmSyncAttemptAt == null ||
          new Date(item.nextOutreachCrmSyncAttemptAt).getTime() <= Date.now(),
      );
  if (due.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      syncedCount: 0,
      failedCount: 0,
      skipped: 'no_due_crm_handoffs',
    };
  }

  let syncedCount = 0;
  let failedCount = 0;
  let lastError = 'crm_sync_failed';

  for (const item of due) {
    const attemptedAt = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.recoveryOutreach.crmApiTimeoutMs);
    const headers = new Headers({
      'content-type': 'application/json',
      'user-agent': 'startup-graveyard/recovery-outreach-crm',
    });
    if (config.recoveryOutreach.crmApiBearerToken) {
      headers.set('authorization', `Bearer ${config.recoveryOutreach.crmApiBearerToken}`);
    }

    try {
      const response = await fetch(config.recoveryOutreach.crmApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(toCrmPayload(attemptedAt, item)),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
      const body = isJson ? await response.json().catch(() => null) : await response.text();

      if (!response.ok) {
        const detail = clipError(
          typeof body === 'string'
            ? body || response.statusText || 'crm_sync_failed'
            : JSON.stringify(body ?? { error: response.statusText || 'crm_sync_failed' }),
        );
        lastError = detail;
        failedCount += 1;
        await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachCrmSync({
          workspaceIds: [item.workspaceId],
          statusCode: response.status,
          error: `HTTP ${response.status}: ${detail}`,
          attemptedAt,
          retryIntervalHours,
        });
        continue;
      }

      const recordId = extractCrmRecordId(body);
      if (!recordId) {
        const detail = 'crm_record_id_missing';
        lastError = detail;
        failedCount += 1;
        await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachCrmSync({
          workspaceIds: [item.workspaceId],
          statusCode: response.status,
          error: detail,
          attemptedAt,
          retryIntervalHours,
        });
        continue;
      }

      const { syncedCount: synced } =
        await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachCrmSync({
          workspaceIds: [item.workspaceId],
          statusCode: response.status,
          error: null,
          attemptedAt,
          syncedAt: attemptedAt,
          retryIntervalHours,
          externalRecordIdByWorkspaceId: {
            [item.workspaceId]: recordId,
          },
        });
      syncedCount += synced;
    } catch (error) {
      clearTimeout(timeout);
      lastError =
        error instanceof Error ? clipError(error.message || error.name) : 'crm_request_failed';
      failedCount += 1;
      await teamWorkspacesRepo.recordHandedOffAdminRecoveryOutreachCrmSync({
        workspaceIds: [item.workspaceId],
        statusCode: null,
        error: lastError,
        attemptedAt,
        retryIntervalHours,
      });
    }
  }

  if (syncedCount === 0 && failedCount > 0) {
    return {
      ok: false,
      error: 'recovery_handoff_crm_failed',
      attemptedCount: due.length,
      syncedCount,
      failedCount,
      detail: lastError,
    };
  }

  return {
    ok: true,
    attemptedCount: due.length,
    syncedCount,
    failedCount,
    skipped: null,
  };
}
