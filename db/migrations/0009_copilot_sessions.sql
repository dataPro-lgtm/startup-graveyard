BEGIN;

CREATE TABLE IF NOT EXISTS copilot_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_id      TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  pinned_case_ids JSONB       NOT NULL DEFAULT '[]'::jsonb,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_visitor
  ON copilot_sessions(visitor_id, last_message_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID        NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  citations  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  grounded   BOOLEAN,
  model      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_session
  ON copilot_messages(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS copilot_message_feedback (
  message_id UUID PRIMARY KEY REFERENCES copilot_messages(id) ON DELETE CASCADE,
  vote       TEXT        NOT NULL CHECK (vote IN ('up', 'down')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
