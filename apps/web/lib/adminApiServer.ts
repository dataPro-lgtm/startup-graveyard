import 'server-only';
import { cookies } from 'next/headers';
import { API_BASE_URL } from './api';
import { ADMIN_ACCESS_COOKIE } from './adminSession';

export async function adminApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(ADMIN_ACCESS_COOKIE)?.value;
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? 'no-store',
  });
}
