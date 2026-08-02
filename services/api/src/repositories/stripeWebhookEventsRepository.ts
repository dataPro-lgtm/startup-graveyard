import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export type StripeWebhookEventStatus = 'processing' | 'processed' | 'failed';

export type StripeWebhookEventRecord = {
  eventId: string;
  eventType: string;
  objectId: string | null;
  livemode: boolean;
  status: StripeWebhookEventStatus;
  attemptCount: number;
  claimToken: string;
  claimedAt: string;
  processedAt: string | null;
  lastError: string | null;
  receivedAt: string;
  updatedAt: string;
};

export type StripeWebhookEventMetrics = {
  total: number;
  processing: number;
  staleProcessing: number;
  processed: number;
  failed: number;
  retried: number;
  lastReceivedAt: string | null;
  recentFailures: Array<{
    eventId: string;
    eventType: string;
    attemptCount: number;
    lastError: string;
    updatedAt: string;
  }>;
};

export type ClaimStripeWebhookEventInput = {
  eventId: string;
  eventType: string;
  objectId?: string | null;
  livemode: boolean;
  leaseSeconds?: number;
};

export type ClaimStripeWebhookEventResult =
  | { acquired: true; record: StripeWebhookEventRecord }
  | { acquired: false; reason: 'processed' | 'in_progress'; record: StripeWebhookEventRecord };

export interface StripeWebhookEventsRepository {
  claim(input: ClaimStripeWebhookEventInput): Promise<ClaimStripeWebhookEventResult>;
  markProcessed(eventId: string, claimToken: string): Promise<boolean>;
  markFailed(eventId: string, claimToken: string, error: string): Promise<boolean>;
  getById(eventId: string): Promise<StripeWebhookEventRecord | null>;
  getMetrics(): Promise<StripeWebhookEventMetrics>;
}

type StripeWebhookEventRow = {
  event_id: string;
  event_type: string;
  object_id: string | null;
  livemode: boolean;
  status: StripeWebhookEventStatus;
  attempt_count: number;
  claim_token: string;
  claimed_at: Date | string;
  processed_at: Date | string | null;
  last_error: string | null;
  received_at: Date | string;
  updated_at: Date | string;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToRecord(row: StripeWebhookEventRow): StripeWebhookEventRecord {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    objectId: row.object_id,
    livemode: row.livemode,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    claimToken: row.claim_token,
    claimedAt: iso(row.claimed_at),
    processedAt: row.processed_at ? iso(row.processed_at) : null,
    lastError: row.last_error,
    receivedAt: iso(row.received_at),
    updatedAt: iso(row.updated_at),
  };
}

export class MockStripeWebhookEventsRepository implements StripeWebhookEventsRepository {
  private readonly events = new Map<string, StripeWebhookEventRecord>();

