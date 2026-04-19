-- Migration 050_002 — pending_approvals
-- Feature 50 spec FR-7, FR-8, FR-14, EC-2
--
-- Durable store for in-flight pre-approval requests. State machine:
--   pending → awaiting_llm → decided
--   pending → awaiting_operator → decided
--   * → expired (operator deadline lapsed)
-- Crash recovery (FR-14) downgrades awaiting_llm → pending on restart.

BEGIN;

CREATE TABLE president.pending_approvals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_event_id         UUID NOT NULL UNIQUE,
  target_event_id          UUID NOT NULL,
  requesting_department    TEXT NOT NULL CHECK (requesting_department ~ '^[a-z][a-z0-9_]+$'),
  target_event_type        TEXT NOT NULL,
  constitutional_rule_id   TEXT NOT NULL,
  payload                  JSONB NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('pending','awaiting_llm','awaiting_operator','decided','expired')),
  awaiting_llm_attempt     INTEGER NOT NULL DEFAULT 0,
  operator_deadline        TIMESTAMPTZ,
  outcome                  TEXT CHECK (outcome IN ('approved','rejected','deferred') OR outcome IS NULL),
  outcome_event_id         UUID,
  decision_mode            TEXT CHECK (decision_mode IN ('rule','llm') OR decision_mode IS NULL),
  rule_id_used             TEXT,
  model_id                 TEXT,
  confidence               NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1 OR confidence IS NULL),
  rationale                TEXT CHECK (length(rationale) <= 2000),
  received_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at               TIMESTAMPTZ,
  surfaced_at              TIMESTAMPTZ
);

-- Startup recovery scan (FR-14): rows in non-terminal states
CREATE INDEX pending_approvals_active_idx
  ON president.pending_approvals (status, received_at)
  WHERE status IN ('pending','awaiting_llm','awaiting_operator');

-- Deadline-sweeper scan
CREATE INDEX pending_approvals_deadline_idx
  ON president.pending_approvals (operator_deadline)
  WHERE status = 'awaiting_operator';

-- Per-department audit queries
CREATE INDEX pending_approvals_dept_received_idx
  ON president.pending_approvals (requesting_department, received_at DESC);

INSERT INTO president.schema_migrations (version) VALUES ('050_002_pending_approvals') ON CONFLICT DO NOTHING;

COMMIT;
