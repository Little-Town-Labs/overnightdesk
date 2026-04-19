-- Migration 050_012 — state-type memory expiry maintenance
-- Feature 50 spec CL-3, FR-17
--
-- Daily maintenance task that supersedes 'state'-type director_memory
-- entries older than 30 days. Other types (charter, decision, pattern,
-- reference) persist indefinitely.
--
-- The actual scheduling lives in tenet0-audit-self-checker (or a new
-- sidecar) — this migration creates the helper function that the daemon
-- calls. Idempotent: running multiple times in one day has no effect on
-- already-superseded rows.

BEGIN;

CREATE OR REPLACE FUNCTION president.expire_stale_state_memories()
RETURNS INTEGER  -- count of rows superseded
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Find active 'state' rows older than 30 days. Mark each superseded by
  -- a self-pointing UUID (no replacement row — pure expiry semantics).
  -- The trigger on director_memory permits NULL→UUID transitions on
  -- superseded_by; we point at id itself as the marker convention.
  WITH expired AS (
    UPDATE president.director_memory
    SET superseded_by = id
    WHERE memory_type = 'state'
      AND superseded_by IS NULL
      AND created_at < now() - interval '30 days'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION president.expire_stale_state_memories() TO president_app;

INSERT INTO president.schema_migrations (version) VALUES ('050_012_state_expiry_task') ON CONFLICT DO NOTHING;

COMMIT;
