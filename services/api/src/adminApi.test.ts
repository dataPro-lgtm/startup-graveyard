import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

describe('admin API (mock DB + ADMIN_API_KEY)', () => {
  let app: FastifyInstance;
  const key = 'vitest-admin-key';

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = key;
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_API_KEY;
  });

  it('GET /v1/admin/audit 401 without key', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/audit?limit=5' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'unauthorized' });
  });

  it('GET /v1/admin/audit 200 with X-Admin-Key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit?limit=5',
      headers: { 'x-admin-key': key },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/admin/ingestion-jobs with Authorization Bearer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/ingestion-jobs?limit=3',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /v1/admin/cases creates draft', async () => {
    const slug = `vitest-${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/cases',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        slug,
        companyName: 'Vitest Draft Co',
        summary: 'integration test draft',
        industryKey: 'saas',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      caseId: string;
      reviewId: string;
      status: string;
    };
    expect(body.status).toBe('draft');
    expect(body.caseId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('GET /v1/admin/stats includes copilot telemetry and feedback eval summary', async () => {
    const ownerEmail = `admin-stats-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Admin Stats Owner',
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
      payload: { name: 'Admin Metrics Workspace' },
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
        email: `admin-stats-member-${Date.now()}@example.com`,
        role: 'member',
      },
    });
    expect(inviteRes.statusCode).toBe(200);
    for (const inviteIndex of [2, 3, 4]) {
      const extraInviteRes = await app.inject({
        method: 'POST',
        url: '/v1/team-workspace/invites',
        headers: {
          authorization: `Bearer ${ownerRegistered.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          email: `admin-stats-member-${inviteIndex}-${Date.now()}@example.com`,
          role: 'member',
        },
      });
      expect(extraInviteRes.statusCode).toBe(200);
    }

    const casesRes = await app.inject({
      method: 'GET',
      url: '/v1/cases?limit=1',
    });
    expect(casesRes.statusCode).toBe(200);
    const firstCaseId = (JSON.parse(casesRes.body) as { items: Array<{ id: string }> }).items[0]!
      .id;

    await app.watchlistsRepo.add(ownerRegistered.user.id, firstCaseId);
    const savedViewResult = await app.savedViewsRepo.create(ownerRegistered.user.id, {
      name: 'Admin Metrics Saved View',
      filters: { industryKey: 'mobility' },
      queryString: 'industryKey=mobility',
      caseCount: 4,
    });
    await app.reportSharesRepo.create(
      {
        userId: ownerRegistered.user.id,
        ownerDisplayName: 'Admin Stats Owner',
      },
      savedViewResult.item,
    );
    const reportShares = await app.reportSharesRepo.listByUserId(ownerRegistered.user.id);
    await app.reportSharesRepo.getPublicByToken(reportShares[0]!.shareToken);
    await app.billingFunnelRepo.record({
      userId: ownerRegistered.user.id,
      type: 'checkout_started',
      source: 'account_page',
      plan: 'team',
      detail: '发起 Team 订阅结账。',
    });
    await app.billingFunnelRepo.record({
      userId: ownerRegistered.user.id,
      type: 'checkout_completed',
      source: 'account_page',
      plan: 'team',
      detail: 'Stripe checkout 已完成，Team 订阅已开通。',
    });
    await app.billingFunnelRepo.record({
      userId: ownerRegistered.user.id,
      type: 'portal_started',
      source: 'team_workspace',
      plan: 'team',
      detail: '从 Team Workspace 恢复动作打开 billing portal。',
    });
    await app.billingFunnelRepo.record({
      userId: ownerRegistered.user.id,
      type: 'subscription_recovered',
      source: 'team_workspace',
      plan: 'team',
      detail: 'Team 订阅已恢复到健康状态。',
    });

    const answerRes = await app.inject({
      method: 'POST',
      url: '/v1/copilot/answer',
      payload: {
        visitorId: 'admin-stats-visitor',
        question: 'Airlift 为什么会失败？',
        topK: 3,
      },
    });
    expect(answerRes.statusCode).toBe(200);
    const answered = JSON.parse(answerRes.body) as { assistantMessageId: string };

    const feedbackRes = await app.inject({
      method: 'POST',
      url: `/v1/copilot/messages/${encodeURIComponent(answered.assistantMessageId)}/feedback`,
      payload: {
        visitorId: 'admin-stats-visitor',
        vote: 'down',
        note: '需要更具体的归因链路',
      },
    });
    expect(feedbackRes.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      commercial: {
        subscriptions: {
          totalUsers: 1,
          freeUsers: 0,
          proUsers: 0,
          teamUsers: 1,
          activePaidUsers: 1,
          pastDueUsers: 0,
          cancelingUsers: 0,
          paidConversionRate: 1,
          teamMixRate: 1,
        },
        billingFunnel: {
          checkoutStarts: 1,
          checkoutCompletions: 1,
          proCheckoutStarts: 0,
          teamCheckoutStarts: 1,
          portalStarts: 1,
          recoveredSubscriptions: 1,
          checkoutCompletionRate: 1,
          teamCheckoutShare: 1,
          recentEvents: expect.arrayContaining([
            expect.objectContaining({
              type: 'subscription_recovered',
              source: 'team_workspace',
              plan: 'team',
            }),
          ]),
        },
        researchUsage: {
          activeResearchUsers: 1,
          watchlistUsers: 1,
          watchlistEntries: 1,
          savedViewUsers: 1,
          savedViews: 1,
          reportShareUsers: 1,
          reportShares: 1,
          accessedReportShares: 1,
          researchActivationRate: 1,
          reportShareActivationRate: 1,
        },
        teamWorkspaces: {
          totalWorkspaces: 1,
          activeWorkspaces: 1,
          workspacesRequiringAction: 1,
          pendingInvites: 4,
          seatsUsed: 1,
          reservedSeats: 5,
          inheritedMembers: 0,
          revokedInvites: 0,
          fallbackMembers: 0,
          fullWorkspaces: 1,
          recoveryActions: expect.arrayContaining([
            expect.objectContaining({ code: 'free_up_seats', count: 1 }),
          ]),
          recoveryStages: expect.arrayContaining([
            expect.objectContaining({ stage: 'recovered_followup', count: 1 }),
          ]),
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              workspaceName: 'Admin Metrics Workspace',
              ownerEmail: ownerEmail,
              seatLimit: 5,
              seatsUsed: 1,
              reservedSeats: 5,
              pendingInvites: 4,
              warningCodes: expect.arrayContaining(['seat_limit_reached']),
              recommendedActions: expect.arrayContaining([
                expect.objectContaining({ code: 'free_up_seats' }),
              ]),
              recoveryStage: 'recovered_followup',
              lastCommercialEventType: 'subscription_recovered',
              lastCommercialEventSource: 'team_workspace',
            }),
          ]),
          recentBillingEvents: [],
        },
      },
      copilot: {
        overview: {
          totalRuns: 1,
          totalSessions: 1,
          groundedRuns: 0,
          fallbackRuns: 1,
        },
        feedbackEval: {
          helpful: 0,
          needsImprovement: 1,
          unrated: 0,
          positiveRate: 0,
        },
        byPromptVersion: [
          expect.objectContaining({
            promptVersion: '2026-04-13.v1',
            runs: 1,
            negativeFeedback: 1,
          }),
        ],
        byFallbackReason: [
          expect.objectContaining({
            reason: 'provider_unavailable',
            count: 1,
          }),
        ],
        recentFlags: [
          expect.objectContaining({
            promptVersion: '2026-04-13.v1',
            feedbackVote: 'down',
            feedbackNote: '需要更具体的归因链路',
            fallbackReason: 'provider_unavailable',
          }),
        ],
      },
    });
  });
});
