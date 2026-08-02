import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from './tokens.js';
import { config } from '../config/index.js';
import type { AuthResult } from '../repositories/usersRepository.js';
import type { UserProfile } from '@sg/shared/schemas/auth';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function extractBearer(header: string | undefined): string | null {
  return header?.trim().match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

export function accessTokenFromRequest(request: FastifyRequest): string | null {
  return (
    extractBearer(request.headers.authorization) ??
    request.cookies[config.auth.cookies.accessName] ??
    null
  );
}

export function refreshTokenFromRequest(request: FastifyRequest): string | null {
  return request.cookies[config.auth.cookies.refreshName] ?? null;
}

export function setAuthCookies(reply: FastifyReply, result: AuthResult): void {
  const cookies = config.auth.cookies;
  const shared = {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: cookies.sameSite,
    path: '/',
  } as const;

  reply.setCookie(cookies.accessName, result.accessToken, {
    ...shared,
    maxAge: result.expiresIn,
  });
  reply.setCookie(cookies.refreshName, result.refreshToken, {
    ...shared,
    maxAge: cookies.refreshTtlSeconds,
  });
}

export function authResponseBody(request: FastifyRequest, result: AuthResult, user: UserProfile) {
  if (request.headers.origin) {
    return { user, expiresIn: result.expiresIn };
  }
  return { ...result, user };
}

export function clearAuthCookies(reply: FastifyReply): void {
  const cookies = config.auth.cookies;
  const options = {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: cookies.sameSite,
    path: '/',
  } as const;
  reply.clearCookie(cookies.accessName, options);
  reply.clearCookie(cookies.refreshName, options);
}

export function cookieOriginAllowed(
  request: FastifyRequest,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (SAFE_METHODS.has(request.method)) return true;

  const bearer = extractBearer(request.headers.authorization);
  if (bearer && verifyAccessToken(bearer)) return true;

  const cookies = config.auth.cookies;
  const hasAuthCookie = Boolean(
    request.cookies[cookies.accessName] || request.cookies[cookies.refreshName],
  );
  if (!hasAuthCookie) return true;

  const origin = request.headers.origin;
  return typeof origin === 'string' && allowedOrigins.has(origin);
}
