import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SavedViewItem } from '@sg/shared/schemas/savedViews';
import type { ReportShareItem } from '@sg/shared/schemas/reportShares';

export type ReportShareOwner = {
  userId: string;
  ownerDisplayName: string | null;
};

export type ReportSharesAdminMetrics = {
  users: number;
  reportShares: number;
  accessedReportShares: number;
  userIds: string[];
};

export type SaveReportShareResult = {
  status: 'created' | 'exists';
  item: ReportShareItemRecord;
};

export type ReportShareItemRecord = Omit<ReportShareItem, 'sharePath' | 'shareUrl'>;

export type PublicReportShareRecord = ReportShareItemRecord & {
  ownerDisplayName: string | null;
};

type MockReportShareItem = ReportShareItemRecord & {
  ownerDisplayName: string | null;
};

export interface ReportSharesRepository {
  listByUserId(userId: string): Promise<ReportShareItemRecord[]>;
  create(owner: ReportShareOwner, savedView: SavedViewItem): Promise<SaveReportShareResult>;
  remove(userId: string, shareId: string): Promise<boolean>;
  getPublicByToken(shareToken: string): Promise<PublicReportShareRecord | null>;
  getAdminMetrics(): Promise<ReportSharesAdminMetrics>;
}

type ReportShareRow = {
  id: string;
  saved_view_id: string;
  saved_view_name: string;
  filters: SavedViewItem['filters'] | string;
  query_string: string;
  case_count_snapshot: number | string;
  share_token: string;
  owner_display_name: string | null;
  last_accessed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoString(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRecord(row: ReportShareRow): ReportShareItemRecord {
  return {
    id: row.id,
    savedViewId: row.saved_view_id,
    savedViewName: row.saved_view_name,
    filters:
      typeof row.filters === 'string'
        ? (JSON.parse(row.filters) as SavedViewItem['filters'])
        : row.filters,
    queryString: row.query_string ?? '',
    caseCount:
      typeof row.case_count_snapshot === 'number'
        ? row.case_count_snapshot
        : Number(row.case_count_snapshot ?? 0),
    shareToken: row.share_token,
    lastAccessedAt: toIsoString(row.last_accessed_at),
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function createShareToken(): string {
  return randomUUID().replaceAll('-', '').slice(0, 16);
}

export class MockReportSharesRepository implements ReportSharesRepository {
  private readonly itemsByUser = new Map<string, MockReportShareItem[]>();

  async listByUserId(userId: string): Promise<ReportShareItemRecord[]> {
    return [...(this.itemsByUser.get(userId) ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ ownerDisplayName: _ownerDisplayName, ...item }) => item);
  }

  async create(owner: ReportShareOwner, savedView: SavedViewItem): Promise<SaveReportShareResult> {
    const current = this.itemsByUser.get(owner.userId) ?? [];
    const existingIndex = current.findIndex((item) => item.savedViewId === savedView.id);
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      const nextItem: MockReportShareItem = {
        ...current[existingIndex]!,
        savedViewName: savedView.name,
        filters: savedView.filters,
        queryString: savedView.queryString,
        caseCount: savedView.caseCount,
        ownerDisplayName: owner.ownerDisplayName,
        updatedAt: now,
      };
      const next = [...current];
      next[existingIndex] = nextItem;
      next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      this.itemsByUser.set(owner.userId, next);
      const { ownerDisplayName: _ownerDisplayName, ...item } = nextItem;
      return { status: 'exists', item };
    }

    const item: MockReportShareItem = {
      id: randomUUID(),
      savedViewId: savedView.id,
      savedViewName: savedView.name,
      filters: savedView.filters,
      queryString: savedView.queryString,
      caseCount: savedView.caseCount,
      shareToken: createShareToken(),
      ownerDisplayName: owner.ownerDisplayName,
      lastAccessedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.itemsByUser.set(owner.userId, [item, ...current]);
    const { ownerDisplayName: _ownerDisplayName, ...record } = item;
    return { status: 'created', item: record };
  }

  async remove(userId: string, shareId: string): Promise<boolean> {
    const current = this.itemsByUser.get(userId) ?? [];
    const next = current.filter((item) => item.id !== shareId);
    this.itemsByUser.set(userId, next);
    return next.length !== current.length;
  }

  async getPublicByToken(shareToken: string): Promise<PublicReportShareRecord | null> {
    for (const [userId, items] of this.itemsByUser.entries()) {
      const item = items.find((entry) => entry.shareToken === shareToken);
      if (!item) continue;
      const updated: MockReportShareItem = {
        ...item,
        lastAccessedAt: new Date().toISOString(),
      };
      this.itemsByUser.set(
        userId,
        items.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      return {
        ...updated,
      };
    }
    return null;
  }

  async getAdminMetrics(): Promise<ReportSharesAdminMetrics> {
    const entries = [...this.itemsByUser.entries()].filter(([, items]) => items.length > 0);
    const users = entries.length;
    const reportShares = entries.reduce((sum, [, items]) => sum + items.length, 0);
    const accessedReportShares = entries.reduce(
      (sum, [, items]) => sum + items.filter((item) => item.lastAccessedAt != null).length,
      0,
    );
    return {
      users,
      reportShares,
      accessedReportShares,
      userIds: entries.map(([userId]) => userId),
    };
  }
}

export class PgReportSharesRepository implements ReportSharesRepository {
  constructor(private readonly pool: Pool) {}

  async listByUserId(userId: string): Promise<ReportShareItemRecord[]> {
    const { rows } = await this.pool.query<ReportShareRow>(
      `SELECT id, saved_view_id, saved_view_name, filters, query_string, case_count_snapshot,
              share_token, owner_display_name, last_accessed_at, created_at, updated_at
       FROM user_saved_view_report_shares
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(toRecord);
  }

  async create(owner: ReportShareOwner, savedView: SavedViewItem): Promise<SaveReportShareResult> {
    const { rows } = await this.pool.query<ReportShareRow>(
      `INSERT INTO user_saved_view_report_shares (
         user_id,
         saved_view_id,
         saved_view_name,
         filters,
         query_string,
         case_count_snapshot,
         owner_display_name,
         share_token
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
       ON CONFLICT (saved_view_id) DO UPDATE
         SET saved_view_name = EXCLUDED.saved_view_name,
             filters = EXCLUDED.filters,
             query_string = EXCLUDED.query_string,
             case_count_snapshot = EXCLUDED.case_count_snapshot,
             owner_display_name = EXCLUDED.owner_display_name,
             updated_at = now()
       RETURNING id, saved_view_id, saved_view_name, filters, query_string, case_count_snapshot,
                 share_token, owner_display_name, last_accessed_at, created_at, updated_at`,
      [
        owner.userId,
        savedView.id,
        savedView.name,
        JSON.stringify(savedView.filters),
        savedView.queryString,
        savedView.caseCount,
        owner.ownerDisplayName,
        createShareToken(),
      ],
    );

    const item = rows[0];
    if (!item) {
      throw new Error('report_share_upsert_failed');
    }

    const created = item.created_at === item.updated_at;
    return {
      status: created ? 'created' : 'exists',
      item: toRecord(item),
    };
  }

  async remove(userId: string, shareId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM user_saved_view_report_shares
       WHERE user_id = $1 AND id = $2`,
      [userId, shareId],
    );
    return (rowCount ?? 0) > 0;
  }

  async getPublicByToken(shareToken: string): Promise<PublicReportShareRecord | null> {
    const { rows } = await this.pool.query<ReportShareRow>(
      `UPDATE user_saved_view_report_shares
       SET last_accessed_at = now()
       WHERE share_token = $1
       RETURNING id, saved_view_id, saved_view_name, filters, query_string, case_count_snapshot,
                 share_token, owner_display_name, last_accessed_at, created_at, updated_at`,
      [shareToken],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...toRecord(row),
      ownerDisplayName: row.owner_display_name,
    };
  }

  async getAdminMetrics(): Promise<ReportSharesAdminMetrics> {
    const { rows } = await this.pool.query<{
      report_share_count: string;
      accessed_report_share_count: string;
      user_ids: string[] | null;
    }>(
      `SELECT
         COUNT(*)::text AS report_share_count,
         COUNT(*) FILTER (WHERE last_accessed_at IS NOT NULL)::text AS accessed_report_share_count,
         ARRAY_AGG(DISTINCT user_id)::text[] AS user_ids
       FROM user_saved_view_report_shares`,
    );
    const reportShares = Number(rows[0]?.report_share_count ?? 0);
    const accessedReportShares = Number(rows[0]?.accessed_report_share_count ?? 0);
    const userIds = rows[0]?.user_ids ?? [];
    return {
      users: userIds.length,
      reportShares,
      accessedReportShares,
      userIds,
    };
  }
}
