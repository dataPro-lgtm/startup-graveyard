BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug CITEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  country_code TEXT,
  industry_key TEXT NOT NULL,
  business_model_key TEXT,
  founded_year INT,
  closed_year INT,
  total_funding_usd BIGINT,
  primary_failure_reason_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE evidence_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  publisher TEXT,
  published_at TIMESTAMPTZ,
  credibility_level TEXT NOT NULL DEFAULT 'medium',
  excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE failure_factors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  level_1_key TEXT NOT NULL,
  level_2_key TEXT NOT NULL,
  level_3_key TEXT,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  explanation TEXT
);

CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  decision_note TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE case_embeddings (
  case_id UUID PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_industry ON cases(industry_key);
CREATE INDEX idx_cases_closed_year ON cases(closed_year);
CREATE INDEX idx_sources_case_id ON evidence_sources(case_id);
CREATE INDEX idx_failure_factors_case_id ON failure_factors(case_id);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX idx_reviews_status ON reviews(review_status);
CREATE INDEX idx_cases_name_trgm ON cases USING gin (company_name gin_trgm_ops);
CREATE INDEX idx_case_embeddings_hnsw ON case_embeddings USING hnsw (embedding vector_cosine_ops);

COMMIT;