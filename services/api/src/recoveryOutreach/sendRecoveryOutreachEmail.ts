import { config } from '../config/index.js';

export type RecoveryOutreachOwnerEmailInput = {
  to: string;
  workspaceName: string;
  ownerDisplayName: string | null;
  title: string;
  detail: string;
  subscription: string;
  billingStatus: string;
  recoveryStage: string;
  followUpState: string;
  warningCodes: string[];
  recommendedActions: Array<{
    code: string;
    title: string;
    detail: string;
    surface: string;
  }>;
};

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ownerLabel(input: RecoveryOutreachOwnerEmailInput): string {
  return input.ownerDisplayName?.trim() || input.to;
}

function emailSubject(input: RecoveryOutreachOwnerEmailInput): string {
  return `[Startup Graveyard] ${input.workspaceName} 需要恢复 Team Workspace`;
}

function emailText(input: RecoveryOutreachOwnerEmailInput): string {
  const actionLines =
    input.recommendedActions.length > 0
      ? input.recommendedActions
          .map(
            (action, index) =>
              `${index + 1}. ${action.title}\n   - ${action.detail}\n   - 入口：${action.surface}`,
          )
          .join('\n')
      : '1. 打开账户页或 Team Workspace 面板，处理当前订阅与席位风险。';

  return [
    `${ownerLabel(input)}，`,
    '',
    `你的 Team Workspace「${input.workspaceName}」当前需要恢复处理。`,
    '',
    `当前提示：${input.title}`,
    input.detail,
    '',
    `订阅状态：${input.subscription.toUpperCase()} / ${input.billingStatus}`,
    `恢复阶段：${input.recoveryStage}`,
    `跟进状态：${input.followUpState}`,
    input.warningCodes.length > 0 ? `风险信号：${input.warningCodes.join(' / ')}` : null,
    '',
    '建议动作：',
    actionLines,
    '',
    '处理完成后，团队成员的权限继承、邀请与协作能力会自动恢复到当前账单允许的状态。',
    '',
    'Startup Graveyard Ops',
  ]
    .filter((line): line is string => line != null)
    .join('\n');
}

function emailHtml(input: RecoveryOutreachOwnerEmailInput): string {
  const actions =
    input.recommendedActions.length > 0
      ? input.recommendedActions
          .map(
            (action) =>
              `<li style="margin:0 0 10px"><strong>${htmlEscape(action.title)}</strong><br /><span>${htmlEscape(
                action.detail,
              )}</span><br /><span style="color:#6b7280">入口：${htmlEscape(action.surface)}</span></li>`,
          )
          .join('')
      : `<li><strong>处理当前账单风险</strong><br /><span>请打开账户页或 Team Workspace 面板，恢复当前订阅与席位状态。</span></li>`;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>${htmlEscape(ownerLabel(input))}，</p>
      <p>你的 Team Workspace <strong>${htmlEscape(input.workspaceName)}</strong> 当前需要恢复处理。</p>
      <div style="border:1px solid #dbe4ff;border-radius:12px;padding:14px 16px;background:#f8fbff">
        <div style="font-weight:700;margin-bottom:6px">${htmlEscape(input.title)}</div>
        <div style="margin-bottom:8px">${htmlEscape(input.detail)}</div>
        <div style="font-size:13px;color:#475569">
          订阅状态：${htmlEscape(input.subscription.toUpperCase())} / ${htmlEscape(
            input.billingStatus,
          )}<br />
          恢复阶段：${htmlEscape(input.recoveryStage)}<br />
          跟进状态：${htmlEscape(input.followUpState)}${
            input.warningCodes.length > 0
              ? `<br />风险信号：${htmlEscape(input.warningCodes.join(' / '))}`
              : ''
          }
        </div>
      </div>
      <p style="margin:16px 0 8px;font-weight:700">建议动作</p>
      <ol style="padding-left:20px;margin:0">${actions}</ol>
      <p style="margin-top:16px">处理完成后，团队成员的权限继承、邀请与协作能力会自动恢复到当前账单允许的状态。</p>
      <p style="margin-top:20px;color:#6b7280">Startup Graveyard Ops</p>
    </div>
  `.trim();
}

export async function sendRecoveryOutreachEmail(input: RecoveryOutreachOwnerEmailInput): Promise<{
  messageId: string | null;
}> {
  const nodemailerModule = await import('nodemailer');
  const transporter = nodemailerModule.default.createTransport({
    host: config.recoveryOutreach.emailSmtpHost,
    port: config.recoveryOutreach.emailSmtpPort,
    secure: config.recoveryOutreach.emailSmtpSecure,
    auth: config.recoveryOutreach.emailSmtpUser
      ? {
          user: config.recoveryOutreach.emailSmtpUser,
          pass: config.recoveryOutreach.emailSmtpPass,
        }
      : undefined,
    connectionTimeout: config.recoveryOutreach.emailTimeoutMs,
    greetingTimeout: config.recoveryOutreach.emailTimeoutMs,
    socketTimeout: config.recoveryOutreach.emailTimeoutMs,
  });
  const info = await transporter.sendMail({
    from: config.recoveryOutreach.emailFrom,
    replyTo: config.recoveryOutreach.emailReplyTo || undefined,
    to: input.to,
    subject: emailSubject(input),
    text: emailText(input),
    html: emailHtml(input),
  });
  return { messageId: info.messageId ?? null };
}
