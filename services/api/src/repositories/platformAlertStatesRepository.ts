import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { withTransaction } from '../db/withTransaction.js';

export type PlatformAlertChannel = 'webhook' | 'slack';
export type PlatformAlertDeliverySeverity = 'warning' | 'critical';
export type PlatformAlertDeliveryStatus = 'active' | 'resolved';

export type PlatformAlertDeliveryState = {
  alertCode: string;
  channel: PlatformAlertChannel;
  severity: PlatformAlertDeliverySeverity;
  status: PlatformAlertDeliveryStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  nextAttemptAt: string | null;
  resolvedAt: string | null;
  resolutionDeliveryPending: boolean;
  deliveryCount: number;
  suppressedCount: number;
  lastError: string | null;
  metadata: Record<string, unknown>;
};

export type PlatformAlertDeliveryClaim = {
  claimed: boolean;
  reason: 'new' | 'due' | 'escalated' | 'reactivated' | 'cooldown';
  state: PlatformAlertDeliveryState;
};

export interface PlatformAlertStatesRepository {
  claimDelivery(input: {
    alertCode: string;
    channel: PlatformAlertChannel;
    severity: PlatformAlertDeliverySeverity;
    observedAt: string;
    cooldownMs: number;
    metadata: Record<string, unknown>;
  }): Promise<PlatformAlertDeliveryClaim>;
  recordDeliveryResult(input: {
    alertCode: string;
    channel: PlatformAlertChannel;
    attemptedAt: string;
    delivered: boolean;
    retryAt: string | null;
    error: string | null;
    deliveryStatus: 'firing' | 'resolved';
  }): Promise<void>;
  resolveInactive(input: {
    channel: PlatformAlertChannel;
    activeAlertCodes: string[];
    resolvedAt: string;
    retryMs: number;
  }): Promise<PlatformAlertDeliveryState[]>;
}

function severityRank(severity: PlatformAlertDeliverySeverity): number {
  return severity === 'critical' ? 2 : 1;
}

