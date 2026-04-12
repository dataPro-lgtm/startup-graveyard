import { API_BASE_URL } from './api';
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

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchMyWatchlist(
  accessToken: string,
): Promise<WatchlistListResponse | ApiError> {
  const res = await fetch(`${API_BASE_URL}/v1/watchlist/me`, {
    headers: authHeaders(accessToken),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistListResponseSchema.parse(json);
}

export async function fetchWatchlistStatus(
  accessToken: string,
  caseId: string,
): Promise<WatchlistStatusResponse | ApiError> {
  const url = `${API_BASE_URL}/v1/watchlist/me/status?caseId=${encodeURIComponent(caseId)}`;
  const res = await fetch(url, {
    headers: authHeaders(accessToken),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistStatusResponseSchema.parse(json);
}

export async function addToWatchlist(
  accessToken: string,
  caseId: string,
): Promise<WatchlistMutationResponse | ApiError> {
  const res = await fetch(`${API_BASE_URL}/v1/watchlist/items`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ caseId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistMutationResponseSchema.parse(json);
}

export async function removeFromWatchlist(
  accessToken: string,
  caseId: string,
): Promise<WatchlistMutationResponse | ApiError> {
  const res = await fetch(`${API_BASE_URL}/v1/watchlist/items/${encodeURIComponent(caseId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return watchlistMutationResponseSchema.parse(json);
}
