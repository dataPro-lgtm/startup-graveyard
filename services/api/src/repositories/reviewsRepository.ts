import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { AdminCaseReviewSnapshot, MockCasesRepository } from './casesRepository.js';
import { withTransaction } from '../db/withTransaction.js';

export type ReviewStatus = 'pending' | 'changes_requested' | 'approved' | 'rejected';
export type ReviewPublishRequirement = 'evidence_sources' | 'failure_factors';

export type ReviewPublishReadiness = {
  ready: boolean;
  evidenceCount: number;
  failureFactorCount: number;
  missing: ReviewPublishRequirement[];
};

export type ListReviewsParams = {
  status?: ReviewStatus;
  page: number;
  limit: number;
};

export type ReviewListItem = {
  id: string;
  caseId: string;
  slug: string;
  companyName: string;
  reviewStatus: ReviewStatus;
  assignedTo: string | null;
  decisionNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  publishReadiness: ReviewPublishReadiness;
};

type ReviewRecord = Omit<ReviewListItem, 'publishReadiness'>;

export type ListReviewsResult = {
  items: ReviewListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ApproveReviewSuccessResult = {
  ok: true;
  reviewId: string;
  caseId: string;
  status: 'approved';
  approvedAt: string;
};

export type ApproveReviewBlockedResult = {
  ok: false;
  error: 'publish_requirements_not_met';
  caseId: string;
  publishReadiness: ReviewPublishReadiness;
};

export type RequestChangesReviewResult = {
  reviewId: string;
  caseId: string;
  status: 'changes_requested';
};

export type ResubmitReviewResult = {
  reviewId: string;
  caseId: string;
  status: 'pending';
};

export type RejectReviewResult = {
  reviewId: string;
  caseId: string;
  status: 'rejected';
};

export type ReviewApprovedHook = (input: {
  reviewId: string;
  caseId: string;
}) => Promise<void>;

export interface ReviewsRepository {
  list(params: ListReviewsParams): Promise<ListReviewsResult>;
  approve(id: string): Promise<ApproveReviewSuccessResult | ApproveReviewBlockedResult | null>;
  requestChanges(id: string, decisionNote: string): Promise<RequestChangesReviewResult | null>;
  resubmit(id: string): Promise<ResubmitReviewResult | null>;
  reject(id: string, decisionNote?: string): Promise<RejectReviewResult | null>;
}

type ReviewRow = QueryResultRow & {
  id: string;
  case_id: string;
  slug: string;
  company_name: string;
  review_status: ReviewStatus;
  assigned_to: string | null;
  decision_note: string | null;
  created_at: Date;
  approved_at: Date | null;
  evidence_count: string | number;
  failure_factor_count: string | number;
};

function buildPublishReadiness(
  evidenceCount: number,
  failureFactorCount: number,
): ReviewPublishReadiness {
  const missing: ReviewPublishRequirement[] = [];
  if (evidenceCount < 1) missing.push('evidence_sources');
  if (failureFactorCount < 1) missing.push('failure_factors');
  return {
    ready: missing.length === 0,
    evidenceCount,
    failureFactorCount,
    missing,
  };
}

function snapshotToReadiness(snapshot: AdminCaseReviewSnapshot | null): ReviewPublishReadiness {
  return buildPublishReadiness(snapshot?.evidenceCount ?? 0, snapshot?.failureFactorCount ?? 0);
}

async function runApprovedHook(
  hook: ReviewApprovedHook | undefined,
  input: { reviewId: string; caseId: string },
): Promise<void> {
  if (!hook) return;
  try {
    await hook(input);
  } catch {
    // 索引任务排队失败不能回滚已完成的 publish；后续可由 backfill job 补齐。
  }
}

function rowToItem(row: ReviewRow): ReviewListItem {
  const evidenceCount = Number(row.evidence_count ?? 0);
  const failureFactorCount = Number(row.failure_factor_count ?? 0);
  return {
    id: row.id,
    caseId: row.case_id,
    slug: row.slug,
    companyName: row.company_name,
    reviewStatus: row.review_status,
    assignedTo: row.assigned_to,
    decisionNote: row.decision_note,
    createdAt: row.created_at.toISOString(),
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    publishReadiness: buildPublishReadiness(evidenceCount, failureFactorCount),
  };
}

async function getCasePublishReadiness(
  client: PoolClient,
  caseId: string,
): Promise<ReviewPublishReadiness | null> {
  const res = await client.query<{
    evidence_count: string;
    failure_factor_count: string;
  }>(
    `
    SELECT
      (SELECT COUNT(*)::bigint FROM evidence_sources WHERE case_id = c.id) AS evidence_count,
      (SELECT COUNT(*)::bigint FROM failure_factors WHERE case_id = c.id) AS failure_factor_count
    FROM cases c
    WHERE c.id = $1
    `,
    [caseId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return buildPublishReadiness(Number(row.evidence_count ?? 0), Number(row.failure_factor_count ?? 0));
}

export class MockReviewsRepository implements ReviewsRepository {
  private items: ReviewRecord[] = [
    {
      id: 'd4444444-4444-4444-8444-444444444444',
      caseId: 'c3333333-3333-4333-8333-333333333333',
      slug: 'mock-draft',
      companyName: 'Mock Draft Inc',
      reviewStatus: 'pending',
      assignedTo: 'dev@local',
      decisionNote: null,
      createdAt: new Date().toISOString(),
      approvedAt: null,
    },
  ];

  constructor(
    private readonly cases: MockCasesRepository,
    private readonly onApproved?: ReviewApprovedHook,
  ) {}

  private toItem(item: ReviewRecord): ReviewListItem {
    const snapshot = this.cases.adminGetReviewSnapshot(item.caseId);
    return {
      ...item,
      slug: snapshot?.slug ?? item.slug,
      companyName: snapshot?.companyName ?? item.companyName,
      publishReadiness: snapshotToReadiness(snapshot),
    };
  }

  async list(params: ListReviewsParams): Promise<ListReviewsResult> {
    let rows = this.items;
    if (params.status) {
      rows = rows.filter((r) => r.reviewStatus === params.status);
    }
    const offset = (params.page - 1) * params.limit;
    const slice = rows.slice(offset, offset + params.limit).map((item) => this.toItem(item));
    return {
      items: slice,
      page: params.page,
      pageSize: params.limit,
      total: rows.length,
    };
  }

  async approve(id: string): Promise<ApproveReviewSuccessResult | ApproveReviewBlockedResult | null> {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const r = this.items[idx];
    if (r.reviewStatus !== 'pending') return null;
    const snapshot = this.cases.adminGetReviewSnapshot(r.caseId);
    if (!snapshot) return null;
    const publishReadiness = snapshotToReadiness(snapshot);
    if (!publishReadiness.ready) {
      return { ok: false, error: 'publish_requirements_not_met', caseId: r.caseId, publishReadiness };
    }

    const approvedAt = new Date().toISOString();
    this.items[idx] = {
      ...r,
      reviewStatus: 'approved',
      approvedAt,
    };
    this.cases.adminSetStatus(r.caseId, 'published');
    const out: ApproveReviewSuccessResult = {
      ok: true,
      reviewId: id,
      caseId: r.caseId,
      status: 'approved',
      approvedAt,
    };
    await runApprovedHook(this.onApproved, { reviewId: id, caseId: r.caseId });
    return out;
  }

  async requestChanges(id: string, decisionNote: string): Promise<RequestChangesReviewResult | null> {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const r = this.items[idx];
    if (r.reviewStatus !== 'pending') return null;
    this.items[idx] = {
      ...r,
      reviewStatus: 'changes_requested',
      decisionNote,
      approvedAt: null,
    };
    this.cases.adminSetStatus(r.caseId, 'draft');
    return { reviewId: id, caseId: r.caseId, status: 'changes_requested' };
  }

  async resubmit(id: string): Promise<ResubmitReviewResult | null> {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const r = this.items[idx];
    if (r.reviewStatus !== 'changes_requested') return null;
    this.items[idx] = {
      ...r,
      reviewStatus: 'pending',
    };
    this.cases.adminSetStatus(r.caseId, 'draft');
    return { reviewId: id, caseId: r.caseId, status: 'pending' };
  }

  async reject(id: string, decisionNote?: string): Promise<RejectReviewResult | null> {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const r = this.items[idx];
    if (r.reviewStatus !== 'pending' && r.reviewStatus !== 'changes_requested') return null;
    const note = decisionNote ?? r.decisionNote;
    this.items[idx] = {
      ...r,
      reviewStatus: 'rejected',
      decisionNote: note,
      approvedAt: null,
    };
    this.cases.adminSetStatus(r.caseId, 'rejected');
    return { reviewId: id, caseId: r.caseId, status: 'rejected' };
  }

  /** 供 `MockAdminWriteRepository` */
  adminQueueReview(opts: {
    caseId: string;
    slug: string;
    companyName: string;
    assignedTo: string | null;
  }): string {
    const id = randomUUID();
    this.items.push({
      id,
      caseId: opts.caseId,
      slug: opts.slug,
      companyName: opts.companyName,
      reviewStatus: 'pending',
      assignedTo: opts.assignedTo,
      decisionNote: null,
      createdAt: new Date().toISOString(),
      approvedAt: null,
    });
    return id;
  }
}

export class PgReviewsRepository implements ReviewsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly onApproved?: ReviewApprovedHook,
  ) {}

  async list(params: ListReviewsParams): Promise<ListReviewsResult> {
    const offset = (params.page - 1) * params.limit;
    const status = params.status ?? null;

    const countValues = status === null ? [] : [status];

    const listSql =
      status === null
        ? `
      SELECT r.id, r.case_id, c.slug, c.company_name, r.review_status,
             r.assigned_to, r.decision_note, r.created_at, r.approved_at,
             (SELECT COUNT(*)::bigint FROM evidence_sources e WHERE e.case_id = r.case_id) AS evidence_count,
             (SELECT COUNT(*)::bigint FROM failure_factors f WHERE f.case_id = r.case_id) AS failure_factor_count
      FROM reviews r
      JOIN cases c ON c.id = r.case_id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
    `
        : `
      SELECT r.id, r.case_id, c.slug, c.company_name, r.review_status,
             r.assigned_to, r.decision_note, r.created_at, r.approved_at,
             (SELECT COUNT(*)::bigint FROM evidence_sources e WHERE e.case_id = r.case_id) AS evidence_count,
             (SELECT COUNT(*)::bigint FROM failure_factors f WHERE f.case_id = r.case_id) AS failure_factor_count
      FROM reviews r
      JOIN cases c ON c.id = r.case_id
      WHERE r.review_status = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql =
      status === null
        ? `SELECT COUNT(*)::bigint AS c FROM reviews r`
        : `SELECT COUNT(*)::bigint AS c FROM reviews r WHERE r.review_status = $1`;

    const listParams = status === null ? [params.limit, offset] : [status, params.limit, offset];

    const [listRes, countRes] = await Promise.all([
      this.pool.query<ReviewRow>(listSql, listParams),
      this.pool.query<{ c: string }>(countSql, countValues),
    ]);

    return {
      items: listRes.rows.map(rowToItem),
      page: params.page,
      pageSize: params.limit,
      total: Number(countRes.rows[0]?.c ?? 0),
    };
  }

  async approve(id: string): Promise<ApproveReviewSuccessResult | ApproveReviewBlockedResult | null> {
    const out: ApproveReviewSuccessResult | ApproveReviewBlockedResult | null =
      await withTransaction(this.pool, async (client) => {
      const locked = await client.query<{ case_id: string }>(
        `
        SELECT case_id
        FROM reviews
        WHERE id = $1 AND review_status = 'pending'
        FOR UPDATE
        `,
        [id],
      );
      if (locked.rowCount === 0) return null;

      const caseId = locked.rows[0]!.case_id;
      const publishReadiness = await getCasePublishReadiness(client, caseId);
      if (!publishReadiness) return null;
      if (!publishReadiness.ready) {
        const blocked: ApproveReviewBlockedResult = {
          ok: false,
          error: 'publish_requirements_not_met',
          caseId,
          publishReadiness,
        };
        return blocked;
      }

      const upd = await client.query<{ case_id: string; approved_at: Date }>(
        `
        UPDATE reviews
        SET review_status = 'approved', approved_at = NOW()
        WHERE id = $1 AND review_status = 'pending'
        RETURNING case_id, approved_at
        `,
        [id],
      );
      if (upd.rowCount === 0) return null;

      const row = upd.rows[0]!;

      await client.query(
        `UPDATE cases
         SET status = 'published',
             published_at = COALESCE(published_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [caseId],
      );
      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          'review.approved',
          id,
          caseId,
          JSON.stringify({
            actor: 'admin_api',
            publishReadiness,
          }),
        ],
      );

      const approved: ApproveReviewSuccessResult = {
        ok: true,
        reviewId: id,
        caseId: row.case_id,
        status: 'approved',
        approvedAt: row.approved_at.toISOString(),
      };
      return approved;
    });
    if (out && out.ok) {
      await runApprovedHook(this.onApproved, { reviewId: out.reviewId, caseId: out.caseId });
    }
    return out;
  }

  async requestChanges(id: string, decisionNote: string): Promise<RequestChangesReviewResult | null> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<{ case_id: string }>(
        `
        UPDATE reviews
        SET review_status = 'changes_requested',
            decision_note = $2,
            approved_at = NULL
        WHERE id = $1 AND review_status = 'pending'
        RETURNING case_id
        `,
        [id, decisionNote],
      );
      if (res.rowCount === 0) return null;

      const caseId = res.rows[0]!.case_id;

      await client.query(`UPDATE cases SET status = 'draft', updated_at = NOW() WHERE id = $1`, [
        caseId,
      ]);
      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          'review.changes_requested',
          id,
          caseId,
          JSON.stringify({ actor: 'admin_api', decisionNote }),
        ],
      );

      return { reviewId: id, caseId, status: 'changes_requested' as const };
    });
  }

  async resubmit(id: string): Promise<ResubmitReviewResult | null> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<{ case_id: string }>(
        `
        UPDATE reviews
        SET review_status = 'pending'
        WHERE id = $1 AND review_status = 'changes_requested'
        RETURNING case_id
        `,
        [id],
      );
      if (res.rowCount === 0) return null;

      const caseId = res.rows[0]!.case_id;

      await client.query(`UPDATE cases SET status = 'draft', updated_at = NOW() WHERE id = $1`, [
        caseId,
      ]);
      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        ['review.resubmitted', id, caseId, JSON.stringify({ actor: 'admin_api' })],
      );

      return { reviewId: id, caseId, status: 'pending' as const };
    });
  }

  async reject(id: string, decisionNote?: string): Promise<RejectReviewResult | null> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<{ case_id: string }>(
        `
        UPDATE reviews
        SET review_status = 'rejected',
            decision_note = COALESCE($2, decision_note),
            approved_at = NULL
        WHERE id = $1 AND review_status IN ('pending', 'changes_requested')
        RETURNING case_id
        `,
        [id, decisionNote ?? null],
      );
      if (res.rowCount === 0) return null;

      const caseId = res.rows[0]!.case_id;

      await client.query(`UPDATE cases SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [
        caseId,
      ]);
      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          'review.rejected',
          id,
          caseId,
          JSON.stringify({ actor: 'admin_api', decisionNote: decisionNote ?? null }),
        ],
      );

      return { reviewId: id, caseId, status: 'rejected' as const };
    });
  }
}
