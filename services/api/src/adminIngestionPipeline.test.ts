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
});
