CREATE TABLE IF NOT EXISTS team_workspace_billing_states (
  workspace_id UUID PRIMARY KEY REFERENCES team_workspaces(id) ON DELETE CASCADE,
  seat_limit INTEGER NOT NULL DEFAULT 0,
  billing_status TEXT NOT NULL DEFAULT 'inactive',
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  reserved_seats INTEGER NOT NULL DEFAULT 0,
  fallback_member_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_workspace_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  event_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_workspace_billing_events_workspace_created
  ON team_workspace_billing_events (workspace_id, created_at DESC);
