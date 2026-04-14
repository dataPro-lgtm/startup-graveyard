import { API_BASE_URL } from './api';
import {
  createReportShareResponseSchema,
  deleteReportShareResponseSchema,
  publicReportShareResponseSchema,
  reportShareListResponseSchema,
} from '@sg/shared/schemas/reportShares';

type ApiError = { error: string; details?: unknown };

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchMyReportShares(token: string) {
  const res = await fetch(`${API_BASE_URL}/v1/reports/shares/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return reportShareListResponseSchema.parse(json);
}

export async function createReportShare(token: string, savedViewId: string) {
  const res = await fetch(`${API_BASE_URL}/v1/reports/shares`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ savedViewId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return createReportShareResponseSchema.parse(json);
}

export async function deleteReportShare(token: string, shareId: string) {
  const res = await fetch(`${API_BASE_URL}/v1/reports/shares/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return deleteReportShareResponseSchema.parse(json);
}

export async function fetchPublicReportShare(shareToken: string) {
  const res = await fetch(
    `${API_BASE_URL}/v1/reports/shares/public/${encodeURIComponent(shareToken)}`,
    {
      cache: 'no-store',
    },
  );
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return publicReportShareResponseSchema.parse(json);
}
