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
  async listRecent(): Promise<AuditListItem[]> {
    return [];
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
}
