-- Track account email verification. Tokens are stored as SHA-256 digests only;
-- the emailed token is the single-use credential and is never persisted.
ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMPTZ;

CREATE TABLE email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

COMMENT ON COLUMN email_verification_tokens.token_hash IS
  'SHA-256 digest of the verification token; the emailed token is never persisted';

CREATE INDEX email_verification_tokens_user_idx
  ON email_verification_tokens (user_id, created_at DESC);
