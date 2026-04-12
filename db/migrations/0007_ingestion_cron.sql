-- ── Ingestion Scheduler Support ──────────────────────────────────────────────
-- Adds a scheduled_jobs table for simple cron-like recurring jobs
-- (no pg_cron dependency — job dispatch handled by API process)

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  source_name   TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  cron_expr     TEXT NOT NULL,              -- human-readable, e.g. '@daily' or '0 2 * * *'
  interval_ms   INTEGER NOT NULL,           -- milliseconds between runs
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default jobs
INSERT INTO scheduled_jobs (name, source_name, payload, cron_expr, interval_ms, next_run_at)
VALUES
  ('auto_embed_new_cases', 'auto_embed_new', '{}', '@daily', 86400000, NOW() + INTERVAL '1 minute'),
  ('cleanup_expired_sessions', 'cleanup_sessions', '{}', '@daily', 86400000, NOW() + INTERVAL '1 hour')
ON CONFLICT (name) DO NOTHING;
