-- Test: events table
-- Validates: PK, FK to departments, self-ref for parent_event_id, payload JSONB

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO departments (id, namespace_prefix, credential_hash)
VALUES ('ops', 'ops', 'hash');

-- constitution version must exist for events.constitution_version_id FK
INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by)
VALUES ('deadbeef', 'cafebabe', 'prose', 'rules: []', 'test');

-- Insert a parent event
INSERT INTO events (id, event_type, source_department_id, payload, constitution_version_id)
VALUES (
  '01f5c000-0000-0000-0000-000000000001',
  'ops.job.completed',
  'ops',
  '{"job_id":"j1"}'::jsonb,
  (SELECT max(version_id) FROM constitution_versions)
);

-- Insert a child event with causality parent
INSERT INTO events (id, event_type, source_department_id, payload, parent_event_id, constitution_version_id)
VALUES (
  '01f5c000-0000-0000-0000-000000000002',
  'ops.job.reported',
  'ops',
  '{}'::jsonb,
  '01f5c000-0000-0000-0000-000000000001',
  (SELECT max(version_id) FROM constitution_versions)
);

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM events;
  ASSERT v_count = 2, format('expected 2 events, got %s', v_count);

  SELECT count(*) INTO v_count FROM events WHERE parent_event_id IS NOT NULL;
  ASSERT v_count = 1, 'expected 1 child event';
END $$;

-- FK violation on bad source_department_id
DO $$
BEGIN
  BEGIN
    INSERT INTO events (id, event_type, source_department_id, payload, constitution_version_id)
    VALUES ('01f5c000-0000-0000-0000-00000000DEAD', 'x.y.z', 'nonexistent', '{}'::jsonb, 1);
    RAISE EXCEPTION 'expected FK violation';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;

\echo 'PASS: events'
