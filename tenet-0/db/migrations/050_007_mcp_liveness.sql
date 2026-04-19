-- Migration 050_007 — mcp_liveness
-- Feature 50 spec FR-18, FR-19, US-6
--
-- Current per-Director per-MCP healthcheck state. Holds STATE, not history.
-- Transitions only persisted (not raw poll results); transition events
-- published to bus instead.

BEGIN;

CREATE TABLE president.mcp_liveness (
  department              TEXT NOT NULL REFERENCES president.director_registry(department) ON DELETE CASCADE,
  mcp_name                TEXT NOT NULL,
  state                   TEXT NOT NULL CHECK (state IN ('unknown','healthy','degraded','recovered')),
  consecutive_failures    INTEGER NOT NULL DEFAULT 0,
  last_poll_at            TIMESTAMPTZ,
  last_success_at         TIMESTAMPTZ,
  last_state_change_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (department, mcp_name)
);

-- Operator query: show all directors in non-healthy state
CREATE INDEX mcp_liveness_unhealthy_idx
  ON president.mcp_liveness (state, last_state_change_at)
  WHERE state IN ('degraded','unknown');

INSERT INTO president.schema_migrations (version) VALUES ('050_007_mcp_liveness') ON CONFLICT DO NOTHING;

COMMIT;
