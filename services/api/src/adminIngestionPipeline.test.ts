import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

describe('admin ingestion pipeline (mock DB)', () => {
  let app: FastifyInstance;
  const key = 'vitest-admin-key';
  const headers = { 'x-admin-key': key };

  beforeAll(() => {
    process.env.ADMIN_API_KEY = key;
  });

  afterAll(() => {
    delete process.env.ADMIN_API_KEY;
  });

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_BEARER_TOKEN;
    delete process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_TIMEOUT_MS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_BEARER_TOKEN;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_TIMEOUT_MS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_MAX_ATTEMPTS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_TIMEOUT_MS;
    await app.close();
  });

  it('pipeline_url_draft queues extraction and improves review readiness after follow-up processing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        '<html><head><title>Acme Collapse | Example News</title></head><body><article><p>In 2022 Acme raised $50 million to expand.</p><p>In 2024 Acme shut down after rapid expansion, layoffs, weak unit economics, and labor lawsuits.</p></article></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      ),
    );

    const enqueueRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'pipeline_url_draft',
        triggerType: 'admin',
        payload: {
          url: 'https://news.example.com/acme-collapse',
          slug: 'acme-collapse',
          summary: 'Acme collapsed after rapid expansion and weak unit economics.',
          industryKey: 'saas',
        },
      },
    });
    expect(enqueueRes.statusCode).toBe(200);

    const processRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers,
    });
    expect(processRes.statusCode).toBe(200);
    expect(JSON.parse(processRes.body)).toMatchObject({
      ok: true,
      job: {
        status: 'succeeded',
        sourceName: 'pipeline_url_draft',
      },
    });

    const queuedRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/ingestion-jobs?status=queued&limit=20',
      headers,
    });
    expect(queuedRes.statusCode).toBe(200);
    expect(JSON.parse(queuedRes.body)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          sourceName: 'extract_case_signals',
          triggerType: 'pipeline_followup',
        }),
      ]),
    });

    const snapshotsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/source-snapshots?limit=5',
      headers,
    });
    expect(snapshotsRes.statusCode).toBe(200);
    expect(JSON.parse(snapshotsRes.body)).toMatchObject({
      items: [
        expect.objectContaining({
          sourceName: 'pipeline_url_draft',
          sourceUrl: 'https://news.example.com/acme-collapse',
          title: 'Acme Collapse | Example News',
        }),
      ],
    });

    const extractRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers,
    });
    expect(extractRes.statusCode).toBe(200);
    expect(JSON.parse(extractRes.body)).toMatchObject({
      ok: true,
      job: {
        status: 'succeeded',
        sourceName: 'extract_case_signals',
      },
    });

    const reviewsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/reviews?status=pending&limit=20',
      headers,
    });
    expect(reviewsRes.statusCode).toBe(200);
    const reviewsBody = JSON.parse(reviewsRes.body) as {
      items: Array<{
        slug: string;
        reviewStatus: string;
        publishReadiness: {
          ready: boolean;
          evidenceCount: number;
          failureFactorCount: number;
          missing: string[];
        };
      }>;
    };
    const review = reviewsBody.items.find((item) => item.slug === 'acme-collapse');
    expect(review).toBeDefined();
    expect(review).toMatchObject({
      reviewStatus: 'pending',
      publishReadiness: {
        ready: true,
        evidenceCount: 1,
        missing: [],
      },
    });
    expect(review?.publishReadiness.failureFactorCount ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('capture_source_snapshot persists a snapshot without creating a case', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><head><title>Snapshot Only</title></head><body>hello</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const triggerRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'capture_source_snapshot',
        payload: { url: 'https://example.com/snapshot-only' },
      },
    });
    expect(triggerRes.statusCode).toBe(200);
    expect(JSON.parse(triggerRes.body)).toMatchObject({
      ok: true,
    });

    const snapshotsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/source-snapshots?limit=5&sourceName=capture_source_snapshot',
      headers,
    });
    expect(snapshotsRes.statusCode).toBe(200);
    const body = JSON.parse(snapshotsRes.body) as {
      items: Array<{ sourceName: string; title: string | null }>;
    };
    expect(body.items[0]).toMatchObject({
      sourceName: 'capture_source_snapshot',
      title: 'Snapshot Only',
    });
  });

  it('run_copilot_eval_suite stores a replay batch and exposes it in admin stats', async () => {
    const triggerRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'run_copilot_eval_suite',
        payload: { topK: 5 },
      },
    });
    expect(triggerRes.statusCode).toBe(200);
    expect(JSON.parse(triggerRes.body)).toMatchObject({
      ok: true,
    });

    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsRes.statusCode).toBe(200);
    expect(JSON.parse(statsRes.body)).toMatchObject({
      copilot: {
        evals: {
          overview: {
            activeCases: 3,
            totalBatches: 1,
            latestPromptVersion: '2026-04-13.v1',
            latestPassRate: 1,
          },
          recentBatches: [
            expect.objectContaining({
              promptVersion: '2026-04-13.v1',
              totalCases: 3,
              passedCases: 3,
            }),
          ],
          latestFailures: [],
        },
      },
    });
  });

  it('reconcile_team_workspace_billing proactively restores team invites without a page read', async () => {
    const ownerEmail = `reconcile-owner-${Date.now()}@example.com`;
    const memberEmail = `reconcile-member-${Date.now()}@example.com`;

    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Reconcile Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Reconcile Member',
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
      payload: { name: 'Scheduler Recovery Workspace' },
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
        workspace: { invites: Array<{ id: string }> };
      }
    ).workspace.invites[0]!.id;

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    const downgradeRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    expect(downgradeRes.statusCode).toBe(200);
    expect(JSON.parse(downgradeRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('revoked=1'),
    });

    const revokedPendingRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(revokedPendingRes.statusCode).toBe(200);
    expect(JSON.parse(revokedPendingRes.body)).toMatchObject({
      hasWorkspace: false,
      pendingInvites: [],
    });

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: false,
    });

    const restoreRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('restored=1'),
    });

    const restoredPendingRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${memberRegistered.accessToken}` },
    });
    expect(restoredPendingRes.statusCode).toBe(200);
    expect(JSON.parse(restoredPendingRes.body)).toMatchObject({
      hasWorkspace: false,
      pendingInvites: [expect.objectContaining({ id: inviteId })],
    });
  });

  it('run_team_workspace_recovery_outreach schedules and resolves workspace recovery outreach', async () => {
    const ownerEmail = `outreach-owner-${Date.now()}@example.com`;
    const memberEmail = `outreach-member-${Date.now()}@example.com`;

    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Outreach Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Outreach Member',
        },
      }),
    ]);
    expect(ownerRegisterRes.statusCode).toBe(201);
    expect(memberRegisterRes.statusCode).toBe(201);

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
      payload: { name: 'Recovery Outreach Workspace' },
    });
    expect(createWorkspaceRes.statusCode).toBe(200);
    const createdWorkspace = JSON.parse(createWorkspaceRes.body) as {
      workspace: { id: string };
    };

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

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    const reconcileRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    expect(reconcileRes.statusCode).toBe(200);

    const outreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    expect(outreachRes.statusCode).toBe(200);
    expect(JSON.parse(outreachRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('owner=1'),
    });
    expect(JSON.parse(outreachRes.body)).toMatchObject({
      detail: expect.stringContaining('admin=1'),
    });

    const ownerContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(ownerContextRes.statusCode).toBe(200);
    expect(JSON.parse(ownerContextRes.body)).toMatchObject({
      workspace: {
        recentRecoveryOutreach: [
          expect.objectContaining({
            audience: 'owner',
            channel: 'owner_banner',
            status: 'pending',
          }),
        ],
      },
    });

    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsRes.statusCode).toBe(200);
    expect(JSON.parse(statsRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          followUpStates: expect.arrayContaining([
            expect.objectContaining({ state: 'awaiting_owner', count: 1 }),
          ]),
          recoveryOutreach: {
            pendingOwner: 1,
            pendingAdmin: 1,
            multiTouchPending: 0,
            pendingExport: 0,
          },
        },
      },
    });

    const retryOutreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'run_team_workspace_recovery_outreach',
        payload: { retryIntervalHours: 0 },
      },
    });
    expect(retryOutreachRes.statusCode).toBe(200);
    expect(JSON.parse(retryOutreachRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('retried=2'),
    });

    const ownerRetriedContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(ownerRetriedContextRes.statusCode).toBe(200);
    expect(JSON.parse(ownerRetriedContextRes.body)).toMatchObject({
      workspace: {
        recentRecoveryOutreach: [
          expect.objectContaining({
            audience: 'owner',
            status: 'pending',
            attemptCount: 2,
          }),
        ],
      },
    });

    const statsAfterRetryRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterRetryRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterRetryRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          followUpStates: expect.arrayContaining([
            expect.objectContaining({ state: 'overdue', count: 1 }),
          ]),
          recoveryOutreach: {
            pendingOwner: 1,
            pendingAdmin: 1,
            multiTouchPending: 2,
            pendingExport: 0,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              lastOutreachAttemptCount: 2,
              nextOutreachAttemptAt: expect.any(String),
            }),
          ]),
        },
      },
    });

    const handoffRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 48,
        note: '已转交 CRM 跟进，48 小时后若未恢复再回到运营队列。',
      },
    });
    expect(handoffRes.statusCode).toBe(200);
    expect(JSON.parse(handoffRes.body)).toMatchObject({ ok: true });

    const statsAfterHandoffRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterHandoffRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterHandoffRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            pendingOwner: 1,
            pendingAdmin: 0,
            pendingExport: 1,
            handedOff: 1,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              lastOutreachStatus: 'handed_off',
              lastOutreachHandoffChannel: 'crm',
              lastOutreachHandoffAt: expect.any(String),
            }),
          ]),
        },
      },
    });

    const exportHandoffsRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/export',
      headers,
    });
    expect(exportHandoffsRes.statusCode).toBe(200);
    expect(exportHandoffsRes.body).toContain('Recovery Outreach Workspace');
    expect(exportHandoffsRes.body).toContain('last_outreach_export_count');

    const statsAfterExportRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterExportRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterExportRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            pendingOwner: 1,
            pendingAdmin: 0,
            pendingExport: 0,
            handedOff: 1,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              lastOutreachExportCount: 1,
              lastOutreachExportedAt: expect.any(String),
            }),
          ]),
        },
      },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL = 'https://crm.example.com/recovery';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'temporary_failure' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const webhookFailRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'deliver_team_workspace_recovery_webhook',
        payload: { retryIntervalHours: 12 },
      },
    });
    expect(webhookFailRes.statusCode).toBe(200);
    expect(JSON.parse(webhookFailRes.body)).toMatchObject({
      ok: false,
      error: expect.stringContaining('recovery_handoff_webhook_failed'),
    });

    const statsAfterWebhookFailRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterWebhookFailRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterWebhookFailRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            pendingWebhook: 0,
            retryingWebhook: 1,
            deliveredWebhook: 0,
            failedWebhook: 1,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              lastOutreachWebhookAttemptCount: 1,
              lastOutreachWebhookAttemptAt: expect.any(String),
              nextOutreachWebhookAttemptAt: expect.any(String),
              lastOutreachWebhookDeliveryCount: 0,
              lastOutreachWebhookDeliveredAt: null,
              lastOutreachWebhookStatusCode: 503,
            }),
          ]),
        },
      },
    });

    const webhookSkipRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'deliver_team_workspace_recovery_webhook',
        payload: {},
      },
    });
    expect(webhookSkipRes.statusCode).toBe(200);
    expect(JSON.parse(webhookSkipRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('skipped=no_due_handoffs'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const webhookRetryRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'deliver_team_workspace_recovery_webhook',
        payload: {
          force: true,
          retryIntervalHours: 0,
        },
      },
    });
    expect(webhookRetryRes.statusCode).toBe(200);
    expect(JSON.parse(webhookRetryRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('attempted=1 delivered=1'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const statsAfterWebhookRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterWebhookRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterWebhookRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            pendingWebhook: 0,
            retryingWebhook: 0,
            deliveredWebhook: 1,
            failedWebhook: 0,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              lastOutreachWebhookAttemptCount: 2,
              lastOutreachWebhookAttemptAt: expect.any(String),
              nextOutreachWebhookAttemptAt: null,
              lastOutreachWebhookDeliveryCount: 1,
              lastOutreachWebhookDeliveredAt: expect.any(String),
              lastOutreachWebhookStatusCode: 202,
              lastOutreachWebhookError: null,
            }),
          ]),
        },
      },
    });

    await app.billingFunnelRepo.record({
      userId: ownerRegistered.user.id,
      type: 'portal_started',
      source: 'team_workspace',
      plan: 'team',
      detail: 'Owner 已从 Team Workspace 打开恢复入口。',
    });

    const engagedOutreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    expect(engagedOutreachRes.statusCode).toBe(200);
    expect(JSON.parse(engagedOutreachRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('resolved=1'),
    });

    const ownerEngagedContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: { authorization: `Bearer ${ownerRegistered.accessToken}` },
    });
    expect(ownerEngagedContextRes.statusCode).toBe(200);
    expect(JSON.parse(ownerEngagedContextRes.body)).toMatchObject({
      workspace: {
        recentRecoveryOutreach: [
          expect.objectContaining({
            audience: 'owner',
            channel: 'owner_banner',
            status: 'resolved',
          }),
        ],
      },
    });

    const statsAfterEngagementRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterEngagementRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterEngagementRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          followUpStates: expect.arrayContaining([
            expect.objectContaining({ state: 'owner_engaged', count: 1 }),
          ]),
          recoveryOutreach: {
            pendingOwner: 0,
            pendingAdmin: 0,
            multiTouchPending: 0,
            pendingExport: 0,
            handedOff: 1,
            resolved: 1,
          },
        },
      },
    });

    const pausedAdminOutreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'run_team_workspace_recovery_outreach',
        payload: { retryIntervalHours: 0 },
      },
    });
    expect(pausedAdminOutreachRes.statusCode).toBe(200);
    expect(JSON.parse(pausedAdminOutreachRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('admin=0'),
    });

    const statsAfterPauseRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterPauseRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterPauseRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            pendingOwner: 0,
            pendingAdmin: 0,
            pendingExport: 0,
            handedOff: 1,
            resolved: 1,
          },
        },
      },
    });

    const expireHandoffRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
        note: '结束外部跟进静默窗口，允许重新回到自动恢复队列。',
      },
    });
    expect(expireHandoffRes.statusCode).toBe(200);

    const reopenAdminOutreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'run_team_workspace_recovery_outreach',
        payload: { retryIntervalHours: 0 },
      },
    });
    expect(reopenAdminOutreachRes.statusCode).toBe(200);
    expect(JSON.parse(reopenAdminOutreachRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('admin=1'),
    });

    const statsAfterReopenRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(statsAfterReopenRes.statusCode).toBe(200);
    expect(JSON.parse(statsAfterReopenRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            pendingOwner: 0,
            pendingAdmin: 1,
            pendingExport: 1,
            handedOff: 1,
            resolved: 1,
          },
        },
      },
    });

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'team',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: false,
    });

    const recoverBillingRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    expect(recoverBillingRes.statusCode).toBe(200);

    const resolveOutreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    expect(resolveOutreachRes.statusCode).toBe(200);
    expect(JSON.parse(resolveOutreachRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('resolved=2'),
    });
  });

  it('deliver_team_workspace_recovery_webhook dead-letters exhausted handoffs until forced', async () => {
    const ownerEmail = `pipeline-recovery-dead-letter-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Pipeline Recovery Dead Letter Owner',
      },
    });
    const ownerRegistered = JSON.parse(ownerRegisterRes.body) as {
      accessToken: string;
      user: { id: string };
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
      payload: { name: 'Pipeline Recovery Dead Letter Workspace' },
    });
    const createdWorkspace = JSON.parse(createWorkspaceRes.body) as {
      workspace: { id: string };
    };
    expect(createWorkspaceRes.statusCode).toBe(200);

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: `pipeline-recovery-dead-letter-member-${Date.now()}@example.com`,
        role: 'member',
      },
    });
    expect(inviteRes.statusCode).toBe(200);

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    const handoffRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
      },
    });
    expect(handoffRes.statusCode).toBe(200);
    expect(JSON.parse(handoffRes.body)).toMatchObject({ ok: true });

    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL = 'https://crm.example.com/recovery';
    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_MAX_ATTEMPTS = '1';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'terminal_failure' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const failRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'deliver_team_workspace_recovery_webhook', payload: {} },
    });
    expect(failRes.statusCode).toBe(200);
    expect(JSON.parse(failRes.body)).toMatchObject({
      ok: false,
      error: expect.stringContaining('recovery_handoff_webhook_failed'),
    });

    const deadLetterStatsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(JSON.parse(deadLetterStatsRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            deadLetteredWebhook: 1,
            retryingWebhook: 0,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              workspaceId: createdWorkspace.workspace.id,
              lastOutreachWebhookAttemptCount: 1,
              lastOutreachWebhookExhaustedAt: expect.any(String),
              nextOutreachWebhookAttemptAt: null,
            }),
          ]),
        },
      },
    });

    const skipRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'deliver_team_workspace_recovery_webhook', payload: {} },
    });
    expect(skipRes.statusCode).toBe(200);
    expect(JSON.parse(skipRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('skipped=no_retryable_handoffs'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const forceRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'deliver_team_workspace_recovery_webhook',
        payload: { force: true },
      },
    });
    expect(forceRes.statusCode).toBe(200);
    expect(JSON.parse(forceRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('attempted=1 delivered=1'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('deliver_team_workspace_recovery_slack_alert notifies dead-letter handoffs via scheduler', async () => {
    const ownerEmail = `pipeline-recovery-slack-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Pipeline Recovery Slack Owner',
      },
    });
    const ownerRegistered = JSON.parse(ownerRegisterRes.body) as {
      accessToken: string;
      user: { id: string };
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
      payload: { name: 'Pipeline Recovery Slack Workspace' },
    });
    const createdWorkspace = JSON.parse(createWorkspaceRes.body) as {
      workspace: { id: string };
    };

    await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: `pipeline-recovery-slack-member-${Date.now()}@example.com`,
        role: 'member',
      },
    });

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
      },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL = 'https://crm.example.com/recovery';
    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_MAX_ATTEMPTS = '1';
    process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL =
      'https://hooks.slack.com/services/test/team/workspace';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'terminal_failure' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      );

    const deadLetterRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'deliver_team_workspace_recovery_webhook', payload: {} },
    });
    expect(deadLetterRes.statusCode).toBe(200);
    expect(JSON.parse(deadLetterRes.body)).toMatchObject({
      ok: false,
      error: expect.stringContaining('recovery_handoff_webhook_failed'),
    });

    const slackRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'deliver_team_workspace_recovery_slack_alert', payload: {} },
    });
    expect(slackRes.statusCode).toBe(200);
    expect(JSON.parse(slackRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('attempted=1 alerted=1'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(JSON.parse(statsRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            deadLetteredWebhook: 1,
            pendingSlackAlert: 0,
            alertedSlack: 1,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              workspaceId: createdWorkspace.workspace.id,
              lastOutreachSlackAlertCount: 1,
              lastOutreachSlackAlertedAt: expect.any(String),
              lastOutreachSlackAlertError: null,
            }),
          ]),
        },
      },
    });
  });

  it('deliver_team_workspace_recovery_crm_sync syncs handed-off CRM items via scheduler', async () => {
    const ownerEmail = `pipeline-recovery-crm-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Pipeline Recovery CRM Owner',
      },
    });
    const ownerRegistered = JSON.parse(ownerRegisterRes.body) as {
      accessToken: string;
      user: { id: string };
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
      payload: { name: 'Pipeline Recovery CRM Workspace' },
    });
    const createdWorkspace = JSON.parse(createWorkspaceRes.body) as {
      workspace: { id: string };
    };

    await app.inject({
      method: 'POST',
      url: '/v1/team-workspace/invites',
      headers: {
        authorization: `Bearer ${ownerRegistered.accessToken}`,
        'content-type': 'application/json',
      },
      payload: {
        email: `pipeline-recovery-crm-member-${Date.now()}@example.com`,
        role: 'member',
      },
    });

    await app.usersRepo.updateBillingAccount(ownerRegistered.user.id, {
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      cancelAtPeriodEnd: true,
    });

    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
      },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL = 'https://crm.example.com/api/recovery';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ticketId: 'crm-ticket-42' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const crmRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      payload: {
        sourceName: 'deliver_team_workspace_recovery_crm_sync',
        payload: { retryIntervalHours: 24 },
      },
    });
    expect(crmRes.statusCode).toBe(200);
    expect(JSON.parse(crmRes.body)).toMatchObject({
      ok: true,
      detail: expect.stringContaining('attempted=1 synced=1 failed=0'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers,
    });
    expect(JSON.parse(statsRes.body)).toMatchObject({
      commercial: {
        teamWorkspaces: {
          recoveryOutreach: {
            syncedCrm: 1,
            pendingCrmSync: 0,
          },
          actionableWorkspaces: expect.arrayContaining([
            expect.objectContaining({
              workspaceId: createdWorkspace.workspace.id,
              lastOutreachCrmSyncCount: 1,
              lastOutreachCrmSyncedAt: expect.any(String),
              lastOutreachCrmExternalRecordId: 'crm-ticket-42',
            }),
          ]),
        },
      },
    });
  });
});
