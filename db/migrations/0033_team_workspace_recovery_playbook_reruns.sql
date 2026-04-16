ALTER TABLE team_workspace_recovery_playbook_runs
  ADD COLUMN IF NOT EXISTS requested_steps TEXT[] NOT NULL DEFAULT ARRAY[
    'outreach',
    'ownerEmail',
    'memberEmail',
    'crmSync',
    'webhook',
    'slack'
  ]::TEXT[],
  ADD COLUMN IF NOT EXISTS rerun_of_run_id UUID NULL
    REFERENCES team_workspace_recovery_playbook_runs(id) ON DELETE SET NULL;

