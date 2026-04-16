import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';
import type {
  TeamWorkspaceRecoveryPlaybookDeliveryStep,
  TeamWorkspaceRecoveryPlaybookOutreachStep,
  TeamWorkspaceRecoveryPlaybookStepName,
  TeamWorkspaceRecoveryPlaybookSteps,
} from '@sg/shared/schemas/teamWorkspace';
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

type RecoveryPlaybookDeliveryStep = TeamWorkspaceRecoveryPlaybookDeliveryStep;
type RecoveryPlaybookOutreachStep = TeamWorkspaceRecoveryPlaybookOutreachStep;
type RecoveryPlaybookStepName = TeamWorkspaceRecoveryPlaybookStepName;

const ALL_RECOVERY_PLAYBOOK_STEPS: readonly RecoveryPlaybookStepName[] = [
  'outreach',
  'ownerEmail',
  'memberEmail',
  'crmSync',
  'webhook',
  'slack',
];

export type RecoveryOutreachPlaybookResult = {
  ok: boolean;
  summary: string;
  steps: TeamWorkspaceRecoveryPlaybookSteps;
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

function summarizeOutreachStep(step: RecoveryPlaybookOutreachStep) {
  if (step.status === 'completed') {
    return `outreach=ok:${step.ownerOutreachCreated}/${step.adminOutreachCreated}/${step.resolvedOutreachCount}`;
  }
  if (step.status === 'skipped') {
    return `outreach=skip:${step.skippedReason ?? 'none'}`;
  }
  return `outreach=failed:${step.detail ?? 'unknown'}`;
}

function normalizeRequestedSteps(
  requestedSteps?: RecoveryPlaybookStepName[],
): RecoveryPlaybookStepName[] {
  if (!requestedSteps || requestedSteps.length === 0) {
    return [...ALL_RECOVERY_PLAYBOOK_STEPS];
  }
  return [...new Set(requestedSteps.filter((step) => ALL_RECOVERY_PLAYBOOK_STEPS.includes(step)))];
}

function skippedDeliveryStep(reason: string): RecoveryPlaybookDeliveryStep {
  return {
    status: 'skipped',
    attemptedCount: 0,
    successCount: 0,
    failedCount: 0,
    skippedReason: reason,
    error: null,
    detail: null,
    statusCode: null,
  };
}

function skippedOutreachStep(reason: string): RecoveryPlaybookOutreachStep {
  return {
    status: 'skipped',
    workspaceCount: 0,
    ownerOutreachCreated: 0,
    adminOutreachCreated: 0,
    retriedOutreachCount: 0,
    resolvedOutreachCount: 0,
    skippedReason: reason,
    detail: null,
  };
}

export async function runRecoveryOutreachPlaybook(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    retryIntervalHours?: number;
    force?: boolean;
    triggerType?: string;
    onlySteps?: RecoveryPlaybookStepName[];
    rerunOfRunId?: string | null;
  },
): Promise<RecoveryOutreachPlaybookResult> {
  const retryIntervalHours = Math.max(0, options?.retryIntervalHours ?? 24);
  const force = options?.force ?? false;
  const triggerType = options?.triggerType ?? 'manual';
  const requestedSteps = normalizeRequestedSteps(options?.onlySteps);
  const requestedStepSet = new Set<RecoveryPlaybookStepName>(requestedSteps);
  const rerunOfRunId = options?.rerunOfRunId ?? null;

  let outreach: RecoveryPlaybookOutreachStep;
  if (requestedStepSet.has('outreach')) {
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
        skippedReason: null,
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
        skippedReason: null,
        detail,
      };
    }
  } else {
    outreach = skippedOutreachStep('not_selected');
  }

  const blockedByOutreachFailure = requestedStepSet.has('outreach') && outreach.status === 'failed';

  const ownerEmail = !requestedStepSet.has('ownerEmail')
    ? skippedDeliveryStep('not_selected')
    : blockedByOutreachFailure
      ? skippedDeliveryStep('outreach_failed')
      : normalizeOwnerEmailStep(
          await deliverRecoveryOutreachOwnerEmail(teamWorkspacesRepo, {
            retryIntervalHours,
            force,
          }),
        );
  const memberEmail = !requestedStepSet.has('memberEmail')
    ? skippedDeliveryStep('not_selected')
    : blockedByOutreachFailure
      ? skippedDeliveryStep('outreach_failed')
      : normalizeMemberEmailStep(
          await deliverRecoveryFallbackMemberEmail(teamWorkspacesRepo, {
            retryIntervalHours,
            force,
          }),
        );
  const crmSync = !requestedStepSet.has('crmSync')
    ? skippedDeliveryStep('not_selected')
    : blockedByOutreachFailure
      ? skippedDeliveryStep('outreach_failed')
      : normalizeCrmStep(
          await deliverRecoveryOutreachCrmSync(teamWorkspacesRepo, {
            retryIntervalHours,
            force,
          }),
        );
  const webhook = !requestedStepSet.has('webhook')
    ? skippedDeliveryStep('not_selected')
    : blockedByOutreachFailure
      ? skippedDeliveryStep('outreach_failed')
      : normalizeWebhookStep(
          await deliverRecoveryOutreachWebhook(teamWorkspacesRepo, {
            retryIntervalHours,
            force,
          }),
        );
  const slack = !requestedStepSet.has('slack')
    ? skippedDeliveryStep('not_selected')
    : blockedByOutreachFailure
      ? skippedDeliveryStep('outreach_failed')
      : normalizeSlackStep(
          await deliverRecoveryOutreachSlackAlert(teamWorkspacesRepo, {
            force,
          }),
        );

  const ok =
    (!requestedStepSet.has('outreach') || outreach.status !== 'failed') &&
    (!requestedStepSet.has('ownerEmail') || ownerEmail.status !== 'failed') &&
    (!requestedStepSet.has('memberEmail') || memberEmail.status !== 'failed') &&
    (!requestedStepSet.has('crmSync') || crmSync.status !== 'failed') &&
    (!requestedStepSet.has('webhook') || webhook.status !== 'failed') &&
    (!requestedStepSet.has('slack') || slack.status !== 'failed');
  const summary = [
    summarizeOutreachStep(outreach),
    summarizeDeliveryStep('owner', ownerEmail),
    summarizeDeliveryStep('member', memberEmail),
    summarizeDeliveryStep('crm', crmSync),
    summarizeDeliveryStep('webhook', webhook),
    summarizeDeliveryStep('slack', slack),
  ].join(' ');

  const result: RecoveryOutreachPlaybookResult = {
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
  await teamWorkspacesRepo.recordRecoveryPlaybookRun({
    triggerType,
    retryIntervalHours,
    force,
    requestedSteps,
    rerunOfRunId,
    ok: result.ok,
    summary: result.summary,
    steps: result.steps,
  });
  return result;
}
