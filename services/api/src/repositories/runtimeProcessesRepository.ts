import type { Pool, QueryResultRow } from 'pg';

export type RuntimeComponent = 'worker' | 'scheduler';
export type RuntimeProcessStatus = 'starting' | 'idle' | 'processing' | 'error' | 'stopped';

export type RuntimeProcessHeartbeat = {
  component: RuntimeComponent;
  instanceId: string;
  status: RuntimeProcessStatus;
  startedAt: string;
  heartbeatAt: string;
  stoppedAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
};

export type RecordRuntimeHeartbeatInput = Omit<
  RuntimeProcessHeartbeat,
  'heartbeatAt' | 'stoppedAt'
> & {
  heartbeatAt?: string;
  stoppedAt?: string | null;
};

export interface RuntimeProcessesRepository {
  recordHeartbeat(input: RecordRuntimeHeartbeatInput): Promise<RuntimeProcessHeartbeat>;
  markStopped(component: RuntimeComponent, instanceId: string, stoppedAt?: string): Promise<void>;
  getLatest(component: RuntimeComponent): Promise<RuntimeProcessHeartbeat | null>;
}

export class MockRuntimeProcessesRepository implements RuntimeProcessesRepository {
  private readonly items = new Map<string, RuntimeProcessHeartbeat>();

  async recordHeartbeat(input: RecordRuntimeHeartbeatInput): Promise<RuntimeProcessHeartbeat> {
    const heartbeat: RuntimeProcessHeartbeat = {
      ...input,
      heartbeatAt: input.heartbeatAt ?? new Date().toISOString(),
      stoppedAt: input.stoppedAt ?? null,
    };
    this.items.set(`${input.component}:${input.instanceId}`, heartbeat);
    return heartbeat;
  }

  async markStopped(
    component: RuntimeComponent,
    instanceId: string,
    stoppedAt = new Date().toISOString(),
  ): Promise<void> {
    const key = `${component}:${instanceId}`;
    const current = this.items.get(key);
    if (!current) return;
    this.items.set(key, {
      ...current,
      status: 'stopped',
      heartbeatAt: stoppedAt,
      stoppedAt,
    });
  }

  async getLatest(component: RuntimeComponent): Promise<RuntimeProcessHeartbeat | null> {
    return (
      [...this.items.values()]
        .filter((item) => item.component === component)
        .sort((left, right) => right.heartbeatAt.localeCompare(left.heartbeatAt))[0] ?? null
    );
  }
}

type RuntimeProcessRow = QueryResultRow & {
  component: RuntimeComponent;
  instance_id: string;
  status: RuntimeProcessStatus;
  started_at: Date;
  heartbeat_at: Date;
  stopped_at: Date | null;
  last_error: string | null;
  metadata: unknown;
};

function metadataFromRow(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowToHeartbeat(row: RuntimeProcessRow): RuntimeProcessHeartbeat {
  return {
    component: row.component,
    instanceId: row.instance_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    heartbeatAt: row.heartbeat_at.toISOString(),
    stoppedAt: row.stopped_at?.toISOString() ?? null,
    lastError: row.last_error,
    metadata: metadataFromRow(row.metadata),
  };
}

export class PgRuntimeProcessesRepository implements RuntimeProcessesRepository {
  constructor(private readonly pool: Pool) {}

  async recordHeartbeat(input: RecordRuntimeHeartbeatInput): Promise<RuntimeProcessHeartbeat> {
    const result = await this.pool.query<RuntimeProcessRow>(
      `INSERT INTO runtime_process_heartbeats (
         component, instance_id, status, started_at, heartbeat_at, stopped_at, last_error, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (component, instance_id) DO UPDATE SET
         status = EXCLUDED.status,
         heartbeat_at = EXCLUDED.heartbeat_at,
         stopped_at = EXCLUDED.stopped_at,
         last_error = EXCLUDED.last_error,
         metadata = EXCLUDED.metadata
       RETURNING component, instance_id, status, started_at, heartbeat_at, stopped_at,
                 last_error, metadata`,
      [
        input.component,
        input.instanceId,
        input.status,
        input.startedAt,
        input.heartbeatAt ?? new Date().toISOString(),
        input.stoppedAt ?? null,
        input.lastError,
        JSON.stringify(input.metadata),
      ],
    );
    return rowToHeartbeat(result.rows[0]!);
  }

  async markStopped(
    component: RuntimeComponent,
    instanceId: string,
    stoppedAt = new Date().toISOString(),
  ): Promise<void> {
    await this.pool.query(
      `UPDATE runtime_process_heartbeats
       SET status = 'stopped', heartbeat_at = $3, stopped_at = $3
       WHERE component = $1 AND instance_id = $2`,
      [component, instanceId, stoppedAt],
    );
  }

  async getLatest(component: RuntimeComponent): Promise<RuntimeProcessHeartbeat | null> {
    const result = await this.pool.query<RuntimeProcessRow>(
      `SELECT component, instance_id, status, started_at, heartbeat_at, stopped_at,
              last_error, metadata
       FROM runtime_process_heartbeats
       WHERE component = $1
       ORDER BY heartbeat_at DESC
       LIMIT 1`,
      [component],
    );
    return result.rows[0] ? rowToHeartbeat(result.rows[0]) : null;
  }
}
