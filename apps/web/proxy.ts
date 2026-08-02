import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_REFRESH_MAX_AGE,
  ADMIN_SESSION_PATH,
  adminCookieSecure,
} from './lib/adminSession';

type AdminAuthPayload = {
  user?: { role?: string; adminRole?: string | null };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

function apiBaseUrl(): string {
  return (
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:18080'
  );
}

function loginRedirect(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  url.searchParams.set('reason', reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(ADMIN_ACCESS_COOKIE);
  response.cookies.delete(ADMIN_REFRESH_COOKIE);
  return response;
}

function isNamedAdmin(payload: AdminAuthPayload): boolean {
  return payload.user?.role === 'admin' && typeof payload.user.adminRole === 'string';
}

async function fetchCurrentAdmin(accessToken: string): Promise<AdminAuthPayload | null> {
  const response = await fetch(`${apiBaseUrl()}/v1/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return { user: (await response.json()) as AdminAuthPayload['user'] };
}

async function refreshAdmin(refreshToken: string): Promise<AdminAuthPayload | null> {
  const response = await fetch(`${apiBaseUrl()}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as AdminAuthPayload;
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/admin/login') return NextResponse.next();

  const accessToken = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  if (accessToken) {
    const current = await fetchCurrentAdmin(accessToken);
    if (current && isNamedAdmin(current)) return NextResponse.next();
    if (current) return loginRedirect(request, 'admin_access_required');
  }
  if (!refreshToken) return loginRedirect(request, 'session_required');

  const refreshed = await refreshAdmin(refreshToken);
  if (
    !refreshed ||
    !isNamedAdmin(refreshed) ||
    !refreshed.accessToken ||
    !refreshed.refreshToken ||
    !refreshed.expiresIn
  ) {
    return loginRedirect(request, 'session_expired');
  }

  const requestHeaders = new Headers(request.headers);
  request.cookies.set(ADMIN_ACCESS_COOKIE, refreshed.accessToken);
  request.cookies.set(ADMIN_REFRESH_COOKIE, refreshed.refreshToken);
  requestHeaders.set('cookie', request.cookies.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const cookieOptions = {
    httpOnly: true,
    secure: adminCookieSecure(),
    sameSite: 'lax' as const,
    path: ADMIN_SESSION_PATH,
  };
  response.cookies.set(ADMIN_ACCESS_COOKIE, refreshed.accessToken, {
    ...cookieOptions,
    maxAge: refreshed.expiresIn,
  });
  response.cookies.set(ADMIN_REFRESH_COOKIE, refreshed.refreshToken, {
    ...cookieOptions,
    maxAge: ADMIN_REFRESH_MAX_AGE,
  });
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
