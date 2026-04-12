CREATE TABLE IF NOT EXISTS team_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_workspaces_name_nonempty CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT team_workspaces_name_length CHECK (char_length(name) <= 80),
  CONSTRAINT team_workspaces_one_owner UNIQUE (owner_user_id)
);

CREATE TABLE IF NOT EXISTS team_workspace_members (
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT team_workspace_members_one_workspace_per_user UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS team_workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT team_workspace_invites_unique_email UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS team_workspace_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  saved_view_id UUID NOT NULL REFERENCES user_saved_views(id) ON DELETE CASCADE,
  shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_workspace_saved_views_unique UNIQUE (workspace_id, saved_view_id)
);

CREATE TABLE IF NOT EXISTS team_workspace_cases (
  workspace_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_team_workspace_invites_email_status
  ON team_workspace_invites (email, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_workspace_saved_views_workspace
  ON team_workspace_saved_views (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_workspace_cases_workspace
  ON team_workspace_cases (workspace_id, created_at DESC);
