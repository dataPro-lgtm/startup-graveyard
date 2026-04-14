import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SavedViewFilters, SavedViewItem } from '@sg/shared/schemas/savedViews';

export type SavedViewSaveInput = {
  name: string;
  filters: SavedViewFilters;
  queryString: string;
  caseCount: number;
};

export type SaveSavedViewResult = {
  status: 'created' | 'exists';
  item: SavedViewItem;
};

export type SavedViewsAdminMetrics = {
  users: number;
  savedViews: number;
  avgSavedViewsPerUser: number | null;
  userIds: string[];
};

export interface SavedViewsRepository {
  listByUserId(userId: string): Promise<SavedViewItem[]>;
  countByUserId(userId: string): Promise<number>;
  getById(userId: string, savedViewId: string): Promise<SavedViewItem | null>;
  findByQueryString(userId: string, queryString: string): Promise<SavedViewItem | null>;
  create(userId: string, input: SavedViewSaveInput): Promise<SaveSavedViewResult>;
  update(
    userId: string,
    savedViewId: string,
    input: SavedViewSaveInput,
  ): Promise<SavedViewItem | 'not_found' | 'duplicate'>;
  remove(userId: string, savedViewId: string): Promise<boolean>;
  getAdminMetrics(): Promise<SavedViewsAdminMetrics>;
}

