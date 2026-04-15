import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';
import {
  deliverRecoveryOutreachCrmSync,
  type RecoveryOutreachCrmSyncResult,
} from './deliverRecoveryOutreachCrmSync.js';
import {
  deliverRecoveryFallbackMemberEmail,
  type RecoveryFallbackMemberEmailResult,
} from './deliverRecoveryFallbackMemberEmail.js';
import {
  deliverRecoveryOutreachOwnerEmail,
  type RecoveryOutreachOwnerEmailResult,
} from './deliverRecoveryOutreachOwnerEmail.js';
import {
  deliverRecoveryOutreachSlackAlert,
  type RecoveryOutreachSlackAlertResult,
} from './deliverRecoveryOutreachSlackAlert.js';
import {
  deliverRecoveryOutreachWebhook,
  type RecoveryOutreachWebhookDeliveryResult,
} from './deliverRecoveryOutreachWebhook.js';

type RecoveryPlaybookDeliveryStep = {
  status: 'completed' | 'skipped' | 'disabled' | 'failed';
  attemptedCount: number;
  successCount: number;
  failedCount: number;
  skippedReason: string | null;
  error: string | null;
  detail: string | null;
  statusCode: number | null;
};

type RecoveryPlaybookOutreachStep =
  | {
      status: 'completed';
      workspaceCount: number;
      ownerOutreachCreated: number;
      adminOutreachCreated: number;
      retriedOutreachCount: number;
      resolvedOutreachCount: number;
      detail: null;
    }
  | {
      status: 'failed';
      workspaceCount: 0;
      ownerOutreachCreated: 0;
      adminOutreachCreated: 0;
      retriedOutreachCount: 0;
      resolvedOutreachCount: 0;
      detail: string;
    };

export type RecoveryOutreachPlaybookResult = {
  ok: boolean;
  summary: string;
  steps: {
    outreach: RecoveryPlaybookOutreachStep;
    ownerEmail: RecoveryPlaybookDeliveryStep;
    memberEmail: RecoveryPlaybookDeliveryStep;
    crmSync: RecoveryPlaybookDeliveryStep;
    webhook: RecoveryPlaybookDeliveryStep;
    slack: RecoveryPlaybookDeliveryStep;
  };
};

function normalizeOwnerEmailStep(
  result: RecoveryOutreachOwnerEmailResult,
): RecoveryPlaybookDeliveryStep {
  if (result.ok) {
    return {
      status: result.skipped ? 'skipped' : 'completed',
      attemptedCount: result.attemptedCount,
      successCount: result.deliveredCount,
      failedCount: result.failedCount,
      skippedReason: result.skipped,
      error: null,
      detail: null,
      statusCode: null,
    };
  }

  return {
    status: result.error === 'recovery_owner_email_disabled' ? 'disabled' : 'failed',
    attemptedCount: result.attemptedCount,
    successCount: result.deliveredCount,
    failedCount: result.failedCount,
    skippedReason: null,
    error: result.error,
    detail: result.detail,
    statusCode: null,
  };
}

function normalizeMemberEmailStep(
  result: RecoveryFallbackMemberEmailResult,
): RecoveryPlaybookDeliveryStep {
  if (result.ok) {
    return {
      status: result.skipped ? 'skipped' : 'completed',
      attemptedCount: result.attemptedCount,
      successCount: result.deliveredCount,
      failedCount: result.failedCount,
      skippedReason: result.skipped,
      error: null,
      detail: null,
      statusCode: null,
    };
  }

  return {
    status: result.error === 'recovery_member_email_disabled' ? 'disabled' : 'failed',
    attemptedCount: result.attemptedCount,
    successCount: result.deliveredCount,
    failedCount: result.failedCount,
    skippedReason: null,
    error: result.error,
    detail: result.detail,
    statusCode: null,
  };
}

function normalizeCrmStep(result: RecoveryOutreachCrmSyncResult): RecoveryPlaybookDeliveryStep {
  if (result.ok) {
    return {
      status: result.skipped ? 'skipped' : 'completed',
      attemptedCount: result.attemptedCount,
      successCount: result.syncedCount,
      failedCount: result.failedCount,
      skippedReason: result.skipped,
      error: null,
      detail: null,
      statusCode: null,
    };
  }

  return {
    status: result.error === 'recovery_handoff_crm_disabled' ? 'disabled' : 'failed',
    attemptedCount: result.attemptedCount,
    successCount: result.syncedCount,
    failedCount: result.failedCount,
    skippedReason: null,
    error: result.error,
    detail: result.detail,
    statusCode: null,
  };
}

function normalizeWebhookStep(
  result: RecoveryOutreachWebhookDeliveryResult,
): RecoveryPlaybookDeliveryStep {
  if (result.ok) {
    return {
      status: result.skipped ? 'skipped' : 'completed',
      attemptedCount: result.attemptedCount,
      successCount: result.deliveredCount,
      failedCount: Math.max(0, result.attemptedCount - result.deliveredCount),
      skippedReason: result.skipped,
      error: null,
      detail: null,
      statusCode: result.statusCode,
    };
  }

  return {
    status: result.error === 'recovery_handoff_webhook_disabled' ? 'disabled' : 'failed',
    attemptedCount: result.attemptedCount,
    successCount: result.deliveredCount,
    failedCount: Math.max(0, result.attemptedCount - result.deliveredCount),
    skippedReason: null,
    error: result.error,
    detail: result.detail,
    statusCode: result.statusCode,
  };
}

