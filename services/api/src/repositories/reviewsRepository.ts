import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { withTransaction } from '../db/withTransaction.js';

export type ListReviewsParams = {
  status?: string;
  page: number;
  limit: number;
};

export type ReviewListItem = {
  id: string;
  caseId: string;
  slug: string;
  companyName: string;
  reviewStatus: string;
  assignedTo: string | null;
  decisionNote: string | null;
  createdAt: string;
  approvedAt: string | null;
};

export type ListReviewsResult = {
  items: ReviewListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ApproveReviewResult = {
  reviewId: string;
  caseId: string;
  status: 'approved';
  approvedAt: string;
};

export type RejectReviewResult = {
  reviewId: string;
  caseId: string;
  status: 'rejected';
};

export interface ReviewsRepository {
  list(params: ListReviewsParams): Promise<ListReviewsResult>;
  approve(id: string): Promise<ApproveReviewResult | null>;
  reject(id: string, decisionNote?: string): Promise<RejectReviewResult | null>;
}

type ReviewRow = QueryResultRow & {
  id: string;
  case_id: string;
  slug: string;
  company_name: string;
  review_status: string;
  assigned_to: string | null;
  decision_note: string | null;
  created_at: Date;
  approved_at: Date | null;
};

function rowToItem(row: ReviewRow): ReviewListItem {
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
  };
}

export class MockReviewsRepository implements ReviewsRepository {
  private items: ReviewListItem[] = [
    {
      id: 'b2222222-2222-4222-8222-222222222222',
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

  async list(params: ListReviewsParams): Promise<ListReviewsResult> {
    let rows = this.items;
    if (params.status) {
      rows = rows.filter((r) => r.reviewStatus === params.status);
    }
    const offset = (params.page - 1) * params.limit;
    const slice = rows.slice(offset, offset + params.limit);
    return {
      items: slice,
      page: params.page,
      pageSize: params.limit,
      total: rows.length,
    };
  }

  async approve(id: string): Promise<ApproveReviewResult | null> {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const r = this.items[idx];
    if (r.reviewStatus !== 'pending') return null;
    const approvedAt = new Date().toISOString();
    this.items[idx] = {
      ...r,
      reviewStatus: 'approved',
      approvedAt,
    };
    return {
      reviewId: id,
      caseId: r.caseId,
      status: 'approved',
      approvedAt,
    };
  }

  async reject(
    id: string,
    decisionNote?: string,
  ): Promise<RejectReviewResult | null> {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const r = this.items[idx];
    if (r.reviewStatus !== 'pending') return null;
    const note = decisionNote ?? r.decisionNote;
    this.items[idx] = {
      ...r,
      reviewStatus: 'rejected',
      decisionNote: note,
    };
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
  constructor(private readonly pool: Pool) {}

  async list(params: ListReviewsParams): Promise<ListReviewsResult> {
    const offset = (params.page - 1) * params.limit;
    const status = params.status ?? null;

    const countValues = status === null ? [] : [status];

    const listSql =
      status === null
        ? `
      SELECT r.id, r.case_id, c.slug, c.company_name, r.review_status,
             r.assigned_to, r.decision_note, r.created_at, r.approved_at
      FROM reviews r
      JOIN cases c ON c.id = r.case_id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
    `
        : `
      SELECT r.id, r.case_id, c.slug, c.company_name, r.review_status,
             r.assigned_to, r.decision_note, r.created_at, r.approved_at
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

    const listParams =
      status === null
        ? [params.limit, offset]
        : [status, params.limit, offset];

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

  async approve(id: string): Promise<ApproveReviewResult | null> {
    return withTransaction(this.pool, async (client) => {
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
      const caseId = row.case_id;

      await client.query(
        `UPDATE cases SET status = 'published', updated_at = NOW() WHERE id = $1`,
        [caseId],
      );
      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        ['review.approved', id, caseId, JSON.stringify({ actor: 'admin_api' })],
      );

      return {
        reviewId: id,
        caseId,
        status: 'approved' as const,
        approvedAt: row.approved_at.toISOString(),
      };
    });
  }

  async reject(
    id: string,
    decisionNote?: string,
  ): Promise<RejectReviewResult | null> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<{ case_id: string }>(
        `
        UPDATE reviews
        SET review_status = 'rejected',
            decision_note = COALESCE($2, decision_note)
        WHERE id = $1 AND review_status = 'pending'
        RETURNING case_id
        `,
        [id, decisionNote ?? null],
      );
      if (res.rowCount === 0) return null;

      const caseId = res.rows[0]!.case_id;

      await client.query(
        `UPDATE cases SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [caseId],
      );
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
