-- ── Copilot Eval Dataset / Regression Batches ───────────────────────────────

CREATE TABLE IF NOT EXISTS copilot_eval_cases (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      CITEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  question                  TEXT NOT NULL,
  pinned_case_slugs         CITEXT[] NOT NULL DEFAULT '{}',
  expected_case_slugs       CITEXT[] NOT NULL DEFAULT '{}',
  expected_grounded         BOOLEAN,
  expected_fallback_reason  TEXT
    CHECK (
      expected_fallback_reason IS NULL
      OR expected_fallback_reason IN ('no_relevant_cases', 'provider_unavailable', 'provider_error')
    ),
  status                    TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_eval_cases_status_updated
  ON copilot_eval_cases (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS copilot_eval_batches (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type              TEXT NOT NULL,
  prompt_version            TEXT NOT NULL,
  provider                  TEXT,
  model                     TEXT,
  total_cases               INTEGER NOT NULL CHECK (total_cases >= 0),
  passed_cases              INTEGER NOT NULL CHECK (passed_cases >= 0),
  grounded_cases            INTEGER NOT NULL CHECK (grounded_cases >= 0),
  fallback_cases            INTEGER NOT NULL CHECK (fallback_cases >= 0),
  avg_citation_recall       NUMERIC(5,4),
  avg_citation_precision    NUMERIC(5,4),
  avg_response_ms           INTEGER NOT NULL CHECK (avg_response_ms >= 0),
  total_tokens              INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  total_estimated_cost_usd  NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_eval_batches_created
  ON copilot_eval_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS copilot_eval_results (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                  UUID NOT NULL REFERENCES copilot_eval_batches(id) ON DELETE CASCADE,
  eval_case_id              UUID NOT NULL REFERENCES copilot_eval_cases(id) ON DELETE CASCADE,
  question                  TEXT NOT NULL,
  answer_preview            TEXT NOT NULL,
  grounded                  BOOLEAN NOT NULL,
  fallback_reason           TEXT
    CHECK (
      fallback_reason IS NULL
      OR fallback_reason IN ('no_relevant_cases', 'provider_unavailable', 'provider_error')
    ),
  expected_case_slugs       CITEXT[] NOT NULL DEFAULT '{}',
  actual_citation_slugs     CITEXT[] NOT NULL DEFAULT '{}',
  matched_expected_count    INTEGER NOT NULL CHECK (matched_expected_count >= 0),
  expected_case_count       INTEGER NOT NULL CHECK (expected_case_count >= 0),
  citation_recall           NUMERIC(5,4),
  citation_precision        NUMERIC(5,4),
  passed                    BOOLEAN NOT NULL,
  response_ms               INTEGER NOT NULL CHECK (response_ms >= 0),
  total_tokens              INTEGER,
  estimated_cost_usd        NUMERIC(12,6),
  prompt_version            TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_eval_results_batch_passed
  ON copilot_eval_results (batch_id, passed, created_at DESC);

INSERT INTO scheduled_jobs (name, source_name, payload, cron_expr, interval_ms, next_run_at)
VALUES (
  'nightly_copilot_eval_suite',
  'run_copilot_eval_suite',
  '{"topK": 5}'::jsonb,
  '@daily',
  86400000,
  NOW() + INTERVAL '2 hour'
)
ON CONFLICT (name) DO NOTHING;
