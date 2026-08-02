const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:18080';
const SERVER_API_BASE_URL = process.env.API_BASE_URL ?? PUBLIC_API_BASE_URL;

export const API_BASE_URL =
  typeof window === 'undefined' ? SERVER_API_BASE_URL : PUBLIC_API_BASE_URL;
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? '';
