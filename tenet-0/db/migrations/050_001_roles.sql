-- Migration 050_001 — President schema + roles
-- Feature 50 / Tenet-0 Director Runtime
--
-- Bootstraps the 'president' Postgres schema and the three application
-- roles per data-model.md §Postgres Roles. Default grants are scoped to
-- the new schema; per-table grant overrides for append-only tables
-- (decision_log, director_memory, lifecycle_events) come in their own
-- migrations.

BEGIN;

-- Schema for all Feature 50 state. Owned by the audit owner role
-- (used only by migrations); runtime app role gets schema USAGE.
CREATE SCHEMA IF NOT EXISTS president;

-- Roles. NOINHERIT prevents accidental privilege climbing through
-- nested roles. Passwords are placeholders here; production passwords
-- come from Phase.dev secrets via ALTER ROLE in the deploy step.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'president_app') THEN
    CREATE ROLE president_app NOINHERIT LOGIN PASSWORD 'placeholder_rotate_via_phase';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'president_audit_owner') THEN
    CREATE ROLE president_audit_owner NOINHERIT LOGIN PASSWORD 'placeholder_rotate_via_phase';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'secops_app') THEN
    CREATE ROLE secops_app NOINHERIT LOGIN PASSWORD 'placeholder_rotate_via_phase';
  END IF;
END$$;

-- Schema ownership: audit_owner owns DDL; runtime roles get USAGE only.
ALTER SCHEMA president OWNER TO president_audit_owner;
GRANT USAGE ON SCHEMA president TO president_app, secops_app;

-- Default privileges for future tables created by audit_owner in the
-- president schema. Per-table overrides land in subsequent migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE president_audit_owner IN SCHEMA president
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO president_app;
ALTER DEFAULT PRIVILEGES FOR ROLE president_audit_owner IN SCHEMA president
  GRANT SELECT ON TABLES TO secops_app;

-- Bootstrap the schema_migrations table in the new schema. The earlier
-- public.schema_migrations row inserted by migrate.sh apply-pending for
-- THIS migration will be supplemented by the version row inserted in the
-- president schema for subsequent migrations. (migrate.sh tries
-- president.* first; falls back to public.* for the first run.)
CREATE TABLE IF NOT EXISTS president.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON president.schema_migrations TO president_app;

-- Tenet-0 admin schema_migrations alias (the migrate.sh script writes
-- to tenet0.schema_migrations per its design). Create a thin schema +
-- view alias so both names resolve.
CREATE SCHEMA IF NOT EXISTS tenet0;
CREATE OR REPLACE VIEW tenet0.schema_migrations AS
  SELECT version, applied_at FROM president.schema_migrations;
-- INSERTs to the view need a rule.
CREATE OR REPLACE RULE tenet0_schema_migrations_insert AS
  ON INSERT TO tenet0.schema_migrations
  DO INSTEAD INSERT INTO president.schema_migrations (version, applied_at)
    VALUES (NEW.version, COALESCE(NEW.applied_at, now()))
    ON CONFLICT DO NOTHING;
GRANT INSERT, SELECT ON tenet0.schema_migrations TO president_app;

COMMIT;
