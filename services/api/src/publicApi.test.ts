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
