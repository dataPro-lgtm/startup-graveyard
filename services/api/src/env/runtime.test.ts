import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeFeatureFlags, validateRuntimeEnv } from './runtime.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('runtime environment', () => {
  it('computes feature flags from current env', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/sg';
    process.env.ADMIN_API_KEY = 'secret';
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    expect(getRuntimeFeatureFlags()).toEqual({
      dbConfigured: true,
      adminEnabled: true,
      aiProvider: 'openai',
      stripeEnabled: true,
      mockMode: false,
    });
  });

  it('throws in production when required env is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_API_KEY;
    process.env.JWT_SECRET = 'change-me-in-production';

    expect(() => validateRuntimeEnv()).toThrow(/Invalid runtime environment/);
  });

  it('rejects unsafe production request-security configuration', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost/sg';
    process.env.ADMIN_API_KEY = 'secret';
    process.env.JWT_SECRET = 'production-secret';
    process.env.WEB_BASE_URL = 'https://app.example.com/path';
    process.env.CORS_ALLOWED_ORIGINS = 'https://research.example.com,not-a-url';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.AUTH_COOKIE_SECURE = 'false';

    expect(() => validateRuntimeEnv()).toThrow(/WEB_BASE_URL/);
    expect(() => validateRuntimeEnv()).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() => validateRuntimeEnv()).toThrow(/RATE_LIMIT_ENABLED/);
    expect(() => validateRuntimeEnv()).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('validates background roles without requiring API credentials', () => {
    process.env.NODE_ENV = 'production';
    process.env.SG_RUNTIME_ROLE = 'worker';
    process.env.DATABASE_URL = 'postgresql://localhost/sg';
    delete process.env.JWT_SECRET;
    delete process.env.WEB_BASE_URL;

    expect(() => validateRuntimeEnv()).not.toThrow();

    delete process.env.DATABASE_URL;
    expect(() => validateRuntimeEnv()).toThrow(/worker runtime requires DATABASE_URL/);
  });

  it('rejects unknown runtime roles and invalid health ports', () => {
    process.env.SG_RUNTIME_ROLE = 'sidecar';
    process.env.RUNTIME_HEALTH_PORT = '70000';

    expect(() => validateRuntimeEnv()).toThrow(/SG_RUNTIME_ROLE/);
    expect(() => validateRuntimeEnv()).toThrow(/RUNTIME_HEALTH_PORT/);
  });

  it('emits warnings in development instead of throwing', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

    expect(() => validateRuntimeEnv()).not.toThrow();
    expect(warningSpy).toHaveBeenCalled();
  });
});
