export const ADMIN_ACCESS_COOKIE = 'sg_admin_access';
export const ADMIN_REFRESH_COOKIE = 'sg_admin_refresh';
export const ADMIN_SESSION_PATH = '/admin';
export const ADMIN_REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export function adminCookieSecure(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}
