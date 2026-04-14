CREATE TABLE IF NOT EXISTS user_saved_view_report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_view_id UUID NOT NULL REFERENCES user_saved_views(id) ON DELETE CASCADE,
  saved_view_name TEXT NOT NULL,
  filters JSONB NOT NULL,
  query_string TEXT NOT NULL DEFAULT '',
  case_count_snapshot INTEGER NOT NULL DEFAULT 0,
  owner_display_name TEXT,
  share_token TEXT NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_view_report_shares_saved_view_unique UNIQUE (saved_view_id),
  CONSTRAINT user_saved_view_report_shares_share_token_unique UNIQUE (share_token),
  CONSTRAINT user_saved_view_report_shares_name_nonempty CHECK (char_length(btrim(saved_view_name)) > 0),
  CONSTRAINT user_saved_view_report_shares_name_length CHECK (char_length(saved_view_name) <= 80),
  CONSTRAINT user_saved_view_report_shares_case_count_nonnegative CHECK (case_count_snapshot >= 0)
);

CREATE INDEX IF NOT EXISTS idx_report_shares_user_updated_at
  ON user_saved_view_report_shares (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_shares_token
  ON user_saved_view_report_shares (share_token);
