import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import { config } from '../config/index.js';
import type { TeamWorkspacesRepository } from '../repositories/teamWorkspacesRepository.js';

type DeadLetterWorkspace = TeamWorkspaceAdminMetrics['actionableWorkspaces'][number];

export type RecoveryOutreachSlackAlertResult =
  | {
      ok: true;
      attemptedCount: number;
      alertedCount: number;
      statusCode: number | null;
      skipped: 'no_dead_letter_handoffs' | 'already_alerted';
    }
  | {
      ok: true;
      attemptedCount: number;
      alertedCount: number;
      statusCode: number;
      skipped: null;
    }
  | {
      ok: false;
      error: 'recovery_slack_alert_disabled' | 'recovery_slack_alert_failed';
      attemptedCount: number;
      alertedCount: number;
      statusCode: number | null;
      detail: string;
    };

type RecoveryOutreachSlackPayload = {
  text: string;
  blocks: Array<Record<string, unknown>>;
};

const ERROR_MAX = 500;

function clipError(detail: string): string {
  return detail.length <= ERROR_MAX ? detail : `${detail.slice(0, ERROR_MAX)}…`;
}

function workspaceSummary(item: DeadLetterWorkspace) {
  const warningCodes = item.warningCodes.join(' / ');
  const actions = item.recommendedActions.map((action) => action.title).join(' / ');
  const parts = [
    `${item.workspaceName} · ${item.ownerEmail}`,
    `${item.subscription.toUpperCase()} / ${item.billingStatus}`,
    `阶段：${item.recoveryStage}`,
    `风险：${warningCodes || '无'}`,
    `动作：${actions || '无'}`,
  ];
  if (item.lastOutreachWebhookError) parts.push(`Webhook 失败：${item.lastOutreachWebhookError}`);
  if (item.lastOutreachWebhookExhaustedAt) {
    parts.push(`停止自动重试：${item.lastOutreachWebhookExhaustedAt}`);
  }
  return parts.join('\n');
}

function toSlackPayload(
  deliveredAt: string,
  items: DeadLetterWorkspace[],
): RecoveryOutreachSlackPayload {
  return {
    text: `Startup Graveyard 有 ${items.length} 个 Team Workspace recovery handoff 已进入 dead-letter，需要 Ops 接管。`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Recovery Dead-Letter Alerts (${items.length})`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `以下 Team Workspace recovery handoff 已达到 webhook 自动重试上限，需要 Ops 跟进。\n发送时间：${deliveredAt}`,
        },
      },
      ...items.flatMap((item) => [
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${item.workspaceName}*\n${workspaceSummary(item)}`,
          },
        },
      ]),
    ],
  };
}

export async function deliverRecoveryOutreachSlackAlert(
  teamWorkspacesRepo: TeamWorkspacesRepository,
  options?: {
    force?: boolean;
  },
): Promise<RecoveryOutreachSlackAlertResult> {
  if (!config.recoveryOutreach.slackWebhookUrl) {
    return {
      ok: false,
      error: 'recovery_slack_alert_disabled',
      attemptedCount: 0,
      alertedCount: 0,
      statusCode: null,
      detail: 'TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL 未配置',
    };
  }

  const force = options?.force ?? false;
  const stats = await teamWorkspacesRepo.getAdminMetrics();
  const deadLettered = stats.actionableWorkspaces.filter(
    (item) =>
      item.lastOutreachStatus === 'handed_off' && item.lastOutreachWebhookExhaustedAt != null,
  );
  if (deadLettered.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      alertedCount: 0,
      statusCode: null,
      skipped: 'no_dead_letter_handoffs',
    };
  }

  const alertable = force
    ? deadLettered
    : deadLettered.filter((item) => item.lastOutreachSlackAlertedAt == null);
  if (alertable.length === 0) {
    return {
      ok: true,
      attemptedCount: 0,
      alertedCount: 0,
      statusCode: null,
      skipped: 'already_alerted',
    };
  }

  const attemptedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.recoveryOutreach.slackWebhookTimeoutMs,
  );

  try {
    const response = await fetch(config.recoveryOutreach.slackWebhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'startup-graveyard/recovery-outreach-slack',
      },
      body: JSON.stringify(toSlackPayload(attemptedAt, alertable)),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const detail = clipError((await response.text()) || response.statusText || 'slack_failed');
      await teamWorkspacesRepo.recordDeadLetteredAdminRecoveryOutreachSlackAlert({
        workspaceIds: alertable.map((item) => item.workspaceId),
        statusCode: response.status,
        error: `HTTP ${response.status}: ${detail}`,
        attemptedAt,
      });
      return {
        ok: false,
        error: 'recovery_slack_alert_failed',
        attemptedCount: alertable.length,
        alertedCount: 0,
        statusCode: response.status,
        detail,
      };
    }

    const { alertedCount } =
      await teamWorkspacesRepo.recordDeadLetteredAdminRecoveryOutreachSlackAlert({
        workspaceIds: alertable.map((item) => item.workspaceId),
        statusCode: response.status,
        error: null,
        attemptedAt,
        alertedAt: attemptedAt,
      });
    return {
      ok: true,
      attemptedCount: alertable.length,
      alertedCount,
      statusCode: response.status,
      skipped: null,
    };
  } catch (error) {
    clearTimeout(timeout);
    const detail =
      error instanceof Error ? clipError(error.message || error.name) : 'slack_request_failed';
    await teamWorkspacesRepo.recordDeadLetteredAdminRecoveryOutreachSlackAlert({
      workspaceIds: alertable.map((item) => item.workspaceId),
      statusCode: null,
      error: detail,
      attemptedAt,
    });
    return {
      ok: false,
      error: 'recovery_slack_alert_failed',
      attemptedCount: alertable.length,
      alertedCount: 0,
      statusCode: null,
      detail,
    };
  }
}
