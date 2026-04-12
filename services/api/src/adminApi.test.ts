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
    expect(body.caseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
