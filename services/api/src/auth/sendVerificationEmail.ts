import { config } from '../config/index.js';

export type VerificationEmailInput = {
  to: string;
  displayName: string | null;
  verifyUrl: string;
  expiresMinutes: number;
};

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function recipientLabel(input: VerificationEmailInput): string {
  return input.displayName?.trim() || input.to;
}

function expiryLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} 小时` : `${minutes} 分钟`;
}

function emailText(input: VerificationEmailInput): string {
  return [
    `${recipientLabel(input)}，`,
    '',
    '感谢注册 Startup Graveyard。请打开以下链接验证你的邮箱：',
    input.verifyUrl,
    '',
    `链接 ${expiryLabel(input.expiresMinutes)} 内有效，且只能使用一次。`,
    '',
    '如果这不是你本人的操作，请忽略这封邮件。',
    '',
    'Startup Graveyard',
  ].join('\n');
}

function emailHtml(input: VerificationEmailInput): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>${htmlEscape(recipientLabel(input))}，</p>
      <p>感谢注册 Startup Graveyard。请点击下方按钮验证你的邮箱：</p>
      <p>
        <a href="${htmlEscape(input.verifyUrl)}"
           style="display:inline-block;padding:10px 18px;background:#5b7cff;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700">
          验证邮箱
        </a>
      </p>
      <p style="font-size:13px;color:#475569">
        链接 ${expiryLabel(input.expiresMinutes)} 内有效，且只能使用一次。若按钮无法点击，请复制以下地址到浏览器：<br />
        <span style="word-break:break-all">${htmlEscape(input.verifyUrl)}</span>
      </p>
      <p>如果这不是你本人的操作，请忽略这封邮件。</p>
      <p style="margin-top:20px;color:#6b7280">Startup Graveyard</p>
    </div>
  `.trim();
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<{
  messageId: string | null;
}> {
  const nodemailerModule = await import('nodemailer');
  const transporter = nodemailerModule.default.createTransport({
    host: config.authEmail.smtpHost,
    port: config.authEmail.smtpPort,
    secure: config.authEmail.smtpSecure,
    auth: config.authEmail.smtpUser
      ? {
          user: config.authEmail.smtpUser,
          pass: config.authEmail.smtpPass,
        }
      : undefined,
    connectionTimeout: config.authEmail.timeoutMs,
    greetingTimeout: config.authEmail.timeoutMs,
    socketTimeout: config.authEmail.timeoutMs,
  });
  const info = await transporter.sendMail({
    from: config.authEmail.from,
    replyTo: config.authEmail.replyTo || undefined,
    to: input.to,
    subject: '[Startup Graveyard] 验证你的邮箱',
    text: emailText(input),
    html: emailHtml(input),
  });
  return { messageId: info.messageId ?? null };
}
