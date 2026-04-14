import type { Pool } from 'pg';
import type { BillingStatus, SubscriptionTier } from '@sg/shared/billing';
import type { CasesRepository } from './casesRepository.js';

export type WatchlistItem = {
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
  addedAt: string;
};

export type WatchlistSummary = {
  subscription: SubscriptionTier;
  billingStatus: BillingStatus;
  watchlistCount: number;
  watchlistLimit: number;
  remainingSlots: number;
  canUseWatchlist: boolean;
  canAddMore: boolean;
  requiredTier: SubscriptionTier | null;
};

export type WatchlistAdminMetrics = {
  users: number;
  entries: number;
  avgEntriesPerUser: number | null;
  userIds: string[];
};

export interface WatchlistsRepository {
  listByUserId(userId: string): Promise<WatchlistItem[]>;
  has(userId: string, caseId: string): Promise<boolean>;
  add(userId: string, caseId: string): Promise<'added' | 'exists' | 'case_not_found'>;
  remove(userId: string, caseId: string): Promise<boolean>;
  countByUserId(userId: string): Promise<number>;
  getAdminMetrics(): Promise<WatchlistAdminMetrics>;
}

type WatchlistRow = {
  added_at: Date | string;
  id: string;
  slug: string;
  company_name: string;
  industry_key: string;
  country_code: string | null;
  closed_year: number | null;
  summary: string;
  business_model_key: string | null;
  founded_year: number | null;
  total_funding_usd: string | number | null;
  primary_failure_reason_key: string | null;
};

function numberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToItem(row: WatchlistRow): WatchlistItem {
  const addedAt =
    row.added_at instanceof Date
      ? row.added_at.toISOString()
      : typeof row.added_at === 'string'
        ? new Date(row.added_at).toISOString()
        : new Date(String(row.added_at)).toISOString();
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
    totalFundingUsd: numberOrNull(row.total_funding_usd),
    primaryFailureReasonKey: row.primary_failure_reason_key,
    addedAt,
  };
}

export class MockWatchlistsRepository implements WatchlistsRepository {
  private readonly itemsByUser = new Map<string, Array<{ caseId: string; addedAt: string }>>();

  constructor(private readonly casesRepo: CasesRepository) {}

  async listByUserId(userId: string): Promise<WatchlistItem[]> {
    const entries = this.itemsByUser.get(userId) ?? [];
    if (entries.length === 0) return [];
    const cases = await this.casesRepo.getByIds(entries.map((entry) => entry.caseId));
    const byId = new Map(cases.map((item) => [item.id, item]));
    return entries
      .map((entry) => {
        const item = byId.get(entry.caseId);
        if (!item) return null;
        return {
          id: item.id,
          slug: item.slug,
          companyName: item.companyName,
          industry: item.industry,
          country: item.country,
          closedYear: item.closedYear,
          summary: item.summary,
          businessModelKey: item.businessModelKey,
          foundedYear: item.foundedYear,
          totalFundingUsd: item.totalFundingUsd,
          primaryFailureReasonKey: item.primaryFailureReasonKey,
          addedAt: entry.addedAt,
        } satisfies WatchlistItem;
      })
      .filter((item): item is WatchlistItem => item !== null);
  }

  async has(userId: string, caseId: string): Promise<boolean> {
    const entries = this.itemsByUser.get(userId) ?? [];
    return entries.some((entry) => entry.caseId === caseId);
  }

  async add(userId: string, caseId: string): Promise<'added' | 'exists' | 'case_not_found'> {
    if (!(await this.casesRepo.caseExists(caseId))) return 'case_not_found';
    const current = this.itemsByUser.get(userId) ?? [];
    if (current.some((entry) => entry.caseId === caseId)) return 'exists';
    this.itemsByUser.set(userId, [{ caseId, addedAt: new Date().toISOString() }, ...current]);
    return 'added';
  }

  async remove(userId: string, caseId: string): Promise<boolean> {
    const current = this.itemsByUser.get(userId) ?? [];
    const next = current.filter((entry) => entry.caseId !== caseId);
    this.itemsByUser.set(userId, next);
    return next.length !== current.length;
  }

  async countByUserId(userId: string): Promise<number> {
    return (this.itemsByUser.get(userId) ?? []).length;
  }

  async getAdminMetrics(): Promise<WatchlistAdminMetrics> {
    const activeEntries = [...this.itemsByUser.entries()].filter(([, items]) => items.length > 0);
    const users = activeEntries.length;
    const entries = activeEntries.reduce((sum, [, items]) => sum + items.length, 0);
    return {
      users,
      entries,
      avgEntriesPerUser: users > 0 ? entries / users : null,
      userIds: activeEntries.map(([userId]) => userId),
    };
  }
}

export class PgWatchlistsRepository implements WatchlistsRepository {
  constructor(private readonly pool: Pool) {}

  async listByUserId(userId: string): Promise<WatchlistItem[]> {
    const { rows } = await this.pool.query<WatchlistRow>(
      `SELECT
         w.created_at AS added_at,
         c.id,
         c.slug,
         c.company_name,
         c.industry_key,
         c.country_code,
         c.closed_year,
         c.summary,
         c.business_model_key,
         c.founded_year,
         c.total_funding_usd,
         c.primary_failure_reason_key
       FROM user_watchlist_entries w
       JOIN cases c
         ON c.id = w.case_id
        AND c.published_at IS NOT NULL
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId],
    );
    return rows.map(rowToItem);
  }

  async has(userId: string, caseId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1
       FROM user_watchlist_entries
       WHERE user_id = $1 AND case_id = $2
       LIMIT 1`,
      [userId, caseId],
    );
    return (rowCount ?? 0) > 0;
  }

  async add(userId: string, caseId: string): Promise<'added' | 'exists' | 'case_not_found'> {
    const { rowCount: caseCount } = await this.pool.query(
      `SELECT 1
       FROM cases
       WHERE id = $1
         AND published_at IS NOT NULL`,
      [caseId],
    );
    if ((caseCount ?? 0) === 0) return 'case_not_found';

    const { rowCount } = await this.pool.query(
      `INSERT INTO user_watchlist_entries (user_id, case_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, case_id) DO NOTHING`,
      [userId, caseId],
    );
    return (rowCount ?? 0) > 0 ? 'added' : 'exists';
  }

  async remove(userId: string, caseId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM user_watchlist_entries
       WHERE user_id = $1 AND case_id = $2`,
      [userId, caseId],
    );
    return (rowCount ?? 0) > 0;
  }

  async countByUserId(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM user_watchlist_entries
       WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async getAdminMetrics(): Promise<WatchlistAdminMetrics> {
    const [{ rows: userRows }, { rows: entryRows }] = await Promise.all([
      this.pool.query<{ user_count: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS user_count
         FROM user_watchlist_entries`,
      ),
      this.pool.query<{ entry_count: string; user_ids: string[] | null }>(
        `SELECT
           COUNT(*)::text AS entry_count,
           ARRAY_AGG(DISTINCT user_id)::text[] AS user_ids
         FROM user_watchlist_entries`,
      ),
    ]);
    const users = Number(userRows[0]?.user_count ?? 0);
    const entries = Number(entryRows[0]?.entry_count ?? 0);
    return {
      users,
      entries,
      avgEntriesPerUser: users > 0 ? entries / users : null,
      userIds: entryRows[0]?.user_ids ?? [],
    };
  }
}
