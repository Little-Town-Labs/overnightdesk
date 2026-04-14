-- Test: publish_event() stored procedure
-- Covers: happy path, namespace violation, unauth, causality, rule enforcement

\set ON_ERROR_STOP on

BEGIN;

-- Setup: seed departments and a constitution version
INSERT INTO departments (id, namespace_prefix, credential_hash) VALUES
  ('ops',       'ops',       crypt('ops-cred',       gen_salt('bf'))),
  ('fin',       'fin',       crypt('fin-cred',       gen_salt('bf'))),
  ('president', 'president', crypt('president-cred', gen_salt('bf')));

INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
VALUES ('p', 'r', 'prose', 'rules: []', 'test', true);

-- Rule: fin.payment.outbound requires per_action approval
INSERT INTO constitution_rules (
  constitution_version_id, rule_id, event_type_pattern, requires_approval_mode
) VALUES (
  (SELECT version_id FROM constitution_versions WHERE is_active),
  'fin-payment-outbound', 'fin.payment.outbound', 'per_action'
);

-- Test 1: happy path publish
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM publish_event(
    'ops-cred', 'ops.job.completed', '{"job_id":"j1"}'::jsonb, NULL, NULL
  );
  ASSERT r.status = 'ok', format('expected ok, got %s (%s)', r.status, r.error_msg);
  ASSERT r.event_id IS NOT NULL, 'expected non-null event_id';
END $$;

-- Test 2: namespace violation
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM publish_event(
    'ops-cred', 'fin.payment.outbound', '{}'::jsonb, NULL, NULL
  );
  ASSERT r.status = 'rejected_namespace', format('expected rejected_namespace, got %s', r.status);
END $$;

-- Test 3: unauthenticated (bad credential)
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM publish_event(
    'wrong-credential', 'ops.job.x', '{}'::jsonb, NULL, NULL
  );
  ASSERT r.status = 'rejected_unauthenticated', format('expected unauth, got %s', r.status);
END $$;

-- Test 4: rule requires approval, none present -> rejected
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM publish_event(
    'fin-cred', 'fin.payment.outbound', '{"amount":100}'::jsonb, NULL, NULL
  );
  ASSERT r.status = 'rejected_constitution', format('expected rejected_constitution, got %s', r.status);
END $$;

-- Test 5: with valid per-action approval -> ok
DO $$
DECLARE r RECORD; v_target_id TEXT; v_approval_id TEXT;
BEGIN
  -- Phase A: Finance publishes a target event placeholder (using a non-rule type for setup)
  SELECT event_id INTO v_target_id FROM publish_event(
    'fin-cred', 'fin.approval.requested', '{"target":"payment-1"}'::jsonb, NULL, NULL
  );

  -- President approves it
  SELECT event_id INTO v_approval_id FROM publish_event(
    'president-cred', 'president.approved',
    jsonb_build_object('approves_event_id', v_target_id, 'scope', 'fin.payment.outbound', 'expires_at', (now() + interval '10 minutes')::text),
    NULL, NULL
  );

  -- Now Finance can publish the payment with the approval in approval_event_id arg
  SELECT * INTO r FROM publish_event(
    'fin-cred', 'fin.payment.outbound', '{"amount":100}'::jsonb, NULL, v_approval_id
  );
  ASSERT r.status = 'ok', format('expected ok with approval, got %s (%s)', r.status, r.error_msg);
END $$;

-- Test 6: approval consumed twice -> second use rejected
DO $$
DECLARE r RECORD; v_target_id TEXT; v_approval_id TEXT;
BEGIN
  SELECT event_id INTO v_target_id FROM publish_event(
    'fin-cred', 'fin.approval.requested', '{}'::jsonb, NULL, NULL
  );
  SELECT event_id INTO v_approval_id FROM publish_event(
    'president-cred', 'president.approved',
    jsonb_build_object('approves_event_id', v_target_id, 'scope', 'fin.payment.outbound', 'expires_at', (now() + interval '10 minutes')::text),
    NULL, NULL
  );
  -- First use: ok
  SELECT * INTO r FROM publish_event(
    'fin-cred', 'fin.payment.outbound', '{"amount":50}'::jsonb, NULL, v_approval_id
  );
  ASSERT r.status = 'ok', 'first use should succeed';

  -- Second use: rejected (already consumed)
  SELECT * INTO r FROM publish_event(
    'fin-cred', 'fin.payment.outbound', '{"amount":50}'::jsonb, NULL, v_approval_id
  );
  ASSERT r.status = 'rejected_constitution', format('expected rejected on reuse, got %s', r.status);
END $$;

-- Test 7: causality chain depth
DO $$
DECLARE r RECORD; v_chain_id TEXT; v_id TEXT; i INT;
BEGIN
  SELECT event_id INTO v_chain_id FROM publish_event('ops-cred', 'ops.start', '{}'::jsonb, NULL, NULL);
  -- Build a chain of 11 events
  FOR i IN 1..11 LOOP
    SELECT event_id INTO v_id FROM publish_event('ops-cred', 'ops.next', '{}'::jsonb, v_chain_id, NULL);
    IF v_id IS NOT NULL THEN
      v_chain_id := v_id;
    END IF;
  END LOOP;
  -- 12th level should be rejected (depth > 10)
  SELECT * INTO r FROM publish_event('ops-cred', 'ops.next', '{}'::jsonb, v_chain_id, NULL);
  ASSERT r.status = 'rejected_causality', format('expected rejected_causality, got %s', r.status);
END $$;

ROLLBACK;

\echo 'PASS: publish_event'
