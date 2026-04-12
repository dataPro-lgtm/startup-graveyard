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
