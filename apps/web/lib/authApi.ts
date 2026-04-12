import { API_BASE_URL } from './api';
import type { AuthResponse, UserProfile } from '@sg/shared/schemas/auth';

// ── Token storage (localStorage, client only) ────────────────────────────────
const ACCESS_KEY = 'sg_access';
const REFRESH_KEY = 'sg_refresh';

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(ACCESS_KEY) : null;
}

export function getRefreshToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
}

// ── API calls ────────────────────────────────────────────────────────────────
type ApiError = { error: string; details?: unknown };

async function post<T>(path: string, body: unknown, token?: string): Promise<T | ApiError> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
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

export async function apiRefresh(refreshToken: string): Promise<AuthResponse | ApiError> {
  return post<AuthResponse>('/v1/auth/refresh', { refreshToken });
}

export async function apiLogout(accessToken: string): Promise<void> {
  await post('/v1/auth/logout', {}, accessToken);
}

export async function apiMe(accessToken: string): Promise<UserProfile | ApiError> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json() as Promise<UserProfile | ApiError>;
}

export type { AuthResponse, UserProfile };
