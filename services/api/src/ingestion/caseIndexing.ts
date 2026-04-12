import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  buildDeterministicEmbedding,
  embedDocumentText,
  embedDocuments,
  vectorToPgLiteral,
} from '../ai/openaiEmbed.js';

type Queryable = Pool | PoolClient;

type CaseBaseRow = QueryResultRow & {
  id: string;
  company_name: string;
  summary: string;
  country_code: string | null;
  industry_key: string;
  closed_year: number | null;
  primary_failure_reason_key: string | null;
  key_lessons: string | null;
  status: string;
};

type EvidenceRow = QueryResultRow & {
  id: string;
  source_type: string;
  title: string;
  url: string;
  publisher: string | null;
  excerpt: string | null;
  credibility_level: string;
};

type FactorRow = QueryResultRow & {
  id: string;
  level_1_key: string;
  level_2_key: string;
  level_3_key: string | null;
  weight: string | number;
  explanation: string | null;
};

type TimelineRow = QueryResultRow & {
  id: string;
  event_date: Date | string;
  event_type: string;
  title: string;
  description: string | null;
  amount_usd: string | number | null;
  sort_order: number;
};

export type CaseChunkKind = 'summary' | 'timeline' | 'factor' | 'lesson' | 'evidence';

export type CaseChunkDraft = {
  chunkKind: CaseChunkKind;
  ordinal: number;
  contentText: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
};

export type CaseChunkSource = {
  caseId: string;
  companyName: string;
  summary: string;
  countryCode: string | null;
  industryKey: string;
  closedYear: number | null;
  primaryFailureReasonKey: string | null;
  keyLessons: string | null;
  evidenceSources: Array<{
    id: string;
    sourceType: string;
    title: string;
    url: string;
    publisher: string | null;
    excerpt: string | null;
    credibilityLevel: string;
  }>;
  failureFactors: Array<{
    id: string;
    level1Key: string;
    level2Key: string;
    level3Key: string | null;
    weight: number;
    explanation: string | null;
  }>;
  timelineEvents: Array<{
    id: string;
    eventDate: string;
    eventType: string;
    title: string;
    description: string | null;
    amountUsd: number | null;
    sortOrder: number;
  }>;
};

type RebuildCaseSearchIndexResult =
  | {
      ok: true;
      caseId: string;
      caseEmbeddingProvider: 'openai' | 'deterministic';
      chunkEmbeddingProvider: 'openai' | 'deterministic';
      chunkCount: number;
    }
  | { ok: false; error: 'case_not_found' };

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clipText(text: string, max = 1200): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(normalizeText(text).length / 4));
}

function formatDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toNumber(value: string | number | null): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function splitLessons(keyLessons: string | null): string[] {
  if (!keyLessons) return [];
  return keyLessons
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^\d+[.)]\s*/, '').replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

