BEGIN;

CREATE TABLE IF NOT EXISTS copilot_runs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          UUID        NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
  user_message_id     UUID        NOT NULL REFERENCES copilot_messages(id) ON DELETE CASCADE,
  assistant_message_id UUID       NOT NULL UNIQUE REFERENCES copilot_messages(id) ON DELETE CASCADE,
  provider            TEXT,
  model               TEXT,
  prompt_version      TEXT        NOT NULL,
  grounded            BOOLEAN     NOT NULL DEFAULT FALSE,
  fallback_reason     TEXT,
  response_ms         INTEGER,
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  total_tokens        INTEGER,
  estimated_cost_usd  NUMERIC(12,8),
  retrieved_case_count INTEGER    NOT NULL DEFAULT 0,
  pinned_case_count   INTEGER     NOT NULL DEFAULT 0,
  citation_count      INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_runs_session
  ON copilot_runs(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_runs_prompt_version
  ON copilot_runs(prompt_version, created_at DESC);

COMMIT;
