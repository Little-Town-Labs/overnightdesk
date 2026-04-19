-- Migration 050_006 — director_registry
-- Feature 50 spec FR-22, FR-23, US-9, EC-12, security T3/T6
--
-- Roster of registered Directors. Populated from *.lifecycle.registered
-- and *.lifecycle.deregistered events observed by the bus-watcher daemon.
-- Conflict handling (EC-12): two markdown files claiming the same
-- namespace raises secops.violation.registry_conflict; both quarantined.

BEGIN;

CREATE TABLE president.director_registry (
  department                  TEXT PRIMARY KEY CHECK (department ~ '^[a-z][a-z0-9_]+$'),
  markdown_path               TEXT NOT NULL,
  file_hash                   TEXT NOT NULL,
  version                     TEXT NOT NULL,
  mcp_grants                  TEXT[] NOT NULL,
  bus_namespace               TEXT NOT NULL CHECK (bus_namespace = department),
  registered_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deregistered_at             TIMESTAMPTZ,
  last_lifecycle_event_id     UUID NOT NULL,
  -- Operator-signed manifest (Ed25519) required for reserved namespaces
  -- (president, secops). NULL is acceptable for non-reserved.
  operator_signature          BYTEA
);

-- Active-Director scan (the polling loop's source)
CREATE INDEX director_registry_active_idx
  ON president.director_registry (deregistered_at)
  WHERE deregistered_at IS NULL;

INSERT INTO president.schema_migrations (version) VALUES ('050_006_director_registry') ON CONFLICT DO NOTHING;

COMMIT;
