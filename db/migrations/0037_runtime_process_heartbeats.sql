CREATE TABLE IF NOT EXISTS runtime_process_heartbeats (
  component TEXT NOT NULL CHECK (component IN ('worker', 'scheduler')),
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'idle', 'processing', 'error', 'stopped')),
  started_at TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (component, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_runtime_process_heartbeats_latest
  ON runtime_process_heartbeats (component, heartbeat_at DESC);
