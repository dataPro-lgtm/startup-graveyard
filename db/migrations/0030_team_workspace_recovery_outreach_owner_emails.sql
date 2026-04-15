ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN email_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_email_attempt_at timestamptz,
  ADD COLUMN next_email_attempt_at timestamptz,
  ADD COLUMN last_email_delivered_at timestamptz,
  ADD COLUMN last_email_message_id text,
  ADD COLUMN last_email_error text;
