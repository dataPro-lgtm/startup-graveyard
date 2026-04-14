import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

const ADMIN_KEY = 'business-flow-admin-key';
const adminHeaders = { 'x-admin-key': ADMIN_KEY };

describe('business flow smoke (mock DB)', () => {
  let app: FastifyInstance;
  const previousAdminKey = process.env.ADMIN_API_KEY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
    if (previousAdminKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previousAdminKey;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  });

  it('runs the current stage business flow end-to-end', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://example.com/cascade-atlas-collapse') {
        return new Response(
          [
            '<html><head><title>Cascade Atlas Collapse</title></head><body><article>',
            '<p>Cascade Atlas was a SaaS startup that raised $28 million before shutting down in 2024.</p>',
            '<p>The company expanded too early, hired ahead of demand, and struggled with weak unit economics.</p>',
            '<p>Leadership later acknowledged channel mismatch and retention decay.</p>',
            '</article></body></html>',
          ].join(''),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        );
      }
      throw new Error(`unexpected fetch during business flow smoke test: ${url}`);
    });

    const enqueueRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'pipeline_url_draft',
        triggerType: 'admin',
        payload: {
          url: 'https://example.com/cascade-atlas-collapse',
          slug: 'cascade-atlas',
          summary: 'Cascade Atlas collapsed after premature scaling and channel mismatch.',
          industryKey: 'saas',
        },
      },
    });
    expect(enqueueRes.statusCode).toBe(200);

    const firstProcessRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers: adminHeaders,
    });
    expect(firstProcessRes.statusCode).toBe(200);
    expect(JSON.parse(firstProcessRes.body)).toMatchObject({
      ok: true,
      job: {
        sourceName: 'pipeline_url_draft',
        status: 'succeeded',
      },
    });

    const secondProcessRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers: adminHeaders,
    });
    expect(secondProcessRes.statusCode).toBe(200);
    expect(JSON.parse(secondProcessRes.body)).toMatchObject({
      ok: true,
      job: {
        sourceName: 'extract_case_signals',
        status: 'succeeded',
      },
    });

    const reviewsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/reviews?status=pending&limit=20',
      headers: adminHeaders,
    });
    expect(reviewsRes.statusCode).toBe(200);
    const review = (
      JSON.parse(reviewsRes.body) as {
        items: Array<{
          id: string;
          caseId: string;
          slug: string;
          publishReadiness: {
            ready: boolean;
            evidenceCount: number;
            failureFactorCount: number;
            missing: string[];
          };
        }>;
      }
    ).items.find((item) => item.slug === 'cascade-atlas');
    expect(review).toBeDefined();
    expect(review).toMatchObject({
      publishReadiness: {
        ready: true,
        evidenceCount: 1,
        missing: [],
      },
    });
    expect(review?.publishReadiness.failureFactorCount ?? 0).toBeGreaterThanOrEqual(1);

    const approveRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/reviews/${review!.id}/approve`,
      headers: adminHeaders,
    });
    expect(approveRes.statusCode).toBe(200);
    expect(JSON.parse(approveRes.body)).toMatchObject({
      ok: true,
      reviewId: review!.id,
      caseId: review!.caseId,
      status: 'approved',
    });

    const reindexRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers: adminHeaders,
    });
    expect(reindexRes.statusCode).toBe(200);
    expect(JSON.parse(reindexRes.body)).toMatchObject({
      ok: true,
      job: {
        sourceName: 'rebuild_case_search_index',
        status: 'succeeded',
      },
    });

    const publishedCaseRes = await app.inject({
      method: 'GET',
      url: '/v1/cases/by-slug/cascade-atlas',
    });
    expect(publishedCaseRes.statusCode).toBe(200);
    expect(JSON.parse(publishedCaseRes.body)).toMatchObject({
      companyName: 'Cascade Atlas',
      slug: 'cascade-atlas',
      evidenceSources: [
        expect.objectContaining({
          title: 'Cascade Atlas Collapse',
        }),
      ],
      failureFactors: expect.arrayContaining([
        expect.objectContaining({
          level1Key: expect.any(String),
        }),
      ]),
    });

    const homeSummaryRes = await app.inject({
      method: 'GET',
      url: '/v1/meta/home-summary',
    });
    expect(homeSummaryRes.statusCode).toBe(200);
    expect(JSON.parse(homeSummaryRes.body)).toMatchObject({
      totalCases: 3,
    });

    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: `flow-owner-${Date.now()}@example.com`,
          password: 'password123',
          displayName: 'Flow Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: `flow-member-${Date.now()}@example.com`,
          password: 'password123',
          displayName: 'Flow Member',
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
      user: { email: string };
      accessToken: string;
    };

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
    });

    const workspaceRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { name: 'Failure Ops Desk' },
    });
    expect(workspaceRes.statusCode).toBe(200);
    expect(JSON.parse(workspaceRes.body)).toMatchObject({
      ok: true,
      workspace: {
        name: 'Failure Ops Desk',
        role: 'owner',
      },
    });

    const savedViewRes = await app.inject({
      method: 'POST',
      url: '/v1/saved-views/items',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Cascade Atlas teardown',
        filters: {
          q: 'Cascade Atlas',
          industry: 'saas',
        },
      },
    });
    expect(savedViewRes.statusCode).toBe(200);
    const savedView = JSON.parse(savedViewRes.body) as {
      item: { id: string; caseCount: number };
      summary: { canUseSavedViews: boolean };
    };
    expect(savedView).toMatchObject({
      summary: { canUseSavedViews: true },
    });
    expect(savedView.item.caseCount).toBeGreaterThanOrEqual(1);

    const createShareRes = await app.inject({
      method: 'POST',
      url: '/v1/reports/shares',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        savedViewId: savedView.item.id,
      },
    });
    expect(createShareRes.statusCode).toBe(200);
    const reportShare = JSON.parse(createShareRes.body) as {
      item: { id: string; shareToken: string };
    };

    const publicShareRes = await app.inject({
      method: 'GET',
      url: `/v1/reports/shares/public/${reportShare.item.shareToken}`,
    });
    expect(publicShareRes.statusCode).toBe(200);
    expect(JSON.parse(publicShareRes.body)).toMatchObject({
      share: {
        id: reportShare.item.id,
        savedViewId: savedView.item.id,
        savedViewName: 'Cascade Atlas teardown',
      },
      brief: {
        title: 'Cascade Atlas teardown',
        totalMatchingCases: expect.any(Number),
      },
    });

    const shareCaseRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/shared-cases',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { caseId: review!.caseId },
    });
    expect(shareCaseRes.statusCode).toBe(200);

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

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: memberRegistered.user.email,
        role: 'member',
      },
    });
    expect(inviteRes.statusCode).toBe(200);

    const memberContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(memberContextRes.statusCode).toBe(200);
    const pendingInvite = (
      JSON.parse(memberContextRes.body) as {
        pendingInvites: Array<{ id: string }>;
      }
    ).pendingInvites[0];
    expect(pendingInvite).toBeDefined();

    const acceptInviteRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${pendingInvite!.id}/accept`,
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(acceptInviteRes.statusCode).toBe(200);

    const memberMeRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(memberMeRes.statusCode).toBe(200);
    expect(JSON.parse(memberMeRes.body)).toMatchObject({
      subscription: 'free',
      effectiveSubscription: 'team',
      workspaceAccess: {
        source: 'team_workspace',
        workspaceName: 'Failure Ops Desk',
      },
      entitlements: {
        canUseWatchlist: true,
        canUseSavedSearches: true,
        canExportReports: true,
      },
    });

    const watchlistRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist/items',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: { caseId: review!.caseId },
    });
    expect(watchlistRes.statusCode).toBe(200);
    expect(JSON.parse(watchlistRes.body)).toMatchObject({
      ok: true,
      summary: {
        subscription: 'team',
        canUseWatchlist: true,
      },
    });

    const exportRes = await app.inject({
      method: 'POST',
      url: '/v1/reports/exports/markdown',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Cascade Atlas team memo',
        filters: {
          q: 'Cascade Atlas',
          industry: 'saas',
        },
      },
    });
    expect(exportRes.statusCode).toBe(200);
    expect(JSON.parse(exportRes.body)).toMatchObject({
      ok: true,
      filename: 'cascade-atlas-team-memo.md',
      content: expect.stringContaining('Cascade Atlas'),
    });

    const visitorId = `flow-visitor-${Date.now()}`;

    const copilotSessionRes = await app.inject({
      method: 'POST',
      url: '/v1/copilot/sessions',
      payload: { visitorId },
    });
    expect(copilotSessionRes.statusCode).toBe(200);
    const createdSession = JSON.parse(copilotSessionRes.body) as {
      session: { id: string };
    };

    const copilotAnswerRes = await app.inject({
      method: 'POST',
      url: '/v1/copilot/answer',
      payload: {
        visitorId,
        sessionId: createdSession.session.id,
        question: 'Airlift 为什么会失败？',
        topK: 3,
      },
    });
    expect(copilotAnswerRes.statusCode).toBe(200);
    expect(JSON.parse(copilotAnswerRes.body)).toMatchObject({
      sessionId: createdSession.session.id,
      citations: expect.arrayContaining([
        expect.objectContaining({
          companyName: 'Airlift',
        }),
      ]),
    });

    const finalWorkspaceRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(finalWorkspaceRes.statusCode).toBe(200);
    expect(JSON.parse(finalWorkspaceRes.body)).toMatchObject({
      hasWorkspace: true,
      workspace: {
        memberCount: 2,
        sharedSavedViewCount: 1,
        sharedCaseCount: 1,
      },
    });
  });
});