  async claim(input: ClaimStripeWebhookEventInput): Promise<ClaimStripeWebhookEventResult> {
    const current = this.events.get(input.eventId);
    const now = new Date();
    const leaseMs = (input.leaseSeconds ?? 300) * 1000;
    if (current?.status === 'processed') {
      return { acquired: false, reason: 'processed', record: current };
    }
    if (
      current?.status === 'processing' &&
      now.getTime() - new Date(current.claimedAt).getTime() < leaseMs
    ) {
      return { acquired: false, reason: 'in_progress', record: current };
    }
    const timestamp = now.toISOString();
    const record: StripeWebhookEventRecord = {
      eventId: input.eventId,
      eventType: input.eventType,
      objectId: input.objectId ?? null,
      livemode: input.livemode,
      status: 'processing',
      attemptCount: (current?.attemptCount ?? 0) + 1,
      claimToken: randomUUID(),
      claimedAt: timestamp,
      processedAt: null,
      lastError: null,
      receivedAt: current?.receivedAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.events.set(input.eventId, record);
    return { acquired: true, record };
  }

  async markProcessed(eventId: string, claimToken: string): Promise<boolean> {
    const current = this.events.get(eventId);
    if (!current || current.status !== 'processing' || current.claimToken !== claimToken)
      return false;
    const timestamp = new Date().toISOString();
    this.events.set(eventId, {
      ...current,
      status: 'processed',
      processedAt: timestamp,
      lastError: null,
      updatedAt: timestamp,
    });
    return true;
  }

  async markFailed(eventId: string, claimToken: string, error: string): Promise<boolean> {
    const current = this.events.get(eventId);
    if (!current || current.status !== 'processing' || current.claimToken !== claimToken)
      return false;
    this.events.set(eventId, {
      ...current,
      status: 'failed',
      lastError: error.slice(0, 2_000),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async getById(eventId: string): Promise<StripeWebhookEventRecord | null> {
    return this.events.get(eventId) ?? null;
  }

  async getMetrics(): Promise<StripeWebhookEventMetrics> {
    const events = [...this.events.values()];
    const staleBefore = Date.now() - 5 * 60_000;
    return {
      total: events.length,
      processing: events.filter((event) => event.status === 'processing').length,
      staleProcessing: events.filter(
        (event) =>
          event.status === 'processing' && new Date(event.claimedAt).getTime() < staleBefore,
      ).length,
      processed: events.filter((event) => event.status === 'processed').length,
      failed: events.filter((event) => event.status === 'failed').length,
      retried: events.filter((event) => event.attemptCount > 1).length,
      lastReceivedAt:
        events.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]?.receivedAt ?? null,
      recentFailures: events
        .filter((event) => event.status === 'failed' && event.lastError)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 10)
        .map((event) => ({
          eventId: event.eventId,
          eventType: event.eventType,
          attemptCount: event.attemptCount,
          lastError: event.lastError!,
          updatedAt: event.updatedAt,
        })),
    };
  }
}

export class PgStripeWebhookEventsRepository implements StripeWebhookEventsRepository {
  constructor(private readonly pool: Pool) {}

  async claim(input: ClaimStripeWebhookEventInput): Promise<ClaimStripeWebhookEventResult> {
    const leaseSeconds = input.leaseSeconds ?? 300;
    const claimToken = randomUUID();
    const claimed = await this.pool.query<StripeWebhookEventRow>(
      `INSERT INTO stripe_webhook_events (
         event_id, event_type, object_id, livemode, status, claim_token
       )
       VALUES ($1, $2, $3, $4, 'processing', $5)
       ON CONFLICT (event_id) DO UPDATE
       SET event_type = EXCLUDED.event_type,
           object_id = EXCLUDED.object_id,
           livemode = EXCLUDED.livemode,
           status = 'processing',
           claim_token = EXCLUDED.claim_token,
           attempt_count = stripe_webhook_events.attempt_count + 1,
           claimed_at = NOW(),
           processed_at = NULL,
           last_error = NULL,
           updated_at = NOW()
       WHERE stripe_webhook_events.status = 'failed'
          OR (
            stripe_webhook_events.status = 'processing'
            AND stripe_webhook_events.claimed_at < NOW() - ($6 * INTERVAL '1 second')
          )
       RETURNING *`,
      [
        input.eventId,
        input.eventType,
        input.objectId ?? null,
        input.livemode,
        claimToken,
        leaseSeconds,
      ],
    );
    if (claimed.rows[0]) return { acquired: true, record: rowToRecord(claimed.rows[0]) };

    const current = await this.getById(input.eventId);
    if (!current) throw new Error(`stripe event claim lost: ${input.eventId}`);
    return {
      acquired: false,
      reason: current.status === 'processed' ? 'processed' : 'in_progress',
      record: current,
    };
  }

  async markProcessed(eventId: string, claimToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE stripe_webhook_events
       SET status = 'processed', processed_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE event_id = $1 AND claim_token = $2 AND status = 'processing'`,
      [eventId, claimToken],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(eventId: string, claimToken: string, error: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE stripe_webhook_events
       SET status = 'failed', last_error = $3, updated_at = NOW()
       WHERE event_id = $1 AND claim_token = $2 AND status = 'processing'`,
      [eventId, claimToken, error.slice(0, 2_000)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getById(eventId: string): Promise<StripeWebhookEventRecord | null> {
    const { rows } = await this.pool.query<StripeWebhookEventRow>(
      'SELECT * FROM stripe_webhook_events WHERE event_id = $1',
      [eventId],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async getMetrics(): Promise<StripeWebhookEventMetrics> {
    const [summary, recentFailures] = await Promise.all([
      this.pool.query<{
        total: string;
        processing: string;
        stale_processing: string;
        processed: string;
        failed: string;
        retried: string;
        last_received_at: Date | string | null;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE status = 'processing')::text AS processing,
           COUNT(*) FILTER (
             WHERE status = 'processing' AND claimed_at < NOW() - INTERVAL '5 minutes'
           )::text AS stale_processing,
           COUNT(*) FILTER (WHERE status = 'processed')::text AS processed,
           COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
           COUNT(*) FILTER (WHERE attempt_count > 1)::text AS retried,
           MAX(received_at) AS last_received_at
         FROM stripe_webhook_events`,
      ),
      this.pool.query<{
        event_id: string;
        event_type: string;
        attempt_count: number;
        last_error: string;
        updated_at: Date | string;
      }>(
        `SELECT event_id, event_type, attempt_count, last_error, updated_at
         FROM stripe_webhook_events
         WHERE status = 'failed' AND last_error IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT 10`,
      ),
    ]);
    const row = summary.rows[0];
    return {
      total: Number(row?.total ?? 0),
      processing: Number(row?.processing ?? 0),
      staleProcessing: Number(row?.stale_processing ?? 0),
      processed: Number(row?.processed ?? 0),
      failed: Number(row?.failed ?? 0),
      retried: Number(row?.retried ?? 0),
      lastReceivedAt: row?.last_received_at ? iso(row.last_received_at) : null,
      recentFailures: recentFailures.rows.map((event) => ({
        eventId: event.event_id,
        eventType: event.event_type,
        attemptCount: Number(event.attempt_count),
        lastError: event.last_error,
        updatedAt: iso(event.updated_at),
      })),
    };
  }
}
