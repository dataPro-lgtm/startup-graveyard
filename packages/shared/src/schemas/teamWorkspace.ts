import { z } from 'zod';
import { caseListItemSchema } from './cases.js';
import { savedViewItemSchema } from './savedViews.js';

export const teamWorkspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export const teamWorkspaceInviteStatusSchema = z.enum(['pending', 'accepted', 'revoked']);

export const teamWorkspaceMemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: teamWorkspaceRoleSchema,
  joinedAt: z.string(),
});

export const teamWorkspaceInviteSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  email: z.string().email(),
  role: teamWorkspaceRoleSchema.exclude(['owner']),
  status: teamWorkspaceInviteStatusSchema,
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
});

export const teamWorkspaceSharedSavedViewSchema = savedViewItemSchema.extend({
  sourceSavedViewId: z.string().uuid(),
  sharedByUserId: z.string().uuid(),
  sharedByName: z.string().nullable(),
  sharedAt: z.string(),
});

export const teamWorkspaceSharedCaseSchema = caseListItemSchema.extend({
  sharedByUserId: z.string().uuid(),
  sharedByName: z.string().nullable(),
  sharedAt: z.string(),
});

export const teamWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: teamWorkspaceRoleSchema,
  canManageMembers: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  sharedSavedViewCount: z.number().int().nonnegative(),
  sharedCaseCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  members: z.array(teamWorkspaceMemberSchema),
  invites: z.array(teamWorkspaceInviteSchema),
  sharedSavedViews: z.array(teamWorkspaceSharedSavedViewSchema),
  sharedCases: z.array(teamWorkspaceSharedCaseSchema),
});

export const teamWorkspaceContextResponseSchema = z.object({
  canCreateWorkspace: z.boolean(),
  hasWorkspace: z.boolean(),
  workspace: teamWorkspaceSchema.nullable(),
  pendingInvites: z.array(teamWorkspaceInviteSchema),
});

export const createTeamWorkspaceBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const inviteTeamWorkspaceMemberBodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: teamWorkspaceRoleSchema.exclude(['owner']).default('member'),
});

export const teamWorkspaceInviteIdParamsSchema = z.object({
  inviteId: z.string().uuid(),
});

export const shareSavedViewToWorkspaceBodySchema = z.object({
  savedViewId: z.string().uuid(),
});

export const shareCaseToWorkspaceBodySchema = z.object({
  caseId: z.string().uuid(),
});

export const teamWorkspaceContextMutationResponseSchema = z.object({
  ok: z.literal(true),
  added: z.boolean().optional(),
  workspace: teamWorkspaceSchema,
});

export type TeamWorkspaceRole = z.infer<typeof teamWorkspaceRoleSchema>;
export type TeamWorkspaceInviteStatus = z.infer<typeof teamWorkspaceInviteStatusSchema>;
export type TeamWorkspaceMember = z.infer<typeof teamWorkspaceMemberSchema>;
export type TeamWorkspaceInvite = z.infer<typeof teamWorkspaceInviteSchema>;
export type TeamWorkspaceSharedSavedView = z.infer<typeof teamWorkspaceSharedSavedViewSchema>;
export type TeamWorkspaceSharedCase = z.infer<typeof teamWorkspaceSharedCaseSchema>;
export type TeamWorkspace = z.infer<typeof teamWorkspaceSchema>;
export type TeamWorkspaceContextResponse = z.infer<typeof teamWorkspaceContextResponseSchema>;
