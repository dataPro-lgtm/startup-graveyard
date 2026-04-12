BEGIN;

-- 1. cases 表补充 published_at 字段
ALTER TABLE cases ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 对已有 published 状态的案例自动回填 published_at（用 updated_at 近似）
UPDATE cases SET published_at = updated_at WHERE status = 'published' AND published_at IS NULL;

-- 2. 时间线事件表
CREATE TABLE IF NOT EXISTS timeline_events (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id     UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_date  DATE        NOT NULL,
  event_type  TEXT        NOT NULL,   -- founded|funding|product_launch|pivot|layoff|shutdown|acquisition|regulatory|other
  title       TEXT        NOT NULL,
  description TEXT,
  amount_usd  BIGINT,                 -- 可选：融资额等金额字段
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_case_id ON timeline_events(case_id);
CREATE INDEX IF NOT EXISTS idx_timeline_event_date ON timeline_events(event_date);

-- 3. 案例分块表（RAG 向量检索用）
CREATE TABLE IF NOT EXISTS case_chunks (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id      UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  chunk_kind   TEXT        NOT NULL,  -- summary|timeline|factor|lesson|evidence
  ordinal      INT         NOT NULL DEFAULT 0,
  content_text TEXT        NOT NULL,
  token_count  INT,
  embedding    vector(1536),
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_chunks_case_id ON case_chunks(case_id);
CREATE INDEX IF NOT EXISTS idx_case_chunks_kind   ON case_chunks(chunk_kind);

-- HNSW 向量索引（仅对有 embedding 的行生效）
CREATE INDEX IF NOT EXISTS idx_case_chunks_hnsw
  ON case_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMIT;
