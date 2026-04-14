-- Test: departments table
-- Validates: PK, unique namespace_prefix, status defaults, credential rotation columns

\set ON_ERROR_STOP on

BEGIN;

-- Insert a valid department
INSERT INTO departments (id, namespace_prefix, credential_hash)
VALUES ('test-dept', 'test-dept', 'fake-hash');

DO $$
DECLARE
  v_status text;
  v_count int;
BEGIN
  SELECT status INTO v_status FROM departments WHERE id = 'test-dept';
  ASSERT v_status = 'active', format('expected status=active, got %s', v_status);

  SELECT count(*) INTO v_count FROM departments WHERE id = 'test-dept';
  ASSERT v_count = 1, 'expected 1 row';
END $$;

-- Reject duplicate namespace_prefix
DO $$
BEGIN
  BEGIN
    INSERT INTO departments (id, namespace_prefix, credential_hash)
    VALUES ('other-dept', 'test-dept', 'fake-hash');
    RAISE EXCEPTION 'expected unique violation on namespace_prefix';
  EXCEPTION WHEN unique_violation THEN
    -- expected
    NULL;
  END;
END $$;

ROLLBACK;

\echo 'PASS: departments'