export function buildCaseChunks(source: CaseChunkSource): CaseChunkDraft[] {
  const items: CaseChunkDraft[] = [];
  const seen = new Set<string>();

  const push = (
    chunkKind: CaseChunkKind,
    ordinal: number,
    contentLines: string[],
    metadata: Record<string, unknown>,
  ) => {
    const contentText = normalizeText(contentLines.filter(Boolean).join('\n'));
    if (!contentText) return;
    const dedupeKey = `${chunkKind}\0${contentText}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({
      chunkKind,
      ordinal,
      contentText,
      tokenCount: estimateTokenCount(contentText),
      metadata,
    });
  };

  push(
    'summary',
    0,
    [
      `公司：${source.companyName}`,
      `行业：${source.industryKey}`,
      source.countryCode ? `国家：${source.countryCode}` : '',
      source.closedYear ? `关闭年份：${source.closedYear}` : '',
      source.primaryFailureReasonKey ? `主要失败原因：${source.primaryFailureReasonKey}` : '',
      `摘要：${clipText(source.summary, 1800)}`,
    ],
    {
      kind: 'summary',
      primaryFailureReasonKey: source.primaryFailureReasonKey,
      industryKey: source.industryKey,
      closedYear: source.closedYear,
    },
  );

  source.failureFactors
    .sort((a, b) => b.weight - a.weight)
    .forEach((factor, index) => {
      push(
        'factor',
        index,
        [
          `失败因子：${factor.level1Key} > ${factor.level2Key}${factor.level3Key ? ` > ${factor.level3Key}` : ''}`,
          `权重：${factor.weight.toFixed(2)}`,
          factor.explanation ? `说明：${clipText(factor.explanation, 1200)}` : '',
        ],
        {
          kind: 'factor',
          factorId: factor.id,
          level1Key: factor.level1Key,
          level2Key: factor.level2Key,
          level3Key: factor.level3Key,
          weight: factor.weight,
        },
      );
    });

  source.timelineEvents
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.eventDate.localeCompare(b.eventDate))
    .forEach((event, index) => {
      push(
        'timeline',
        index,
        [
          `时间线：${event.eventDate} ${event.eventType}`,
          `事件：${event.title}`,
          event.description ? `说明：${clipText(event.description, 1200)}` : '',
          event.amountUsd != null ? `金额 USD：${event.amountUsd}` : '',
        ],
        {
          kind: 'timeline',
          eventId: event.id,
          eventType: event.eventType,
          eventDate: event.eventDate,
          amountUsd: event.amountUsd,
        },
      );
    });

  splitLessons(source.keyLessons).forEach((lesson, index) => {
    push('lesson', index, [`经验教训：${clipText(lesson, 1200)}`], {
      kind: 'lesson',
      lessonIndex: index,
    });
  });

  source.evidenceSources.forEach((evidence, index) => {
    push(
      'evidence',
      index,
      [
        `证据来源：${evidence.title}`,
        evidence.publisher ? `发布方：${evidence.publisher}` : '',
        `类型：${evidence.sourceType}`,
        `可信度：${evidence.credibilityLevel}`,
        evidence.excerpt ? `摘录：${clipText(evidence.excerpt, 1200)}` : '',
        `URL：${evidence.url}`,
      ],
      {
        kind: 'evidence',
        evidenceId: evidence.id,
        sourceType: evidence.sourceType,
        publisher: evidence.publisher,
        credibilityLevel: evidence.credibilityLevel,
        url: evidence.url,
      },
    );
  });

  return items;
}

async function loadCaseChunkSource(
  queryable: Queryable,
  caseId: string,
): Promise<CaseChunkSource | null> {
  const [caseRes, evidenceRes, factorRes, timelineRes] = await Promise.all([
    queryable.query<CaseBaseRow>(
      `
      SELECT id, company_name, summary, country_code, industry_key, closed_year,
             primary_failure_reason_key, key_lessons, status
      FROM cases
      WHERE id = $1
      LIMIT 1
      `,
      [caseId],
    ),
    queryable.query<EvidenceRow>(
      `
      SELECT id, source_type, title, url, publisher, excerpt, credibility_level
      FROM evidence_sources
      WHERE case_id = $1
      ORDER BY created_at ASC
      `,
      [caseId],
    ),
    queryable.query<FactorRow>(
      `
      SELECT id, level_1_key, level_2_key, level_3_key, weight, explanation
      FROM failure_factors
      WHERE case_id = $1
      ORDER BY weight DESC, id ASC
      `,
      [caseId],
    ),
    queryable.query<TimelineRow>(
      `
      SELECT id, event_date, event_type, title, description, amount_usd, sort_order
      FROM timeline_events
      WHERE case_id = $1
      ORDER BY sort_order ASC, event_date ASC, created_at ASC
      `,
      [caseId],
    ),
  ]);

  const base = caseRes.rows[0];
  if (!base) return null;

  return {
    caseId: base.id,
    companyName: base.company_name,
    summary: base.summary,
    countryCode: base.country_code,
    industryKey: base.industry_key,
    closedYear: base.closed_year,
    primaryFailureReasonKey: base.primary_failure_reason_key,
    keyLessons: base.key_lessons,
    evidenceSources: evidenceRes.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      title: row.title,
      url: row.url,
      publisher: row.publisher,
      excerpt: row.excerpt,
      credibilityLevel: row.credibility_level,
    })),
    failureFactors: factorRes.rows.map((row) => ({
      id: row.id,
      level1Key: row.level_1_key,
      level2Key: row.level_2_key,
      level3Key: row.level_3_key,
      weight: Number(row.weight),
      explanation: row.explanation,
    })),
    timelineEvents: timelineRes.rows.map((row) => ({
      id: row.id,
      eventDate: formatDate(row.event_date),
      eventType: row.event_type,
      title: row.title,
      description: row.description,
      amountUsd: toNumber(row.amount_usd),
      sortOrder: row.sort_order,
    })),
  };
}

async function upsertCaseEmbedding(
  queryable: Queryable,
  source: CaseChunkSource,
): Promise<'openai' | 'deterministic'> {
  const input = [
    `公司：${source.companyName}`,
    `行业：${source.industryKey}`,
    source.primaryFailureReasonKey ? `主要失败原因：${source.primaryFailureReasonKey}` : '',
    `摘要：${source.summary}`,
    source.keyLessons ? `经验教训：${source.keyLessons}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const { vector, provider } = await embedDocumentText(input, { fallbackToDeterministic: true });
  await queryable.query(
    `
    INSERT INTO case_embeddings (case_id, embedding)
    VALUES ($1::uuid, $2::vector(1536))
    ON CONFLICT (case_id) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
    `,
    [source.caseId, vectorToPgLiteral(vector)],
  );
  return provider;
}

export async function rebuildCaseSearchIndex(
  queryable: Queryable,
  caseId: string,
): Promise<RebuildCaseSearchIndexResult> {
  const source = await loadCaseChunkSource(queryable, caseId);
  if (!source) return { ok: false, error: 'case_not_found' };

  const chunks = buildCaseChunks(source);
  const { vectors, provider: chunkEmbeddingProvider } =
    chunks.length === 0
      ? { vectors: [] as number[][], provider: 'deterministic' as const }
      : await embedDocuments(
          chunks.map((chunk) => chunk.contentText),
          { fallbackToDeterministic: true },
        );

  await queryable.query(`DELETE FROM case_chunks WHERE case_id = $1`, [caseId]);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const vector = vectors[i] ?? buildDeterministicEmbedding(chunk.contentText);
    await queryable.query(
      `
      INSERT INTO case_chunks (case_id, chunk_kind, ordinal, content_text, token_count, embedding, metadata)
      VALUES ($1::uuid, $2, $3, $4, $5, $6::vector(1536), $7::jsonb)
      `,
      [
        caseId,
        chunk.chunkKind,
        chunk.ordinal,
        chunk.contentText,
        chunk.tokenCount,
        vectorToPgLiteral(vector),
        JSON.stringify(chunk.metadata),
      ],
    );
  }

  const caseEmbeddingProvider = await upsertCaseEmbedding(queryable, source);
  return {
    ok: true,
    caseId,
    caseEmbeddingProvider,
    chunkEmbeddingProvider,
    chunkCount: chunks.length,
  };
}
