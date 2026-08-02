import { apiFetch } from './api';
import {
  teamWorkspaceContextMutationResponseSchema,
  teamWorkspaceContextResponseSchema,
  type TeamWorkspaceRole,
} from '@sg/shared/schemas/teamWorkspace';

export const TEAM_WORKSPACE_REFRESH_EVENT = 'sg-team-workspace-refresh';

type ApiError = { error: string; details?: unknown };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export function notifyTeamWorkspaceUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TEAM_WORKSPACE_REFRESH_EVENT));
  }
}

export async function fetchTeamWorkspaceContext() {
  const res = await apiFetch('/v1/team-workspace/me', {
    cache: 'no-store',
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextResponseSchema.parse(json);
}

export async function createTeamWorkspace(input: { name: string }) {
  const res = await apiFetch('/v1/team-workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function inviteTeamWorkspaceMember(input: {
  email: string;
  role: Exclude<TeamWorkspaceRole, 'owner'>;
}) {
  const res = await apiFetch('/v1/team-workspace/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function acceptTeamWorkspaceInvite(inviteId: string) {
  const res = await apiFetch(`/v1/team-workspace/invites/${encodeURIComponent(inviteId)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function shareSavedViewToWorkspace(savedViewId: string) {
  const res = await apiFetch('/v1/team-workspace/shared-saved-views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedViewId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}

export async function shareCaseToWorkspace(caseId: string) {
  const res = await apiFetch('/v1/team-workspace/shared-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId }),
  });
  const json: unknown = await res.json();
  if (!res.ok) return json as ApiError;
  return teamWorkspaceContextMutationResponseSchema.parse(json);
}
