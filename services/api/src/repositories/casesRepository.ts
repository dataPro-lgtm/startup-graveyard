import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { CreateDraftCaseBody } from '../schemas/adminCases.js';
import { embedSearchQuery, vectorToPgLiteral } from '../ai/openaiEmbed.js';
import { getMockExtraEvidence, getMockExtraFactors } from './mockCaseExtras.js';

export type ListCasesSort = 'relevance' | 'updated_at';

export type ListCasesParams = {
  q?: string;
  industry?: string;
  country?: string;
  closedYear?: number;
  /** 与 `cases.business_model_key` 精确匹配（已小写）。 */
  businessModelKey?: string;
  /** 与 `cases.primary_failure_reason_key` 精确匹配（已小写）。 */
  primaryFailureReasonKey?: string;
  /** 未传且存在 `q` 时仓库默认 `relevance`，否则 `updated_at`。 */
  sort?: ListCasesSort;
  page: number;
  limit: number;
};

export type CaseListItem = {
  id: string;
  slug: string;
  companyName: string;
  industry: string;
  country: string | null;
  closedYear: number | null;
  summary: string;
  businessModelKey: string | null;
  foundedYear: number | null;
  totalFundingUsd: number | null;
  primaryFailureReasonKey: string | null;
  keyLessons: string | null;
};

export type EvidenceSourceItem = {
  id: string;
  sourceType: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string | null;
  credibilityLevel: string;
  excerpt: string | null;
};

export type FailureFactorItem = {
  id: string;
  level1Key: string;
  level2Key: string;
  level3Key: string | null;
  weight: number;
  explanation: string | null;
};

export type TimelineEventItem = {
  id: string;
  eventDate: string;
  eventType: string;
  title: string;
  description: string | null;
  amountUsd: number | null;
  sortOrder: number;
};

export type CaseDetail = CaseListItem & {
  evidenceSources: EvidenceSourceItem[];
  failureFactors: FailureFactorItem[];
  timelineEvents: TimelineEventItem[];
};

