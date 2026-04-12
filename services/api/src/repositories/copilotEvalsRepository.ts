import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { CopilotEvalAdminMetrics } from '@sg/shared/schemas/adminStats';
import type { CopilotFallbackReason } from '@sg/shared/schemas/copilot';
import { withTransaction } from '../db/withTransaction.js';

export type CopilotEvalCaseItem = {
  id: string;
  slug: string;
  title: string;
  question: string;
  pinnedCaseSlugs: string[];
  expectedCaseSlugs: string[];
  expectedGrounded: boolean | null;
  expectedFallbackReason: CopilotFallbackReason | null;
  notes: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type CopilotEvalBatchResultItem = {
  evalCaseId: string;
  question: string;
  answerPreview: string;
  grounded: boolean;
  fallbackReason: CopilotFallbackReason | null;
  expectedCaseSlugs: string[];
  actualCitationSlugs: string[];
  matchedExpectedCount: number;
  expectedCaseCount: number;
  citationRecall: number | null;
  citationPrecision: number | null;
  passed: boolean;
  responseMs: number;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  promptVersion: string;
};

export type SaveCopilotEvalBatchInput = {
  triggerType: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  totalCases: number;
  passedCases: number;
  groundedCases: number;
  fallbackCases: number;
  avgCitationRecall: number | null;
  avgCitationPrecision: number | null;
  avgResponseMs: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  results: CopilotEvalBatchResultItem[];
};

export interface CopilotEvalsRepository {
  listActiveCases(input?: { limit?: number; slugs?: string[] }): Promise<CopilotEvalCaseItem[]>;
  recordBatch(input: SaveCopilotEvalBatchInput): Promise<{ batchId: string; createdAt: string }>;
  getAdminMetrics(): Promise<CopilotEvalAdminMetrics>;
}

type BatchRecord = {
  batchId: string;
  triggerType: string;
  promptVersion: string;
  totalCases: number;
  passedCases: number;
  groundedCases: number;
  fallbackCases: number;
  passRate: number | null;
  avgCitationRecall: number | null;
  avgCitationPrecision: number | null;
  avgResponseMs: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  createdAt: string;
};

type EvalResultRecord = {
  batchId: string;
  evalCaseId: string;
  evalCaseSlug: string;
  evalCaseTitle: string;
  question: string;
  answerPreview: string;
  grounded: boolean;
  fallbackReason: CopilotFallbackReason | null;
  expectedCaseSlugs: string[];
  actualCitationSlugs: string[];
  citationRecall: number | null;
  citationPrecision: number | null;
  createdAt: string;
  promptVersion: string;
  passed: boolean;
};

type EvalCaseRow = QueryResultRow & {
  id: string;
  slug: string;
  title: string;
  question: string;
  pinned_case_slugs: string[] | null;
  expected_case_slugs: string[] | null;
  expected_grounded: boolean | null;
  expected_fallback_reason: CopilotFallbackReason | null;
  notes: string | null;
  status: 'active' | 'archived';
  created_at: Date;
  updated_at: Date;
};

type EvalBatchRow = QueryResultRow & {
  id: string;
  trigger_type: string;
  prompt_version: string;
  total_cases: string | number;
  passed_cases: string | number;
  grounded_cases: string | number;
  fallback_cases: string | number;
  avg_citation_recall: string | number | null;
  avg_citation_precision: string | number | null;
  avg_response_ms: string | number;
  total_tokens: string | number;
  total_estimated_cost_usd: string | number;
  created_at: Date;
};

type EvalOverviewRow = QueryResultRow & {
  active_cases: string | number;
  total_batches: string | number;
  latest_prompt_version: string | null;
  last_run_at: Date | null;
  latest_pass_rate: string | number | null;
  latest_avg_citation_recall: string | number | null;
  latest_avg_citation_precision: string | number | null;
};

type EvalFailureRow = QueryResultRow & {
  batch_id: string;
  eval_case_slug: string;
  eval_case_title: string;
  question: string;
  prompt_version: string;
  grounded: boolean;
  fallback_reason: CopilotFallbackReason | null;
  expected_case_slugs: string[] | null;
  actual_citation_slugs: string[] | null;
  citation_recall: string | number | null;
  citation_precision: string | number | null;
  answer_preview: string;
  created_at: Date;
};

const DEFAULT_EVAL_CASES = [
  {
    id: 'ec111111-1111-4111-8111-111111111111',
    slug: 'airlift-why-failed',
    title: 'Airlift root cause recall',
    question: 'Airlift 为什么会失败？',
    pinnedCaseSlugs: ['airlift'],
    expectedCaseSlugs: ['airlift'],
    expectedGrounded: null,
    expectedFallbackReason: null,
    notes: '基础单案例回忆，使用 pinned context 验证 prompt 对 Airlift 归因是否稳定。',
    status: 'active' as const,
  },
  {
    id: 'ec222222-2222-4222-8222-222222222222',
    slug: 'pakistan-mobility-compare',
    title: 'Pakistan mobility cluster comparison',
    question: '比较 Airlift 和 QuickRide 的失败共性。',
    pinnedCaseSlugs: ['airlift', 'quickride-pk'],
    expectedCaseSlugs: ['airlift', 'quickride-pk'],
    expectedGrounded: null,
    expectedFallbackReason: null,
    notes: '验证显式双案例问题在固定上下文下是否至少引用 Airlift 和 QuickRide。',
    status: 'active' as const,
  },
  {
    id: 'ec333333-3333-4333-8333-333333333333',
    slug: 'no-relevant-cases-fallback',
    title: 'No relevant case fallback',
    question: 'zzzzqxjvnotarealstartuppattern 为什么会失败？',
    pinnedCaseSlugs: [] as string[],
    expectedCaseSlugs: [] as string[],
    expectedGrounded: false,
    expectedFallbackReason: 'no_relevant_cases' as const,
    notes: '验证知识库缺失时的 fallback 行为和无引用输出。',
    status: 'active' as const,
  },
];

function toNumber(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed === '{}' || trimmed === '') return [];
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [trimmed];
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

function mapEvalCaseRow(row: EvalCaseRow): CopilotEvalCaseItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    question: row.question,
    pinnedCaseSlugs: toStringArray(row.pinned_case_slugs),
    expectedCaseSlugs: toStringArray(row.expected_case_slugs),
    expectedGrounded: row.expected_grounded,
    expectedFallbackReason: row.expected_fallback_reason ?? null,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toBatchRecord(row: EvalBatchRow): BatchRecord {
  const totalCases = Number(row.total_cases);
  const passedCases = Number(row.passed_cases);
  return {
    batchId: row.id,
    triggerType: row.trigger_type,
    promptVersion: row.prompt_version,
    totalCases,
    passedCases,
    groundedCases: Number(row.grounded_cases),
    fallbackCases: Number(row.fallback_cases),
    passRate: totalCases > 0 ? passedCases / totalCases : null,
    avgCitationRecall: toNumber(row.avg_citation_recall),
    avgCitationPrecision: toNumber(row.avg_citation_precision),
    avgResponseMs: Number(row.avg_response_ms),
    totalTokens: Number(row.total_tokens),
    totalEstimatedCostUsd: Number(row.total_estimated_cost_usd),
    createdAt: row.created_at.toISOString(),
  };
}

function buildEvalOverview(
  activeCases: number,
  batches: BatchRecord[],
): CopilotEvalAdminMetrics['overview'] {
  const latest = batches[0] ?? null;
  return {
    activeCases,
    totalBatches: batches.length,
    lastRunAt: latest?.createdAt ?? null,
    latestPromptVersion: latest?.promptVersion ?? null,
    latestPassRate: latest?.passRate ?? null,
    latestAvgCitationRecall: latest?.avgCitationRecall ?? null,
    latestAvgCitationPrecision: latest?.avgCitationPrecision ?? null,
  };
}

export class MockCopilotEvalsRepository implements CopilotEvalsRepository {
  private readonly evalCases: CopilotEvalCaseItem[];
  private readonly batches: BatchRecord[] = [];
  private readonly results: EvalResultRecord[] = [];

  constructor() {
    const now = new Date().toISOString();
    this.evalCases = DEFAULT_EVAL_CASES.map((item) => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async listActiveCases(input?: {
    limit?: number;
    slugs?: string[];
  }): Promise<CopilotEvalCaseItem[]> {
    const slugSet =
      input?.slugs && input.slugs.length > 0
        ? new Set(input.slugs.map((item) => item.trim().toLowerCase()))
        : null;
    const limit = input?.limit ?? 25;
    return this.evalCases
      .filter((item) => item.status === 'active')
      .filter((item) => (slugSet ? slugSet.has(item.slug.toLowerCase()) : true))
      .slice(0, limit);
  }

  async recordBatch(
    input: SaveCopilotEvalBatchInput,
  ): Promise<{ batchId: string; createdAt: string }> {
    const batchId = randomUUID();
    const createdAt = new Date().toISOString();
    this.batches.unshift({
      batchId,
      triggerType: input.triggerType,
      promptVersion: input.promptVersion,
      totalCases: input.totalCases,
      passedCases: input.passedCases,
      groundedCases: input.groundedCases,
      fallbackCases: input.fallbackCases,
      passRate: input.totalCases > 0 ? input.passedCases / input.totalCases : null,
      avgCitationRecall: input.avgCitationRecall,
      avgCitationPrecision: input.avgCitationPrecision,
      avgResponseMs: input.avgResponseMs,
      totalTokens: input.totalTokens,
      totalEstimatedCostUsd: input.totalEstimatedCostUsd,
      createdAt,
    });

    for (const item of input.results) {
      const evalCase = this.evalCases.find((candidate) => candidate.id === item.evalCaseId);
      if (!evalCase) continue;
      this.results.unshift({
        batchId,
        evalCaseId: item.evalCaseId,
        evalCaseSlug: evalCase.slug,
        evalCaseTitle: evalCase.title,
        question: item.question,
        answerPreview: item.answerPreview,
        grounded: item.grounded,
        fallbackReason: item.fallbackReason,
        expectedCaseSlugs: item.expectedCaseSlugs,
        actualCitationSlugs: item.actualCitationSlugs,
        citationRecall: item.citationRecall,
        citationPrecision: item.citationPrecision,
        createdAt,
        promptVersion: item.promptVersion,
        passed: item.passed,
      });
    }

    return { batchId, createdAt };
  }

  async getAdminMetrics(): Promise<CopilotEvalAdminMetrics> {
    const latestBatch = this.batches[0]?.batchId ?? null;
    return {
      overview: buildEvalOverview(
        this.evalCases.filter((item) => item.status === 'active').length,
        this.batches,
      ),
      recentBatches: this.batches.slice(0, 5),
      latestFailures: latestBatch
        ? this.results
            .filter((item) => item.batchId === latestBatch && !item.passed)
            .slice(0, 6)
            .map((item) => ({
              batchId: item.batchId,
              evalCaseSlug: item.evalCaseSlug,
              evalCaseTitle: item.evalCaseTitle,
              question: item.question,
              promptVersion: item.promptVersion,
              grounded: item.grounded,
              fallbackReason: item.fallbackReason,
              expectedCaseSlugs: item.expectedCaseSlugs,
              actualCitationSlugs: item.actualCitationSlugs,
              citationRecall: item.citationRecall,
              citationPrecision: item.citationPrecision,
              answerPreview: item.answerPreview,
              createdAt: item.createdAt,
            }))
        : [],
    };
  }
}

export class PgCopilotEvalsRepository implements CopilotEvalsRepository {
  constructor(private readonly pool: Pool) {}

  async listActiveCases(input?: {
    limit?: number;
    slugs?: string[];
  }): Promise<CopilotEvalCaseItem[]> {
    const limit = input?.limit ?? 25;
    const slugs =
      input?.slugs && input.slugs.length > 0 ? input.slugs.map((item) => item.trim()) : null;
    const res = await this.pool.query<EvalCaseRow>(
      `
      SELECT
        id, slug, title, question, pinned_case_slugs, expected_case_slugs,
        expected_grounded, expected_fallback_reason, notes, status, created_at, updated_at
      FROM copilot_eval_cases
      WHERE status = 'active'
        AND ($1::citext[] IS NULL OR slug = ANY($1::citext[]))
      ORDER BY updated_at DESC, slug ASC
      LIMIT $2
      `,
      [slugs, limit],
    );
    return res.rows.map(mapEvalCaseRow);
  }

  async recordBatch(
    input: SaveCopilotEvalBatchInput,
  ): Promise<{ batchId: string; createdAt: string }> {
    return withTransaction(this.pool, async (client) => {
      const batchRes = await client.query<{ id: string; created_at: Date }>(
        `
        INSERT INTO copilot_eval_batches (
          trigger_type,
          prompt_version,
          provider,
          model,
          total_cases,
          passed_cases,
          grounded_cases,
          fallback_cases,
          avg_citation_recall,
          avg_citation_precision,
          avg_response_ms,
          total_tokens,
          total_estimated_cost_usd
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, created_at
        `,
        [
          input.triggerType,
          input.promptVersion,
          input.provider,
          input.model,
          input.totalCases,
          input.passedCases,
          input.groundedCases,
          input.fallbackCases,
          input.avgCitationRecall,
          input.avgCitationPrecision,
          input.avgResponseMs,
          input.totalTokens,
          input.totalEstimatedCostUsd,
        ],
      );

      const batch = batchRes.rows[0]!;
      for (const item of input.results) {
        await client.query(
          `
          INSERT INTO copilot_eval_results (
            batch_id,
            eval_case_id,
            question,
            answer_preview,
            grounded,
            fallback_reason,
            expected_case_slugs,
            actual_citation_slugs,
            matched_expected_count,
            expected_case_count,
            citation_recall,
            citation_precision,
            passed,
            response_ms,
            total_tokens,
            estimated_cost_usd,
            prompt_version
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7::citext[], $8::citext[], $9, $10, $11, $12, $13, $14, $15, $16, $17
          )
          `,
          [
            batch.id,
            item.evalCaseId,
            item.question,
            item.answerPreview,
            item.grounded,
            item.fallbackReason,
            item.expectedCaseSlugs,
            item.actualCitationSlugs,
            item.matchedExpectedCount,
            item.expectedCaseCount,
            item.citationRecall,
            item.citationPrecision,
            item.passed,
            item.responseMs,
            item.totalTokens,
            item.estimatedCostUsd,
            item.promptVersion,
          ],
        );
      }

      return { batchId: batch.id, createdAt: batch.created_at.toISOString() };
    });
  }

  async getAdminMetrics(): Promise<CopilotEvalAdminMetrics> {
    const [overviewRes, batchesRes] = await Promise.all([
      this.pool.query<EvalOverviewRow>(
        `
        SELECT
          (SELECT COUNT(*) FROM copilot_eval_cases WHERE status = 'active') AS active_cases,
          (SELECT COUNT(*) FROM copilot_eval_batches) AS total_batches,
          latest.prompt_version AS latest_prompt_version,
          latest.created_at AS last_run_at,
          CASE
            WHEN latest.total_cases > 0 THEN latest.passed_cases::float8 / latest.total_cases::float8
            ELSE NULL
          END AS latest_pass_rate,
          latest.avg_citation_recall AS latest_avg_citation_recall,
          latest.avg_citation_precision AS latest_avg_citation_precision
        FROM (
          SELECT prompt_version, created_at, total_cases, passed_cases,
                 avg_citation_recall, avg_citation_precision
          FROM copilot_eval_batches
          ORDER BY created_at DESC
          LIMIT 1
        ) latest
        RIGHT JOIN (SELECT 1) AS keep_row ON true
        `,
      ),
      this.pool.query<EvalBatchRow>(
        `
        SELECT
          id, trigger_type, prompt_version, total_cases, passed_cases, grounded_cases,
          fallback_cases, avg_citation_recall, avg_citation_precision, avg_response_ms,
          total_tokens, total_estimated_cost_usd, created_at
        FROM copilot_eval_batches
        ORDER BY created_at DESC
        LIMIT 5
        `,
      ),
    ]);

    const overview = overviewRes.rows[0];
    const recentBatches = batchesRes.rows.map(toBatchRecord);
    const latestBatchId = recentBatches[0]?.batchId ?? null;

    let latestFailures: CopilotEvalAdminMetrics['latestFailures'] = [];
    if (latestBatchId) {
      const failuresRes = await this.pool.query<EvalFailureRow>(
        `
        SELECT
          r.batch_id,
          c.slug AS eval_case_slug,
          c.title AS eval_case_title,
          r.question,
          r.prompt_version,
          r.grounded,
          r.fallback_reason,
          r.expected_case_slugs,
          r.actual_citation_slugs,
          r.citation_recall,
          r.citation_precision,
          r.answer_preview,
          r.created_at
        FROM copilot_eval_results r
        JOIN copilot_eval_cases c
          ON c.id = r.eval_case_id
        WHERE r.batch_id = $1
          AND r.passed = false
        ORDER BY r.citation_recall ASC NULLS FIRST, r.created_at DESC
        LIMIT 6
        `,
        [latestBatchId],
      );
      latestFailures = failuresRes.rows.map((row) => ({
        batchId: row.batch_id,
        evalCaseSlug: row.eval_case_slug,
        evalCaseTitle: row.eval_case_title,
        question: row.question,
        promptVersion: row.prompt_version,
        grounded: row.grounded,
        fallbackReason: row.fallback_reason ?? null,
        expectedCaseSlugs: toStringArray(row.expected_case_slugs),
        actualCitationSlugs: toStringArray(row.actual_citation_slugs),
        citationRecall: toNumber(row.citation_recall),
        citationPrecision: toNumber(row.citation_precision),
        answerPreview: row.answer_preview,
        createdAt: row.created_at.toISOString(),
      }));
    }

    return {
      overview: {
        activeCases: Number(overview?.active_cases ?? 0),
        totalBatches: Number(overview?.total_batches ?? 0),
        lastRunAt: overview?.last_run_at ? overview.last_run_at.toISOString() : null,
        latestPromptVersion: overview?.latest_prompt_version ?? null,
        latestPassRate: toNumber(overview?.latest_pass_rate ?? null),
        latestAvgCitationRecall: toNumber(overview?.latest_avg_citation_recall ?? null),
        latestAvgCitationPrecision: toNumber(overview?.latest_avg_citation_precision ?? null),
      },
      recentBatches,
      latestFailures,
    };
  }
}
