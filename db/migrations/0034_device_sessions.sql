-- Existing refresh tokens were stored in plaintext. Invalidate them during the
-- security upgrade instead of carrying reusable credentials into the new model.
DELETE FROM user_sessions;

ALTER TABLE user_sessions
  RENAME COLUMN refresh_token TO refresh_token_hash;

ALTER TABLE user_sessions
  ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN user_sessions.refresh_token_hash IS
  'SHA-256 digest of the refresh token; the reusable credential is never persisted';

CREATE INDEX user_sessions_user_activity_idx
  ON user_sessions (user_id, last_seen_at DESC);
