ALTER TABLE team_workspace_recovery_outreach_events
  ADD COLUMN crm_sync_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_crm_sync_attempt_at timestamptz,
  ADD COLUMN next_crm_sync_attempt_at timestamptz,
  ADD COLUMN last_crm_synced_at timestamptz,
  ADD COLUMN crm_external_record_id text,
  ADD COLUMN last_crm_sync_status_code integer,
  ADD COLUMN last_crm_sync_error text;
