import { describe, expect, it } from 'vitest';
import { extractCaseSignals } from './extractCaseSignals.js';

describe('extractCaseSignals', () => {
  it('extracts failure signals, timeline events, and lessons from a shutdown article', () => {
    const out = extractCaseSignals({
      title: 'Acme Collapse | Example News',
      excerpt: 'Acme shut down after rapid expansion and weak unit economics.',
      snapshotText:
        'In 2022 Acme raised $50 million to expand nationally. In 2024 the startup shut down after rapid expansion, layoffs, and rising regulatory scrutiny over labor classification.',
    });

    expect(out.primaryFailureReasonKey).toBe('premature_scaling');
    expect(out.failureFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level2Key: 'premature_scaling',
        }),
        expect.objectContaining({
          level2Key: 'regulatory_compliance',
        }),
      ]),
    );
    expect(out.timelineEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventDate: '2022-01-01',
          eventType: 'funding',
        }),
        expect.objectContaining({
          eventDate: '2024-01-01',
          eventType: 'shutdown',
        }),
      ]),
    );
    expect(out.keyLessons).toContain('扩张前先验证单位经济模型');
    expect(out.keyLessons).toContain('监管约束要前置');
  });
});
