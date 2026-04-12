import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { runIngestionJob } from '../ingestion/runIngestionJob.js';
import type { AdminCaseAttachmentsRepository } from './adminCaseAttachmentsRepository.js';
import type { AdminWriteRepository } from './adminWriteRepository.js';
import type { EnqueueIngestionJobBody } from '../schemas/ingestionJobs.js';
import type { SourceSnapshotsRepository } from './sourceSnapshotsRepository.js';
import { withTransaction } from '../db/withTransaction.js';

export type ListIngestionJobsParams = {
  limit: number;
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
};

export type IngestionJobItem = {
  id: string;
  sourceName: string;
  triggerType: string;
  status: string;
  payload: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type ProcessNextStubResult =
  | { ok: true; job: IngestionJobItem }
  | { ok: false; reason: 'empty_queue' };

export interface IngestionJobsRepository {
  listRecent(params: ListIngestionJobsParams): Promise<IngestionJobItem[]>;
  getById(id: string): Promise<IngestionJobItem | null>;
  enqueue(input: EnqueueIngestionJobBody): Promise<{ id: string }>;
  /**
   * FIFO 认领 `queued` → `running`，执行 `runIngestionJob`（可能含外网 fetch），
   * 再落库 `succeeded` / `failed` 并写 `ingestion.job_succeeded` / `ingestion.job_failed`。
   */
  processNext(): Promise<ProcessNextStubResult>;
  /** 将超时仍处 `running` 的任务重置为 `queued`（便于 worker 崩溃后重试）。 */
  reclaimStaleRunning(maxRunningMinutes: number): Promise<{
    reclaimed: number;
    jobIds: string[];
  }>;
  /** 仅 `failed` → `queued`，清空时间与错误；写审计 `ingestion.job_requeued`。 */
  requeueFailed(id: string): Promise<IngestionJobItem | null>;
}

type JobRow = QueryResultRow & {
  id: string;
  source_name: string;
  trigger_type: string;
  status: string;
  payload: unknown;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  created_at: Date;
};

function mapPayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function rowToItem(row: JobRow): IngestionJobItem {
  return {
    id: row.id,
    sourceName: row.source_name,
    triggerType: row.trigger_type,
    status: row.status,
    payload: mapPayload(row.payload),
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
  };
}

export class MockIngestionJobsRepository implements IngestionJobsRepository {
  private readonly jobs: IngestionJobItem[] = [];

  constructor(
    private readonly adminWrite?: AdminWriteRepository,
    private readonly adminAttachments?: AdminCaseAttachmentsRepository,
    private readonly sourceSnapshots?: SourceSnapshotsRepository,
  ) {}

  async listRecent(params: ListIngestionJobsParams): Promise<IngestionJobItem[]> {
    let rows = this.jobs;
    if (params.status) {
      rows = rows.filter((j) => j.status === params.status);
    }
    return rows.slice(0, params.limit);
  }

  async getById(id: string): Promise<IngestionJobItem | null> {
    return this.jobs.find((j) => j.id === id) ?? null;
  }

  async enqueue(input: EnqueueIngestionJobBody): Promise<{ id: string }> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.jobs.unshift({
      id,
      sourceName: input.sourceName,
      triggerType: input.triggerType,
      status: 'queued',
      payload: input.payload ?? {},
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      createdAt: now,
    });
    return { id };
  }

  async processNext(): Promise<ProcessNextStubResult> {
    let idx = -1;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      if (this.jobs[i]!.status === 'queued') {
        idx = i;
        break;
      }
    }
    if (idx < 0) return { ok: false, reason: 'empty_queue' };
    const cur = this.jobs[idx]!;
    const claimedJobId = cur.id;
    const now = new Date().toISOString();
    this.jobs[idx] = {
      ...cur,
      status: 'running',
      startedAt: cur.startedAt ?? now,
    };

    const runResult = await runIngestionJob(
      {
        sourceName: cur.sourceName,
        triggerType: cur.triggerType,
        payload: cur.payload,
      },
      {
        adminWrite: this.adminWrite,
        adminAttachments: this.adminAttachments,
        sourceSnapshots: this.sourceSnapshots,
        ingestionJobs: this,
      },
    );

    const doneAt = new Date().toISOString();
    const baseIdx = this.jobs.findIndex((job) => job.id === claimedJobId);
    if (baseIdx < 0) {
      throw new Error('mock ingestion job missing after execution');
    }
    const base = this.jobs[baseIdx]!;
    if (runResult.ok) {
      this.jobs[baseIdx] = {
        ...base,
        status: 'succeeded',
        finishedAt: doneAt,
        errorMessage: null,
      };
    } else {
      this.jobs[baseIdx] = {
        ...base,
        status: 'failed',
        finishedAt: doneAt,
        errorMessage: runResult.error,
      };
    }
    return { ok: true, job: this.jobs[baseIdx]! };
  }

  async reclaimStaleRunning(maxRunningMinutes: number): Promise<{
    reclaimed: number;
    jobIds: string[];
  }> {
    const cutoff = Date.now() - maxRunningMinutes * 60_000;
    const jobIds: string[] = [];
    for (let i = 0; i < this.jobs.length; i++) {
      const j = this.jobs[i]!;
      if (j.status !== 'running' || !j.startedAt) continue;
      const t = Date.parse(j.startedAt);
      if (Number.isFinite(t) && t < cutoff) {
        this.jobs[i] = {
          ...j,
          status: 'queued',
          startedAt: null,
          errorMessage: null,
        };
        jobIds.push(j.id);
      }
    }
    return { reclaimed: jobIds.length, jobIds };
  }

  async requeueFailed(id: string): Promise<IngestionJobItem | null> {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx < 0) return null;
    const j = this.jobs[idx]!;
    if (j.status !== 'failed') return null;
    const next: IngestionJobItem = {
      ...j,
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
    };
    this.jobs[idx] = next;
    return next;
  }
}

