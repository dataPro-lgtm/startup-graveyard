BEGIN;

CREATE TABLE IF NOT EXISTS source_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name   TEXT        NOT NULL,
  source_url    TEXT        NOT NULL,
  final_url     TEXT        NOT NULL,
  http_status   INTEGER     NOT NULL,
  content_type  TEXT,
  title         TEXT,
  excerpt       TEXT,
  content_sha256 TEXT       NOT NULL,
  snapshot_text TEXT        NOT NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_source_name
  ON source_snapshots(source_name, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_sha
  ON source_snapshots(content_sha256);

COMMIT;
