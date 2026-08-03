-- Password reset tokens are stored as SHA-256 digests only; the emailed token
-- is the single-use credential and is never persisted in reusable form.
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

COMMENT ON COLUMN password_reset_tokens.token_hash IS
  'SHA-256 digest of the reset token; the emailed token is never persisted';

CREATE INDEX password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, created_at DESC);
