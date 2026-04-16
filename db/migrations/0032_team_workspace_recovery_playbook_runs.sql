CREATE TABLE IF NOT EXISTS team_workspace_recovery_playbook_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type          TEXT NOT NULL,
  retry_interval_hours  INTEGER NOT NULL DEFAULT 24 CHECK (retry_interval_hours >= 0),
  force_run             BOOLEAN NOT NULL DEFAULT FALSE,
  ok                    BOOLEAN NOT NULL,
  summary               TEXT NOT NULL,
  steps                 JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_workspace_recovery_playbook_runs_created
  ON team_workspace_recovery_playbook_runs (created_at DESC);

INSERT INTO scheduled_jobs (name, source_name, payload, cron_expr, interval_ms, next_run_at)
VALUES (
  'run_team_workspace_recovery_playbook',
  'run_team_workspace_recovery_playbook',
  '{"retryIntervalHours": 24}'::jsonb,
  '@hourly',
  3600000,
  NOW() + INTERVAL '35 minute'
)
ON CONFLICT (name) DO NOTHING;
