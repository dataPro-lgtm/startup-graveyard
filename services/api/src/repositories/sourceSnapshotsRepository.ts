import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';

export type SaveSourceSnapshotInput = {
  sourceName: string;
  sourceUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  title: string | null;
  excerpt: string | null;
  contentSha256: string;
  snapshotText: string;
  metadata: Record<string, unknown>;
};

export type SourceSnapshotItem = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  title: string | null;
  excerpt: string | null;
  contentSha256: string;
  metadata: Record<string, unknown>;
  fetchedAt: string;
  createdAt: string;
};

export type ListSourceSnapshotsParams = {
  limit: number;
  sourceName?: string;
};

export type SourceSnapshotRecord = SourceSnapshotItem & {
  snapshotText: string;
};

export interface SourceSnapshotsRepository {
  save(input: SaveSourceSnapshotInput): Promise<SourceSnapshotItem>;
  listRecent(params: ListSourceSnapshotsParams): Promise<SourceSnapshotItem[]>;
  getById(id: string): Promise<SourceSnapshotRecord | null>;
}

type SnapshotRow = QueryResultRow & {
  id: string;
  source_name: string;
  source_url: string;
  final_url: string;
  http_status: number;
  content_type: string | null;
  title: string | null;
  excerpt: string | null;
  content_sha256: string;
  snapshot_text: string;
  metadata: unknown;
  fetched_at: Date;
  created_at: Date;
};

function mapMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function rowToItem(row: SnapshotRow): SourceSnapshotItem {
  return {
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    finalUrl: row.final_url,
    httpStatus: row.http_status,
    contentType: row.content_type,
    title: row.title,
    excerpt: row.excerpt,
    contentSha256: row.content_sha256,
    metadata: mapMetadata(row.metadata),
    fetchedAt: row.fetched_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function rowToRecord(row: SnapshotRow): SourceSnapshotRecord {
  return {
    ...rowToItem(row),
    snapshotText: row.snapshot_text,
  };
}

export class MockSourceSnapshotsRepository implements SourceSnapshotsRepository {
  private readonly items: Array<SourceSnapshotItem & { snapshotText: string }> = [];

  async save(input: SaveSourceSnapshotInput): Promise<SourceSnapshotItem> {
    const item: SourceSnapshotItem & { snapshotText: string } = {
      id: randomUUID(),
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      finalUrl: input.finalUrl,
      httpStatus: input.httpStatus,
      contentType: input.contentType,
      title: input.title,
      excerpt: input.excerpt,
      contentSha256: input.contentSha256,
      metadata: input.metadata,
      fetchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      snapshotText: input.snapshotText,
    };
    this.items.unshift(item);
    const { snapshotText: _snapshotText, ...publicItem } = item;
    return publicItem;
  }

  async listRecent(params: ListSourceSnapshotsParams): Promise<SourceSnapshotItem[]> {
    let rows = this.items;
    if (params.sourceName) {
      rows = rows.filter((item) => item.sourceName === params.sourceName);
    }
    return rows.slice(0, params.limit).map(({ snapshotText: _snapshotText, ...publicItem }) => publicItem);
  }

  async getById(id: string): Promise<SourceSnapshotRecord | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }
}

export class PgSourceSnapshotsRepository implements SourceSnapshotsRepository {
  constructor(private readonly pool: Pool) {}

  async save(input: SaveSourceSnapshotInput): Promise<SourceSnapshotItem> {
    const res = await this.pool.query<SnapshotRow>(
      `
      INSERT INTO source_snapshots (
        source_name, source_url, final_url, http_status, content_type,
        title, excerpt, content_sha256, snapshot_text, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10::jsonb
      )
      RETURNING id, source_name, source_url, final_url, http_status, content_type,
                title, excerpt, content_sha256, snapshot_text, metadata, fetched_at, created_at
      `,
      [
        input.sourceName,
        input.sourceUrl,
        input.finalUrl,
        input.httpStatus,
        input.contentType,
        input.title,
        input.excerpt,
        input.contentSha256,
        input.snapshotText,
        JSON.stringify(input.metadata),
      ],
    );
    return rowToItem(res.rows[0]!);
  }

  async listRecent(params: ListSourceSnapshotsParams): Promise<SourceSnapshotItem[]> {
    const res = await this.pool.query<SnapshotRow>(
      `
      SELECT id, source_name, source_url, final_url, http_status, content_type,
             title, excerpt, content_sha256, snapshot_text, metadata, fetched_at, created_at
      FROM source_snapshots
      WHERE ($2::text IS NULL OR source_name = $2::text)
      ORDER BY fetched_at DESC, created_at DESC
      LIMIT $1
      `,
      [params.limit, params.sourceName ?? null],
    );
    return res.rows.map(rowToItem);
  }

  async getById(id: string): Promise<SourceSnapshotRecord | null> {
    const res = await this.pool.query<SnapshotRow>(
      `
      SELECT id, source_name, source_url, final_url, http_status, content_type,
             title, excerpt, content_sha256, snapshot_text, metadata, fetched_at, created_at
      FROM source_snapshots
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );
    const row = res.rows[0];
    return row ? rowToRecord(row) : null;
  }
}
