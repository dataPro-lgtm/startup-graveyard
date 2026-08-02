import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { API_BASE_URL } from '@/lib/api';
import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, ADMIN_SESSION_PATH } from '@/lib/adminSession';

export async function POST(request: Request) {
  const store = await cookies();
  const accessToken = store.get(ADMIN_ACCESS_COOKIE)?.value;
  if (accessToken) {
    await fetch(`${API_BASE_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const target = new URL('/admin/login?reason=signed_out', request.url);
  const response = NextResponse.redirect(target, { status: 303 });
  for (const name of [ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE]) {
    response.cookies.set(name, '', { maxAge: 0, path: ADMIN_SESSION_PATH });
  }
  return response;
}
