ALTER TABLE users
  ADD COLUMN admin_role TEXT;

UPDATE users
SET admin_role = 'owner'
WHERE role = 'admin';

ALTER TABLE users
  ADD CONSTRAINT users_admin_role_check
    CHECK (admin_role IS NULL OR admin_role IN ('viewer', 'editor', 'operator', 'owner')),
  ADD CONSTRAINT users_admin_role_consistency_check
    CHECK (
      (role = 'admin' AND admin_role IS NOT NULL)
      OR (role = 'user' AND admin_role IS NULL)
    );

CREATE INDEX users_admin_role_idx
  ON users (admin_role)
  WHERE role = 'admin';

ALTER TABLE admin_audit_events
  ADD COLUMN actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN actor_email CITEXT,
  ADD COLUMN actor_admin_role TEXT,
  ADD COLUMN actor_auth_type TEXT,
  ADD CONSTRAINT admin_audit_actor_role_check
    CHECK (
      actor_admin_role IS NULL
      OR actor_admin_role IN ('viewer', 'editor', 'operator', 'owner')
    ),
  ADD CONSTRAINT admin_audit_actor_auth_type_check
    CHECK (
      actor_auth_type IS NULL
      OR actor_auth_type IN ('user_session', 'service_key', 'system')
    );

CREATE INDEX admin_audit_events_actor_created_idx
  ON admin_audit_events (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
