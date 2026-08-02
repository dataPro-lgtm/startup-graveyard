import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../auth/tokens.js';
import { config } from '../config/index.js';

export type RateLimitProfile =
  | 'auth'
  | 'authRefresh'
  | 'billing'
  | 'copilot'
  | 'export'
  | 'webhook';

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  const parsed = new URL(trimmed);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== trimmed) {
    throw new Error(`Invalid CORS origin: ${value}`);
  }
  return parsed.origin;
}

export function resolveCorsAllowedOrigins(): ReadonlySet<string> {
  const origins = [config.web.baseUrl, ...config.security.additionalCorsOrigins]
    .filter(Boolean)
    .map(normalizeOrigin);
  return new Set(origins);
}

function authenticatedPrincipalKey(request: FastifyRequest): string {
  const header = request.headers.authorization?.trim();
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token ? verifyAccessToken(token) : null;
  if (payload) return `user:${payload.sub}`;

  return `ip:${request.ip}`;
}

function profileMax(profile: RateLimitProfile): number {
  return config.security.rateLimit.max[profile];
}

export function routeRateLimit(profile: RateLimitProfile): FastifyContextConfig['rateLimit'] {
  if (!config.security.rateLimit.enabled) return false;

  const usePrincipal = profile === 'billing' || profile === 'export';
  return {
    max: profileMax(profile),
    timeWindow: config.security.rateLimit.windowMs,
    groupId: profile,
    keyGenerator: usePrincipal ? authenticatedPrincipalKey : (request) => `ip:${request.ip}`,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'rate_limit_exceeded',
      message: `Too many requests. Retry in ${context.after}.`,
      retryAfter: context.after,
    }),
  };
}
