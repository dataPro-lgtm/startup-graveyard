import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';

export type AuditListItem = {
  id: string;
  action: string;
  reviewId: string | null;
  caseId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export interface AuditRepository {
  listRecent(limit: number): Promise<AuditListItem[]>;
  listRecentByAction(action: string, limit: number): Promise<AuditListItem[]>;
  record(input: {
    action: string;
    reviewId?: string | null;
    caseId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AuditListItem>;
}

type AuditRow = QueryResultRow & {
  id: string;
  action: string;
  review_id: string | null;
  case_id: string | null;
  metadata: unknown;
  created_at: Date;
};

function rowToItem(row: AuditRow): AuditListItem {
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    action: row.action,
    reviewId: row.review_id,
    caseId: row.case_id,
    metadata: meta,
    createdAt: row.created_at.toISOString(),
  };
}

export class MockAuditRepository implements AuditRepository {
  private readonly items: AuditListItem[] = [];

  async listRecent(limit: number): Promise<AuditListItem[]> {
    return this.items.slice(0, limit);
  }

  async listRecentByAction(action: string, limit: number): Promise<AuditListItem[]> {
    return this.items.filter((item) => item.action === action).slice(0, limit);
  }

  async record(input: {
    action: string;
    reviewId?: string | null;
    caseId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AuditListItem> {
    const item: AuditListItem = {
      id: randomUUID(),
      action: input.action,
      reviewId: input.reviewId ?? null,
      caseId: input.caseId ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    this.items.unshift(item);
    return item;
  }
}

export class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async listRecent(limit: number): Promise<AuditListItem[]> {
    const res = await this.pool.query<AuditRow>(
      `
      SELECT id, action, review_id, case_id, metadata, created_at
      FROM admin_audit_events
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit],
    );
    return res.rows.map(rowToItem);
  }

  async listRecentByAction(action: string, limit: number): Promise<AuditListItem[]> {
    const res = await this.pool.query<AuditRow>(
      `
      SELECT id, action, review_id, case_id, metadata, created_at
      FROM admin_audit_events
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [action, limit],
    );
    return res.rows.map(rowToItem);
  }

  async record(input: {
    action: string;
    reviewId?: string | null;
    caseId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AuditListItem> {
    const res = await this.pool.query<AuditRow>(
      `
      INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id, action, review_id, case_id, metadata, created_at
      `,
      [
        input.action,
        input.reviewId ?? null,
        input.caseId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return rowToItem(res.rows[0]!);
  }
}
