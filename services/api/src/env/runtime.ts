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

export function getRuntimeFeatureFlags(): RuntimeFeatureFlags {
  const dbConfigured = hasValue(process.env.DATABASE_URL);
  const adminEnabled = hasValue(process.env.ADMIN_API_KEY);
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
  const features = getRuntimeFeatureFlags();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (nodeEnv === 'production') {
    if (!features.dbConfigured) {
      errors.push('DATABASE_URL is required in production.');
    }
    if (!features.adminEnabled) {
      errors.push('ADMIN_API_KEY is required in production.');
    }
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
  } else {
    if (!features.dbConfigured) {
      warnings.push('DATABASE_URL unset; API will use mock repositories for public data.');
    }
    if (!features.adminEnabled) {
      warnings.push('ADMIN_API_KEY unset; admin API endpoints are disabled.');
    }
    if (features.aiProvider === 'none') {
      warnings.push('No LLM provider configured; Copilot will fall back to rule-based answers.');
    }
    if (!features.stripeEnabled) {
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