export type ListCasesResult = {
  items: CaseListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type HomeSummary = {
  totalCases: number;
  totalFundingUsd: number;
  failurePatterns: number;
};

export type AdminCaseReviewSnapshot = {
  caseId: string;
  slug: string;
  companyName: string;
  status: string;
  evidenceCount: number;
  failureFactorCount: number;
};

export interface CasesRepository {
  list(params: ListCasesParams): Promise<ListCasesResult>;
  getById(id: string): Promise<CaseDetail | null>;
  /** Bulk fetch by IDs — returns only published cases, preserving input order. */
  getByIds(ids: string[]): Promise<CaseDetail[]>;
  /** Published only; case-insensitive slug match (citext). */
  getPublishedBySlug(slug: string): Promise<CaseDetail | null>;
  getHomeSummary(): Promise<HomeSummary>;
  /** Any status (draft / rejected / published). */
  caseExists(id: string): Promise<boolean>;
  /** Published only; returns [] when anchor has no embedding. */
  findSimilarPublished(anchorId: string, limit: number): Promise<CaseListItem[]>;
  getTimeline(caseId: string): Promise<TimelineEventItem[]>;
}

type CaseRow = QueryResultRow & {
  id: string;
  slug: string;
  company_name: string;
  summary: string;
  country_code: string | null;
  industry_key: string;
  closed_year: number | null;
  business_model_key: string | null;
  founded_year: number | null;
  /** `pg` 对 `BIGINT` 常返回 string */
  total_funding_usd: string | number | null;
  primary_failure_reason_key: string | null;
  key_lessons: string | null;
};

function fundingUsdToNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowToItem(row: CaseRow): CaseListItem {
  return {
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    industry: row.industry_key,
    country: row.country_code,
    closedYear: row.closed_year,
    summary: row.summary,
    businessModelKey: row.business_model_key,
    foundedYear: row.founded_year,
    totalFundingUsd: fundingUsdToNumber(row.total_funding_usd),
    primaryFailureReasonKey: row.primary_failure_reason_key,
    keyLessons: row.key_lessons ?? null,
  };
}

type EvidenceRow = QueryResultRow & {
  id: string;
  source_type: string;
  title: string;
  url: string;
  publisher: string | null;
  published_at: Date | null;
  credibility_level: string;
  excerpt: string | null;
};

type FactorRow = QueryResultRow & {
  id: string;
  level_1_key: string;
  level_2_key: string;
  level_3_key: string | null;
  /** `pg` 对 `numeric` 常返回 string */
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

function mapTimelineRow(row: TimelineRow): TimelineEventItem {
  const d = row.event_date;
  const dateStr =
    d instanceof Date
      ? d.toISOString().slice(0, 10)
      : typeof d === 'string'
        ? d.slice(0, 10)
        : String(d);
  return {
    id: row.id,
    eventDate: dateStr,
    eventType: row.event_type,
    title: row.title,
    description: row.description,
    amountUsd: fundingUsdToNumber(row.amount_usd),
    sortOrder: row.sort_order,
  };
}

function mapEvidenceRow(row: EvidenceRow): EvidenceSourceItem {
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    credibilityLevel: row.credibility_level,
    excerpt: row.excerpt,
  };
}

function mapFactorRow(row: FactorRow): FailureFactorItem {
  return {
    id: row.id,
    level1Key: row.level_1_key,
    level2Key: row.level_2_key,
    level3Key: row.level_3_key,
    weight: Number(row.weight),
    explanation: row.explanation,
  };
}

type MockCaseRow = {
  id: string;
  slug: string;
  status: string;
  companyName: string;
  industry: string;
  country: string | null;
  closedYear: number | null;
  summary: string;
  businessModelKey: string | null;
  foundedYear: number | null;
  totalFundingUsd: number | null;
  primaryFailureReasonKey: string | null;
  keyLessons: string | null;
};

function mockRowToItem(r: MockCaseRow): CaseListItem {
  return {
    id: r.id,
    slug: r.slug,
    companyName: r.companyName,
    industry: r.industry,
    country: r.country,
    closedYear: r.closedYear,
    summary: r.summary,
    businessModelKey: r.businessModelKey,
    foundedYear: r.foundedYear,
    totalFundingUsd: r.totalFundingUsd,
    primaryFailureReasonKey: r.primaryFailureReasonKey,
    keyLessons: r.keyLessons,
  };
}

const AIRLIFT_MOCK_ID = 'a1111111-1111-4111-8111-111111111111';

const AIRLIFT_BUILTIN_EVIDENCE: EvidenceSourceItem[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    sourceType: 'media',
    title: 'Airlift shutdown coverage',
    url: 'https://example.com/airlift',
    publisher: 'Example Media',
    publishedAt: null,
    credibilityLevel: 'medium',
    excerpt: 'Mock 证据条目，对应 seed 结构。',
  },
];

const AIRLIFT_BUILTIN_FACTORS: FailureFactorItem[] = [
  {
    id: 'f0000000-0000-4000-8000-000000000001',
    level1Key: 'execution',
    level2Key: 'scaling',
    level3Key: 'premature_scaling',
    weight: 0.85,
    explanation: '扩张节奏相对单位经济模型偏快（示例因子）。',
  },
];

function mockRelevanceScore(item: CaseListItem, qRaw: string): number {
  const qn = qRaw.toLowerCase().trim();
  if (!qn) return 0;
  const name = item.companyName.toLowerCase();
  const sum = item.summary.toLowerCase();
  let s = 0;
  if (name.includes(qn)) s += 10;
  if (sum.includes(qn)) s += 5;
  for (const w of qn.split(/\s+/)) {
    if (w.length < 2) continue;
    if (name.includes(w)) s += 3;
    if (sum.includes(w)) s += 1;
  }
  return s;
}

