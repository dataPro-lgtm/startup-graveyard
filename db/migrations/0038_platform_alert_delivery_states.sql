CREATE TABLE IF NOT EXISTS platform_alert_delivery_states (
  alert_code TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('webhook', 'slack')),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('active', 'resolved')),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  last_attempt_at TIMESTAMPTZ,
  last_delivered_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_delivery_pending BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_count INTEGER NOT NULL DEFAULT 0 CHECK (delivery_count >= 0),
  suppressed_count INTEGER NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (alert_code, channel)
);

CREATE INDEX IF NOT EXISTS idx_platform_alert_delivery_states_due
  ON platform_alert_delivery_states (channel, status, resolution_delivery_pending, next_attempt_at);
