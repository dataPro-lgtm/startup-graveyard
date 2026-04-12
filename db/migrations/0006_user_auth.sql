-- ── User Authentication System ───────────────────────────────────────────────
-- Tables: users, user_sessions
-- No third-party deps; JWT issued by API, refresh tracked in DB

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT,
  -- subscription: 'free' | 'pro'
  subscription    TEXT NOT NULL DEFAULT 'free' CHECK (subscription IN ('free', 'pro')),
  -- role: 'user' | 'admin'
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- Refresh token store — one active session per user (simplest viable approach)
CREATE TABLE IF NOT EXISTS user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token   TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx   ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_refresh_idx    ON user_sessions (refresh_token);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

-- Automatically prune expired sessions (run via cron or pg_cron)
-- DELETE FROM user_sessions WHERE expires_at < NOW();
