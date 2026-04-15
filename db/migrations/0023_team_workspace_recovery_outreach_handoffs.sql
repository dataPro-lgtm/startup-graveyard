ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN IF NOT EXISTS handoff_channel TEXT CHECK (
    handoff_channel IS NULL OR handoff_channel IN ('crm', 'manual_follow_up')
  ),
  ADD COLUMN IF NOT EXISTS handoff_note TEXT,
  ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;
