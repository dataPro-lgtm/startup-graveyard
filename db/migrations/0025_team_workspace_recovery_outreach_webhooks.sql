ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN webhook_delivery_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_webhook_delivered_at TIMESTAMPTZ,
  ADD COLUMN last_webhook_status_code INTEGER,
  ADD COLUMN last_webhook_error TEXT;
