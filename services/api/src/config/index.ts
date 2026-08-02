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

  get runtime() {
    const role = process.env.SG_RUNTIME_ROLE ?? 'api';
    const defaultHealthPort = role === 'worker' ? 18081 : role === 'scheduler' ? 18082 : 18080;
    return {
      role,
      healthPort: Number(process.env.RUNTIME_HEALTH_PORT ?? defaultHealthPort),
    };
  },

  get observability() {
    const role = (process.env.SG_RUNTIME_ROLE ?? 'api') as 'api' | 'worker' | 'scheduler';
    const defaultMetricsPort = role === 'worker' ? 9465 : role === 'scheduler' ? 9466 : 9464;
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/$/, '') ?? '';
    const tracesUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
    return {
      enabled:
        process.env.OBSERVABILITY_ENABLED === 'true' ||
        (process.env.OBSERVABILITY_ENABLED !== 'false' && process.env.NODE_ENV === 'production'),
      role,
      metricsHost: process.env.OTEL_EXPORTER_PROMETHEUS_HOST?.trim() || '0.0.0.0',
      metricsPort: Number(process.env.OTEL_EXPORTER_PROMETHEUS_PORT ?? defaultMetricsPort),
      metricsPath: process.env.OTEL_EXPORTER_PROMETHEUS_PATH?.trim() || '/metrics',
      otlpTraceUrl: tracesUrl || (endpoint ? `${endpoint}/v1/traces` : null),
      serviceVersion: process.env.RELEASE_VERSION?.trim() || 'development',
    };
  },

  get platformAlerts() {
    const positiveNumber = (value: string | undefined, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    return {
      environment: process.env.NODE_ENV ?? 'development',
      cooldownMs: positiveNumber(process.env.PLATFORM_ALERT_COOLDOWN_MINUTES, 60) * 60_000,
      retryMs: positiveNumber(process.env.PLATFORM_ALERT_RETRY_MINUTES, 5) * 60_000,
      timeoutMs: positiveNumber(process.env.PLATFORM_ALERT_TIMEOUT_MS, 10_000),
      webhookUrl: process.env.PLATFORM_ALERT_WEBHOOK_URL?.trim() ?? '',
      webhookBearerToken: process.env.PLATFORM_ALERT_WEBHOOK_BEARER_TOKEN?.trim() ?? '',
      slackWebhookUrl: process.env.PLATFORM_ALERT_SLACK_WEBHOOK_URL?.trim() ?? '',
    };
  },

  get auth() {
    const secure =
      process.env.AUTH_COOKIE_SECURE === 'true' ||
      (process.env.AUTH_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');
    const configuredSameSite = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
    const sameSite: 'lax' | 'strict' | 'none' =
      configuredSameSite === 'strict' ||
      configuredSameSite === 'none' ||
      configuredSameSite === 'lax'
        ? configuredSameSite
        : 'lax';
    return {
      jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
      cookies: {
        accessName: secure ? '__Host-sg_access' : 'sg_access',
        refreshName: secure ? '__Host-sg_refresh' : 'sg_refresh',
        secure,
        sameSite,
        refreshTtlSeconds: 30 * 24 * 60 * 60,
      },
    };
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
