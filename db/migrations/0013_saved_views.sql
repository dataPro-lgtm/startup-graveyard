CREATE TABLE IF NOT EXISTS user_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL,
  query_string TEXT NOT NULL DEFAULT '',
  case_count_snapshot INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_views_name_nonempty CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT user_saved_views_name_length CHECK (char_length(name) <= 80),
  CONSTRAINT user_saved_views_case_count_nonnegative CHECK (case_count_snapshot >= 0),
  CONSTRAINT user_saved_views_user_query_unique UNIQUE (user_id, query_string)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_views_user_updated_at
  ON user_saved_views (user_id, updated_at DESC);
