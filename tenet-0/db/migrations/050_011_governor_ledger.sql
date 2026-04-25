-- Migration 050_011 — governor_ledger
-- Feature 50 spec NFR-7, OQ-5
--
-- Token-equivalent measurements per Director spawn. MEASUREMENT ONLY —
-- no per-token billing path exists in any binary. Used for capacity
-- modeling, spawn-overhead detection, future per-Director rate budgets.
-- NFR-7 invariant: zero new Anthropic API spend.

BEGIN;

CREATE TABLE president.governor_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director        TEXT NOT NULL CHECK (director ~ '^[a-z][a-z0-9_]+$'),
  event_id        UUID NOT NULL,
  tokens_in       INTEGER NOT NULL DEFAULT 0,
  tokens_out      INTEGER NOT NULL DEFAULT 0,
  wall_clock_ms   INTEGER NOT NULL,
  mode            TEXT NOT NULL CHECK (mode IN ('rule','llm')),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-Director usage queries
CREATE INDEX governor_ledger_director_idx
  ON president.governor_ledger (director, recorded_at DESC);

-- Capacity-planning queries
CREATE INDEX governor_ledger_recorded_idx
  ON president.governor_ledger (recorded_at DESC);

INSERT INTO president.schema_migrations (version) VALUES ('050_011_governor_ledger') ON CONFLICT DO NOTHING;

COMMIT;
