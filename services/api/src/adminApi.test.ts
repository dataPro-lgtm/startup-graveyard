import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';
import * as memberRecoveryEmailClient from './recoveryOutreach/sendRecoveryFallbackMemberEmail.js';
import * as recoveryCrmClient from './recoveryOutreach/deliverRecoveryOutreachCrmSync.js';
import * as recoveryEmailClient from './recoveryOutreach/sendRecoveryOutreachEmail.js';

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

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_BEARER_TOKEN;
    delete process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_TIMEOUT_MS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_PORT;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_SECURE;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_USER;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_PASS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_REPLY_TO;
    delete process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_TIMEOUT_MS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_BEARER_TOKEN;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_TIMEOUT_MS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_MAX_ATTEMPTS;
    delete process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_URL;
    delete process.env.TEAM_WORKSPACE_RECOVERY_SLACK_WEBHOOK_TIMEOUT_MS;
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
      platform: {
        runtime: {
          service: 'startup-graveyard-api',
          features: {
            adminEnabled: true,
            mockMode: true,
            dbConfigured: false,
          },
        },
        ingestion: {
          recentFailedCount: 0,
          recentFailed: [],
        },
        alertSummary: expect.objectContaining({
          warning: expect.any(Number),
        }),
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'mock_mode_active',
          }),
        ]),
      },
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
          followUpStates: expect.arrayContaining([
            expect.objectContaining({ state: 'recovered_followup', count: 1 }),
          ]),
          recoveryOutreach: {
            pendingOwner: 0,
            pendingAdmin: 0,
            multiTouchPending: 0,
            pendingExport: 0,
            handedOff: 0,
            resolved: 0,
            recent: [],
          },
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
              followUpState: 'recovered_followup',
              nextFollowUpAt: null,
              lastCommercialEventType: 'subscription_recovered',
              lastCommercialEventSource: 'team_workspace',
              lastOutreachAt: null,
              lastOutreachTitle: null,
              lastOutreachAudience: null,
              lastOutreachChannel: null,
              lastOutreachStatus: null,
              lastOutreachAttemptCount: null,
              nextOutreachAttemptAt: null,
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

  it('GET /v1/admin/stats surfaces platform diagnostics for failed ingestion jobs', async () => {
    const queued = await app.ingestionJobsRepo.enqueue({
      sourceName: 'fetch_title',
      triggerType: 'platform_diagnostics_test',
      payload: {},
    });
    expect(queued.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const processed = await app.ingestionJobsRepo.processNext();
    expect(processed.ok).toBe(true);
    if (processed.ok) {
      expect(processed.job.status).toBe('failed');
      expect(processed.job.sourceName).toBe('fetch_title');
      expect(processed.job.triggerType).toBe('platform_diagnostics_test');
      expect(processed.job.errorMessage).toContain('需要 payload.url');
    }

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      platform: {
        ingestion: {
          recentFailedCount: expect.any(Number),
          recentFailed: expect.arrayContaining([
            expect.objectContaining({
              sourceName: 'fetch_title',
              triggerType: 'platform_diagnostics_test',
              errorMessage: expect.stringContaining('需要 payload.url'),
            }),
          ]),
        },
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'failed_ingestion_jobs',
          }),
        ]),
      },
    });
  });

  it('GET /v1/admin/stats detects stale running jobs and reclaim-stale resets them', async () => {
    const queued = await app.ingestionJobsRepo.enqueue({
      sourceName: 'pipeline_url_draft',
      triggerType: 'stale_running_test',
      payload: { url: 'https://example.com/stale-running' },
    });
    const mockRepo = app.ingestionJobsRepo as unknown as {
      jobs: Array<{
        id: string;
        status: string;
        startedAt: string | null;
        finishedAt: string | null;
        errorMessage: string | null;
      }>;
    };
    const staleStartedAt = new Date(Date.now() - 45 * 60_000).toISOString();
    const staleIndex = mockRepo.jobs.findIndex((job) => job.id === queued.id);
    expect(staleIndex).toBeGreaterThanOrEqual(0);
    mockRepo.jobs[staleIndex] = {
      ...mockRepo.jobs[staleIndex]!,
      status: 'running',
      startedAt: staleStartedAt,
      finishedAt: null,
      errorMessage: null,
    };

    const beforeRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(beforeRes.statusCode).toBe(200);
    expect(JSON.parse(beforeRes.body)).toMatchObject({
      platform: {
        ingestion: {
          runningCount: expect.any(Number),
          staleRunningCount: 1,
          staleThresholdMinutes: 30,
          recentStale: expect.arrayContaining([
            expect.objectContaining({
              sourceName: 'pipeline_url_draft',
              triggerType: 'stale_running_test',
            }),
          ]),
        },
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'stale_running_jobs',
          }),
        ]),
      },
    });

    const reclaimRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/reclaim-stale?maxRunningMinutes=30',
      headers: { 'x-admin-key': key },
    });
    expect(reclaimRes.statusCode).toBe(200);
    expect(JSON.parse(reclaimRes.body)).toMatchObject({
      reclaimed: 1,
      jobIds: [queued.id],
    });

    const afterRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(afterRes.statusCode).toBe(200);
    expect(JSON.parse(afterRes.body)).toMatchObject({
      platform: {
        ingestion: {
          staleRunningCount: 0,
          recentStale: [],
        },
      },
    });
  });

  it('GET /v1/admin/stats surfaces ingestion queue backlog and recent throughput', async () => {
    const completed = await app.ingestionJobsRepo.enqueue({
      sourceName: 'echo',
      triggerType: 'queue_backlog_completed_test',
      payload: { message: 'completed ok' },
    });
    const backlog = await app.ingestionJobsRepo.enqueue({
      sourceName: 'echo',
      triggerType: 'queue_backlog_pending_test',
      payload: { message: 'pending backlog' },
    });
    const mockRepo = app.ingestionJobsRepo as unknown as {
      jobs: Array<{
        id: string;
        status: string;
        createdAt: string;
        finishedAt: string | null;
        startedAt: string | null;
        errorMessage: string | null;
      }>;
    };
    const backlogIndex = mockRepo.jobs.findIndex((job) => job.id === backlog.id);
    expect(backlogIndex).toBeGreaterThanOrEqual(0);
    mockRepo.jobs[backlogIndex] = {
      ...mockRepo.jobs[backlogIndex]!,
      status: 'queued',
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    };
    const completedIndex = mockRepo.jobs.findIndex((job) => job.id === completed.id);
    expect(completedIndex).toBeGreaterThanOrEqual(0);
    mockRepo.jobs[completedIndex] = {
      ...mockRepo.jobs[completedIndex]!,
      status: 'succeeded',
      startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      finishedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      errorMessage: null,
    };

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      platform: {
        ingestion: {
          queuedCount: number;
          oldestQueuedAgeMinutes: number | null;
          oldestQueuedSourceName: string | null;
          oldestQueuedTriggerType: string | null;
          completedLastHour: number;
          recentSucceeded: Array<{ sourceName: string; triggerType: string }>;
        };
        alerts: Array<{ code: string }>;
      };
    };
    expect(body.platform.ingestion.queuedCount).toBeGreaterThanOrEqual(1);
    expect(body.platform.ingestion.oldestQueuedAgeMinutes).not.toBeNull();
    expect(body.platform.ingestion.oldestQueuedAgeMinutes!).toBeGreaterThanOrEqual(19);
    expect(body.platform.ingestion.oldestQueuedSourceName).toBe('echo');
    expect(body.platform.ingestion.oldestQueuedTriggerType).toBe('queue_backlog_pending_test');
    expect(body.platform.ingestion.completedLastHour).toBeGreaterThanOrEqual(0);
    expect(body.platform.ingestion.recentSucceeded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceName: 'echo',
          triggerType: 'queue_backlog_completed_test',
        }),
      ]),
    );
    expect(body.platform.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ingestion_queue_backlog',
        }),
      ]),
    );
  });

  it('GET /v1/admin/stats surfaces ingestion worker health and stalled alerts', async () => {
    process.env.DATABASE_URL = 'postgres://worker-health-test';
    app.ingestionWorkerMonitor.enabled = true;
    app.ingestionWorkerMonitor.status = 'idle';
    app.ingestionWorkerMonitor.startDelayMs = 5_000;
    app.ingestionWorkerMonitor.pollIntervalMs = 5_000;
    app.ingestionWorkerMonitor.maxJobsPerTick = 8;
    app.ingestionWorkerMonitor.startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    app.ingestionWorkerMonitor.lastTickStartedAt = new Date(Date.now() - 70_000).toISOString();
    app.ingestionWorkerMonitor.lastTickCompletedAt = new Date(Date.now() - 60_000).toISOString();
    app.ingestionWorkerMonitor.lastProcessedAt = new Date(Date.now() - 15_000).toISOString();
    app.ingestionWorkerMonitor.lastProcessedSourceName = 'run_team_workspace_recovery_playbook';
    app.ingestionWorkerMonitor.lastProcessedJobStatus = 'succeeded';
    app.ingestionWorkerMonitor.processedJobs = 12;
    app.ingestionWorkerMonitor.consecutiveErrors = 0;
    app.ingestionWorkerMonitor.lastError = null;

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      platform: {
        worker: {
          enabled: true,
          status: 'idle',
          lastProcessedSourceName: 'run_team_workspace_recovery_playbook',
          lastProcessedJobStatus: 'succeeded',
          processedJobs: 12,
        },
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'ingestion_worker_stalled',
          }),
        ]),
      },
    });
  });

  it('GET /v1/admin/stats surfaces ingestion worker heartbeat history and error alerts', async () => {
    process.env.DATABASE_URL = 'postgres://worker-error-test';
    app.ingestionWorkerMonitor.enabled = true;
    app.ingestionWorkerMonitor.status = 'error';
    app.ingestionWorkerMonitor.startDelayMs = 5_000;
    app.ingestionWorkerMonitor.pollIntervalMs = 5_000;
    app.ingestionWorkerMonitor.maxJobsPerTick = 8;
    app.ingestionWorkerMonitor.startedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    app.ingestionWorkerMonitor.lastTickStartedAt = new Date(Date.now() - 8_000).toISOString();
    app.ingestionWorkerMonitor.lastTickCompletedAt = new Date(Date.now() - 3_000).toISOString();
    app.ingestionWorkerMonitor.lastProcessedAt = new Date(Date.now() - 70_000).toISOString();
    app.ingestionWorkerMonitor.lastProcessedSourceName = 'extract_case_signals';
    app.ingestionWorkerMonitor.lastProcessedJobStatus = 'failed';
    app.ingestionWorkerMonitor.processedJobs = 24;
    app.ingestionWorkerMonitor.consecutiveErrors = 2;
    app.ingestionWorkerMonitor.lastError = 'worker timed out waiting for queue lock';
    app.ingestionWorkerMonitor.recentTicks = [
      {
        startedAt: new Date(Date.now() - 8_000).toISOString(),
        completedAt: new Date(Date.now() - 3_000).toISOString(),
        outcome: 'error',
        processedCount: 1,
        lastJobSourceName: 'extract_case_signals',
        lastJobStatus: 'failed',
        error: 'worker timed out waiting for queue lock',
      },
      {
        startedAt: new Date(Date.now() - 20_000).toISOString(),
        completedAt: new Date(Date.now() - 17_000).toISOString(),
        outcome: 'processed',
        processedCount: 2,
        lastJobSourceName: 'run_team_workspace_recovery_playbook',
        lastJobStatus: 'succeeded',
        error: null,
      },
    ];

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': key },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      platform: {
        worker: {
          status: 'error',
          consecutiveErrors: 2,
          lastError: 'worker timed out waiting for queue lock',
          recentTicks: [
            {
              outcome: 'error',
              processedCount: 1,
              lastJobSourceName: 'extract_case_signals',
            },
            {
              outcome: 'processed',
              processedCount: 2,
              lastJobSourceName: 'run_team_workspace_recovery_playbook',
            },
          ],
        },
        alerts: expect.arrayContaining([
          expect.objectContaining({
            code: 'ingestion_worker_erroring',
          }),
        ]),
      },
    });
  });

  it('GET /v1/admin/stats/recovery-queue.csv exports actionable workspace follow-up rows', async () => {
    const ownerEmail = `recovery-export-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Recovery Export Owner',
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
      payload: { name: 'Recovery Export Workspace' },
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
          email: `recovery-export-member-${inviteIndex}-${Date.now()}@example.com`,
          role: 'member',
        },
      });
      expect(inviteRes.statusCode).toBe(200);
    }

    const csvRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/recovery-queue.csv',
      headers: { 'x-admin-key': key },
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.body).toContain('workspace_name,owner_email');
    expect(csvRes.body).toContain('last_outreach_attempt_count');
    expect(csvRes.body).toContain('Recovery Export Workspace');
    expect(csvRes.body).toContain(ownerEmail);
    expect(csvRes.body).toContain('needs_initial_touch');
  });

  it('POST /v1/admin/stats/recovery-outreach/handoff hands off admin outreach and records snooze metadata', async () => {
    const ownerEmail = `recovery-handoff-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Recovery Handoff Owner',
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
      payload: { name: 'Recovery Handoff Workspace' },
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
        email: `recovery-handoff-member-${Date.now()}@example.com`,
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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    expect(reconcileRes.statusCode).toBe(200);

    const outreachRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    expect(outreachRes.statusCode).toBe(200);

    const handoffRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 48,
        note: '已转交 CRM 跟进，静默 48 小时。',
      },
    });
    expect(handoffRes.statusCode).toBe(200);
    expect(JSON.parse(handoffRes.body)).toMatchObject({ ok: true });

    const workspaceStats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(workspaceStats).toMatchObject({
      recoveryOutreach: {
        pendingExport: 1,
        handedOff: 1,
      },
      actionableWorkspaces: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachStatus: 'handed_off',
          lastOutreachHandoffChannel: 'crm',
          lastOutreachHandoffAt: expect.any(String),
          lastOutreachHandoffNote: '已转交 CRM 跟进，静默 48 小时。',
        }),
      ]),
    });

    const exportRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/export',
      headers: { 'x-admin-key': key },
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.body).toContain('workspace_name,owner_email');
    expect(exportRes.body).toContain('last_outreach_export_count');
    expect(exportRes.body).toContain('Recovery Handoff Workspace');

    const exportedStats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(exportedStats).toMatchObject({
      recoveryOutreach: {
        pendingExport: 0,
        handedOff: 1,
      },
      actionableWorkspaces: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachExportCount: 1,
          lastOutreachExportedAt: expect.any(String),
        }),
      ]),
    });

    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_URL = 'https://crm.example.com/recovery';
    process.env.TEAM_WORKSPACE_RECOVERY_WEBHOOK_BEARER_TOKEN = 'test-token';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'upstream_failed' }), {
          status: 502,
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
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { retryIntervalHours: 12 },
    });
    expect(webhookFailRes.statusCode).toBe(502);
    expect(JSON.parse(webhookFailRes.body)).toMatchObject({
      error: 'recovery_handoff_webhook_failed',
      attemptedCount: 1,
      deliveredCount: 0,
      statusCode: 502,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://crm.example.com/recovery',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );

    const failedStats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(failedStats).toMatchObject({
      recoveryOutreach: {
        pendingWebhook: 0,
        retryingWebhook: 1,
        deliveredWebhook: 0,
        failedWebhook: 1,
      },
      actionableWorkspaces: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachWebhookAttemptCount: 1,
          lastOutreachWebhookAttemptAt: expect.any(String),
          nextOutreachWebhookAttemptAt: expect.any(String),
          lastOutreachWebhookDeliveryCount: 0,
          lastOutreachWebhookDeliveredAt: null,
          lastOutreachWebhookStatusCode: 502,
          lastOutreachWebhookError: expect.stringContaining('HTTP 502'),
        }),
      ]),
    });

    const webhookSkipRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: { 'x-admin-key': key },
    });
    expect(webhookSkipRes.statusCode).toBe(200);
    expect(JSON.parse(webhookSkipRes.body)).toMatchObject({
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      skipped: 'no_due_handoffs',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const webhookRetryRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        force: true,
        retryIntervalHours: 0,
      },
    });
    expect(webhookRetryRes.statusCode).toBe(200);
    expect(JSON.parse(webhookRetryRes.body)).toMatchObject({
      ok: true,
      attemptedCount: 1,
      deliveredCount: 1,
      statusCode: 202,
      skipped: null,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const deliveredStats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(deliveredStats).toMatchObject({
      recoveryOutreach: {
        pendingWebhook: 0,
        retryingWebhook: 0,
        deliveredWebhook: 1,
        failedWebhook: 0,
      },
      actionableWorkspaces: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachWebhookAttemptCount: 2,
          lastOutreachWebhookAttemptAt: expect.any(String),
          nextOutreachWebhookAttemptAt: null,
          lastOutreachWebhookDeliveryCount: 1,
          lastOutreachWebhookDeliveredAt: expect.any(String),
          lastOutreachWebhookStatusCode: 202,
          lastOutreachWebhookError: null,
        }),
      ]),
    });
  });

  it('POST /v1/admin/stats/recovery-handoffs/webhook dead-letters exhausted handoffs until force=true', async () => {
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `recovery-dead-letter-owner-${Date.now()}@example.com`,
        password: 'password123',
        displayName: 'Recovery Dead Letter Owner',
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
      payload: { name: 'Recovery Dead Letter Workspace' },
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
        email: `recovery-dead-letter-member-${Date.now()}@example.com`,
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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
        note: '切到 dead-letter 演示链路。',
      },
    });

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
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: { 'x-admin-key': key },
    });
    expect(failRes.statusCode).toBe(502);

    const deadLetterStats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(deadLetterStats).toMatchObject({
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
          lastOutreachWebhookDeliveredAt: null,
        }),
      ]),
    });

    const skipRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: { 'x-admin-key': key },
    });
    expect(skipRes.statusCode).toBe(200);
    expect(JSON.parse(skipRes.body)).toMatchObject({
      ok: true,
      attemptedCount: 0,
      deliveredCount: 0,
      skipped: 'no_retryable_handoffs',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const forceRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { force: true },
    });
    expect(forceRes.statusCode).toBe(200);
    expect(JSON.parse(forceRes.body)).toMatchObject({
      ok: true,
      attemptedCount: 1,
      deliveredCount: 1,
      skipped: null,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('POST /v1/admin/stats/recovery-owner-email delivers owner recovery emails and stores SMTP metadata', async () => {
    const ownerEmail = `recovery-email-owner-${Date.now()}@example.com`;
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'password123',
        displayName: 'Recovery Email Owner',
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
      payload: { name: 'Recovery Email Workspace' },
    });
    expect(createWorkspaceRes.statusCode).toBe(200);
    const createdWorkspace = JSON.parse(createWorkspaceRes.body) as {
      workspace: { id: string };
    };

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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM = 'Startup Graveyard <ops@example.com>';
    const emailSpy = vi
      .spyOn(recoveryEmailClient, 'sendRecoveryOutreachEmail')
      .mockResolvedValue({ messageId: 'smtp-msg-123' });

    const emailRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-owner-email',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { retryIntervalHours: 24 },
    });
    expect(emailRes.statusCode).toBe(200);
    const emailBody = JSON.parse(emailRes.body) as {
      ok: boolean;
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
      skipped: string | null;
    };
    expect(emailBody.ok).toBe(true);
    expect(emailBody.skipped).toBeNull();
    expect(emailBody.attemptedCount).toBeGreaterThanOrEqual(1);
    expect(emailBody.deliveredCount).toBeGreaterThanOrEqual(1);
    expect(emailBody.failedCount).toBe(0);
    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ownerEmail,
        workspaceName: 'Recovery Email Workspace',
      }),
    );

    const stats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(stats.recoveryOutreach.deliveredEmail).toBeGreaterThanOrEqual(1);
    expect(stats.actionableWorkspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachEmailAttemptCount: 1,
          lastOutreachEmailDeliveredAt: expect.any(String),
          lastOutreachEmailMessageId: 'smtp-msg-123',
        }),
      ]),
    );
  });

  it('POST /v1/admin/stats/recovery-member-email delivers fallback member emails and stores SMTP metadata', async () => {
    const ownerEmail = `recovery-member-owner-${Date.now()}@example.com`;
    const memberEmail = `recovery-member-user-${Date.now()}@example.com`;
    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Recovery Member Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Fallback Member',
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
      payload: { name: 'Recovery Member Email Workspace' },
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
      payload: { email: memberEmail, role: 'member' },
    });
    expect(inviteRes.statusCode).toBe(200);

    const memberContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
      },
    });
    const memberContext = JSON.parse(memberContextRes.body) as {
      pendingInvites: Array<{ id: string }>;
    };

    const acceptInviteRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${memberContext.pendingInvites[0]!.id}/accept`,
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
      },
    });
    expect(acceptInviteRes.statusCode).toBe(200);

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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM = 'Startup Graveyard <ops@example.com>';
    const emailSpy = vi
      .spyOn(memberRecoveryEmailClient, 'sendRecoveryFallbackMemberEmail')
      .mockResolvedValue({ messageId: 'member-msg-123' });

    const emailRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-member-email',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { retryIntervalHours: 24 },
    });
    expect(emailRes.statusCode).toBe(200);
    const emailBody = JSON.parse(emailRes.body) as {
      ok: boolean;
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
      skipped: string | null;
    };
    expect(emailBody.ok).toBe(true);
    expect(emailBody.skipped).toBeNull();
    expect(emailBody.attemptedCount).toBeGreaterThanOrEqual(1);
    expect(emailBody.deliveredCount).toBeGreaterThanOrEqual(1);
    expect(emailBody.failedCount).toBe(0);
    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: memberEmail,
        workspaceName: 'Recovery Member Email Workspace',
      }),
    );

    const stats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(stats.recoveryOutreach.deliveredMemberEmail).toBeGreaterThanOrEqual(1);
    expect(stats.actionableWorkspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          memberRecoveryDeliveredCount: 1,
          memberRecoveryPendingCount: 0,
          memberRecoveryLastEmailDeliveredAt: expect.any(String),
        }),
      ]),
    );
  });

  it('POST /v1/admin/stats/recovery-playbook orchestrates owner/member email and CRM sync', async () => {
    const ownerEmail = `recovery-playbook-owner-${Date.now()}@example.com`;
    const memberEmail = `recovery-playbook-member-${Date.now()}@example.com`;
    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Recovery Playbook Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Recovery Playbook Member',
        },
      }),
    ]);
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
      payload: { name: 'Recovery Playbook Workspace' },
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
      payload: { email: memberEmail, role: 'member' },
    });

    const memberContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
      },
    });
    const memberContext = JSON.parse(memberContextRes.body) as {
      pendingInvites: Array<{ id: string }>;
    };
    const acceptInviteRes = await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${memberContext.pendingInvites[0]!.id}/accept`,
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
      },
    });
    expect(acceptInviteRes.statusCode).toBe(200);

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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    const handoffRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 24,
        note: 'Playbook 交给 CRM 自动同步。',
      },
    });
    expect(handoffRes.statusCode).toBe(200);

    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM = 'Startup Graveyard <ops@example.com>';
    process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL = 'https://crm.example.com/recovery';
    const ownerEmailSpy = vi
      .spyOn(recoveryEmailClient, 'sendRecoveryOutreachEmail')
      .mockResolvedValue({ messageId: 'playbook-owner-msg-1' });
    const memberEmailSpy = vi
      .spyOn(memberRecoveryEmailClient, 'sendRecoveryFallbackMemberEmail')
      .mockResolvedValue({ messageId: 'playbook-member-msg-1' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ recordId: 'crm-case-123' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const playbookRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-playbook',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { retryIntervalHours: 0 },
    });
    expect(playbookRes.statusCode).toBe(200);
    const playbookBody = JSON.parse(playbookRes.body) as {
      ok: boolean;
      summary: string;
      steps: {
        outreach: { status: string };
        ownerEmail: { status: string; successCount: number };
        memberEmail: { status: string; successCount: number };
        crmSync: { status: string; successCount: number };
        webhook: { status: string };
        slack: { status: string };
      };
    };
    expect(playbookBody).toMatchObject({
      ok: true,
      summary: expect.stringContaining('member=ok:1'),
      steps: {
        outreach: expect.objectContaining({ status: 'completed' }),
        memberEmail: expect.objectContaining({ status: 'completed', successCount: 1 }),
        crmSync: expect.objectContaining({ status: 'completed', successCount: 1 }),
        webhook: expect.objectContaining({ status: 'disabled' }),
        slack: expect.objectContaining({ status: 'disabled' }),
      },
    });
    expect(['skipped', 'completed']).toContain(playbookBody.steps.ownerEmail.status);
    expect(ownerEmailSpy).toHaveBeenCalledTimes(playbookBody.steps.ownerEmail.successCount);
    expect(memberEmailSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    const stats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(stats.recoveryOutreach.deliveredMemberEmail).toBeGreaterThanOrEqual(1);
    expect(stats.recoveryOutreach.syncedCrm).toBeGreaterThanOrEqual(1);
    expect(stats.recoveryPlaybook.totalRuns).toBeGreaterThanOrEqual(1);
    expect(stats.recoveryPlaybook.recent[0]).toMatchObject({
      triggerType: 'manual',
      requestedSteps: ['outreach', 'ownerEmail', 'memberEmail', 'crmSync', 'webhook', 'slack'],
      rerunOfRunId: null,
      ok: true,
      steps: {
        memberEmail: expect.objectContaining({ status: 'completed', successCount: 1 }),
        crmSync: expect.objectContaining({ status: 'completed', successCount: 1 }),
      },
    });
    expect(stats.actionableWorkspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachCrmSyncedAt: expect.any(String),
          lastOutreachCrmExternalRecordId: 'crm-case-123',
          memberRecoveryDeliveredCount: 1,
          memberRecoveryPendingCount: 0,
        }),
      ]),
    );
  });

  it('POST /v1/admin/stats/recovery-playbook/rerun-failed reruns only failed steps', async () => {
    const ownerEmail = `recovery-rerun-owner-${Date.now()}@example.com`;
    const memberEmail = `recovery-rerun-member-${Date.now()}@example.com`;
    const [ownerRegisterRes, memberRegisterRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: ownerEmail,
          password: 'password123',
          displayName: 'Recovery Rerun Owner',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: memberEmail,
          password: 'password123',
          displayName: 'Recovery Rerun Member',
        },
      }),
    ]);
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
      payload: { name: 'Recovery Playbook Rerun Workspace' },
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
      payload: { email: memberEmail, role: 'member' },
    });

    const memberContextRes = await app.inject({
      method: 'GET',
      url: '/v1/team-workspace/me',
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
      },
    });
    const memberContext = JSON.parse(memberContextRes.body) as {
      pendingInvites: Array<{ id: string }>;
    };
    await app.inject({
      method: 'POST',
      url: `/v1/team-workspace/invites/${memberContext.pendingInvites[0]!.id}/accept`,
      headers: {
        authorization: `Bearer ${memberRegistered.accessToken}`,
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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 24,
        note: 'Playbook rerun test handoff.',
      },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.TEAM_WORKSPACE_RECOVERY_EMAIL_FROM = 'Startup Graveyard <ops@example.com>';
    process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL = 'https://crm.example.com/recovery';
    vi.spyOn(recoveryEmailClient, 'sendRecoveryOutreachEmail').mockResolvedValue({
      messageId: 'rerun-owner-msg-1',
    });
    vi.spyOn(memberRecoveryEmailClient, 'sendRecoveryFallbackMemberEmail').mockResolvedValue({
      messageId: 'rerun-member-msg-1',
    });
    vi.spyOn(recoveryCrmClient, 'deliverRecoveryOutreachCrmSync')
      .mockResolvedValueOnce({
        ok: false,
        error: 'recovery_handoff_crm_failed',
        attemptedCount: 1,
        syncedCount: 0,
        failedCount: 1,
        detail: 'temporary_crm_failure',
      })
      .mockResolvedValue({
        ok: true,
        attemptedCount: 1,
        syncedCount: 1,
        failedCount: 0,
        skipped: null,
      });

    const failedRunRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-playbook',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { retryIntervalHours: 0 },
    });
    expect(failedRunRes.statusCode).toBe(502);
    const failedRunBody = JSON.parse(failedRunRes.body) as {
      steps: { crmSync: { status: string } };
    };
    expect(failedRunBody.steps.crmSync.status).toBe('failed');

    const failedRun = (await app.teamWorkspacesRepo.listRecentRecoveryPlaybookRuns(1))[0]!;
    expect(failedRun.ok).toBe(false);

    const rerunRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-playbook/rerun-failed',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { runId: failedRun.id },
    });
    expect(rerunRes.statusCode).toBe(200);
    const rerunBody = JSON.parse(rerunRes.body) as {
      ok: boolean;
      requestedSteps: string[];
      rerunOfRunId: string;
      steps: {
        outreach: { status: string; skippedReason: string | null };
        crmSync: { status: string; successCount: number };
        memberEmail: { status: string; skippedReason: string | null };
      };
    };
    expect(rerunBody).toMatchObject({
      ok: true,
      requestedSteps: ['crmSync'],
      rerunOfRunId: failedRun.id,
      steps: {
        outreach: { status: 'skipped', skippedReason: 'not_selected' },
        crmSync: { status: 'completed', successCount: 1 },
        memberEmail: { status: 'skipped', skippedReason: 'not_selected' },
      },
    });

    const recentRuns = await app.teamWorkspacesRepo.listRecentRecoveryPlaybookRuns(2);
    expect(recentRuns[0]).toMatchObject({
      triggerType: 'manual_rerun',
      requestedSteps: ['crmSync'],
      rerunOfRunId: failedRun.id,
      ok: true,
      steps: {
        outreach: expect.objectContaining({ status: 'skipped', skippedReason: 'not_selected' }),
        crmSync: expect.objectContaining({ status: 'completed', successCount: 1 }),
      },
    });
  });

  it('POST /v1/admin/stats/recovery-handoffs/slack alerts webhook dead-letters to ops', async () => {
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `recovery-slack-owner-${Date.now()}@example.com`,
        password: 'password123',
        displayName: 'Recovery Slack Owner',
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
      payload: { name: 'Recovery Slack Workspace' },
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
        email: `recovery-slack-member-${Date.now()}@example.com`,
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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
        note: '切到 Slack 告警演示链路。',
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
      url: '/v1/admin/stats/recovery-handoffs/webhook',
      headers: { 'x-admin-key': key },
    });
    expect(deadLetterRes.statusCode).toBe(502);

    const slackRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/slack',
      headers: { 'x-admin-key': key },
    });
    expect(slackRes.statusCode).toBe(200);
    const slackBody = JSON.parse(slackRes.body) as {
      ok: boolean;
      attemptedCount: number;
      alertedCount: number;
      skipped: string | null;
    };
    expect(slackBody).toMatchObject({
      ok: true,
      skipped: null,
    });
    expect(slackBody.attemptedCount).toBeGreaterThanOrEqual(1);
    expect(slackBody.alertedCount).toBeGreaterThanOrEqual(1);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://hooks.slack.com/services/test/team/workspace',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const slackStats = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(slackStats.recoveryOutreach.deadLetteredWebhook).toBeGreaterThanOrEqual(1);
    expect(slackStats.recoveryOutreach.alertedSlack).toBeGreaterThanOrEqual(1);
    expect(slackStats.recoveryOutreach.pendingSlackAlert).toBe(0);
    expect(slackStats.recoveryOutreach.failedSlackAlert).toBe(0);
    expect(slackStats.actionableWorkspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachWebhookExhaustedAt: expect.any(String),
          lastOutreachSlackAlertCount: 1,
          lastOutreachSlackAlertAttemptAt: expect.any(String),
          lastOutreachSlackAlertedAt: expect.any(String),
          lastOutreachSlackAlertError: null,
        }),
      ]),
    );
  });

  it('POST /v1/admin/stats/recovery-handoffs/crm syncs handed-off CRM cases and stores external ids', async () => {
    const ownerRegisterRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `recovery-crm-owner-${Date.now()}@example.com`,
        password: 'password123',
        displayName: 'Recovery CRM Owner',
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
      payload: { name: 'Recovery CRM Workspace' },
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
        email: `recovery-crm-member-${Date.now()}@example.com`,
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
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'reconcile_team_workspace_billing', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/scheduler/trigger',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: { sourceName: 'run_team_workspace_recovery_outreach', payload: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-outreach/handoff',
      headers: {
        'x-admin-key': key,
        'content-type': 'application/json',
      },
      payload: {
        workspaceId: createdWorkspace.workspace.id,
        channel: 'crm',
        snoozeHours: 0,
        note: '同步到 CRM case 队列。',
      },
    });

    process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_URL = 'https://crm.example.com/api/recovery';
    process.env.TEAM_WORKSPACE_RECOVERY_CRM_API_BEARER_TOKEN = 'crm-secret';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ recordId: 'crm-case-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const crmRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/stats/recovery-handoffs/crm',
      headers: { 'x-admin-key': key },
    });
    expect(crmRes.statusCode).toBe(200);
    const crmBody = JSON.parse(crmRes.body) as {
      ok: boolean;
      attemptedCount: number;
      syncedCount: number;
      failedCount: number;
      skipped: string | null;
    };
    expect(crmBody.ok).toBe(true);
    expect(crmBody.skipped).toBeNull();
    expect(crmBody.attemptedCount).toBeGreaterThanOrEqual(1);
    expect(crmBody.syncedCount).toBeGreaterThanOrEqual(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://crm.example.com/api/recovery',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );

    const teamMetrics = await app.teamWorkspacesRepo.getAdminMetrics();
    expect(teamMetrics).toMatchObject({
      recoveryOutreach: {
        syncedCrm: expect.any(Number),
      },
      actionableWorkspaces: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: createdWorkspace.workspace.id,
          lastOutreachCrmSyncCount: 1,
          lastOutreachCrmSyncedAt: expect.any(String),
          lastOutreachCrmExternalRecordId: 'crm-case-123',
          lastOutreachCrmSyncError: null,
        }),
      ]),
    });
  });
});
