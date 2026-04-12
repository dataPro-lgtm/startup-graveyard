import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

describe('public API (mock DB)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      features: { adminEnabled: boolean; mockMode: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.features.adminEnabled).toBe(false);
    expect(body.features.mockMode).toBe(true);
  });

  it('GET /v1/cases returns slug + extended fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/cases?limit=5' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      items: Array<{
        slug: string;
        businessModelKey: string | null;
        foundedYear: number | null;
      }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty('slug');
    expect(body.items[0]).toHaveProperty('businessModelKey');
  });

  it('GET /v1/cases/by-slug/airlift', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cases/by-slug/airlift',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { companyName: string; slug: string };
    expect(body.slug).toBe('airlift');
    expect(body.companyName).toBe('Airlift');
  });

  it('GET /v1/meta/taxonomy includes businessModels', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/meta/taxonomy' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      businessModels: Record<string, string>;
      primaryFailureReasons: Record<string, string>;
      failureFactorLevel1: Record<string, string>;
      timelineEventTypes: Record<string, string>;
    };
    expect(body.businessModels.marketplace).toBeDefined();
    expect(body.primaryFailureReasons.premature_scaling).toBeDefined();
    expect(body.failureFactorLevel1.finance).toBeDefined();
    expect(body.timelineEventTypes.founded).toBeDefined();
  });

  it('GET /v1/meta/home-summary returns published aggregates', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/meta/home-summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      totalCases: number;
      totalFundingUsd: number;
      failurePatterns: number;
    };
    expect(body.totalCases).toBe(2);
    expect(body.totalFundingUsd).toBe(109_000_000);
    expect(body.failurePatterns).toBe(1);
  });

  it('GET /v1/meta/research-overview returns grouped research aggregates', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/meta/research-overview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      summary: { totalCases: number; totalFundingUsd: number; failurePatterns: number };
      topIndustries: Array<{ key: string; caseCount: number; totalFundingUsd: number }>;
      topCountries: Array<{ key: string; caseCount: number; totalFundingUsd: number }>;
      topFailureReasons: Array<{ key: string; caseCount: number; totalFundingUsd: number }>;
      closureTimeline: Array<{ year: number; caseCount: number; totalFundingUsd: number }>;
    };
    expect(body.summary.totalCases).toBe(2);
    expect(body.topIndustries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'mobility',
          caseCount: 2,
        }),
      ]),
    );
    expect(body.topCountries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'PK',
          caseCount: 2,
        }),
      ]),
    );
    expect(body.topFailureReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'premature_scaling',
          caseCount: 1,
        }),
      ]),
    );
    expect(body.closureTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          year: 2022,
          caseCount: 1,
        }),
      ]),
    );
  });

  it('Copilot sessions support persisted threads, pinned context, and feedback', async () => {
    const visitorId = 'visitor-test-001';

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/copilot/sessions',
      payload: { visitorId },
    });
    expect(createRes.statusCode).toBe(200);
    const created = JSON.parse(createRes.body) as {
      session: { id: string; messageCount: number };
      pinnedCases: unknown[];
      messages: unknown[];
    };
    expect(created.session.messageCount).toBe(0);
    expect(created.pinnedCases).toHaveLength(0);
    expect(created.messages).toHaveLength(0);

    const answerRes = await app.inject({
      method: 'POST',
      url: '/v1/copilot/answer',
      payload: {
        visitorId,
        sessionId: created.session.id,
        question: 'Airlift 为什么会失败？',
        topK: 3,
      },
    });
    expect(answerRes.statusCode).toBe(200);
    const answered = JSON.parse(answerRes.body) as {
      sessionId: string;
      assistantMessageId: string;
      citations: Array<{ caseId: string; companyName: string; pinned?: boolean }>;
    };
    expect(answered.sessionId).toBe(created.session.id);
    expect(answered.citations.length).toBeGreaterThan(0);
    expect(answered.citations[0]?.companyName).toBe('Airlift');

    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/copilot/sessions?visitorId=${encodeURIComponent(visitorId)}&limit=10`,
    });
    expect(listRes.statusCode).toBe(200);
    const listed = JSON.parse(listRes.body) as {
      items: Array<{ id: string; messageCount: number; lastQuestion: string | null }>;
    };
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      id: created.session.id,
      messageCount: 2,
      lastQuestion: 'Airlift 为什么会失败？',
    });

    const pinRes = await app.inject({
      method: 'POST',
      url: `/v1/copilot/sessions/${encodeURIComponent(created.session.id)}/pins`,
      payload: { visitorId, caseId: answered.citations[0]!.caseId },
    });
    expect(pinRes.statusCode).toBe(200);
    const pinned = JSON.parse(pinRes.body) as {
      pinnedCases: Array<{ id: string; companyName: string }>;
    };
    expect(pinned.pinnedCases).toHaveLength(1);
    expect(pinned.pinnedCases[0]?.companyName).toBe('Airlift');

    const feedbackRes = await app.inject({
      method: 'POST',
      url: `/v1/copilot/messages/${encodeURIComponent(answered.assistantMessageId)}/feedback`,
      payload: { visitorId, vote: 'up' },
    });
    expect(feedbackRes.statusCode).toBe(200);
    expect(JSON.parse(feedbackRes.body)).toMatchObject({
      ok: true,
      vote: 'up',
      messageId: answered.assistantMessageId,
    });

    const followupRes = await app.inject({
      method: 'POST',
      url: '/v1/copilot/answer',
      payload: {
        visitorId,
        sessionId: created.session.id,
        question: '继续展开这个案例的失败路径。',
        topK: 1,
      },
    });
    expect(followupRes.statusCode).toBe(200);
    const followup = JSON.parse(followupRes.body) as {
      citations: Array<{ caseId: string; pinned?: boolean }>;
    };
    expect(followup.citations.some((item) => item.caseId === answered.citations[0]!.caseId)).toBe(
      true,
    );
    expect(followup.citations.some((item) => item.pinned === true)).toBe(true);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/v1/copilot/sessions/${encodeURIComponent(created.session.id)}?visitorId=${encodeURIComponent(visitorId)}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.body) as {
      session: { messageCount: number };
      pinnedCases: Array<{ id: string }>;
      messages: Array<{
        role: string;
        feedbackVote: string | null;
        run: { promptVersion: string; fallbackReason: string | null; citationCount: number } | null;
      }>;
    };
    expect(detail.session.messageCount).toBe(4);
    expect(detail.pinnedCases).toHaveLength(1);
    expect(detail.messages.filter((item) => item.role === 'assistant')[0]?.feedbackVote).toBe('up');
    expect(detail.messages.filter((item) => item.role === 'assistant')[0]?.run).toMatchObject({
      promptVersion: '2026-04-13.v1',
      fallbackReason: 'provider_unavailable',
      citationCount: answered.citations.length,
    });
  });

  it('auth profiles expose entitlements and watchlist gating unlocks with Pro', async () => {
    const email = `watchlist-${Date.now()}@example.com`;
    const registerRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email,
        password: 'password123',
        displayName: 'Watchlist User',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const registered = JSON.parse(registerRes.body) as {
      user: {
        id: string;
        subscription: string;
        billingStatus: string;
        entitlements: { canUseWatchlist: boolean; watchlistLimit: number };
      };
      accessToken: string;
    };
    expect(registered.user.subscription).toBe('free');
    expect(registered.user.billingStatus).toBe('inactive');
    expect(registered.user.entitlements.canUseWatchlist).toBe(false);
    expect(registered.user.entitlements.watchlistLimit).toBe(0);

    const listCasesRes = await app.inject({
      method: 'GET',
      url: '/v1/cases?limit=1',
    });
    const firstCaseId = (JSON.parse(listCasesRes.body) as { items: Array<{ id: string }> })
      .items[0]!.id;

    const freeListRes = await app.inject({
      method: 'GET',
      url: '/v1/watchlist/me',
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(freeListRes.statusCode).toBe(200);
    expect(JSON.parse(freeListRes.body)).toMatchObject({
      summary: {
        canUseWatchlist: false,
        watchlistLimit: 0,
      },
      items: [],
    });

    const blockedAddRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { caseId: firstCaseId },
    });
    expect(blockedAddRes.statusCode).toBe(403);
    expect(JSON.parse(blockedAddRes.body)).toMatchObject({
      error: 'entitlement_required',
    });

    await app.usersRepo.updateBillingAccount(registered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const unlockedAddRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { caseId: firstCaseId },
    });
    expect(unlockedAddRes.statusCode).toBe(200);
    expect(JSON.parse(unlockedAddRes.body)).toMatchObject({
      ok: true,
      saved: true,
      caseId: firstCaseId,
      summary: {
        canUseWatchlist: true,
        watchlistLimit: 100,
        watchlistCount: 1,
      },
    });

    const statusRes = await app.inject({
      method: 'GET',
      url: `/v1/watchlist/me/status?caseId=${encodeURIComponent(firstCaseId)}`,
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(JSON.parse(statusRes.body)).toMatchObject({
      caseId: firstCaseId,
      saved: true,
      summary: {
        canUseWatchlist: true,
      },
    });

    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/v1/watchlist/items/${encodeURIComponent(firstCaseId)}`,
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(removeRes.statusCode).toBe(200);
    expect(JSON.parse(removeRes.body)).toMatchObject({
      ok: true,
      saved: false,
      caseId: firstCaseId,
      summary: {
        watchlistCount: 0,
      },
    });
  });

  it('saved views unlock with Pro and support create, dedupe, rename, delete', async () => {
    const email = `saved-views-${Date.now()}@example.com`;
    const registerRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email,
        password: 'password123',
        displayName: 'Saved Views User',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const registered = JSON.parse(registerRes.body) as {
      user: {
        id: string;
        entitlements: { canUseSavedSearches: boolean; savedSearchLimit: number };
      };
      accessToken: string;
    };
    expect(registered.user.entitlements.canUseSavedSearches).toBe(false);
    expect(registered.user.entitlements.savedSearchLimit).toBe(0);

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/saved-views/me',
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(JSON.parse(listRes.body)).toMatchObject({
      summary: {
        canUseSavedViews: false,
        savedViewLimit: 0,
      },
      items: [],
    });

    const blockedCreateRes = await app.inject({
      method: 'POST',
      url: '/v1/saved-views/items',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Marketplace collapse',
        filters: { businessModelKey: 'marketplace' },
      },
    });
    expect(blockedCreateRes.statusCode).toBe(403);
    expect(JSON.parse(blockedCreateRes.body)).toMatchObject({
      error: 'entitlement_required',
    });

    await app.usersRepo.updateBillingAccount(registered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/saved-views/items',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Marketplace collapse',
        filters: {
          businessModelKey: 'marketplace',
          primaryFailureReasonKey: 'premature_scaling',
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = JSON.parse(createRes.body) as {
      created: boolean;
      item: { id: string; caseCount: number; name: string; queryString: string };
      summary: { savedViewCount: number; canUseSavedViews: boolean };
    };
    expect(created).toMatchObject({
      created: true,
      item: {
        name: 'Marketplace collapse',
        queryString: 'businessModelKey=marketplace&primaryFailureReasonKey=premature_scaling',
      },
      summary: {
        savedViewCount: 1,
        canUseSavedViews: true,
      },
    });
    expect(created.item.caseCount).toBeGreaterThan(0);

    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/v1/saved-views/items',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Duplicate name ignored',
        filters: {
          businessModelKey: 'marketplace',
          primaryFailureReasonKey: 'premature_scaling',
        },
      },
    });
    expect(duplicateRes.statusCode).toBe(200);
    expect(JSON.parse(duplicateRes.body)).toMatchObject({
      ok: true,
      created: false,
      item: {
        id: created.item.id,
      },
      summary: {
        savedViewCount: 1,
      },
    });

    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/v1/saved-views/items/${created.item.id}`,
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Marketplace burn',
      },
    });
    expect(renameRes.statusCode).toBe(200);
    expect(JSON.parse(renameRes.body)).toMatchObject({
      ok: true,
      item: {
        id: created.item.id,
        name: 'Marketplace burn',
      },
    });

    const refreshedListRes = await app.inject({
      method: 'GET',
      url: '/v1/saved-views/me',
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(refreshedListRes.statusCode).toBe(200);
    expect(JSON.parse(refreshedListRes.body)).toMatchObject({
      summary: {
        canUseSavedViews: true,
        savedViewCount: 1,
      },
      items: [
        {
          id: created.item.id,
          name: 'Marketplace burn',
        },
      ],
    });

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/v1/saved-views/items/${created.item.id}`,
      headers: { authorization: `Bearer ${registered.accessToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.body)).toMatchObject({
      ok: true,
      savedViewId: created.item.id,
      summary: {
        savedViewCount: 0,
      },
    });
  });

  it('report exports unlock with Pro and return markdown research briefs', async () => {
    const email = `report-export-${Date.now()}@example.com`;
    const registerRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email,
        password: 'password123',
        displayName: 'Report Export User',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const registered = JSON.parse(registerRes.body) as {
      user: { id: string };
      accessToken: string;
    };

    const blockedRes = await app.inject({
      method: 'POST',
      url: '/v1/reports/exports/markdown',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Marketplace memo',
        filters: { businessModelKey: 'marketplace' },
      },
    });
    expect(blockedRes.statusCode).toBe(403);
    expect(JSON.parse(blockedRes.body)).toMatchObject({
      error: 'entitlement_required',
    });

    await app.usersRepo.updateBillingAccount(registered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const exportRes = await app.inject({
      method: 'POST',
      url: '/v1/reports/exports/markdown',
      headers: {
        authorization: `Bearer ${registered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Marketplace memo',
        filters: { businessModelKey: 'marketplace' },
      },
    });
    expect(exportRes.statusCode).toBe(200);
    const exported = JSON.parse(exportRes.body) as {
      filename: string;
      mimeType: string;
      caseCount: number;
      sampleSize: number;
      content: string;
    };
    expect(exported.filename).toBe('marketplace-memo.md');
    expect(exported.mimeType).toBe('text/markdown');
    expect(exported.caseCount).toBeGreaterThan(0);
    expect(exported.sampleSize).toBeGreaterThan(0);
    expect(exported.content).toContain('# Marketplace memo');
    expect(exported.content).toContain('## Snapshot');
    expect(exported.content).toContain('## Matching Cases');
    expect(exported.content).toContain('Airlift');
  });

  it('team workspace supports create, invite, accept, and asset sharing flows', async () => {
    const ownerEmail = `team-owner-${Date.now()}@example.com`;
    const memberEmail = `team-member-${Date.now()}@example.com`;

    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Team Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Team Member',
        },
      }),
    ]);
    expect(ownerRegisterRes.statusCode).toBe(201);
    expect(memberRegisterRes.statusCode).toBe(201);

    const ownerRegistered = JSON.parse(ownerRegisterRes.body) as {
      user: { id: string };
      accessToken: string;
    };
    const memberRegistered = JSON.parse(memberRegisterRes.body) as {
      user: { id: string };
      accessToken: string;
    };

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const createWorkspaceRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { name: 'Mobility Failure Desk' },
    });
    expect(createWorkspaceRes.statusCode).toBe(200);
    expect(JSON.parse(createWorkspaceRes.body)).toMatchObject({
      ok: true,
      workspace: {
        name: 'Mobility Failure Desk',
        role: 'owner',
        memberCount: 1,
        billing: {
          subscription: 'team',
          billingStatus: 'active',
          seatLimit: 5,
          seatsUsed: 1,
          reservedSeats: 1,
          seatsRemaining: 4,
          canInviteMore: true,
          warningCodes: [],
        },
      },
    });

    const createSavedViewRes = await app.inject({
      method: 'POST',
      url: '/v1/saved-views/items',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Marketplace failures',
        filters: { businessModelKey: 'marketplace' },
      },
    });
    expect(createSavedViewRes.statusCode).toBe(200);
    const savedView = JSON.parse(createSavedViewRes.body) as {
      item: { id: string };
    };

    const listCasesRes = await app.inject({
      method: 'GET',
      url: '/v1/cases?limit=1',
    });
    const firstCaseId = (JSON.parse(listCasesRes.body) as { items: Array<{ id: string }> })
      .items[0]!.id;

    const shareCaseRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/shared-cases',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { caseId: firstCaseId },
    });
    expect(shareCaseRes.statusCode).toBe(200);
    expect(JSON.parse(shareCaseRes.body)).toMatchObject({
      ok: true,
      added: true,
      workspace: {
        sharedCaseCount: 1,
      },
    });

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: memberEmail,
        role: 'admin',
      },
    });
    expect(inviteRes.statusCode).toBe(200);
    expect(JSON.parse(inviteRes.body)).toMatchObject({
      ok: true,
      workspace: {
        billing: {
          seatLimit: 5,
          seatsUsed: 1,
          reservedSeats: 2,
          seatsRemaining: 3,
          canInviteMore: true,
        },
        invites: [{ email: memberEmail, role: 'admin' }],
      },
    });

    const memberContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(memberContextRes.statusCode).toBe(200);
    const memberContext = JSON.parse(memberContextRes.body) as {
      canCreateWorkspace: boolean;
      hasWorkspace: boolean;
      pendingInvites: Array<{ id: string; workspaceName: string }>;
    };
    expect(memberContext.hasWorkspace).toBe(false);
    expect(memberContext.canCreateWorkspace).toBe(false);
    expect(memberContext.pendingInvites).toHaveLength(1);

    const acceptInviteRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${memberContext.pendingInvites[0]!.id}/accept`,
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(acceptInviteRes.statusCode).toBe(200);
    expect(JSON.parse(acceptInviteRes.body)).toMatchObject({
      ok: true,
      workspace: {
        name: 'Mobility Failure Desk',
        role: 'admin',
        memberCount: 2,
        billing: {
          ownerEmail,
          seatLimit: 5,
          seatsUsed: 2,
          reservedSeats: 2,
          seatsRemaining: 3,
        },
      },
    });

    const memberMeRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(memberMeRes.statusCode).toBe(200);
    expect(JSON.parse(memberMeRes.body)).toMatchObject({
      subscription: 'free',
      effectiveSubscription: 'team',
      effectiveBillingStatus: 'active',
      workspaceAccess: {
        source: 'team_workspace',
        workspaceName: 'Mobility Failure Desk',
        workspaceRole: 'admin',
        inheritedFromUserId: ownerRegistered.user.id,
      },
      entitlements: {
        canUseWatchlist: true,
        canUseSavedSearches: true,
        canExportReports: true,
        canUseTeamWorkspace: true,
      },
    });

    const memberWatchlistRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { caseId: firstCaseId },
    });
    expect(memberWatchlistRes.statusCode).toBe(200);
    expect(JSON.parse(memberWatchlistRes.body)).toMatchObject({
      ok: true,
      summary: {
        subscription: 'team',
        billingStatus: 'active',
        canUseWatchlist: true,
      },
    });

    const memberSavedViewRes = await app.inject({
      method: 'POST',
      url: '/v1/saved-views/items',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Inherited Team View',
        filters: { businessModelKey: 'saas' },
      },
    });
    expect(memberSavedViewRes.statusCode).toBe(200);
    expect(JSON.parse(memberSavedViewRes.body)).toMatchObject({
      ok: true,
      created: true,
      summary: {
        subscription: 'team',
        billingStatus: 'active',
        canUseSavedViews: true,
      },
    });

    const memberReportRes = await app.inject({
      method: 'POST',
      url: '/v1/reports/exports/markdown',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Team inherited memo',
        filters: { businessModelKey: 'saas' },
      },
    });
    expect(memberReportRes.statusCode).toBe(200);
    expect(JSON.parse(memberReportRes.body)).toMatchObject({
      ok: true,
      filename: 'team-inherited-memo.md',
    });

    const shareSavedViewRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/shared-saved-views',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { savedViewId: savedView.item.id },
    });
    expect(shareSavedViewRes.statusCode).toBe(200);
    expect(JSON.parse(shareSavedViewRes.body)).toMatchObject({
      ok: true,
      added: true,
      workspace: {
        sharedSavedViewCount: 1,
      },
    });

    const ownerContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(ownerContextRes.statusCode).toBe(200);
    expect(JSON.parse(ownerContextRes.body)).toMatchObject({
      hasWorkspace: true,
      pendingInvites: [],
      workspace: {
        memberCount: 2,
        sharedSavedViewCount: 1,
        sharedCaseCount: 1,
        billing: {
          ownerEmail,
          seatLimit: 5,
          seatsUsed: 2,
          reservedSeats: 2,
          seatsRemaining: 3,
          warningCodes: [],
        },
      },
    });

    const memberWorkspaceRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(memberWorkspaceRes.statusCode).toBe(200);
    expect(JSON.parse(memberWorkspaceRes.body)).toMatchObject({
      hasWorkspace: true,
      workspace: {
        role: 'admin',
        members: expect.arrayContaining([
          expect.objectContaining({ email: ownerEmail, role: 'owner' }),
          expect.objectContaining({ email: memberEmail, role: 'admin' }),
        ]),
        sharedSavedViews: expect.arrayContaining([
          expect.objectContaining({ id: savedView.item.id }),
        ]),
        sharedCases: expect.arrayContaining([expect.objectContaining({ id: firstCaseId })]),
        billing: expect.objectContaining({
          ownerEmail,
          seatLimit: 5,
          seatsUsed: 2,
          reservedSeats: 2,
        }),
      },
    });
  });

  it('team workspace enforces seat limits and surfaces billing risk warnings', async () => {
    const ownerEmail = `seat-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Seat Owner',
      },
    });
    expect(ownerRegisterRes.statusCode).toBe(201);
    const ownerRegistered = JSON.parse(ownerRegisterRes.body) as {
      user: { id: string };
      accessToken: string;
    };

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const createWorkspaceRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { name: 'Seat Ops Desk' },
    });
    expect(createWorkspaceRes.statusCode).toBe(200);

    for (const inviteIndex of [1, 2, 3, 4]) {
      const inviteRes = await app.inject({
        method: 'POST',
        url: '/v1/team-workspace/invites',
        headers: {
          authorization: `Bearer ${ownerRegistered.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          email: `seat-member-${inviteIndex}-${Date.now()}@example.com`,
          role: 'member',
        },
      });
      expect(inviteRes.statusCode).toBe(200);
    }

    const fullContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(fullContextRes.statusCode).toBe(200);
    expect(JSON.parse(fullContextRes.body)).toMatchObject({
      workspace: {
        billing: {
          seatLimit: 5,
          seatsUsed: 1,
          reservedSeats: 5,
          seatsRemaining: 0,
          canInviteMore: false,
          warningCodes: ['seat_limit_reached'],
        },
      },
    });

    const blockedInviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: `seat-member-overflow-${Date.now()}@example.com`,
        role: 'member',
      },
    });
    expect(blockedInviteRes.statusCode).toBe(409);
    expect(JSON.parse(blockedInviteRes.body)).toMatchObject({
      error: 'seat_limit_reached',
    });

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    const degradedContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(degradedContextRes.statusCode).toBe(200);
    expect(JSON.parse(degradedContextRes.body)).toMatchObject({
      workspace: {
        billing: {
          subscription: 'pro',
          billingStatus: 'active',
          seatLimit: 0,
          canInviteMore: false,
          warningCodes: expect.arrayContaining(['workspace_plan_inactive', 'cancel_at_period_end']),
        },
      },
    });

    const inactiveInviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: `seat-member-inactive-${Date.now()}@example.com`,
        role: 'member',
      },
    });
    expect(inactiveInviteRes.statusCode).toBe(409);
    expect(JSON.parse(inactiveInviteRes.body)).toMatchObject({
      error: 'workspace_plan_inactive',
    });
  });

  it('team workspace blocks accepting pending invites after workspace billing is downgraded', async () => {
    const ownerEmail = `invite-owner-${Date.now()}@example.com`;
    const memberEmail = `invite-member-${Date.now()}@example.com`;

    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Invite Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Invite Member',
        },
      }),
    ]);
    expect(ownerRegisterRes.statusCode).toBe(201);
    expect(memberRegisterRes.statusCode).toBe(201);

    const ownerRegistered = JSON.parse(ownerRegisterRes.body) as {
      user: { id: string };
      accessToken: string;
    };
    const memberRegistered = JSON.parse(memberRegisterRes.body) as {
      accessToken: string;
    };

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const createWorkspaceRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { name: 'Invite Guard Desk' },
    });
    expect(createWorkspaceRes.statusCode).toBe(200);

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: memberEmail,
        role: 'member',
      },
    });
    expect(inviteRes.statusCode).toBe(200);
    const inviteId = (
      JSON.parse(inviteRes.body) as {
        workspace: { invites: Array<{ id: string; email: string }> };
      }
    ).workspace.invites[0]!.id;

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    const acceptInviteRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${inviteId}/accept`,
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(acceptInviteRes.statusCode).toBe(409);
    expect(JSON.parse(acceptInviteRes.body)).toMatchObject({
      error: 'workspace_plan_inactive',
    });
  });

  it('GET /v1/admin/audit is disabled when ADMIN_API_KEY is unset', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/audit?limit=5' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'admin_api_disabled' });
  });

  it('GET /v1/cases filters by businessModelKey', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cases?businessModelKey=marketplace&limit=20',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      items: Array<{ businessModelKey: string | null }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    for (const row of body.items) {
      expect((row.businessModelKey ?? '').toLowerCase()).toBe('marketplace');
    }
  });

  it('GET /v1/cases filters by primaryFailureReasonKey', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cases?primaryFailureReasonKey=premature_scaling&limit=20',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      items: Array<{ primaryFailureReasonKey: string | null }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    for (const row of body.items) {
      expect((row.primaryFailureReasonKey ?? '').toLowerCase()).toBe('premature_scaling');
    }
  });
});
