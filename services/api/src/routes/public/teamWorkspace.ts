import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../../auth/tokens.js';
import {
  createTeamWorkspaceBodySchema,
  inviteTeamWorkspaceMemberBodySchema,
  shareCaseToWorkspaceBodySchema,
  shareSavedViewToWorkspaceBodySchema,
  teamWorkspaceContextMutationResponseSchema,
  teamWorkspaceContextResponseSchema,
  teamWorkspaceInviteIdParamsSchema,
} from '../../schemas/teamWorkspace.js';

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

async function requireUser(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const token = extractBearer(request.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
  const user = await app.usersRepo.getById(payload.sub);
  if (!user) {
    reply.code(404).send({ error: 'user_not_found' });
    return null;
  }
  return user;
}

export async function teamWorkspaceRoutes(app: FastifyInstance) {
  app.get('/me', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;
    return teamWorkspaceContextResponseSchema.parse(
      await app.teamWorkspacesRepo.getContextForUser(user),
    );
  });

  app.post('/', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = createTeamWorkspaceBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const result = await app.teamWorkspacesRepo.createWorkspace(user, parsed.data.name);
    if (result === 'entitlement_required') {
      return reply.code(403).send({ error: 'entitlement_required' });
    }
    if (result === 'already_in_workspace') {
      return reply.code(409).send({ error: 'already_in_workspace' });
    }
    return teamWorkspaceContextMutationResponseSchema.parse({ ok: true, workspace: result });
  });

  app.post('/invites', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = inviteTeamWorkspaceMemberBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const result = await app.teamWorkspacesRepo.inviteMember(
      user.id,
      parsed.data.email,
      parsed.data.role,
    );
    if (result === 'workspace_not_found') {
      return reply.code(404).send({ error: 'workspace_not_found' });
    }
    if (result === 'forbidden') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (result === 'user_already_in_workspace') {
      return reply.code(409).send({ error: 'user_already_in_workspace' });
    }
    if (result === 'workspace_plan_inactive') {
      return reply.code(409).send({ error: 'workspace_plan_inactive' });
    }
    if (result === 'seat_limit_reached') {
      return reply.code(409).send({ error: 'seat_limit_reached' });
    }
    return teamWorkspaceContextMutationResponseSchema.parse({ ok: true, workspace: result });
  });

  app.post('/invites/:inviteId/accept', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = teamWorkspaceInviteIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_params', details: parsed.error.flatten() });
    }

    const result = await app.teamWorkspacesRepo.acceptInvite(user, parsed.data.inviteId);
    if (result === 'invite_not_found') {
      return reply.code(404).send({ error: 'invite_not_found' });
    }
    if (result === 'email_mismatch') {
      return reply.code(403).send({ error: 'email_mismatch' });
    }
    if (result === 'already_in_workspace') {
      return reply.code(409).send({ error: 'already_in_workspace' });
    }
    return teamWorkspaceContextMutationResponseSchema.parse({ ok: true, workspace: result });
  });

  app.post('/shared-saved-views', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = shareSavedViewToWorkspaceBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const result = await app.teamWorkspacesRepo.shareSavedView(user.id, parsed.data.savedViewId);
    if (result === 'workspace_not_found') {
      return reply.code(404).send({ error: 'workspace_not_found' });
    }
    if (result === 'saved_view_not_found') {
      return reply.code(404).send({ error: 'saved_view_not_found' });
    }
    return teamWorkspaceContextMutationResponseSchema.parse({
      ok: true,
      added: result.status === 'added',
      workspace: result.workspace,
    });
  });

  app.post('/shared-cases', async (request, reply) => {
    const user = await requireUser(app, request, reply);
    if (!user) return reply;

    const parsed = shareCaseToWorkspaceBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const result = await app.teamWorkspacesRepo.shareCase(user.id, parsed.data.caseId);
    if (result === 'workspace_not_found') {
      return reply.code(404).send({ error: 'workspace_not_found' });
    }
    if (result === 'case_not_found') {
      return reply.code(404).send({ error: 'case_not_found' });
    }
    return teamWorkspaceContextMutationResponseSchema.parse({
      ok: true,
      added: result.status === 'added',
      workspace: result.workspace,
    });
  });
}
