INSERT INTO scheduled_jobs (name, source_name, payload, cron_expr, interval_ms, next_run_at)
VALUES (
  'reconcile_team_workspace_billing',
  'reconcile_team_workspace_billing',
  '{}'::jsonb,
  '@hourly',
  3600000,
  NOW() + INTERVAL '10 minute'
)
ON CONFLICT (name) DO NOTHING;
