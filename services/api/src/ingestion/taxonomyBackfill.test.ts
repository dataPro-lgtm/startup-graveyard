import { describe, expect, it } from 'vitest';
import {
  diffCaseTaxonomyRow,
  diffFailureFactorTaxonomyRow,
  diffTimelineTaxonomyRow,
  normalizeCaseTaxonomyRow,
  normalizeFailureFactorTaxonomyRow,
  normalizeTimelineTaxonomyRow,
} from './taxonomyBackfill.js';

describe('taxonomyBackfill normalization', () => {
  it('normalizes case-level taxonomy keys using the same canonical rules as admin writes', () => {
    expect(
      normalizeCaseTaxonomyRow({
        industryKey: 'Real Estate',
        businessModelKey: 'B2B SaaS',
        primaryFailureReasonKey: '技术债',
      }),
    ).toEqual({
      industryKey: 'real_estate',
      businessModelKey: 'b2b_saas',
      primaryFailureReasonKey: 'technical_debt',
    });
  });

  it('normalizes failure-factor aliases and freeform level3 keys', () => {
    expect(
      normalizeFailureFactorTaxonomyRow({
        level1Key: 'Go To Market',
        level2Key: 'Channel Mismatch',
        level3Key: 'Cash Burn',
      }),
    ).toEqual({
      level1Key: 'go_to_market',
      level2Key: 'channel_mismatch',
      level3Key: 'cash_burn',
    });
  });

  it('normalizes timeline event aliases', () => {
    expect(
      normalizeTimelineTaxonomyRow({
        eventType: 'Released',
      }),
    ).toEqual({
      eventType: 'product_launch',
    });
  });

  it('returns null diffs when rows are already canonical', () => {
    expect(
      diffCaseTaxonomyRow({
        industryKey: 'saas',
        businessModelKey: 'subscription',
        primaryFailureReasonKey: 'premature_scaling',
      }),
    ).toBeNull();
    expect(
      diffFailureFactorTaxonomyRow({
        level1Key: 'finance',
        level2Key: 'premature_scaling',
        level3Key: 'cash_burn',
      }),
    ).toBeNull();
    expect(
      diffTimelineTaxonomyRow({
        eventType: 'shutdown',
      }),
    ).toBeNull();
  });
});