function matchesFilters(item: CaseListItem, p: ListCasesParams): boolean {
  if (p.q) {
    const q = p.q.toLowerCase().trim();
    const hit =
      item.companyName.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q);
    if (!hit && mockRelevanceScore(item, p.q) <= 0) return false;
  }
  if (p.industry && item.industry !== p.industry) return false;
  if (p.country && item.country !== p.country.toUpperCase()) return false;
  if (p.closedYear != null && item.closedYear !== p.closedYear) return false;
  if (p.businessModelKey && (item.businessModelKey ?? '').toLowerCase() !== p.businessModelKey) {
    return false;
  }
  if (
    p.primaryFailureReasonKey &&
    (item.primaryFailureReasonKey ?? '').toLowerCase() !== p.primaryFailureReasonKey
  ) {
    return false;
  }
  return true;
}

/** In-memory fallback when `DATABASE_URL` is unset. */
export class MockCasesRepository implements CasesRepository {
  private readonly rows: MockCaseRow[] = [
    {
      id: 'a1111111-1111-4111-8111-111111111111',
      slug: 'airlift',
      status: 'published',
      companyName: 'Airlift',
      industry: 'mobility',
      country: 'PK',
      closedYear: 2022,
      summary: '高速扩张叠加融资环境收缩，导致现金流无法支撑业务。',
      businessModelKey: 'marketplace',
      foundedYear: 2019,
      totalFundingUsd: 109_000_000,
      primaryFailureReasonKey: 'premature_scaling',
      keyLessons: null,
    },
    {
      id: 'b2222222-2222-4222-8222-222222222222',
      slug: 'quickride-pk',
      status: 'published',
      companyName: 'QuickRide',
      industry: 'mobility',
      country: 'PK',
      closedYear: 2023,
      summary: '同类即时出行扩张过快，补贴退坡与融资成本上升后现金流承压。',
      businessModelKey: 'marketplace',
      foundedYear: 2020,
      totalFundingUsd: null,
      primaryFailureReasonKey: null,
      keyLessons: null,
    },
    {
      id: 'c3333333-3333-4333-8333-333333333333',
      slug: 'mock-draft',
      status: 'draft',
      companyName: 'Mock Draft Inc',
      industry: 'saas',
      country: 'US',
      closedYear: null,
      summary: '用于本地开发的草稿案例，默认没有证据与失败因子，方便演示发布 gate。',
      businessModelKey: 'subscription',
      foundedYear: 2023,
      totalFundingUsd: null,
      primaryFailureReasonKey: null,
      keyLessons: null,
    },
  ];

  async list(params: ListCasesParams): Promise<ListCasesResult> {
    const qTrim = params.q?.trim() ?? '';
    const sortMode: ListCasesSort = params.sort ?? (qTrim ? 'relevance' : 'updated_at');
    const published = this.rows.filter((r) => r.status === 'published').map(mockRowToItem);
    const filtered = published.filter((x) => matchesFilters(x, params));
    const ordered = [...filtered];
    if (qTrim && sortMode === 'relevance') {
      ordered.sort(
        (a, b) =>
          mockRelevanceScore(b, qTrim) - mockRelevanceScore(a, qTrim) ||
          a.companyName.localeCompare(b.companyName),
      );
    } else {
      ordered.sort((a, b) => a.companyName.localeCompare(b.companyName));
    }
    const offset = (params.page - 1) * params.limit;
    const slice = ordered.slice(offset, offset + params.limit);
    return {
      items: slice,
      page: params.page,
      pageSize: params.limit,
      total: filtered.length,
    };
  }

  async getTimeline(_caseId: string): Promise<TimelineEventItem[]> {
    return [];
  }

