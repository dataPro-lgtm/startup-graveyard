INSERT INTO scheduled_jobs (name, source_name, payload, cron_expr, interval_ms, next_run_at)
VALUES (
  'capture_platform_snapshot',
  'capture_platform_snapshot',
  '{}'::jsonb,
  '*/30 * * * *',
  1800000,
  NOW() + INTERVAL '15 minute'
)
ON CONFLICT (name) DO NOTHING;
