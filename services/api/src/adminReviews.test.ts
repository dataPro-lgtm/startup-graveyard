import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';

const ADMIN_KEY = 'test-admin-key';
const adminHeaders = { 'X-Admin-Key': ADMIN_KEY };

describe('admin reviews API (mock DB)', () => {
  let app: FastifyInstance;
  const previousAdminKey = process.env.ADMIN_API_KEY;

  beforeAll(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  });

  afterAll(() => {
    if (previousAdminKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previousAdminKey;
  });

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('blocks approval until evidence and failure factors are present', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/cases',
      headers: adminHeaders,
      payload: {
        slug: 'maturity-gate',
        companyName: 'Maturity Gate Inc',
        summary: 'A draft case created to verify publish gating in the admin review flow.',
        industryKey: 'saas',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = JSON.parse(createRes.body) as { caseId: string; reviewId: string };

    const blockedRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/reviews/${created.reviewId}/approve`,
      headers: adminHeaders,
    });
    expect(blockedRes.statusCode).toBe(409);
    expect(JSON.parse(blockedRes.body)).toMatchObject({
      error: 'publish_requirements_not_met',
      caseId: created.caseId,
      publishReadiness: {
        ready: false,
        evidenceCount: 0,
        failureFactorCount: 0,
        missing: ['evidence_sources', 'failure_factors'],
      },
    });

    const evidenceRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/cases/${created.caseId}/evidence`,
      headers: adminHeaders,
      payload: {
        sourceType: 'media',
        title: 'Maturity Gate coverage',
        url: 'https://example.com/maturity-gate',
        credibilityLevel: 'high',
      },
    });
    expect(evidenceRes.statusCode).toBe(200);

    const factorRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/cases/${created.caseId}/failure-factors`,
      headers: adminHeaders,
      payload: {
        level1Key: 'Go To Market',
        level2Key: 'Channel Mismatch',
        weight: 12,
      },
    });
    expect(factorRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/reviews?status=pending&limit=20',
      headers: adminHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      items: Array<{
        id: string;
        publishReadiness: {
          ready: boolean;
          evidenceCount: number;
          failureFactorCount: number;
          missing: string[];
        };
      }>;
    };
    const createdReview = listBody.items.find((item) => item.id === created.reviewId);
    expect(createdReview).toBeDefined();
    expect(createdReview?.publishReadiness).toMatchObject({
      ready: true,
      evidenceCount: 1,
      failureFactorCount: 1,
      missing: [],
    });

    const approveRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/reviews/${created.reviewId}/approve`,
      headers: adminHeaders,
    });
    expect(approveRes.statusCode).toBe(200);
    expect(JSON.parse(approveRes.body)).toMatchObject({
      ok: true,
      reviewId: created.reviewId,
      caseId: created.caseId,
      status: 'approved',
    });

    const ingestionRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/ingestion-jobs?status=queued&limit=20',
      headers: adminHeaders,
    });
    expect(ingestionRes.statusCode).toBe(200);
    expect(JSON.parse(ingestionRes.body)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          sourceName: 'rebuild_case_search_index',
          triggerType: 'review_approved',
          payload: {
            caseId: created.caseId,
          },
        }),
      ]),
    });

    const publicRes = await app.inject({
      method: 'GET',
      url: '/v1/cases/by-slug/maturity-gate',
    });
    expect(publicRes.statusCode).toBe(200);
    expect(JSON.parse(publicRes.body)).toMatchObject({
      failureFactors: expect.arrayContaining([
        expect.objectContaining({
          level1Key: 'go_to_market',
          level2Key: 'channel_mismatch',
        }),
      ]),
    });
  });

  it('supports request-changes and resubmit transitions', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/cases',
      headers: adminHeaders,
      payload: {
        slug: 'needs-edits',
        companyName: 'Needs Edits LLC',
        summary: 'A draft case created to validate request-changes and resubmit.',
        industryKey: 'fintech',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = JSON.parse(createRes.body) as { caseId: string; reviewId: string };

    const requestChangesRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/reviews/${created.reviewId}/request-changes`,
      headers: adminHeaders,
      payload: {
        decisionNote: '请补充至少一条证据来源，并补一个可复用的失败因子。',
      },
    });
    expect(requestChangesRes.statusCode).toBe(200);
    expect(JSON.parse(requestChangesRes.body)).toMatchObject({
      reviewId: created.reviewId,
      caseId: created.caseId,
      status: 'changes_requested',
    });

    const changedListRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/reviews?status=changes_requested&limit=20',
      headers: adminHeaders,
    });
    expect(changedListRes.statusCode).toBe(200);
    expect(JSON.parse(changedListRes.body)).toMatchObject({
      items: [
        expect.objectContaining({
          id: created.reviewId,
          reviewStatus: 'changes_requested',
          decisionNote: '请补充至少一条证据来源，并补一个可复用的失败因子。',
        }),
      ],
    });

    const resubmitRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/reviews/${created.reviewId}/resubmit`,
      headers: adminHeaders,
    });
    expect(resubmitRes.statusCode).toBe(200);
    expect(JSON.parse(resubmitRes.body)).toMatchObject({
      reviewId: created.reviewId,
      caseId: created.caseId,
      status: 'pending',
    });
  });
});
