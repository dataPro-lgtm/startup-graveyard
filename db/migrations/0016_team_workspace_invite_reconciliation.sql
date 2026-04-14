ALTER TABLE team_workspace_invites
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT
    CHECK (revoked_reason IN ('billing_inactive', 'seat_limit_reduced', 'accepted_elsewhere'));

ALTER TABLE team_workspace_invites
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_team_workspace_invites_workspace_status_revoked
  ON team_workspace_invites (workspace_id, status, revoked_reason, revoked_at DESC);
