import { config } from '../config/index.js';

export type RecoveryFallbackMemberEmailInput = {
  to: string;
  memberDisplayName: string | null;
  workspaceName: string;
  ownerDisplayName: string | null;
  ownerEmail: string;
  title: string;
  detail: string;
  subscription: string;
  billingStatus: string;
};

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function memberLabel(input: RecoveryFallbackMemberEmailInput): string {
  return input.memberDisplayName?.trim() || input.to;
}

function ownerLabel(input: RecoveryFallbackMemberEmailInput): string {
  return input.ownerDisplayName?.trim() || input.ownerEmail;
}

function emailSubject(input: RecoveryFallbackMemberEmailInput): string {
  return `[Startup Graveyard] ${input.workspaceName} 已临时回退到个人权限`;
}

function emailText(input: RecoveryFallbackMemberEmailInput): string {
  return [
    `${memberLabel(input)}，`,
    '',
    `你所在的 Team Workspace「${input.workspaceName}」当前已临时回退到个人套餐权限。`,
    '',
    `当前提示：${input.title}`,
    input.detail,
    '',
    `工作区所有者：${ownerLabel(input)}`,
    `当前团队账单状态：${input.subscription.toUpperCase()} / ${input.billingStatus}`,
    '',
    '你现在仍然可以继续按个人套餐使用产品；当账单所有者恢复 Team 订阅后，团队权限、共享视图和邀请能力会自动恢复。',
    '如果这会影响你的工作，请直接联系工作区所有者处理恢复。',
    '',
    'Startup Graveyard Ops',
  ].join('\n');
}

function emailHtml(input: RecoveryFallbackMemberEmailInput): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>${htmlEscape(memberLabel(input))}，</p>
      <p>你所在的 Team Workspace <strong>${htmlEscape(input.workspaceName)}</strong> 当前已临时回退到个人套餐权限。</p>
      <div style="border:1px solid #dbe4ff;border-radius:12px;padding:14px 16px;background:#f8fbff">
        <div style="font-weight:700;margin-bottom:6px">${htmlEscape(input.title)}</div>
        <div style="margin-bottom:8px">${htmlEscape(input.detail)}</div>
        <div style="font-size:13px;color:#475569">
          工作区所有者：${htmlEscape(ownerLabel(input))}<br />
          当前团队账单状态：${htmlEscape(input.subscription.toUpperCase())} / ${htmlEscape(
            input.billingStatus,
          )}
        </div>
      </div>
      <p style="margin-top:16px">你现在仍然可以继续按个人套餐使用产品；当账单所有者恢复 Team 订阅后，团队权限、共享视图和邀请能力会自动恢复。</p>
      <p>如果这会影响你的工作，请直接联系工作区所有者处理恢复。</p>
      <p style="margin-top:20px;color:#6b7280">Startup Graveyard Ops</p>
    </div>
  `.trim();
}

export async function sendRecoveryFallbackMemberEmail(
  input: RecoveryFallbackMemberEmailInput,
): Promise<{
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
