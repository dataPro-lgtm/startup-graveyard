import { apiFetch } from './api';
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

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchMySavedViews() {
  const res = await apiFetch('/v1/saved-views/me', {
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return savedViewListResponseSchema.parse(json);
}

export async function createSavedView(input: { name: string; filters: SavedViewFilters }) {
  const res = await apiFetch('/v1/saved-views/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return createSavedViewResponseSchema.parse(json);
}

export async function updateSavedView(
  savedViewId: string,
  input: { name?: string; filters?: SavedViewFilters },
) {
  const res = await apiFetch(`/v1/saved-views/items/${encodeURIComponent(savedViewId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return updateSavedViewResponseSchema.parse(json);
}

export async function deleteSavedView(savedViewId: string) {
  const res = await apiFetch(`/v1/saved-views/items/${encodeURIComponent(savedViewId)}`, {
    method: 'DELETE',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return deleteSavedViewResponseSchema.parse(json);
}
