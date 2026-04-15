ALTER TABLE team_workspace_recovery_outreach_events
ADD COLUMN webhook_attempt_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN last_webhook_attempt_at TIMESTAMPTZ,
ADD COLUMN next_webhook_attempt_at TIMESTAMPTZ;
