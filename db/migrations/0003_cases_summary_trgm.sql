BEGIN;

CREATE INDEX IF NOT EXISTS idx_cases_summary_trgm ON cases USING gin (summary gin_trgm_ops);

COMMIT;
