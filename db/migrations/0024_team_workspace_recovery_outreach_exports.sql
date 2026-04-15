ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN IF NOT EXISTS export_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMPTZ;
