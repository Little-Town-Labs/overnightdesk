-- Test: approvals_active table and partial index

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO departments (id, namespace_prefix, credential_hash) VALUES ('president', 'president', 'h');
INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by)
  VALUES ('a','b','p','r','t');

INSERT INTO events (id, event_type, source_department_id, payload, constitution_version_id)
VALUES (
  '01f5c000-1000-0000-0000-000000000001',
  'president.approved',
  'president',
  '{"approves_event_id":"evt-1"}'::jsonb,
  (SELECT max(version_id) FROM constitution_versions)
);

INSERT INTO approvals_active (approval_event_id, kind, scope_event_type, target_event_id, expires_at)
VALUES (
  '01f5c000-1000-0000-0000-000000000001',
  'per_action',
  'fin.payment.outbound',
  'evt-1',
  now() + interval '10 minutes'
);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM approvals_active
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
  ASSERT v_count = 1, 'expected 1 active approval';
END $$;

-- Consume it
UPDATE approvals_active SET consumed_at = now()
WHERE approval_event_id = '01f5c000-1000-0000-0000-000000000001';

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM approvals_active
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
  ASSERT v_count = 0, 'consumed approval should not appear as active';
END $$;

ROLLBACK;

\echo 'PASS: approvals_active'
