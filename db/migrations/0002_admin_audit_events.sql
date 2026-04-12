BEGIN;

CREATE TABLE admin_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_events_created_at ON admin_audit_events(created_at DESC);

COMMIT;
