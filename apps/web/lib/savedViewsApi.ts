import { API_BASE_URL } from './api';
import {
  createSavedViewResponseSchema,
  deleteSavedViewResponseSchema,
  savedViewListResponseSchema,
  updateSavedViewResponseSchema,
  type SavedViewFilters,
} from '@sg/shared/schemas/savedViews';

type ApiError = {
  error: string;
  summary?: {
    savedViewCount: number;
    savedViewLimit: number;
    remainingSlots: number;
    canUseSavedViews: boolean;
  };
  details?: unknown;
};

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchMySavedViews(token: string) {
  const res = await fetch(`${API_BASE_URL}/v1/saved-views/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return savedViewListResponseSchema.parse(json);
}

export async function createSavedView(
  token: string,
  input: { name: string; filters: SavedViewFilters },
) {
  const res = await fetch(`${API_BASE_URL}/v1/saved-views/items`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return createSavedViewResponseSchema.parse(json);
}

export async function updateSavedView(
  token: string,
  savedViewId: string,
  input: { name?: string; filters?: SavedViewFilters },
) {
  const res = await fetch(
    `${API_BASE_URL}/v1/saved-views/items/${encodeURIComponent(savedViewId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return updateSavedViewResponseSchema.parse(json);
}

export async function deleteSavedView(token: string, savedViewId: string) {
  const res = await fetch(
    `${API_BASE_URL}/v1/saved-views/items/${encodeURIComponent(savedViewId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return deleteSavedViewResponseSchema.parse(json);
}
