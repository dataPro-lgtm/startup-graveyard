import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { AdminRole } from '@sg/shared/schemas/auth';

export type AuditActorAuthType = 'user_session' | 'service_key' | 'system';

export type AuditListItem = {
  id: string;
  action: string;
  reviewId: string | null;
  caseId: string | null;
  metadata: Record<string, unknown>;
  actorUserId: string | null;
  actorEmail: string | null;
  actorAdminRole: AdminRole | null;
  actorAuthType: AuditActorAuthType | null;
  createdAt: string;
};

export type RecordAuditInput = {
  action: string;
  reviewId?: string | null;
  caseId?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorAdminRole?: AdminRole | null;
  actorAuthType?: AuditActorAuthType | null;
};

export interface AuditRepository {
  listRecent(limit: number): Promise<AuditListItem[]>;
  listRecentByAction(action: string, limit: number): Promise<AuditListItem[]>;
  record(input: RecordAuditInput): Promise<AuditListItem>;
}

type AuditRow = QueryResultRow & {
  id: string;
  action: string;
  review_id: string | null;
  case_id: string | null;
  metadata: unknown;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_admin_role: AdminRole | null;
  actor_auth_type: AuditActorAuthType | null;
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
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorAdminRole: row.actor_admin_role,
    actorAuthType: row.actor_auth_type,
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

  async record(input: RecordAuditInput): Promise<AuditListItem> {
    const item: AuditListItem = {
      id: randomUUID(),
      action: input.action,
      reviewId: input.reviewId ?? null,
      caseId: input.caseId ?? null,
      metadata: input.metadata ?? {},
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorAdminRole: input.actorAdminRole ?? null,
      actorAuthType: input.actorAuthType ?? null,
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
      SELECT id, action, review_id, case_id, metadata,
             actor_user_id, actor_email, actor_admin_role, actor_auth_type, created_at
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
      SELECT id, action, review_id, case_id, metadata,
             actor_user_id, actor_email, actor_admin_role, actor_auth_type, created_at
      FROM admin_audit_events
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [action, limit],
    );
    return res.rows.map(rowToItem);
  }

  async record(input: RecordAuditInput): Promise<AuditListItem> {
    const res = await this.pool.query<AuditRow>(
      `
      INSERT INTO admin_audit_events (
        action, review_id, case_id, metadata,
        actor_user_id, actor_email, actor_admin_role, actor_auth_type
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
      RETURNING id, action, review_id, case_id, metadata,
                actor_user_id, actor_email, actor_admin_role, actor_auth_type, created_at
      `,
      [
        input.action,
        input.reviewId ?? null,
        input.caseId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.actorUserId ?? null,
        input.actorEmail ?? null,
        input.actorAdminRole ?? null,
        input.actorAuthType ?? null,
      ],
    );
    return rowToItem(res.rows[0]!);
  }
}
