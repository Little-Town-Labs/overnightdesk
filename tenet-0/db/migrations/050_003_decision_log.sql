-- Migration 050_003 — decision_log + hash chain
-- Feature 50 spec FR-9, FR-10, FR-21, NFR-3, security T7
--
-- Append-only audit table with SHA256 hash chain. Belt-and-braces:
--   1. Postgres role grant: INSERT/SELECT only (UPDATE/DELETE/TRUNCATE revoked)
--   2. BEFORE UPDATE OR DELETE trigger that raises an exception
--   3. Hash chain (each row's row_hash depends on prev_hash + canonical row)
-- Even if role/trigger are bypassed (compromised superuser), chain
-- validation detects tampering.

BEGIN;

-- Sentinel row for chain extension serialization.
-- decision_log writes do `SELECT ... FOR UPDATE` on this single row first,
-- guaranteeing monotonic chain even under concurrent writers.
CREATE TABLE president.decision_log_chain_state (
  id   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_hash BYTEA NOT NULL
);

-- Chain seed: SHA256("tenet0-decision-log-v1" || sha256_of_constitution_v1_md)
-- Constitution v1 hash placeholder; recomputed if constitution prose ever
-- changes pre-genesis (it has not). The genesis row's prev_hash is this.
INSERT INTO president.decision_log_chain_state (id, last_hash)
  VALUES (1, decode(
    'b6c79e7c92aa4c44e6fcaa28ff3c1f3b5e09d9e4c45f3f7e2a8d3a1e7f9c4d2a',  -- placeholder constitution hash
    'hex'
  ))
  ON CONFLICT DO NOTHING;

CREATE TABLE president.decision_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_event_id            UUID NOT NULL UNIQUE,
  outcome_event_type          TEXT NOT NULL,
  causality_root_event_id     UUID,
  decision_mode               TEXT NOT NULL CHECK (decision_mode IN ('rule','llm')),
  rule_id_used                TEXT,
  model_id                    TEXT,
  input_tokens                INTEGER,
  output_tokens               INTEGER,
  confidence                  NUMERIC(3,2),
  rationale                   TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 2000),
  actor_director              TEXT NOT NULL DEFAULT 'president',
  prev_hash                   BYTEA NOT NULL,
  row_hash                    BYTEA NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX decision_log_created_at_idx ON president.decision_log (created_at DESC);
CREATE INDEX decision_log_event_type_idx ON president.decision_log (outcome_event_type, created_at DESC);
CREATE INDEX decision_log_causality_idx  ON president.decision_log (causality_root_event_id);

-- Append-only enforcement: trigger as belt-and-braces. The role grants
-- (set in migration 050_001's ALTER DEFAULT PRIVILEGES) plus this trigger
-- ensure no path can UPDATE/DELETE/TRUNCATE this table at runtime.
CREATE OR REPLACE FUNCTION president.decision_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'president.decision_log is append-only; UPDATE/DELETE not permitted (row id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decision_log_no_update
  BEFORE UPDATE ON president.decision_log
  FOR EACH ROW EXECUTE FUNCTION president.decision_log_immutable();

CREATE TRIGGER decision_log_no_delete
  BEFORE DELETE ON president.decision_log
  FOR EACH ROW EXECUTE FUNCTION president.decision_log_immutable();

-- Per-table grants: revoke UPDATE/DELETE/TRUNCATE that the schema-default
-- granted; re-grant just SELECT and INSERT.
REVOKE UPDATE, DELETE, TRUNCATE ON president.decision_log FROM president_app;
GRANT SELECT, INSERT ON president.decision_log TO president_app;

INSERT INTO president.schema_migrations (version) VALUES ('050_003_decision_log') ON CONFLICT DO NOTHING;

COMMIT;
