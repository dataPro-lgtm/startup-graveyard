import { apiFetch } from './api';
import {
  watchlistListResponseSchema,
  watchlistMutationResponseSchema,
  watchlistStatusResponseSchema,
  type WatchlistListResponse,
  type WatchlistMutationResponse,
  type WatchlistStatusResponse,
} from '@sg/shared/schemas/watchlist';

export type ApiError = {
  error: string;
  details?: unknown;
  summary?: unknown;
};

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchMyWatchlist(): Promise<WatchlistListResponse | ApiError> {
  const res = await apiFetch('/v1/watchlist/me');
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistListResponseSchema.parse(json);
}

export async function fetchWatchlistStatus(
  caseId: string,
): Promise<WatchlistStatusResponse | ApiError> {
  const url = `/v1/watchlist/me/status?caseId=${encodeURIComponent(caseId)}`;
  const res = await apiFetch(url);
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistStatusResponseSchema.parse(json);
}

export async function addToWatchlist(
  caseId: string,
): Promise<WatchlistMutationResponse | ApiError> {
  const res = await apiFetch('/v1/watchlist/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistMutationResponseSchema.parse(json);
}

export async function removeFromWatchlist(
  caseId: string,
): Promise<WatchlistMutationResponse | ApiError> {
  const res = await apiFetch(`/v1/watchlist/items/${encodeURIComponent(caseId)}`, {
    method: 'DELETE',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistMutationResponseSchema.parse(json);
}