export class PgIngestionJobsRepository implements IngestionJobsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly adminWrite?: AdminWriteRepository,
    private readonly adminAttachments?: AdminCaseAttachmentsRepository,
    private readonly sourceSnapshots?: SourceSnapshotsRepository,
  ) {}

  async listRecent(params: ListIngestionJobsParams): Promise<IngestionJobItem[]> {
    const res = await this.pool.query<JobRow>(
      `
      SELECT id, source_name, trigger_type, status, payload,
             started_at, finished_at, error_message, created_at
      FROM ingestion_jobs
      WHERE ($2::text IS NULL OR status = $2::text)
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [params.limit, params.status ?? null],
    );
    return res.rows.map(rowToItem);
  }

  async getById(id: string): Promise<IngestionJobItem | null> {
    const res = await this.pool.query<JobRow>(
      `
      SELECT id, source_name, trigger_type, status, payload,
             started_at, finished_at, error_message, created_at
      FROM ingestion_jobs
      WHERE id = $1
      `,
      [id],
    );
    const row = res.rows[0];
    return row ? rowToItem(row) : null;
  }

  async enqueue(input: EnqueueIngestionJobBody): Promise<{ id: string }> {
    return withTransaction(this.pool, async (client) => {
      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO ingestion_jobs (source_name, trigger_type, status, payload)
        VALUES ($1, $2, 'queued', $3::jsonb)
        RETURNING id
        `,
        [input.sourceName, input.triggerType, JSON.stringify(input.payload ?? {})],
      );
      const id = ins.rows[0]!.id;
      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, NULL, NULL, $2::jsonb)`,
        [
          'ingestion.job_queued',
          JSON.stringify({
            jobId: id,
            sourceName: input.sourceName,
            triggerType: input.triggerType,
          }),
        ],
      );
      return { id };
    });
  }

  async processNext(): Promise<ProcessNextStubResult> {
    // Phase 1: claim a queued job atomically
    const claimed = await withTransaction(this.pool, async (client) => {
      const claim = await client.query<JobRow>(
        `
        WITH picked AS (
          SELECT id FROM ingestion_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ingestion_jobs j
        SET status = 'running', started_at = COALESCE(j.started_at, NOW())
        FROM picked
        WHERE j.id = picked.id
        RETURNING j.id, j.source_name, j.trigger_type, j.status, j.payload,
                  j.started_at, j.finished_at, j.error_message, j.created_at
        `,
      );
      return (claim.rowCount ?? 0) === 0 ? null : claim.rows[0]!;
    });

    if (!claimed) return { ok: false, reason: 'empty_queue' };

    // Phase 2: execute job (outside transaction — may do network calls)
    const runResult = await runIngestionJob(
      {
        sourceName: claimed.source_name,
        triggerType: claimed.trigger_type,
        payload: mapPayload(claimed.payload),
      },
      {
        adminWrite: this.adminWrite,
        adminAttachments: this.adminAttachments,
        sourceSnapshots: this.sourceSnapshots,
        ingestionJobs: this,
        pool: this.pool,
      },
    );

    // Phase 3: persist outcome
    await withTransaction(this.pool, async (client) => {
      const id = claimed.id;
      if (runResult.ok) {
        await client.query(
          `UPDATE ingestion_jobs SET status = 'succeeded', finished_at = NOW(), error_message = NULL WHERE id = $1`,
          [id],
        );
        await client.query(
          `INSERT INTO admin_audit_events (action, review_id, case_id, metadata) VALUES ($1, NULL, NULL, $2::jsonb)`,
          [
            'ingestion.job_succeeded',
            JSON.stringify({
              jobId: id,
              sourceName: claimed.source_name,
              triggerType: claimed.trigger_type,
              detail: runResult.detail ?? null,
            }),
          ],
        );
      } else {
        await client.query(
          `UPDATE ingestion_jobs SET status = 'failed', finished_at = NOW(), error_message = $2 WHERE id = $1`,
          [id, runResult.error],
        );
        await client.query(
          `INSERT INTO admin_audit_events (action, review_id, case_id, metadata) VALUES ($1, NULL, NULL, $2::jsonb)`,
          [
            'ingestion.job_failed',
            JSON.stringify({
              jobId: id,
              sourceName: claimed.source_name,
              triggerType: claimed.trigger_type,
              error: runResult.error,
            }),
          ],
        );
      }
    });

    const sel = await this.pool.query<JobRow>(
      `SELECT id, source_name, trigger_type, status, payload,
              started_at, finished_at, error_message, created_at
       FROM ingestion_jobs WHERE id = $1`,
      [claimed.id],
    );
    const row = sel.rows[0];
    if (!row) throw new Error('ingestion job row missing after finalize');
    return { ok: true, job: rowToItem(row) };
  }

  async reclaimStaleRunning(maxRunningMinutes: number): Promise<{
    reclaimed: number;
    jobIds: string[];
  }> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<{ id: string }>(
        `
        WITH stale AS (
          SELECT id FROM ingestion_jobs
          WHERE status = 'running'
            AND started_at IS NOT NULL
            AND started_at < NOW() - ($1 * INTERVAL '1 minute')
          LIMIT 500
        ),
        upd AS (
          UPDATE ingestion_jobs j
          SET status = 'queued', started_at = NULL, error_message = NULL
          FROM stale s WHERE j.id = s.id
          RETURNING j.id
        )
        SELECT id FROM upd
        `,
        [maxRunningMinutes],
      );
      const jobIds = res.rows.map((r) => r.id);
      if (jobIds.length > 0) {
        await client.query(
          `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
           VALUES ($1, NULL, NULL, $2::jsonb)`,
          [
            'ingestion.jobs_reclaimed_stale',
            JSON.stringify({ count: jobIds.length, jobIds, maxRunningMinutes }),
          ],
        );
      }
      return { reclaimed: jobIds.length, jobIds };
    });
  }

  async requeueFailed(id: string): Promise<IngestionJobItem | null> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<JobRow>(
        `
        UPDATE ingestion_jobs
        SET status = 'queued', started_at = NULL, finished_at = NULL, error_message = NULL
        WHERE id = $1 AND status = 'failed'
        RETURNING id, source_name, trigger_type, status, payload,
                  started_at, finished_at, error_message, created_at
        `,
        [id],
      );
      const row = res.rows[0];
      if (!row) return null;

      await client.query(
        `INSERT INTO admin_audit_events (action, review_id, case_id, metadata)
         VALUES ($1, NULL, NULL, $2::jsonb)`,
        ['ingestion.job_requeued', JSON.stringify({ jobId: id })],
      );
      return rowToItem(row);
    });
  }
}