function normalizeSlackStep(
  result: RecoveryOutreachSlackAlertResult,
): RecoveryPlaybookDeliveryStep {
  if (result.ok) {
    return {
      status: result.skipped ? 'skipped' : 'completed',
      attemptedCount: result.attemptedCount,
      successCount: result.alertedCount,
      failedCount: Math.max(0, result.attemptedCount - result.alertedCount),
      skippedReason: result.skipped,
      error: null,
      detail: null,
      statusCode: result.statusCode,
    };
  }

  return {
    status: result.error === 'recovery_slack_alert_disabled' ? 'disabled' : 'failed',
    attemptedCount: result.attemptedCount,
    successCount: result.alertedCount,
    failedCount: Math.max(0, result.attemptedCount - result.alertedCount),
    skippedReason: null,
    error: result.error,
    detail: result.detail,
    statusCode: result.statusCode,
  };
}

function summarizeDeliveryStep(label: string, step: RecoveryPlaybookDeliveryStep) {
  if (step.status === 'completed') return `${label}=ok:${step.successCount}`;
  if (step.status === 'skipped') return `${label}=skip:${step.skippedReason ?? 'none'}`;
  if (step.status === 'disabled') return `${label}=disabled`;
  return `${label}=failed:${step.error ?? 'unknown'}`;
}

export async function runRecoveryOutreachPlaybook(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    retryIntervalHours?: number;
    force?: boolean;
  },
): Promise<RecoveryOutreachPlaybookResult> {
  const retryIntervalHours = Math.max(0, options?.retryIntervalHours ?? 24);
  const force = options?.force ?? false;

  let outreach: RecoveryPlaybookOutreachStep;
  try {
    const synced = await teamWorkspacesRepo.runRecoveryOutreachAutomation({
      retryIntervalHours,
    });
    outreach = {
      status: 'completed',
      workspaceCount: synced.workspaceCount,
      ownerOutreachCreated: synced.ownerOutreachCreated,
      adminOutreachCreated: synced.adminOutreachCreated,
      retriedOutreachCount: synced.retriedOutreachCount,
      resolvedOutreachCount: synced.resolvedOutreachCount,
      detail: null,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message || error.name : 'recovery_playbook_outreach_failed';
    outreach = {
      status: 'failed',
      workspaceCount: 0,
      ownerOutreachCreated: 0,
      adminOutreachCreated: 0,
      retriedOutreachCount: 0,
      resolvedOutreachCount: 0,
      detail,
    };
    return {
      ok: false,
      summary: `outreach=failed:${detail}`,
      steps: {
        outreach,
        ownerEmail: {
          status: 'skipped',
          attemptedCount: 0,
          successCount: 0,
          failedCount: 0,
          skippedReason: 'outreach_failed',
          error: null,
          detail: null,
          statusCode: null,
        },
        memberEmail: {
          status: 'skipped',
          attemptedCount: 0,
          successCount: 0,
          failedCount: 0,
          skippedReason: 'outreach_failed',
          error: null,
          detail: null,
          statusCode: null,
        },
        crmSync: {
          status: 'skipped',
          attemptedCount: 0,
          successCount: 0,
          failedCount: 0,
          skippedReason: 'outreach_failed',
          error: null,
          detail: null,
          statusCode: null,
        },
        webhook: {
          status: 'skipped',
          attemptedCount: 0,
          successCount: 0,
          failedCount: 0,
          skippedReason: 'outreach_failed',
          error: null,
          detail: null,
          statusCode: null,
        },
        slack: {
          status: 'skipped',
          attemptedCount: 0,
          successCount: 0,
          failedCount: 0,
          skippedReason: 'outreach_failed',
          error: null,
          detail: null,
          statusCode: null,
        },
      },
    };
  }

  const ownerEmail = normalizeOwnerEmailStep(
    await deliverRecoveryOutreachOwnerEmail(teamWorkspacesRepo, {
      retryIntervalHours,
      force,
    }),
  );
  const memberEmail = normalizeMemberEmailStep(
    await deliverRecoveryFallbackMemberEmail(teamWorkspacesRepo, {
      retryIntervalHours,
      force,
    }),
  );
  const crmSync = normalizeCrmStep(
    await deliverRecoveryOutreachCrmSync(teamWorkspacesRepo, {
      retryIntervalHours,
      force,
    }),
  );
  const webhook = normalizeWebhookStep(
    await deliverRecoveryOutreachWebhook(teamWorkspacesRepo, {
      retryIntervalHours,
      force,
    }),
  );
  const slack = normalizeSlackStep(
    await deliverRecoveryOutreachSlackAlert(teamWorkspacesRepo, {
      force,
    }),
  );

  const ok = [ownerEmail, memberEmail, crmSync, webhook, slack].every(
    (step) => step.status !== 'failed',
  );
  const summary = [
    `outreach=ok:${outreach.ownerOutreachCreated}/${outreach.adminOutreachCreated}/${outreach.resolvedOutreachCount}`,
    summarizeDeliveryStep('owner', ownerEmail),
    summarizeDeliveryStep('member', memberEmail),
    summarizeDeliveryStep('crm', crmSync),
    summarizeDeliveryStep('webhook', webhook),
    summarizeDeliveryStep('slack', slack),
  ].join(' ');

  return {
    ok,
    summary,
    steps: {
      outreach,
      ownerEmail,
      memberEmail,
      crmSync,
      webhook,
      slack,
    },
  };
}
