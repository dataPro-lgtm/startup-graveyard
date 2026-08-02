import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

const ORIGINAL_ENV = { ...process.env };

type TestUser = {
  id: string;
  email: string;
  accessToken: string;
};

describe('team workspace tenant boundary', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'tenant-boundary-test-secret';
    process.env.RATE_LIMIT_ENABLED = 'false';
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  async function register(label: string): Promise<TestUser> {
    const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'secure-password-123', displayName: label },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { user: { id: string; email: string }; accessToken: string };
    return { id: body.user.id, email: body.user.email, accessToken: body.accessToken };
  }

  function auth(user: TestUser) {
    return { authorization: `Bearer ${user.accessToken}`, 'content-type': 'application/json' };
  }

  async function createWorkspace(owner: TestUser, name: string) {
    await app.usersRepo.updateBillingAccount(owner.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace',
      headers: auth(owner),
      payload: { name },
    });
    expect(response.statusCode).toBe(200);
  }

  async function inviteAndAccept(owner: TestUser, target: TestUser, role: 'admin' | 'member') {
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: auth(owner),
      payload: { email: target.email, role },
    });
    expect(inviteRes.statusCode).toBe(200);
    const targetContext = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: auth(target),
    });
    const inviteId = (targetContext.json() as { pendingInvites: Array<{ id: string }> })
      .pendingInvites[0]!.id;
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${inviteId}/accept`,
      headers: auth(target),
      payload: {},
    });
    expect(acceptRes.statusCode).toBe(200);
  }

  it('isolates workspace reads, member management, assets, and invite identifiers', async () => {
    const [ownerA, ownerB, adminA, memberA, outsider, inviteTarget] = await Promise.all([
      register('owner-a'),
      register('owner-b'),
      register('admin-a'),
      register('member-a'),
      register('outsider'),
      register('invite-target'),
    ]);
    await createWorkspace(ownerA, 'Workspace Alpha');
    await createWorkspace(ownerB, 'Workspace Beta');
    await inviteAndAccept(ownerA, adminA, 'admin');
    await inviteAndAccept(ownerA, memberA, 'member');

    const [ownerAContext, ownerBContext, outsiderContext] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/team-workspace/me', headers: auth(ownerA) }),
      app.inject({ method: 'GET', url: '/v1/team-workspace/me', headers: auth(ownerB) }),
      app.inject({ method: 'GET', url: '/v1/team-workspace/me', headers: auth(outsider) }),
    ]);
    expect(ownerAContext.json()).toMatchObject({
      workspace: { name: 'Workspace Alpha', role: 'owner', memberCount: 3 },
    });
    expect(ownerBContext.json()).toMatchObject({
      workspace: { name: 'Workspace Beta', role: 'owner', memberCount: 1 },
    });
    expect(outsiderContext.json()).toMatchObject({ hasWorkspace: false, workspace: null });
    expect(JSON.stringify(ownerAContext.json())).not.toContain('Workspace Beta');
    expect(JSON.stringify(ownerBContext.json())).not.toContain('Workspace Alpha');

    const memberInviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: auth(memberA),
      payload: { email: inviteTarget.email, role: 'member' },
    });
    expect(memberInviteRes.statusCode).toBe(403);
    expect(memberInviteRes.json()).toEqual({ error: 'forbidden' });

    const outsiderInviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: auth(outsider),
      payload: { email: inviteTarget.email, role: 'member' },
    });
    expect(outsiderInviteRes.statusCode).toBe(404);
    expect(outsiderInviteRes.json()).toEqual({ error: 'workspace_not_found' });

    const adminInviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: auth(adminA),
      payload: { email: inviteTarget.email, role: 'member' },
    });
    expect(adminInviteRes.statusCode).toBe(200);

    const targetContext = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: auth(inviteTarget),
    });
    const inviteId = (targetContext.json() as { pendingInvites: Array<{ id: string }> })
      .pendingInvites[0]!.id;
    const enumeratedInviteRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${inviteId}/accept`,
      headers: auth(outsider),
      payload: {},
    });
    expect(enumeratedInviteRes.statusCode).toBe(404);
    expect(enumeratedInviteRes.json()).toEqual({ error: 'invite_not_found' });

    const [viewARes, viewBRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/saved-views/items',
        headers: auth(ownerA),
        payload: { name: 'Alpha private view', filters: { industry: 'saas' } },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/saved-views/items',
        headers: auth(ownerB),
        payload: { name: 'Beta private view', filters: { industry: 'marketplace' } },
      }),
    ]);
    const viewAId = (viewARes.json() as { item: { id: string } }).item.id;
    const viewBId = (viewBRes.json() as { item: { id: string } }).item.id;

    const shareOwnARes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/shared-saved-views',
      headers: auth(ownerA),
      payload: { savedViewId: viewAId },
    });
    expect(shareOwnARes.statusCode).toBe(200);

    const crossShareARes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/shared-saved-views',
      headers: auth(ownerA),
      payload: { savedViewId: viewBId },
    });
    expect(crossShareARes.statusCode).toBe(404);
    expect(crossShareARes.json()).toEqual({ error: 'saved_view_not_found' });

    const crossShareBRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/shared-saved-views',
      headers: auth(ownerB),
      payload: { savedViewId: viewAId },
    });
    expect(crossShareBRes.statusCode).toBe(404);

    const adminContext = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: auth(adminA),
    });
    expect(JSON.stringify(adminContext.json())).toContain('Alpha private view');
    expect(JSON.stringify(adminContext.json())).not.toContain('Beta private view');
  });
});
