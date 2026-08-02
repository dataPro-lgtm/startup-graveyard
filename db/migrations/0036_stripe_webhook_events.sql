CREATE TABLE stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  livemode BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stripe_webhook_events_status_updated_idx
  ON stripe_webhook_events (status, updated_at DESC);

ALTER TABLE billing_funnel_events
  ADD COLUMN source_event_id TEXT;

CREATE UNIQUE INDEX billing_funnel_events_source_event_uidx
  ON billing_funnel_events (source_event_id)
  WHERE source_event_id IS NOT NULL;
