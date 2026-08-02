export type AiProvider = 'anthropic' | 'openai' | 'none';

export type RuntimeFeatureFlags = {
  dbConfigured: boolean;
  adminEnabled: boolean;
  aiProvider: AiProvider;
  stripeEnabled: boolean;
  mockMode: boolean;
};

const DEFAULT_JWT_SECRET = 'change-me-in-production';

function hasValue(v: string | undefined): boolean {
  return (v?.trim() ?? '').length > 0;
}

function isHttpOrigin(value: string): boolean {
  const normalized = value.trim().replace(/\/$/, '');
  try {
    const parsed = new URL(normalized);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === normalized;
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}

function isLoopbackOrigin(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function getRuntimeFeatureFlags(): RuntimeFeatureFlags {
  const dbConfigured = hasValue(process.env.DATABASE_URL);
  const adminEnabled = true;
  const stripeEnabled = (process.env.STRIPE_SECRET_KEY?.trim() ?? '').startsWith('sk_');
  const aiProvider: AiProvider = hasValue(process.env.ANTHROPIC_API_KEY)
    ? 'anthropic'
    : hasValue(process.env.OPENAI_API_KEY)
      ? 'openai'
      : 'none';

  return {
    dbConfigured,
    adminEnabled,
    aiProvider,
    stripeEnabled,
    mockMode: !dbConfigured,
  };
}

export function validateRuntimeEnv(): RuntimeFeatureFlags {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const runtimeRole = process.env.SG_RUNTIME_ROLE ?? 'api';
  const features = getRuntimeFeatureFlags();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!['api', 'worker', 'scheduler'].includes(runtimeRole)) {
    errors.push('SG_RUNTIME_ROLE must be api, worker, or scheduler.');
  }
  if (runtimeRole !== 'api' && !features.dbConfigured) {
    errors.push(`${runtimeRole} runtime requires DATABASE_URL.`);
  }
  if (
    process.env.RUNTIME_HEALTH_PORT &&
    (!Number.isInteger(Number(process.env.RUNTIME_HEALTH_PORT)) ||
      Number(process.env.RUNTIME_HEALTH_PORT) < 1 ||
      Number(process.env.RUNTIME_HEALTH_PORT) > 65535)
  ) {
    errors.push('RUNTIME_HEALTH_PORT must be an integer between 1 and 65535.');
  }
  if (
    process.env.OTEL_EXPORTER_PROMETHEUS_PORT &&
    (!Number.isInteger(Number(process.env.OTEL_EXPORTER_PROMETHEUS_PORT)) ||
      Number(process.env.OTEL_EXPORTER_PROMETHEUS_PORT) < 1 ||
      Number(process.env.OTEL_EXPORTER_PROMETHEUS_PORT) > 65535)
  ) {
    errors.push('OTEL_EXPORTER_PROMETHEUS_PORT must be an integer between 1 and 65535.');
  }
  if (
    process.env.OTEL_EXPORTER_PROMETHEUS_PATH &&
    !process.env.OTEL_EXPORTER_PROMETHEUS_PATH.startsWith('/')
  ) {
    errors.push('OTEL_EXPORTER_PROMETHEUS_PATH must start with /.');
  }
  for (const key of ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT']) {
    const value = process.env[key]?.trim();
    if (value && !isHttpUrl(value)) {
      errors.push(`${key} must be an HTTP(S) URL.`);
    }
  }
  for (const key of [
    'PLATFORM_ALERT_COOLDOWN_MINUTES',
    'PLATFORM_ALERT_RETRY_MINUTES',
    'PLATFORM_ALERT_TIMEOUT_MS',
  ]) {
    const value = process.env[key];
    if (value && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
      errors.push(`${key} must be a positive number.`);
    }
  }
  for (const key of ['PLATFORM_ALERT_WEBHOOK_URL', 'PLATFORM_ALERT_SLACK_WEBHOOK_URL']) {
    const value = process.env[key]?.trim();
    if (value && !isHttpUrl(value)) {
      errors.push(`${key} must be an HTTP(S) URL without embedded credentials.`);
    }
  }

  if (nodeEnv === 'production') {
    if (!features.dbConfigured) {
      errors.push('DATABASE_URL is required in production.');
    }
    if (runtimeRole === 'api') {
      if (!hasValue(process.env.JWT_SECRET) || process.env.JWT_SECRET === DEFAULT_JWT_SECRET) {
        errors.push('JWT_SECRET must be set to a non-default value in production.');
      }
      if (!hasValue(process.env.WEB_BASE_URL) || !isHttpOrigin(process.env.WEB_BASE_URL ?? '')) {
        errors.push('WEB_BASE_URL must be set to an exact HTTP(S) origin in production.');
      }
      const additionalOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (additionalOrigins.some((origin) => !isHttpOrigin(origin))) {
        errors.push('CORS_ALLOWED_ORIGINS must contain only comma-separated HTTP(S) origins.');
      }
      if (process.env.RATE_LIMIT_ENABLED === 'false') {
        errors.push('RATE_LIMIT_ENABLED cannot be false in production.');
      }
      const insecureCookie = process.env.AUTH_COOKIE_SECURE === 'false';
      if (insecureCookie && !isLoopbackOrigin(process.env.WEB_BASE_URL ?? '')) {
        errors.push('AUTH_COOKIE_SECURE cannot be false for a public production origin.');
      }
      const sameSite = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
      if (sameSite && !['lax', 'strict', 'none'].includes(sameSite)) {
        errors.push('AUTH_COOKIE_SAME_SITE must be lax, strict, or none.');
      }
      if (sameSite === 'none' && insecureCookie) {
        errors.push('AUTH_COOKIE_SAME_SITE=none requires secure cookies.');
      }
    }
  } else {
    if (!features.dbConfigured) {
      warnings.push('DATABASE_URL unset; API will use mock repositories for public data.');
    }
    if (runtimeRole === 'api' && !hasValue(process.env.ADMIN_API_KEY)) {
      warnings.push('ADMIN_API_KEY unset; transitional admin service-key access is disabled.');
    }
    if (features.aiProvider === 'none') {
      warnings.push('No LLM provider configured; Copilot will fall back to rule-based answers.');
    }
    if (runtimeRole === 'api' && !features.stripeEnabled) {
      warnings.push('Stripe is not configured; paid subscription checkout is disabled.');
    }
  }

  for (const warning of warnings) {
    process.emitWarning(warning, { code: 'SG_RUNTIME_WARN' });
  }

  if (errors.length > 0) {
    throw new Error(`Invalid runtime environment:\n- ${errors.join('\n- ')}`);
  }

  return features;
}
