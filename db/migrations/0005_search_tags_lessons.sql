BEGIN;

-- 搜索标签：补充同义词/分类词，增强 trigram 搜索覆盖
ALTER TABLE cases ADD COLUMN IF NOT EXISTS search_tags TEXT NOT NULL DEFAULT '';

-- 核心教训：AI 或人工提炼的结构化教训
ALTER TABLE cases ADD COLUMN IF NOT EXISTS key_lessons TEXT;

-- 为搜索标签建 trigram 索引
CREATE INDEX IF NOT EXISTS idx_cases_tags_trgm ON cases USING gin (search_tags gin_trgm_ops);

COMMIT;
