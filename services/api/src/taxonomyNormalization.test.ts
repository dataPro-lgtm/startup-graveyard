import { describe, expect, it } from 'vitest';
import {
  failureFactorLevel1Label,
  normalizePrimaryFailureReasonKey,
  timelineEventTypeLabel,
} from '@sg/shared/taxonomy';
import { addFailureFactorBodySchema, addTimelineEventBodySchema } from './schemas/adminCaseAttachments.js';
import { createDraftCaseBodySchema } from './schemas/adminCases.js';
import { listCasesQuerySchema } from './schemas/cases.js';

describe('taxonomy normalization', () => {
  it('normalizes draft case taxonomy keys', () => {
    const body = createDraftCaseBodySchema.parse({
      slug: 'Acme',
      companyName: 'Acme',
      summary: 'Acme summary',
      industryKey: 'SaaS',
      businessModelKey: 'B2B SaaS',
      primaryFailureReasonKey: 'Product Market Fit',
    });

    expect(body.slug).toBe('acme');
    expect(body.industryKey).toBe('saas');
    expect(body.businessModelKey).toBe('b2b_saas');
    expect(body.primaryFailureReasonKey).toBe('product_market_fit');
  });

  it('normalizes factor and timeline payloads', () => {
    const factor = addFailureFactorBodySchema.parse({
      level1Key: 'Finance',
      level2Key: 'Unit Economics',
      level3Key: 'Cash Burn',
      weight: 80,
    });
    expect(factor.level1Key).toBe('finance');
    expect(factor.level2Key).toBe('unit_economics');
    expect(factor.level3Key).toBe('cash_burn');

    const timeline = addTimelineEventBodySchema.parse({
      eventDate: '2024-01-15',
      eventType: 'Founding',
      title: 'Acme founded',
    });
    expect(timeline.eventType).toBe('founded');
  });

  it('normalizes filter aliases and exposes labels for display', () => {
    const query = listCasesQuerySchema.parse({
      primaryFailureReasonKey: '监管',
      businessModelKey: 'B2B SaaS',
    });
    expect(query.primaryFailureReasonKey).toBe('regulatory');
    expect(query.businessModelKey).toBe('b2b_saas');

    expect(normalizePrimaryFailureReasonKey('技术债')).toBe('technical_debt');
    expect(failureFactorLevel1Label('Finance')).toBe('财务 / 资本');
    expect(timelineEventTypeLabel('founding')).toBe('成立');
  });
});
