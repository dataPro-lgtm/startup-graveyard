import { apiFetch } from './api';
import {
  createReportShareResponseSchema,
  deleteReportShareResponseSchema,
  publicReportShareResponseSchema,
  reportShareListResponseSchema,
} from '@sg/shared/schemas/reportShares';

type ApiError = { error: string; details?: unknown };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchMyReportShares() {
  const res = await apiFetch('/v1/reports/shares/me', {
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return reportShareListResponseSchema.parse(json);
}

export async function createReportShare(savedViewId: string) {
  const res = await apiFetch('/v1/reports/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedViewId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return createReportShareResponseSchema.parse(json);
}

export async function deleteReportShare(shareId: string) {
  const res = await apiFetch(`/v1/reports/shares/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return deleteReportShareResponseSchema.parse(json);
}

export async function fetchPublicReportShare(shareToken: string) {
  const res = await apiFetch(`/v1/reports/shares/public/${encodeURIComponent(shareToken)}`, {
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return publicReportShareResponseSchema.parse(json);
}
