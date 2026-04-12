import { API_BASE_URL } from './api';
import {
  teamWorkspaceContextMutationResponseSchema,
  teamWorkspaceContextResponseSchema,
  type TeamWorkspaceRole,
} from '@sg/shared/schemas/teamWorkspace';

export const TEAM_WORKSPACE_REFRESH_EVENT = 'sg-team-workspace-refresh';

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

export function notifyTeamWorkspaceUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TEAM_WORKSPACE_REFRESH_EVENT));
  }
}

export async function fetchTeamWorkspaceContext(token: string) {
  const res = await fetch(`${API_BASE_URL}/v1/team-workspace/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextResponseSchema.parse(json);
}

export async function createTeamWorkspace(token: string, input: { name: string }) {
  const res = await fetch(`${API_BASE_URL}/v1/team-workspace`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function inviteTeamWorkspaceMember(
  token: string,
  input: { email: string; role: Exclude<TeamWorkspaceRole, 'owner'> },
) {
  const res = await fetch(`${API_BASE_URL}/v1/team-workspace/invites`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function acceptTeamWorkspaceInvite(token: string, inviteId: string) {
  const res = await fetch(
    `${API_BASE_URL}/v1/team-workspace/invites/${encodeURIComponent(inviteId)}/accept`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    },
  );
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function shareSavedViewToWorkspace(token: string, savedViewId: string) {
  const res = await fetch(`${API_BASE_URL}/v1/team-workspace/shared-saved-views`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ savedViewId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function shareCaseToWorkspace(token: string, caseId: string) {
  const res = await fetch(`${API_BASE_URL}/v1/team-workspace/shared-cases`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ caseId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}
