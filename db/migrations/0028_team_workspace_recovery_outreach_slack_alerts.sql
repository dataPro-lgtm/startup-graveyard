ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN slack_alert_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_slack_alert_attempt_at TIMESTAMPTZ,
  ADD COLUMN last_slack_alerted_at TIMESTAMPTZ,
  ADD COLUMN last_slack_alert_status_code INTEGER,
  ADD COLUMN last_slack_alert_error TEXT;
