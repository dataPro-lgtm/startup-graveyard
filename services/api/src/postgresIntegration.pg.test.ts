import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './buildApp.js';
import { resetPool } from './db/pool.js';
import {
  createTestPool,
  getRequiredTestDatabaseUrl,
  truncatePublicTables,
} from './test/pgTestHarness.js';

const ADMIN_KEY = 'pg-integration-admin-key';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const suite = TEST_DATABASE_URL ? describe : describe.skip;

suite('postgres integration', () => {
  let app: FastifyInstance | null = null;
  let pool: Pool | null = null;
  const previousEnv = {
    adminApiKey: process.env.ADMIN_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    openAiApiKey: process.env.OPENAI_API_KEY,
  };

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    delete process.env.OPENAI_API_KEY;
    pool = createTestPool();
  });

  beforeEach(async () => {
    if (!pool) throw new Error('postgres integration test pool not initialized');
    await truncatePublicTables(pool);
    await resetPool();
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) {
      await app.close();
      app = null;
    }
    await resetPool();
  });

  afterAll(async () => {
    await resetPool();
    if (pool) {
      await pool.end();
      pool = null;
    }
    if (previousEnv.adminApiKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previousEnv.adminApiKey;
    if (previousEnv.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousEnv.databaseUrl;
    if (previousEnv.openAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousEnv.openAiApiKey;
  });

  it('approves a review and rebuilds case search index against postgres', async () => {
    const db = pool;
    if (!db) throw new Error('postgres integration test pool not initialized');
    const adminHeaders = {
      'content-type': 'application/json',
      'x-admin-key': ADMIN_KEY,
    };

    const createRes = await app!.inject({
      method: 'POST',
      url: '/v1/admin/cases',
      headers: adminHeaders,
      payload: {
        slug: 'pg-index-case',
        companyName: 'PG Index Case',
        summary: 'A PostgreSQL-backed draft case used to validate publish and indexing.',
        industryKey: 'saas',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = JSON.parse(createRes.body) as { caseId: string; reviewId: string };

    const evidenceRes = await app!.inject({
      method: 'POST',
      url: `/v1/admin/cases/${created.caseId}/evidence`,
      headers: adminHeaders,
      payload: {
        sourceType: 'media',
        title: 'PG Index Case postmortem',
        url: 'https://example.com/pg-index-case',
        credibilityLevel: 'high',
        excerpt: 'The company expanded too fast and failed to hold margin.',
      },
    });
    expect(evidenceRes.statusCode).toBe(200);

    const factorRes = await app!.inject({
      method: 'POST',
      url: `/v1/admin/cases/${created.caseId}/failure-factors`,
      headers: adminHeaders,
      payload: {
        level1Key: 'Finance',
        level2Key: 'Premature Scaling',
        level3Key: 'Cash Burn',
        weight: 88,
        explanation: 'The business expanded faster than its unit economics allowed.',
      },
    });
    expect(factorRes.statusCode).toBe(200);

    const approveRes = await app!.inject({
      method: 'POST',
      url: `/v1/admin/reviews/${created.reviewId}/approve`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(JSON.parse(approveRes.body)).toMatchObject({
      ok: true,
      caseId: created.caseId,
      reviewId: created.reviewId,
      status: 'approved',
    });

    const queuedRes = await app!.inject({
      method: 'GET',
      url: '/v1/admin/ingestion-jobs?status=queued&limit=20',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(queuedRes.statusCode).toBe(200);
    expect(JSON.parse(queuedRes.body)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          sourceName: 'rebuild_case_search_index',
          triggerType: 'review_approved',
          payload: { caseId: created.caseId },
        }),
      ]),
    });

    const processRes = await app!.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(processRes.statusCode).toBe(200);
    expect(JSON.parse(processRes.body)).toMatchObject({
      ok: true,
      job: {
        status: 'succeeded',
        sourceName: 'rebuild_case_search_index',
      },
    });

    const chunksRes = await db.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM case_chunks WHERE case_id = $1`,
      [created.caseId],
    );
    expect(Number(chunksRes.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(3);

    const embeddingRes = await db.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM case_embeddings WHERE case_id = $1`,
      [created.caseId],
    );
    expect(Number(embeddingRes.rows[0]?.count ?? 0)).toBe(1);

    const publicRes = await app!.inject({
      method: 'GET',
      url: '/v1/cases/by-slug/pg-index-case',
    });
    expect(publicRes.statusCode).toBe(200);
    expect(JSON.parse(publicRes.body)).toMatchObject({
      slug: 'pg-index-case',
      companyName: 'PG Index Case',
      failureFactors: expect.arrayContaining([
        expect.objectContaining({
          level1Key: 'finance',
          level2Key: 'premature_scaling',
        }),
      ]),
    });
  });

  it('persists snapshots and extracts factors, timeline, and lessons against postgres', async () => {
    const db = pool;
    if (!db) throw new Error('postgres integration test pool not initialized');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `
          <html>
            <head>
              <title>Acme Collapse | Example News</title>
            </head>
            <body>
              <article>
                <p>Acme founded in 2020 to build workflow software for field teams.</p>
                <p>In 2022 Acme raised $50 million and started rapid expansion across three markets.</p>
                <p>By 2023 the company announced layoffs as unit economics deteriorated and multiple contractor lawsuits hit the business.</p>
                <p>On January 15, 2024 Acme shut down after failing to secure a new round.</p>
              </article>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      ),
    );

    const adminHeaders = {
      'content-type': 'application/json',
      'x-admin-key': ADMIN_KEY,
    };

    const enqueueRes = await app!.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs',
      headers: adminHeaders,
      payload: {
        sourceName: 'pipeline_url_draft',
        triggerType: 'admin',
        payload: {
          url: 'https://example.com/acme-collapse',
          slug: 'acme-collapse',
          companyName: 'Acme',
          summary: 'Acme collapsed after rapid expansion, lawsuits, and weak unit economics.',
          industryKey: 'saas',
        },
      },
    });
    expect(enqueueRes.statusCode).toBe(200);

    const firstProcessRes = await app!.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(firstProcessRes.statusCode).toBe(200);
    expect(JSON.parse(firstProcessRes.body)).toMatchObject({
      ok: true,
      job: {
        status: 'succeeded',
        sourceName: 'pipeline_url_draft',
      },
    });

    const secondProcessRes = await app!.inject({
      method: 'POST',
      url: '/v1/admin/ingestion-jobs/process-next',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(secondProcessRes.statusCode).toBe(200);
    expect(JSON.parse(secondProcessRes.body)).toMatchObject({
      ok: true,
      job: {
        status: 'succeeded',
        sourceName: 'extract_case_signals',
      },
    });

    const snapshotListRes = await app!.inject({
      method: 'GET',
      url: '/v1/admin/source-snapshots?limit=10&sourceName=pipeline_url_draft',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(snapshotListRes.statusCode).toBe(200);
    expect(JSON.parse(snapshotListRes.body)).toMatchObject({
      items: [
        expect.objectContaining({
          sourceName: 'pipeline_url_draft',
          title: 'Acme Collapse | Example News',
          sourceUrl: 'https://example.com/acme-collapse',
        }),
      ],
    });

    const caseRes = await db.query<{
      case_id: string;
      primary_failure_reason_key: string | null;
      key_lessons: string | null;
    }>(
      `
      SELECT c.id AS case_id, c.primary_failure_reason_key, c.key_lessons
      FROM cases c
      WHERE c.slug = 'acme-collapse'
      LIMIT 1
      `,
    );
    const row = caseRes.rows[0];
    expect(row).toBeDefined();
    expect(row?.primary_failure_reason_key).toBe('premature_scaling');
    expect(row?.key_lessons).toContain('扩张前先验证单位经济模型');

    const evidenceCountRes = await db.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM evidence_sources WHERE case_id = $1`,
      [row!.case_id],
    );
    expect(Number(evidenceCountRes.rows[0]?.count ?? 0)).toBe(1);

    const factorCountRes = await db.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM failure_factors WHERE case_id = $1`,
      [row!.case_id],
    );
    expect(Number(factorCountRes.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);

    const timelineRes = await db.query<{ event_type: string; title: string }>(
      `
      SELECT event_type, title
      FROM timeline_events
      WHERE case_id = $1
      ORDER BY sort_order, event_date
      `,
      [row!.case_id],
    );
    expect(timelineRes.rows.map((item) => item.event_type)).toEqual(
      expect.arrayContaining(['founded', 'funding', 'layoff', 'shutdown']),
    );

    const reviewsRes = await app!.inject({
      method: 'GET',
      url: '/v1/admin/reviews?status=pending&limit=20',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(reviewsRes.statusCode).toBe(200);
    expect(JSON.parse(reviewsRes.body)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          slug: 'acme-collapse',
          publishReadiness: expect.objectContaining({
            ready: true,
            evidenceCount: 1,
          }),
        }),
      ]),
    });
  });
});
