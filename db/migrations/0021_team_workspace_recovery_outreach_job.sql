INSERT INTO scheduled_jobs (name, source_name, payload, cron_expr, interval_ms, next_run_at)
VALUES (
  'run_team_workspace_recovery_outreach',
  'run_team_workspace_recovery_outreach',
  '{}'::jsonb,
  '@hourly',
  3600000,
  NOW() + INTERVAL '20 minute'
)
ON CONFLICT (name) DO NOTHING;
