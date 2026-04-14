-- Tenet-0 departments table + roles
-- Creates the minimal auth surface before any other tables depend on it.

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  namespace_prefix TEXT NOT NULL UNIQUE,
  credential_hash TEXT NOT NULL,
  credential_rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_credential_hash TEXT,
  previous_valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);

-- Grant the app role SELECT (direct namespace lookups) but never INSERT/UPDATE
-- Department provisioning happens via migrations + rotate_credential SP.
GRANT SELECT ON departments TO tenet0_app;
GRANT SELECT ON departments TO tenet0_secops;
