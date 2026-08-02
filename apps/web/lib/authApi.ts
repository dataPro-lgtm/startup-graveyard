import { apiFetch } from './api';
import type { AuthResponse, UserProfile, UserSession } from '@sg/shared/schemas/auth';

// ── API calls ────────────────────────────────────────────────────────────────
type ApiError = { error: string; details?: unknown };

async function post<T>(path: string, body: unknown): Promise<T | ApiError> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T | ApiError>;
}

export function isApiError(v: unknown): v is ApiError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export async function apiRegister(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse | ApiError> {
  return post<AuthResponse>('/v1/auth/register', { email, password, displayName });
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse | ApiError> {
  return post<AuthResponse>('/v1/auth/login', { email, password });
}

export async function apiRefresh(): Promise<AuthResponse | ApiError> {
  return post<AuthResponse>('/v1/auth/refresh', {});
}

export async function apiLogout(): Promise<void> {
  await post('/v1/auth/logout', {});
}

export async function apiMe(): Promise<UserProfile | ApiError> {
  const res = await apiFetch('/v1/auth/me');
  return res.json() as Promise<UserProfile | ApiError>;
}

export async function apiSessions(): Promise<{ items: UserSession[] } | ApiError> {
  const res = await apiFetch('/v1/auth/sessions');
  return res.json() as Promise<{ items: UserSession[] } | ApiError>;
}

export async function apiRevokeSession(
  sessionId: string,
): Promise<{ ok: true; currentSessionRevoked: boolean } | ApiError> {
  const res = await apiFetch(`/v1/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  return res.json() as Promise<{ ok: true; currentSessionRevoked: boolean } | ApiError>;
}

export async function apiRevokeOtherSessions(): Promise<
  { ok: true; revokedCount: number } | ApiError
> {
  return post('/v1/auth/sessions/revoke-others', {});
}

export type { AuthResponse, UserProfile, UserSession };