  async getHomeSummary(): Promise<HomeSummary> {
    const published = this.rows.filter((r) => r.status === 'published');
    return {
      totalCases: published.length,
      totalFundingUsd: published.reduce((sum, item) => sum + (item.totalFundingUsd ?? 0), 0),
      failurePatterns: new Set(
        published.map((item) => item.primaryFailureReasonKey).filter(Boolean),
      ).size,
    };
  }

  async getById(id: string): Promise<CaseDetail | null> {
    const r = this.rows.find((x) => x.id === id && x.status === 'published');
    if (!r) return null;
    const base = mockRowToItem(r);
    return {
      ...base,
      evidenceSources: [
        ...(id === AIRLIFT_MOCK_ID ? AIRLIFT_BUILTIN_EVIDENCE : []),
        ...getMockExtraEvidence(id),
      ],
      failureFactors: [
        ...(id === AIRLIFT_MOCK_ID ? AIRLIFT_BUILTIN_FACTORS : []),
        ...getMockExtraFactors(id),
      ],
      timelineEvents: [],
    };
  }

  async getByIds(ids: string[]): Promise<CaseDetail[]> {
    const results = await Promise.all(ids.map((id) => this.getById(id)));
    return results.filter((r): r is CaseDetail => r !== null);
  }

  async getPublishedBySlug(slug: string): Promise<CaseDetail | null> {
    const key = slug.trim().toLowerCase();
    const r = this.rows.find((x) => x.slug.toLowerCase() === key && x.status === 'published');
    if (!r) return null;
    return this.getById(r.id);
  }

  async caseExists(id: string): Promise<boolean> {
    return this.rows.some((r) => r.id === id);
  }

  async findSimilarPublished(anchorId: string, limit: number): Promise<CaseListItem[]> {
    const anchor = this.rows.find((r) => r.id === anchorId && r.status === 'published');
    if (!anchor) return [];
    const others = this.rows
      .filter((r) => r.status === 'published' && r.id !== anchorId)
      .map(mockRowToItem);
    others.sort((a, b) => {
      const score = (x: CaseListItem) =>
        (x.industry === anchor.industry ? 4 : 0) + (x.country === anchor.country ? 2 : 0);
      return score(b) - score(a) || a.companyName.localeCompare(b.companyName);
    });
    return others.slice(0, limit);
  }

  /** 供 `MockAdminWriteRepository`：创建草稿（不进入公开列表直至 publish）。 */
  adminCreateDraft(
    input: CreateDraftCaseBody,
  ): { ok: true; caseId: string } | { ok: false; error: 'duplicate_slug' } {
    if (this.rows.some((r) => r.slug === input.slug)) {
      return { ok: false, error: 'duplicate_slug' };
    }
    const id = randomUUID();
    this.rows.push({
      id,
      slug: input.slug,
      status: 'draft',
      companyName: input.companyName,
      summary: input.summary,
      industry: input.industryKey,
      country: input.countryCode ?? null,
      closedYear: input.closedYear ?? null,
      businessModelKey: input.businessModelKey ?? null,
      foundedYear: input.foundedYear ?? null,
      totalFundingUsd: input.totalFundingUsd ?? null,
      primaryFailureReasonKey: input.primaryFailureReasonKey ?? null,
      keyLessons: null,
    });
    return { ok: true, caseId: id };
  }

  adminGetReviewSnapshot(caseId: string): AdminCaseReviewSnapshot | null {
    const row = this.rows.find((item) => item.id === caseId);
    if (!row) return null;
    const builtinEvidence = caseId === AIRLIFT_MOCK_ID ? AIRLIFT_BUILTIN_EVIDENCE.length : 0;
    const builtinFactors = caseId === AIRLIFT_MOCK_ID ? AIRLIFT_BUILTIN_FACTORS.length : 0;
    return {
      caseId: row.id,
      slug: row.slug,
      companyName: row.companyName,
      status: row.status,
      evidenceCount: builtinEvidence + getMockExtraEvidence(caseId).length,
      failureFactorCount: builtinFactors + getMockExtraFactors(caseId).length,
    };
  }

