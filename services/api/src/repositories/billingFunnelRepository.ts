import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  BillingFunnelAdminMetrics,
  BillingFunnelEvent,
  BillingFunnelEventSource,
  BillingFunnelEventType,
} from '@sg/shared/schemas/adminStats';

type BillingFunnelPlan = 'pro' | 'team' | null;

export type BillingFunnelUserTouch = {
  userId: string;
  type: BillingFunnelEventType;
  source: BillingFunnelEventSource;
  plan: BillingFunnelPlan;
  detail: string;
  createdAt: string;
};

export type RecordBillingFunnelEventInput = {
  userId: string;
  type: BillingFunnelEventType;
  source: BillingFunnelEventSource;
  plan?: BillingFunnelPlan;
  detail: string;
};

type BillingFunnelRow = {
  user_id: string;
  id: string;
  event_type: BillingFunnelEventType;
  event_source: BillingFunnelEventSource;
  plan: BillingFunnelPlan;
  detail: string;
  created_at: Date | string;
};

export interface BillingFunnelRepository {
  record(input: RecordBillingFunnelEventInput): Promise<void>;
  getAdminMetrics(): Promise<BillingFunnelAdminMetrics>;
  getLatestEventsByUserIds(userIds: string[]): Promise<BillingFunnelUserTouch[]>;
}

function rowToEvent(row: BillingFunnelRow): BillingFunnelEvent {
  return {
    id: row.id,
    type: row.event_type,
    source: row.event_source,
    plan: row.plan,
    detail: row.detail,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function rowToUserTouch(row: BillingFunnelRow): BillingFunnelUserTouch {
  return {
    userId: row.user_id,
    type: row.event_type,
    source: row.event_source,
    plan: row.plan,
    detail: row.detail,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function toMetrics(events: BillingFunnelEvent[]): BillingFunnelAdminMetrics {
  const checkoutStarts = events.filter((event) => event.type === 'checkout_started').length;
  const checkoutCompletions = events.filter((event) => event.type === 'checkout_completed').length;
  const proCheckoutStarts = events.filter(
    (event) => event.type === 'checkout_started' && event.plan === 'pro',
  ).length;
  const teamCheckoutStarts = events.filter(
    (event) => event.type === 'checkout_started' && event.plan === 'team',
  ).length;
  const portalStarts = events.filter((event) => event.type === 'portal_started').length;
  const recoveredSubscriptions = events.filter(
    (event) => event.type === 'subscription_recovered',
  ).length;

  return {
    checkoutStarts,
    checkoutCompletions,
    proCheckoutStarts,
    teamCheckoutStarts,
    portalStarts,
    recoveredSubscriptions,
    checkoutCompletionRate: checkoutStarts > 0 ? checkoutCompletions / checkoutStarts : null,
    teamCheckoutShare: checkoutStarts > 0 ? teamCheckoutStarts / checkoutStarts : null,
    recentEvents: events.slice(0, 12),
  };
}

export class MockBillingFunnelRepository implements BillingFunnelRepository {
  private readonly events: Array<BillingFunnelEvent & { userId: string }> = [];

  async record(input: RecordBillingFunnelEventInput): Promise<void> {
    this.events.unshift({
      userId: input.userId,
      id: randomUUID(),
      type: input.type,
      source: input.source,
      plan: input.plan ?? null,
      detail: input.detail,
      createdAt: new Date().toISOString(),
    });

    if (this.events.length > 128) {
      this.events.length = 128;
    }
  }

  async getAdminMetrics(): Promise<BillingFunnelAdminMetrics> {
    return toMetrics(this.events);
  }

  async getLatestEventsByUserIds(userIds: string[]): Promise<BillingFunnelUserTouch[]> {
    const remainingUserIds = new Set(userIds);
    const touches: BillingFunnelUserTouch[] = [];
    for (const event of this.events) {
      if (!remainingUserIds.has(event.userId)) continue;
      touches.push({
        userId: event.userId,
        type: event.type,
        source: event.source,
        plan: event.plan,
        detail: event.detail,
        createdAt: event.createdAt,
      });
      remainingUserIds.delete(event.userId);
      if (remainingUserIds.size === 0) break;
    }
    return touches;
  }
}

export class PgBillingFunnelRepository implements BillingFunnelRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: RecordBillingFunnelEventInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing_funnel_events (
         user_id,
         event_type,
         event_source,
         plan,
         detail
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [input.userId, input.type, input.source, input.plan ?? null, input.detail],
    );
  }

  async getAdminMetrics(): Promise<BillingFunnelAdminMetrics> {
    const [summaryRes, recentRes] = await Promise.all([
      this.pool.query<{
        checkout_starts: string;
        checkout_completions: string;
        pro_checkout_starts: string;
        team_checkout_starts: string;
        portal_starts: string;
        recovered_subscriptions: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'checkout_started')::text AS checkout_starts,
          COUNT(*) FILTER (WHERE event_type = 'checkout_completed')::text AS checkout_completions,
          COUNT(*) FILTER (WHERE event_type = 'checkout_started' AND plan = 'pro')::text AS pro_checkout_starts,
          COUNT(*) FILTER (WHERE event_type = 'checkout_started' AND plan = 'team')::text AS team_checkout_starts,
          COUNT(*) FILTER (WHERE event_type = 'portal_started')::text AS portal_starts,
          COUNT(*) FILTER (WHERE event_type = 'subscription_recovered')::text AS recovered_subscriptions
        FROM billing_funnel_events
      `),
      this.pool.query<BillingFunnelRow>(
        `SELECT user_id, id, event_type, event_source, plan, detail, created_at
         FROM billing_funnel_events
         ORDER BY created_at DESC
         LIMIT 12`,
      ),
    ]);

    const row = summaryRes.rows[0];
    const checkoutStarts = Number(row?.checkout_starts ?? 0);
    const checkoutCompletions = Number(row?.checkout_completions ?? 0);
    const proCheckoutStarts = Number(row?.pro_checkout_starts ?? 0);
    const teamCheckoutStarts = Number(row?.team_checkout_starts ?? 0);
    const portalStarts = Number(row?.portal_starts ?? 0);
    const recoveredSubscriptions = Number(row?.recovered_subscriptions ?? 0);

    return {
      checkoutStarts,
      checkoutCompletions,
      proCheckoutStarts,
      teamCheckoutStarts,
      portalStarts,
      recoveredSubscriptions,
      checkoutCompletionRate: checkoutStarts > 0 ? checkoutCompletions / checkoutStarts : null,
      teamCheckoutShare: checkoutStarts > 0 ? teamCheckoutStarts / checkoutStarts : null,
      recentEvents: recentRes.rows.map(rowToEvent),
    };
  }

  async getLatestEventsByUserIds(userIds: string[]): Promise<BillingFunnelUserTouch[]> {
    if (userIds.length === 0) return [];
    const { rows } = await this.pool.query<BillingFunnelRow>(
      `SELECT DISTINCT ON (user_id)
         user_id,
         id,
         event_type,
         event_source,
         plan,
         detail,
         created_at
       FROM billing_funnel_events
       WHERE user_id = ANY($1::uuid[])
       ORDER BY user_id, created_at DESC`,
      [userIds],
    );
    return rows.map(rowToUserTouch);
  }
}
