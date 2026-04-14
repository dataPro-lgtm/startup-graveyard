CREATE TABLE IF NOT EXISTS billing_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('checkout_started', 'checkout_completed', 'portal_started', 'subscription_recovered')
  ),
  event_source TEXT NOT NULL CHECK (
    event_source IN ('account_page', 'team_workspace')
  ),
  plan TEXT CHECK (plan IN ('pro', 'team')),
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_funnel_events_created_at
  ON billing_funnel_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_funnel_events_type
  ON billing_funnel_events (event_type, plan);
