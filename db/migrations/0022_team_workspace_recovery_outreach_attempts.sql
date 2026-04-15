ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

UPDATE team_workspace_recovery_outreach_events
SET last_attempt_at = COALESCE(last_attempt_at, created_at),
    next_attempt_at = CASE
      WHEN status = 'pending' THEN COALESCE(next_attempt_at, COALESCE(last_attempt_at, created_at) + INTERVAL '24 hour')
      ELSE NULL
    END
WHERE last_attempt_at IS NULL
   OR (status = 'pending' AND next_attempt_at IS NULL);
