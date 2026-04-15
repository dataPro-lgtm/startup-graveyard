CREATE TABLE IF NOT EXISTS team_workspace_recovery_outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('owner', 'admin')),
  channel TEXT NOT NULL CHECK (channel IN ('owner_banner', 'admin_queue')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  action_code TEXT CHECK (
    action_code IS NULL OR action_code IN (
      'upgrade_to_team',
      'resume_team_subscription',
      'update_payment_method',
      'renew_team_subscription',
      'free_up_seats'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_workspace_recovery_outreach_workspace_created
  ON team_workspace_recovery_outreach_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_workspace_recovery_outreach_pending
  ON team_workspace_recovery_outreach_events (status, audience, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_workspace_recovery_outreach_pending_unique
  ON team_workspace_recovery_outreach_events (workspace_id, audience)
  WHERE status = 'pending';
