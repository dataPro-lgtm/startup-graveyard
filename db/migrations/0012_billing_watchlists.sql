ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_check;

ALTER TABLE users
  ADD CONSTRAINT users_subscription_check
  CHECK (subscription IN ('free', 'pro', 'team'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (billing_status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS billing_interval TEXT
    CHECK (billing_interval IN ('month', 'year')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET billing_status = 'active'
WHERE subscription IN ('pro', 'team') AND billing_status = 'inactive';

CREATE TABLE IF NOT EXISTS user_watchlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, case_id)
);

CREATE INDEX IF NOT EXISTS user_watchlist_entries_user_id_idx
  ON user_watchlist_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_watchlist_entries_case_id_idx
  ON user_watchlist_entries (case_id);
