/**
 * Centralised configuration — all process.env access goes through here.
 * Callers import typed values instead of reading env vars directly.
 */

/**
 * All fields use getters so values are read from process.env at call time,
 * not at module-load time. This lets loadRootEnv() run before any access.
 */
export const config = {
  get db() {
    return { url: process.env.DATABASE_URL ?? '' };
  },

  get server() {
    return {
      port: Number(process.env.PORT ?? 18080),
      adminApiKey: process.env.ADMIN_API_KEY ?? '',
    };
  },

  get auth() {
    return { jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production' };
  },

  get web() {
    return {
      baseUrl: (
        process.env.WEB_BASE_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        'http://localhost:3000'
      )
        .trim()
        .replace(/\/$/, ''),
    };
  },

  get security() {
    const positiveInt = (value: string | undefined, fallback: number) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    const trustProxyValue = process.env.TRUST_PROXY?.trim() ?? '';
    const trustProxy =
      trustProxyValue === 'true'
        ? true
        : trustProxyValue === '' || trustProxyValue === 'false'
          ? false
          : trustProxyValue
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean);

    return {
      additionalCorsOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      trustProxy,
      rateLimit: {
        enabled:
          process.env.RATE_LIMIT_ENABLED === 'true' ||
          (process.env.RATE_LIMIT_ENABLED !== 'false' && process.env.NODE_ENV !== 'test'),
        windowMs: positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
        max: {
          auth: positiveInt(process.env.RATE_LIMIT_AUTH_MAX, 10),
          authRefresh: positiveInt(process.env.RATE_LIMIT_AUTH_REFRESH_MAX, 30),
          billing: positiveInt(process.env.RATE_LIMIT_BILLING_MAX, 10),
          copilot: positiveInt(process.env.RATE_LIMIT_COPILOT_MAX, 20),
          export: positiveInt(process.env.RATE_LIMIT_EXPORT_MAX, 10),
          webhook: positiveInt(process.env.RATE_LIMIT_WEBHOOK_MAX, 120),
        },
      },
    };
  },

  get openai() {
    return {
      apiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
      baseUrl: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, ''),
      chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    };
  },

  get anthropic() {
    return {
      apiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? '',
      chatModel: process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001',
    };
  },

  get hasOpenAI(): boolean {
    return (process.env.OPENAI_API_KEY?.trim() ?? '').length > 0;
  },
  get hasAnthropic(): boolean {
    return (process.env.ANTHROPIC_API_KEY?.trim() ?? '').length > 0;
  },

  get stripe() {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      proPriceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
      teamPriceId: process.env.STRIPE_TEAM_PRICE_ID ?? '',
    };
  },
  get recoveryOutreach() {
    return {
      emailSmtpHost: process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST ?? '',
      emailSmtpPort: Math.max(
        1,
        Math.trunc(Number(process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_PORT ?? 587)) || 587,
      ),
      emailSmtpSecure: process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_SECURE === 'true',
      emailSmtpUser: process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_USER ?? '',
      emailSmtpPass: process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_PASS ?? '',
      emailFrom: process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM ?? '',
      emailReplyTo: process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_REPLY_TO ?? '',
      emailTimeoutMs: Number(process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_TIMEOUT_MS ?? 10000),
      webhookUrl: process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL ?? '',
      webhookBearerToken: process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_BEARER_TOKEN ?? '',
      webhookTimeoutMs: Number(process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_TIMEOUT_MS ?? 10000),
      crmApiUrl: process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL ?? '',
      crmApiBearerToken: process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_BEARER_TOKEN ?? '',
      crmApiTimeoutMs: Number(process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_TIMEOUT_MS ?? 10000),
      slackWebhookUrl: process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL ?? '',
      slackWebhookTimeoutMs: Number(
        process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_TIMEOUT_MS ?? 10000,
      ),
      webhookMaxAttempts: Math.max(
        1,
        Math.trunc(Number(process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_MAX_ATTEMPTS ?? 3)) || 3,
      ),
    };
  },
  get hasStripe(): boolean {
    return (process.env.STRIPE_SECRET_KEY?.trim() ?? '').startsWith('sk_');
  },
  get hasRecoveryOutreachWebhook(): boolean {
    return (process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL?.trim() ?? '').length > 0;
  },
  get hasRecoveryOutreachEmail(): boolean {
    return (
      (process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST?.trim() ?? '').length > 0 &&
      (process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM?.trim() ?? '').length > 0
    );
  },
  get hasRecoveryOutreachCrmApi(): boolean {
    return (process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL?.trim() ?? '').length > 0;
  },
  get hasRecoveryOutreachSlackWebhook(): boolean {
    return (process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL?.trim() ?? '').length > 0;
  },
};
