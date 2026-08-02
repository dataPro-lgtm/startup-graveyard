'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authResponseSchema, loginBodySchema } from '@sg/shared/schemas/auth';
import { API_BASE_URL } from '@/lib/api';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_REFRESH_MAX_AGE,
  ADMIN_SESSION_PATH,
  adminCookieSecure,
} from '@/lib/adminSession';

export async function loginAdmin(formData: FormData) {
  const parsed = loginBodySchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) redirect('/admin/login?reason=invalid_credentials');

  const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  if (!response.ok) redirect('/admin/login?reason=invalid_credentials');

  const result = authResponseSchema.safeParse(await response.json());
  if (
    !result.success ||
    !result.data.accessToken ||
    !result.data.refreshToken ||
    result.data.user.role !== 'admin' ||
    !result.data.user.adminRole
  ) {
    if (result.success && result.data.accessToken) {
      await fetch(`${API_BASE_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${result.data.accessToken}` },
      }).catch(() => undefined);
    }
    redirect('/admin/login?reason=admin_access_required');
  }

  const store = await cookies();
  const shared = {
    httpOnly: true,
    secure: adminCookieSecure(),
    sameSite: 'lax' as const,
    path: ADMIN_SESSION_PATH,
  };
  store.set(ADMIN_ACCESS_COOKIE, result.data.accessToken, {
    ...shared,
    maxAge: result.data.expiresIn,
  });
  store.set(ADMIN_REFRESH_COOKIE, result.data.refreshToken, {
    ...shared,
    maxAge: ADMIN_REFRESH_MAX_AGE,
  });
  redirect('/admin/reviews');
}
