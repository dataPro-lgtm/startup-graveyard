import { describe, expect, it } from 'vitest';
import { buildCaseChunks } from './caseIndexing.js';

describe('case indexing chunk builder', () => {
  it('builds summary, factor, timeline, lesson, and evidence chunks with structured metadata', () => {
    const chunks = buildCaseChunks({
      caseId: '11111111-1111-4111-8111-111111111111',
      companyName: 'Atlas AI',
      summary: 'Atlas AI scaled headcount too quickly and lost enterprise customers.',
      countryCode: 'US',
      industryKey: 'ai',
      closedYear: 2025,
      primaryFailureReasonKey: 'premature_scaling',
      keyLessons: '1. 先跑通留存，再扩销售。\n2. 不要在低毛利模型上堆人。',
      failureFactors: [
        {
          id: 'factor-1',
          level1Key: 'go_to_market',
          level2Key: 'enterprise_sales_execution',
          level3Key: null,
          weight: 9,
          explanation: 'Enterprise pipeline quality collapsed after the team expanded too fast.',
        },
      ],
      timelineEvents: [
        {
          id: 'timeline-1',
          eventDate: '2024-05-20',
          eventType: 'layoff',
          title: 'Laid off 40% of the team',
          description: 'Cash burn exceeded plan after aggressive hiring.',
          amountUsd: null,
          sortOrder: 2,
        },
      ],
      evidenceSources: [
        {
          id: 'evidence-1',
          sourceType: 'web_snapshot',
          title: 'Atlas AI collapse analysis',
          url: 'https://example.com/atlas',
          publisher: 'Example News',
          excerpt: 'Atlas AI grew too quickly and churn rose across key enterprise accounts.',
          credibilityLevel: 'high',
        },
      ],
    });

    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual([
      'summary',
      'factor',
      'timeline',
      'lesson',
      'lesson',
      'evidence',
    ]);
    expect(chunks[0]).toMatchObject({
      chunkKind: 'summary',
      metadata: {
        kind: 'summary',
        primaryFailureReasonKey: 'premature_scaling',
      },
    });
    expect(chunks[1]?.contentText).toContain('失败因子：go_to_market > enterprise_sales_execution');
    expect(chunks[2]?.metadata).toMatchObject({
      kind: 'timeline',
      eventType: 'layoff',
    });
    expect(chunks[5]).toMatchObject({
      chunkKind: 'evidence',
      metadata: {
        evidenceId: 'evidence-1',
        credibilityLevel: 'high',
      },
    });
    expect(chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);
  });

  it('dedupes identical chunk content inside the same case', () => {
    const chunks = buildCaseChunks({
      caseId: '22222222-2222-4222-8222-222222222222',
      companyName: 'Repeat Co',
      summary: 'Repeat Co ran out of cash.',
      countryCode: null,
      industryKey: 'consumer',
      closedYear: null,
      primaryFailureReasonKey: null,
      keyLessons: null,
      failureFactors: [],
      timelineEvents: [],
      evidenceSources: [
        {
          id: 'evidence-a',
          sourceType: 'media',
          title: 'Repeat Co analysis',
          url: 'https://example.com/repeat-a',
          publisher: 'Example News',
          excerpt: 'Repeat Co ran out of cash.',
          credibilityLevel: 'medium',
        },
        {
          id: 'evidence-b',
          sourceType: 'media',
          title: 'Repeat Co analysis',
          url: 'https://example.com/repeat-a',
          publisher: 'Example News',
          excerpt: 'Repeat Co ran out of cash.',
          credibilityLevel: 'medium',
        },
      ],
    });

    expect(chunks.filter((chunk) => chunk.chunkKind === 'evidence')).toHaveLength(1);
  });
});