type SavedViewRow = {
  id: string;
  name: string;
  filters: SavedViewFilters | string;
  query_string: string;
  case_count_snapshot: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSavedViewItem(row: SavedViewRow): SavedViewItem {
  return {
    id: row.id,
    name: row.name,
    filters:
      typeof row.filters === 'string'
        ? (JSON.parse(row.filters) as SavedViewFilters)
        : (row.filters ?? {}),
    queryString: row.query_string ?? '',
    caseCount:
      typeof row.case_count_snapshot === 'number'
        ? row.case_count_snapshot
        : Number(row.case_count_snapshot ?? 0),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export class MockSavedViewsRepository implements SavedViewsRepository {
  private readonly itemsByUser = new Map<string, SavedViewItem[]>();

  async listByUserId(userId: string): Promise<SavedViewItem[]> {
    return [...(this.itemsByUser.get(userId) ?? [])].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async countByUserId(userId: string): Promise<number> {
    return (this.itemsByUser.get(userId) ?? []).length;
  }

  async getById(userId: string, savedViewId: string): Promise<SavedViewItem | null> {
    return (this.itemsByUser.get(userId) ?? []).find((item) => item.id === savedViewId) ?? null;
  }

  async findByQueryString(userId: string, queryString: string): Promise<SavedViewItem | null> {
    return (
      (this.itemsByUser.get(userId) ?? []).find((item) => item.queryString === queryString) ?? null
    );
  }

  async create(userId: string, input: SavedViewSaveInput): Promise<SaveSavedViewResult> {
    const existing = await this.findByQueryString(userId, input.queryString);
    if (existing) return { status: 'exists', item: existing };

    const now = new Date().toISOString();
    const item: SavedViewItem = {
      id: randomUUID(),
      name: input.name,
      filters: input.filters,
      queryString: input.queryString,
      caseCount: input.caseCount,
      createdAt: now,
      updatedAt: now,
    };
    const current = this.itemsByUser.get(userId) ?? [];
    this.itemsByUser.set(userId, [item, ...current]);
    return { status: 'created', item };
  }

  async update(
    userId: string,
    savedViewId: string,
    input: SavedViewSaveInput,
  ): Promise<SavedViewItem | 'not_found' | 'duplicate'> {
    const current = this.itemsByUser.get(userId) ?? [];
    const index = current.findIndex((item) => item.id === savedViewId);
    if (index < 0) return 'not_found';

    const duplicate = current.find(
      (item) => item.id !== savedViewId && item.queryString === input.queryString,
    );
    if (duplicate) return 'duplicate';

    const existing = current[index]!;
    const updated: SavedViewItem = {
      ...existing,
      name: input.name,
      filters: input.filters,
      queryString: input.queryString,
      caseCount: input.caseCount,
      updatedAt: new Date().toISOString(),
    };
    const next = [...current];
    next[index] = updated;
    next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.itemsByUser.set(userId, next);
    return updated;
  }

  async remove(userId: string, savedViewId: string): Promise<boolean> {
    const current = this.itemsByUser.get(userId) ?? [];
    const next = current.filter((item) => item.id !== savedViewId);
    this.itemsByUser.set(userId, next);
    return next.length !== current.length;
  }

  async getAdminMetrics(): Promise<SavedViewsAdminMetrics> {
    const activeEntries = [...this.itemsByUser.entries()].filter(([, items]) => items.length > 0);
    const users = activeEntries.length;
    const savedViews = activeEntries.reduce((sum, [, items]) => sum + items.length, 0);
    return {
      users,
      savedViews,
      avgSavedViewsPerUser: users > 0 ? savedViews / users : null,
      userIds: activeEntries.map(([userId]) => userId),
    };
  }
}

export class PgSavedViewsRepository implements SavedViewsRepository {
  constructor(private readonly pool: Pool) {}

  async listByUserId(userId: string): Promise<SavedViewItem[]> {
    const { rows } = await this.pool.query<SavedViewRow>(
      `SELECT id, name, filters, query_string, case_count_snapshot, created_at, updated_at
       FROM user_saved_views
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(toSavedViewItem);
  }

  async countByUserId(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM user_saved_views
       WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async getById(userId: string, savedViewId: string): Promise<SavedViewItem | null> {
    const { rows } = await this.pool.query<SavedViewRow>(
      `SELECT id, name, filters, query_string, case_count_snapshot, created_at, updated_at
       FROM user_saved_views
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, savedViewId],
    );
    return rows[0] ? toSavedViewItem(rows[0]) : null;
  }

  async findByQueryString(userId: string, queryString: string): Promise<SavedViewItem | null> {
    const { rows } = await this.pool.query<SavedViewRow>(
      `SELECT id, name, filters, query_string, case_count_snapshot, created_at, updated_at
       FROM user_saved_views
       WHERE user_id = $1 AND query_string = $2
       LIMIT 1`,
      [userId, queryString],
    );
    return rows[0] ? toSavedViewItem(rows[0]) : null;
  }

  async create(userId: string, input: SavedViewSaveInput): Promise<SaveSavedViewResult> {
    const existing = await this.findByQueryString(userId, input.queryString);
    if (existing) return { status: 'exists', item: existing };

    const { rows } = await this.pool.query<SavedViewRow>(
      `INSERT INTO user_saved_views (
         user_id,
         name,
         filters,
         query_string,
         case_count_snapshot
       )
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (user_id, query_string) DO NOTHING
       RETURNING id, name, filters, query_string, case_count_snapshot, created_at, updated_at`,
      [userId, input.name, JSON.stringify(input.filters), input.queryString, input.caseCount],
    );
    if (rows[0]) return { status: 'created', item: toSavedViewItem(rows[0]) };

    const fallback = await this.findByQueryString(userId, input.queryString);
    if (!fallback) throw new Error('saved_view_insert_failed');
    return { status: 'exists', item: fallback };
  }

  async update(
    userId: string,
    savedViewId: string,
    input: SavedViewSaveInput,
  ): Promise<SavedViewItem | 'not_found' | 'duplicate'> {
    const duplicate = await this.findByQueryString(userId, input.queryString);
    if (duplicate && duplicate.id !== savedViewId) return 'duplicate';

    const { rows } = await this.pool.query<SavedViewRow>(
      `UPDATE user_saved_views
       SET name = $3,
           filters = $4::jsonb,
           query_string = $5,
           case_count_snapshot = $6,
           updated_at = now()
       WHERE user_id = $1 AND id = $2
       RETURNING id, name, filters, query_string, case_count_snapshot, created_at, updated_at`,
      [
        userId,
        savedViewId,
        input.name,
        JSON.stringify(input.filters),
        input.queryString,
        input.caseCount,
      ],
    );
    if (!rows[0]) return 'not_found';
    return toSavedViewItem(rows[0]);
  }

  async remove(userId: string, savedViewId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM user_saved_views
       WHERE user_id = $1 AND id = $2`,
      [userId, savedViewId],
    );
    return (rowCount ?? 0) > 0;
  }

  async getAdminMetrics(): Promise<SavedViewsAdminMetrics> {
    const { rows } = await this.pool.query<{
      saved_view_count: string;
      user_ids: string[] | null;
    }>(
      `SELECT
         COUNT(*)::text AS saved_view_count,
         ARRAY_AGG(DISTINCT user_id)::text[] AS user_ids
       FROM user_saved_views`,
    );
    const savedViews = Number(rows[0]?.saved_view_count ?? 0);
    const userIds = rows[0]?.user_ids ?? [];
    const users = userIds.length;
    return {
      users,
      savedViews,
      avgSavedViewsPerUser: users > 0 ? savedViews / users : null,
      userIds,
    };
  }
}
