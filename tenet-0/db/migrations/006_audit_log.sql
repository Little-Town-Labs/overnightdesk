-- Tenet-0 append-only audit log
-- INSERT-only from app code; never UPDATE or DELETE.

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor_recorded ON audit_log(actor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_recorded ON audit_log(action, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recorded ON audit_log(recorded_at DESC);

-- Enforce append-only at role level: tenet0_app gets INSERT only.
-- UPDATE/DELETE are implicitly denied by not granting them.
GRANT INSERT ON audit_log TO tenet0_app;
GRANT SELECT ON audit_log TO tenet0_secops;
-- NOTE: tenet0_app does NOT get SELECT on audit_log — departments should not read each other's audit.
-- If a department needs its own history, it queries events table with its own source filter.