function addMilliseconds(value: string, milliseconds: number): string {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

export class MockPlatformAlertStatesRepository implements PlatformAlertStatesRepository {
  private readonly states = new Map<string, PlatformAlertDeliveryState>();

  async claimDelivery(
    input: Parameters<PlatformAlertStatesRepository['claimDelivery']>[0],
  ): Promise<PlatformAlertDeliveryClaim> {
    const key = `${input.channel}:${input.alertCode}`;
    const current = this.states.get(key);
    if (!current) {
      const state: PlatformAlertDeliveryState = {
        alertCode: input.alertCode,
        channel: input.channel,
        severity: input.severity,
        status: 'active',
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
        lastAttemptAt: input.observedAt,
        lastDeliveredAt: null,
        nextAttemptAt: addMilliseconds(input.observedAt, input.cooldownMs),
        resolvedAt: null,
        resolutionDeliveryPending: false,
        deliveryCount: 0,
        suppressedCount: 0,
        lastError: null,
        metadata: input.metadata,
      };
      this.states.set(key, state);
      return { claimed: true, reason: 'new', state };
    }

    const escalated = severityRank(input.severity) > severityRank(current.severity);
    const reactivated = current.status === 'resolved';
    const due =
      !current.nextAttemptAt || Date.parse(current.nextAttemptAt) <= Date.parse(input.observedAt);
    const claimed = escalated || reactivated || due;
    const reason: PlatformAlertDeliveryClaim['reason'] = escalated
      ? 'escalated'
      : reactivated
        ? 'reactivated'
        : due
          ? 'due'
          : 'cooldown';
    const state: PlatformAlertDeliveryState = {
      ...current,
      severity: input.severity,
      status: 'active',
      firstSeenAt: reactivated ? input.observedAt : current.firstSeenAt,
      lastSeenAt: input.observedAt,
      lastAttemptAt: claimed ? input.observedAt : current.lastAttemptAt,
      nextAttemptAt: claimed
        ? addMilliseconds(input.observedAt, input.cooldownMs)
        : current.nextAttemptAt,
      resolvedAt: null,
      resolutionDeliveryPending: false,
      suppressedCount: current.suppressedCount + (claimed ? 0 : 1),
      metadata: input.metadata,
    };
    this.states.set(key, state);
    return { claimed, reason, state };
  }

  async recordDeliveryResult(
    input: Parameters<PlatformAlertStatesRepository['recordDeliveryResult']>[0],
  ): Promise<void> {
    const key = `${input.channel}:${input.alertCode}`;
    const current = this.states.get(key);
    if (!current) return;
    this.states.set(key, {
      ...current,
      lastAttemptAt: input.attemptedAt,
      lastDeliveredAt: input.delivered ? input.attemptedAt : current.lastDeliveredAt,
      nextAttemptAt:
        input.deliveryStatus === 'resolved' && input.delivered
          ? null
          : (input.retryAt ?? current.nextAttemptAt),
      resolutionDeliveryPending:
        input.deliveryStatus === 'resolved' && input.delivered
          ? false
          : current.resolutionDeliveryPending,
      deliveryCount: current.deliveryCount + (input.delivered ? 1 : 0),
      lastError: input.error,
    });
  }

  async resolveInactive(
    input: Parameters<PlatformAlertStatesRepository['resolveInactive']>[0],
  ): Promise<PlatformAlertDeliveryState[]> {
    const active = new Set(input.activeAlertCodes);
    const resolved: PlatformAlertDeliveryState[] = [];
    for (const [key, current] of this.states) {
      if (current.channel !== input.channel) continue;
      let next = current;
      if (current.status === 'active' && !active.has(current.alertCode)) {
        next = {
          ...current,
          status: 'resolved' as const,
          resolvedAt: input.resolvedAt,
          resolutionDeliveryPending: true,
          nextAttemptAt: input.resolvedAt,
        };
      }
      if (
        next.status === 'resolved' &&
        next.resolutionDeliveryPending &&
        next.nextAttemptAt &&
        Date.parse(next.nextAttemptAt) <= Date.parse(input.resolvedAt)
      ) {
        next = {
          ...next,
          lastAttemptAt: input.resolvedAt,
          nextAttemptAt: addMilliseconds(input.resolvedAt, input.retryMs),
        };
        resolved.push(next);
      }
      this.states.set(key, next);
    }
    return resolved;
  }
}

type PlatformAlertStateRow = QueryResultRow & {
  alert_code: string;
  channel: PlatformAlertChannel;
  severity: PlatformAlertDeliverySeverity;
  status: PlatformAlertDeliveryStatus;
  first_seen_at: Date;
  last_seen_at: Date;
  last_attempt_at: Date | null;
  last_delivered_at: Date | null;
  next_attempt_at: Date | null;
  resolved_at: Date | null;
  resolution_delivery_pending: boolean;
  delivery_count: number;
  suppressed_count: number;
  last_error: string | null;
  metadata: unknown;
};

function mapMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowToState(row: PlatformAlertStateRow): PlatformAlertDeliveryState {
  return {
    alertCode: row.alert_code,
    channel: row.channel,
    severity: row.severity,
    status: row.status,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    lastAttemptAt: row.last_attempt_at?.toISOString() ?? null,
    lastDeliveredAt: row.last_delivered_at?.toISOString() ?? null,
    nextAttemptAt: row.next_attempt_at?.toISOString() ?? null,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    resolutionDeliveryPending: row.resolution_delivery_pending,
    deliveryCount: row.delivery_count,
    suppressedCount: row.suppressed_count,
    lastError: row.last_error,
    metadata: mapMetadata(row.metadata),
  };
}

async function selectForUpdate(
  client: PoolClient,
  alertCode: string,
  channel: PlatformAlertChannel,
): Promise<PlatformAlertStateRow | null> {
  const result = await client.query<PlatformAlertStateRow>(
    `SELECT * FROM platform_alert_delivery_states
     WHERE alert_code = $1 AND channel = $2
     FOR UPDATE`,
    [alertCode, channel],
  );
  return result.rows[0] ?? null;
}

export class PgPlatformAlertStatesRepository implements PlatformAlertStatesRepository {
  constructor(private readonly pool: Pool) {}

  async claimDelivery(
    input: Parameters<PlatformAlertStatesRepository['claimDelivery']>[0],
  ): Promise<PlatformAlertDeliveryClaim> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<PlatformAlertStateRow>(
        `INSERT INTO platform_alert_delivery_states (
           alert_code, channel, severity, status, first_seen_at, last_seen_at,
           last_attempt_at, next_attempt_at, metadata
         ) VALUES ($1, $2, $3, 'active', $4, $4, $4, $5, $6::jsonb)
         ON CONFLICT (alert_code, channel) DO NOTHING
         RETURNING *`,
        [
          input.alertCode,
          input.channel,
          input.severity,
          input.observedAt,
          addMilliseconds(input.observedAt, input.cooldownMs),
          JSON.stringify(input.metadata),
        ],
      );
      if (inserted.rows[0]) {
        return { claimed: true, reason: 'new' as const, state: rowToState(inserted.rows[0]!) };
      }

      const currentRow = await selectForUpdate(client, input.alertCode, input.channel);
      if (!currentRow) throw new Error('platform alert state disappeared while claiming delivery');

      const current = rowToState(currentRow);
      const escalated = severityRank(input.severity) > severityRank(current.severity);
      const reactivated = current.status === 'resolved';
      const due =
        !current.nextAttemptAt || Date.parse(current.nextAttemptAt) <= Date.parse(input.observedAt);
      const claimed = escalated || reactivated || due;
      const reason: PlatformAlertDeliveryClaim['reason'] = escalated
        ? 'escalated'
        : reactivated
          ? 'reactivated'
          : due
            ? 'due'
            : 'cooldown';
      const updated = await client.query<PlatformAlertStateRow>(
        `UPDATE platform_alert_delivery_states
         SET severity = $3,
             status = 'active',
             first_seen_at = CASE WHEN status = 'resolved' THEN $4 ELSE first_seen_at END,
             last_seen_at = $4,
             last_attempt_at = CASE WHEN $5 THEN $4 ELSE last_attempt_at END,
             next_attempt_at = CASE WHEN $5 THEN $6 ELSE next_attempt_at END,
             resolved_at = NULL,
             resolution_delivery_pending = FALSE,
             suppressed_count = suppressed_count + CASE WHEN $5 THEN 0 ELSE 1 END,
             metadata = $7::jsonb
         WHERE alert_code = $1 AND channel = $2
         RETURNING *`,
        [
          input.alertCode,
          input.channel,
          input.severity,
          input.observedAt,
          claimed,
          addMilliseconds(input.observedAt, input.cooldownMs),
          JSON.stringify(input.metadata),
        ],
      );
      return { claimed, reason, state: rowToState(updated.rows[0]!) };
    });
  }

  async recordDeliveryResult(
    input: Parameters<PlatformAlertStatesRepository['recordDeliveryResult']>[0],
  ): Promise<void> {
    await this.pool.query(
      `UPDATE platform_alert_delivery_states
       SET last_attempt_at = $3,
           last_delivered_at = CASE WHEN $4 THEN $3 ELSE last_delivered_at END,
           delivery_count = delivery_count + CASE WHEN $4 THEN 1 ELSE 0 END,
           last_error = $6,
           resolution_delivery_pending = CASE
             WHEN $7 = 'resolved' AND $4 THEN FALSE
             ELSE resolution_delivery_pending
           END,
           next_attempt_at = CASE
             WHEN $7 = 'resolved' AND $4 THEN NULL
             ELSE COALESCE($5, next_attempt_at)
           END
       WHERE alert_code = $1 AND channel = $2`,
      [
        input.alertCode,
        input.channel,
        input.attemptedAt,
        input.delivered,
        input.retryAt,
        input.error,
        input.deliveryStatus,
      ],
    );
  }

  async resolveInactive(
    input: Parameters<PlatformAlertStatesRepository['resolveInactive']>[0],
  ): Promise<PlatformAlertDeliveryState[]> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE platform_alert_delivery_states
         SET status = 'resolved',
             resolved_at = $3,
             resolution_delivery_pending = TRUE,
             next_attempt_at = $3
         WHERE channel = $1
           AND status = 'active'
           AND NOT (alert_code = ANY($2::text[]))`,
        [input.channel, input.activeAlertCodes, input.resolvedAt],
      );
      const result = await client.query<PlatformAlertStateRow>(
        `WITH due AS (
           SELECT alert_code, channel
           FROM platform_alert_delivery_states
           WHERE channel = $1
             AND status = 'resolved'
             AND resolution_delivery_pending = TRUE
             AND next_attempt_at <= $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE platform_alert_delivery_states AS states
         SET last_attempt_at = $2,
             next_attempt_at = $2::timestamptz + ($3::bigint * interval '1 millisecond')
         FROM due
         WHERE states.alert_code = due.alert_code AND states.channel = due.channel
         RETURNING states.*`,
        [input.channel, input.resolvedAt, input.retryMs],
      );
      return result.rows.map(rowToState);
    });
  }
}
