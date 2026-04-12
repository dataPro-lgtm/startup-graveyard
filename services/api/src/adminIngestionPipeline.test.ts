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

  it('pipeline_url_draft captures a snapshot and creates a draft review with evidence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        '<html><head><title>Acme Collapse | Example News</title></head><body><article><p>Acme shut down after rapid expansion and weak unit economics.</p></article></body></html>',
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

    const reviewsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/reviews?status=pending&limit=20',
      headers,
    });
    expect(reviewsRes.statusCode).toBe(200);
    expect(JSON.parse(reviewsRes.body)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          slug: 'acme-collapse',
          reviewStatus: 'pending',
          publishReadiness: {
            ready: false,
            evidenceCount: 1,
            failureFactorCount: 0,
            missing: ['failure_factors'],
          },
        }),
      ]),
    });
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
