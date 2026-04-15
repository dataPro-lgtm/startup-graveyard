CREATE TABLE IF NOT EXISTS team_workspace_member_recovery_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  email_attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_email_attempt_at TIMESTAMPTZ,
  next_email_attempt_at TIMESTAMPTZ,
  last_email_delivered_at TIMESTAMPTZ,
  last_email_message_id TEXT,
  last_email_error TEXT,
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_workspace_member_recovery_pending
  ON team_workspace_member_recovery_notifications (workspace_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_team_workspace_member_recovery_workspace
  ON team_workspace_member_recovery_notifications (workspace_id, created_at DESC);
