import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserProfile } from '@sg/shared/schemas/auth';
import { verifyAccessToken, type AccessTokenPayload } from '../../auth/tokens.js';
import { accessTokenFromRequest } from '../../auth/cookies.js';

export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

export async function resolveEffectiveUser(
  app: FastifyInstance,
  user: UserProfile,
): Promise<UserProfile> {
  return app.teamWorkspacesRepo.resolveEffectiveUserProfile(user);
}

export async function requireAccessPayload(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AccessTokenPayload | null> {
  const token = accessTokenFromRequest(request);
  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
  if (payload.sid && !(await app.usersRepo.isSessionActive(payload.sub, payload.sid))) {
    reply.code(401).send({ error: 'session_revoked' });
    return null;
  }
  return payload;
}

export async function requireEffectiveUser(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<UserProfile | null> {
  const payload = await requireAccessPayload(app, request, reply);
  if (!payload) return null;
  const user = await app.usersRepo.getById(payload.sub);
  if (!user) {
    reply.code(404).send({ error: 'user_not_found' });
    return null;
  }
  return resolveEffectiveUser(app, user);
}
