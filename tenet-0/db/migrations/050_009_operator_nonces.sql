-- Migration 050_009 — operator_nonces
-- Feature 50 spec FR-25, security T8 (replay defense)
--
-- Single-use nonces for operator decisions. Issued on
-- president.approval.surface_requested publish; consumed on first valid
-- POST /internal/operator-decision; replay returns cached
-- consumed_decision with HTTP 200 + Idempotent-Replay: true.

BEGIN;

CREATE TABLE president.operator_nonces (
  nonce                TEXT PRIMARY KEY,
  approval_id          UUID NOT NULL REFERENCES president.pending_approvals(id),
  issued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at          TIMESTAMPTZ,
  consumed_decision    TEXT,
  expires_at           TIMESTAMPTZ NOT NULL
);

CREATE INDEX operator_nonces_expiry_idx ON president.operator_nonces (expires_at);
CREATE INDEX operator_nonces_approval_idx ON president.operator_nonces (approval_id);

INSERT INTO president.schema_migrations (version) VALUES ('050_009_operator_nonces') ON CONFLICT DO NOTHING;

COMMIT;
