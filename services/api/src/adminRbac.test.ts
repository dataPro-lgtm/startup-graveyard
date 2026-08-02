import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminRole } from '@sg/shared/schemas/auth';
import { buildApp } from './buildApp.js';

describe('named admin RBAC', () => {
  let app: FastifyInstance;
  let adminUserId: string;
  let adminSessionId: string;
  let accessToken: string;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    process.env.ADMIN_API_KEY = 'rbac-service-key';
    app = await buildApp({ logger: false });
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'admin@startupgraveyard.local',
        password: 'password123',
      },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json() as {
      user: { id: string; adminRole: AdminRole };
      sessionId: string;
      accessToken: string;
    };
    expect(body.user.adminRole).toBe('owner');
    adminUserId = body.user.id;
    adminSessionId = body.sessionId;
    accessToken = body.accessToken;
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ADMIN_API_KEY;
  });

  const headers = () => ({
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  });

  async function assign(role: AdminRole | null) {
    expect(await app.usersRepo.setAdminRole(adminUserId, role)).toBe(true);
  }

  async function createDraft(suffix: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/admin/cases',
      headers: headers(),
      payload: {
        slug: `rbac-${suffix}-${Date.now()}`,
        companyName: `RBAC ${suffix}`,
        summary: 'RBAC boundary test',
        industryKey: 'saas',
      },
    });
  }

  async function enqueueJob(suffix: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs',
      headers: headers(),
      payload: {
        sourceName: `rbac-${suffix}`,
        triggerType: 'test',
      },
    });
  }

  it('enforces viewer, editor, operator, and owner capabilities from current user state', async () => {
    await assign('viewer');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/audit?limit=5',
          headers: headers(),
        })
      ).statusCode,
    ).toBe(200);
    const viewerWrite = await createDraft('viewer');
    expect(viewerWrite.statusCode).toBe(403);
    expect(viewerWrite.json()).toMatchObject({
      error: 'admin_role_forbidden',
      requiredCapability: 'content_write',
    });

    await assign('editor');
    expect((await createDraft('editor')).statusCode).toBe(200);
    expect((await enqueueJob('editor')).statusCode).toBe(403);

    await assign('operator');
    expect((await enqueueJob('operator')).statusCode).toBe(200);
    expect((await createDraft('operator')).statusCode).toBe(403);

    await assign('owner');
    expect((await createDraft('owner')).statusCode).toBe(200);
    expect((await enqueueJob('owner')).statusCode).toBe(200);
  });

  it('rejects non-admin and revoked sessions using live repository state', async () => {
    await assign(null);
    const demoted = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit',
      headers: headers(),
    });
    expect(demoted.statusCode).toBe(403);
    expect(demoted.json()).toEqual({ error: 'admin_access_required' });

    await assign('owner');
    expect(await app.usersRepo.revokeSession(adminUserId, adminSessionId)).toBe(true);
    const revoked = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit',
      headers: headers(),
    });
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json()).toEqual({ error: 'session_revoked' });
  });

  it('attributes successful and denied mutations to the named principal', async () => {
    await assign('viewer');
    expect((await createDraft('denied-audit')).statusCode).toBe(403);
    await assign('editor');
    expect((await createDraft('allowed-audit')).statusCode).toBe(200);

    const events = await app.auditRepo.listRecent(20);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'admin.authorization_denied',
          actorUserId: adminUserId,
          actorEmail: 'admin@startupgraveyard.local',
          actorAdminRole: 'viewer',
          actorAuthType: 'user_session',
        }),
        expect.objectContaining({
          action: 'admin.request',
          actorUserId: adminUserId,
          actorAdminRole: 'editor',
          actorAuthType: 'user_session',
          metadata: expect.objectContaining({
            method: 'POST',
            route: '/v1/admin/cases',
            statusCode: 200,
          }),
        }),
      ]),
    );
  });

  it('keeps the explicit service-key header as a transitional owner principal', async () => {
    const allowed = await enqueueJob('named-user');
    expect(allowed.statusCode).toBe(200);

    const serviceResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs',
      headers: {
        'x-admin-key': 'rbac-service-key',
        'content-type': 'application/json',
      },
      payload: { sourceName: 'service-principal', triggerType: 'test' },
    });
    expect(serviceResponse.statusCode).toBe(200);

    const bearerKey = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit',
      headers: { authorization: 'Bearer rbac-service-key' },
    });
    expect(bearerKey.statusCode).toBe(401);

    const events = await app.auditRepo.listRecent(10);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'admin.request',
          actorUserId: null,
          actorAdminRole: 'owner',
          actorAuthType: 'service_key',
        }),
      ]),
    );
  });
});