  adminSetStatus(caseId: string, status: string): boolean {
    const idx = this.rows.findIndex((item) => item.id === caseId);
    if (idx < 0) return false;
    this.rows[idx] = { ...this.rows[idx], status };
    return true;
  }
}

export class PgCasesRepository implements CasesRepository {
  constructor(private readonly pool: Pool) {}

  async caseExists(id: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM cases WHERE id = $1 LIMIT 1`, [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async getHomeSummary(): Promise<HomeSummary> {
    const res = await this.pool.query<{
      total_cases: string;
      total_funding_usd: string;
      failure_patterns: string;
    }>(
      `
      SELECT
        COUNT(*)::bigint AS total_cases,
        COALESCE(SUM(total_funding_usd), 0)::numeric AS total_funding_usd,
        COUNT(DISTINCT primary_failure_reason_key)::bigint
          FILTER (WHERE primary_failure_reason_key IS NOT NULL) AS failure_patterns
      FROM cases
      WHERE status = 'published'
      `,
    );
    const row = res.rows[0];
    return {
      totalCases: Number(row?.total_cases ?? 0),
      totalFundingUsd: Number(row?.total_funding_usd ?? 0),
      failurePatterns: Number(row?.failure_patterns ?? 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Query-building helpers (private)
  // ---------------------------------------------------------------------------

  /**
   * Builds the WHERE clause and collects bound values.
   * Returns the SQL fragment, values array, and the param index of the
   * trigram query term (for use in ORDER BY), or null if no text query.
   */
  #buildWhereClause(params: ListCasesParams): {
    whereSql: string;
    values: unknown[];
    qTrgmParam: number | null;
  } {
    const q = params.q?.trim() || null;
    const industry = params.industry?.trim() || null;
    const country = params.country?.trim().toUpperCase() || null;
    const closedYear = params.closedYear ?? null;
    const businessModelKey = params.businessModelKey?.trim() || null;
    const primaryFailureReasonKey = params.primaryFailureReasonKey?.trim() || null;

    const values: unknown[] = ['published'];
    const clauses: string[] = ['c.status = $1'];
    let qTrgmParam: number | null = null;

    // Helper: push a value and return its 1-based $N placeholder
    const push = (v: unknown): number => {
      values.push(v);
      return values.length;
    };

    if (q) {
      const iLike = push(`%${q}%`);
      const iQ = push(q);
      clauses.push(
        `(c.company_name ILIKE $${iLike} OR c.summary ILIKE $${iLike} OR c.search_tags ILIKE $${iLike}
          OR similarity(c.company_name, $${iQ}) > 0.03
          OR similarity(c.summary, $${iQ}) > 0.03
          OR similarity(c.search_tags, $${iQ}) > 0.05)`,
      );
      qTrgmParam = iQ;
    }
    if (industry) clauses.push(`c.industry_key = $${push(industry)}`);
    if (country) clauses.push(`c.country_code = $${push(country)}`);
    if (closedYear !== null) clauses.push(`c.closed_year = $${push(closedYear)}`);
    if (businessModelKey) clauses.push(`c.business_model_key = $${push(businessModelKey)}`);
    if (primaryFailureReasonKey)
      clauses.push(`c.primary_failure_reason_key = $${push(primaryFailureReasonKey)}`);

    return { whereSql: clauses.join(' AND '), values, qTrgmParam };
  }

  /**
   * Builds the ORDER BY clause.
   * When a vector is available, uses 50/50 hybrid (vector cosine + trigram).
   * Falls back to trigram-only, then recency.
   */
  #buildOrderBy(opts: {
    sortMode: ListCasesSort;
    q: string | null;
    qTrgmParam: number | null;
    vecIdx: number | null;
  }): { orderBy: string; joinSql: string } {
    const { sortMode, q, qTrgmParam, vecIdx } = opts;

    if (!q || sortMode !== 'relevance' || qTrgmParam === null) {
      return { orderBy: 'ORDER BY c.updated_at DESC', joinSql: '' };
    }

    const trgm = `COALESCE(GREATEST(
      similarity(c.company_name, $${qTrgmParam}),
      similarity(c.summary, $${qTrgmParam}),
      similarity(c.search_tags, $${qTrgmParam})
    ), 0)`;

    if (vecIdx !== null) {
      return {
        joinSql: 'LEFT JOIN case_embeddings e ON e.case_id = c.id',
        orderBy: `ORDER BY (
          CASE
            WHEN e.embedding IS NOT NULL THEN
              (0.5 * (1 - (e.embedding <=> $${vecIdx}::vector)) + 0.5 * ${trgm})
            ELSE ${trgm}
          END
        ) DESC NULLS LAST, c.updated_at DESC`,
      };
    }

    return {
      joinSql: '',
      orderBy: `ORDER BY ${trgm} DESC NULLS LAST, c.updated_at DESC`,
    };
  }

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------

  async list(params: ListCasesParams): Promise<ListCasesResult> {
    const offset = (params.page - 1) * params.limit;
    const q = params.q?.trim() || null;
    const sortMode: ListCasesSort = params.sort ?? (q ? 'relevance' : 'updated_at');

    const { whereSql, values, qTrgmParam } = this.#buildWhereClause(params);
    const filterValuesLen = values.length; // values used by WHERE (for COUNT query)

    // Optionally fetch query vector for hybrid ranking
    let vecIdx: number | null = null;
    if (q && sortMode === 'relevance' && qTrgmParam !== null) {
      const qVec = await embedSearchQuery(q);
      if (qVec != null && qVec.length === 1536) {
        vecIdx = values.length + 1;
        values.push(vectorToPgLiteral(qVec));
      }
    }

    const { orderBy, joinSql } = this.#buildOrderBy({
      sortMode,
      q,
      qTrgmParam,
      vecIdx,
    });

    values.push(params.limit, offset);
    const limIdx = values.length - 1;
    const offIdx = values.length;

    const listSql = `
      SELECT c.id, c.slug::text AS slug, c.company_name, c.summary, c.country_code, c.industry_key, c.closed_year,
             c.business_model_key, c.founded_year, c.total_funding_usd, c.primary_failure_reason_key, c.key_lessons
      FROM cases c
      ${joinSql}
      WHERE ${whereSql}
      ${orderBy}
      LIMIT $${limIdx} OFFSET $${offIdx}
    `;

    const countSql = `SELECT COUNT(*)::bigint AS c FROM cases c WHERE ${whereSql}`;

    const [listRes, countRes] = await Promise.all([
      this.pool.query<CaseRow>(listSql, values),
      this.pool.query<{ c: string }>(countSql, values.slice(0, filterValuesLen)),
    ]);

    return {
      items: listRes.rows.map(rowToItem),
      page: params.page,
      pageSize: params.limit,
      total: Number(countRes.rows[0]?.c ?? 0),
    };
  }

  async getTimeline(caseId: string): Promise<TimelineEventItem[]> {
    try {
      const res = await this.pool.query<TimelineRow>(
        `
        SELECT id, event_date::text AS event_date, event_type, title, description, amount_usd, sort_order
        FROM timeline_events
        WHERE case_id = $1
        ORDER BY sort_order ASC, event_date ASC
        `,
        [caseId],
      );
      return res.rows.map(mapTimelineRow);
    } catch {
      // timeline_events 表在旧数据库可能不存在，降级返回空数组
      return [];
    }
  }

  /** 已校验 `cases` 行为 published 的一行，拉证据 + 因子 + 时间线（单轮并行查询）。 */
  async #detailFromPublishedRow(row: CaseRow): Promise<CaseDetail> {
    const base = rowToItem(row);
    const caseId = row.id;
    const [evRes, ffRes, timeline] = await Promise.all([
      this.pool.query<EvidenceRow>(
        `
        SELECT id, source_type, title, url, publisher, published_at,
               credibility_level, excerpt
        FROM evidence_sources
        WHERE case_id = $1
        ORDER BY created_at ASC
        `,
        [caseId],
      ),
      this.pool.query<FactorRow>(
        `
        SELECT id, level_1_key, level_2_key, level_3_key, weight, explanation
        FROM failure_factors
        WHERE case_id = $1
        ORDER BY weight DESC, id ASC
        `,
        [caseId],
      ),
      this.getTimeline(caseId),
    ]);
    return {
      ...base,
      evidenceSources: evRes.rows.map(mapEvidenceRow),
      failureFactors: ffRes.rows.map(mapFactorRow),
      timelineEvents: timeline,
    };
  }

  async getById(id: string): Promise<CaseDetail | null> {
    const res = await this.pool.query<CaseRow>(
      `
      SELECT id, slug::text AS slug, company_name, summary, country_code, industry_key, closed_year,
             business_model_key, founded_year, total_funding_usd, primary_failure_reason_key, key_lessons
      FROM cases
      WHERE id = $1 AND status = 'published'
      `,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    return this.#detailFromPublishedRow(row);
  }

  async getByIds(ids: string[]): Promise<CaseDetail[]> {
    if (ids.length === 0) return [];
    const res = await this.pool.query<CaseRow>(
      `
      SELECT id, slug::text AS slug, company_name, summary, country_code, industry_key, closed_year,
             business_model_key, founded_year, total_funding_usd, primary_failure_reason_key, key_lessons
      FROM cases
      WHERE id = ANY($1::uuid[]) AND status = 'published'
      `,
      [ids],
    );
    // Preserve input order and enrich in parallel
    const rowMap = new Map(res.rows.map((r) => [r.id, r]));
    const details = await Promise.all(
      ids
        .map((id) => rowMap.get(id))
        .filter((r): r is CaseRow => r !== undefined)
        .map((r) => this.#detailFromPublishedRow(r)),
    );
    return details;
  }

  async getPublishedBySlug(slug: string): Promise<CaseDetail | null> {
    const res = await this.pool.query<CaseRow>(
      `
      SELECT id, slug::text AS slug, company_name, summary, country_code, industry_key, closed_year,
             business_model_key, founded_year, total_funding_usd, primary_failure_reason_key, key_lessons
      FROM cases
      WHERE slug = $1 AND status = 'published'
      `,
      [slug.trim().toLowerCase()],
    );
    const row = res.rows[0];
    if (!row) return null;
    return this.#detailFromPublishedRow(row);
  }

  async findSimilarPublished(anchorId: string, limit: number): Promise<CaseListItem[]> {
    const anchorEmb = await this.pool.query(`SELECT 1 FROM case_embeddings WHERE case_id = $1`, [
      anchorId,
    ]);
    if ((anchorEmb.rowCount ?? 0) === 0) return [];

    const res = await this.pool.query<CaseRow>(
      `
      WITH anchor AS (
        SELECT embedding FROM case_embeddings WHERE case_id = $1
      )
      SELECT c.id, c.slug::text AS slug, c.company_name, c.summary, c.country_code, c.industry_key, c.closed_year,
             c.business_model_key, c.founded_year, c.total_funding_usd, c.primary_failure_reason_key, c.key_lessons
      FROM case_embeddings e
      JOIN cases c ON c.id = e.case_id
      CROSS JOIN anchor a
      WHERE e.case_id <> $1
        AND c.status = 'published'
      ORDER BY e.embedding <=> a.embedding
      LIMIT $2
      `,
      [anchorId, limit],
    );
    return res.rows.map(rowToItem);
  }
}
