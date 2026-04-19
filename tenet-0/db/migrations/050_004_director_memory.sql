-- Migration 050_004 — director_memory
-- Feature 50 spec FR-11/13/14/15/16/17, EC-4/5/9
--
-- Per-Director namespaced persistent memory. Append-only with supersedes
-- (update_memory creates new row + sets old row's superseded_by). Pre-write
-- PII scrubber rejects PII patterns before INSERT (enforced in MCP layer,
-- not the DB). The DB enforces structural append-only via role + trigger.

BEGIN;

CREATE TABLE president.director_memory (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department             TEXT NOT NULL CHECK (department ~ '^[a-z][a-z0-9_]+$'),
  memory_type            TEXT NOT NULL CHECK (memory_type IN ('charter','decision','pattern','state','reference')),
  name                   TEXT NOT NULL,
  description            TEXT CHECK (length(description) <= 200),
  body                   TEXT NOT NULL CHECK (length(body) <= 10000),
  source_event_id        UUID,
  superseded_by          UUID REFERENCES president.director_memory(id),
  visible_to             TEXT[] DEFAULT NULL,
  constitution_version   TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only ONE active entry per (dept, type, name) — older entries marked superseded
CREATE UNIQUE INDEX director_memory_active_unique_idx
  ON president.director_memory (department, memory_type, name)
  WHERE superseded_by IS NULL;

-- Per-Director recent reads
CREATE INDEX director_memory_dept_created_idx
  ON president.director_memory (department, created_at DESC);

-- Type-scoped scans
CREATE INDEX director_memory_type_dept_idx
  ON president.director_memory (memory_type, department);

-- Full-text search across body + description
CREATE INDEX director_memory_search_idx
  ON president.director_memory
  USING GIN (to_tsvector('english', body || ' ' || coalesce(description, '')));

-- Causality traversal
CREATE INDEX director_memory_source_event_idx
  ON president.director_memory (source_event_id) WHERE source_event_id IS NOT NULL;

-- 30-day state-type expiry sweep (CL-3)
CREATE INDEX director_memory_state_expiry_idx
  ON president.director_memory (department, created_at)
  WHERE memory_type = 'state' AND superseded_by IS NULL;

-- Append-only with restricted-UPDATE: only superseded_by may be set
-- (NULL→UUID, not the other way around). Body and identity columns
-- are immutable.
CREATE OR REPLACE FUNCTION president.director_memory_supersede_only() RETURNS TRIGGER AS $$
BEGIN
  -- Anything other than a superseded_by transition is forbidden.
  IF NEW.id            != OLD.id            OR
     NEW.department    != OLD.department    OR
     NEW.memory_type   != OLD.memory_type   OR
     NEW.name          != OLD.name          OR
     NEW.body          != OLD.body          OR
     NEW.created_at    != OLD.created_at    OR
     NEW.constitution_version != OLD.constitution_version
  THEN
    RAISE EXCEPTION 'president.director_memory: only superseded_by may be updated; row id=%', OLD.id;
  END IF;

  -- superseded_by transition: NULL → UUID only. Cannot clear, cannot re-point.
  IF OLD.superseded_by IS NOT NULL AND NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN
    RAISE EXCEPTION 'president.director_memory: superseded_by is immutable once set; row id=%', OLD.id;
  END IF;

  IF OLD.superseded_by IS NULL AND NEW.superseded_by IS NULL THEN
    -- No-op update. Allow but it's pointless.
    RETURN NEW;
  END IF;

  IF NEW.superseded_by IS NULL AND OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'president.director_memory: cannot un-supersede a row; row id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER director_memory_supersede_only
  BEFORE UPDATE ON president.director_memory
  FOR EACH ROW EXECUTE FUNCTION president.director_memory_supersede_only();

-- Forbid DELETE entirely.
CREATE OR REPLACE FUNCTION president.director_memory_no_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'president.director_memory is append-only; DELETE not permitted (row id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER director_memory_no_delete
  BEFORE DELETE ON president.director_memory
  FOR EACH ROW EXECUTE FUNCTION president.director_memory_no_delete();

-- Grant adjustments: keep INSERT + SELECT + restricted UPDATE; remove DELETE/TRUNCATE.
REVOKE DELETE, TRUNCATE ON president.director_memory FROM president_app;
GRANT SELECT, INSERT, UPDATE ON president.director_memory TO president_app;

INSERT INTO president.schema_migrations (version) VALUES ('050_004_director_memory') ON CONFLICT DO NOTHING;

COMMIT;
