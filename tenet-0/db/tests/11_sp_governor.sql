-- Test: check_budget() and record_token_usage()

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO departments (id, namespace_prefix, credential_hash) VALUES
  ('ops', 'ops', crypt('ops-cred', gen_salt('bf')));

INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
VALUES ('p', 'r', '', 'rules: []', 'test', true);

INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents)
VALUES ('ops', date_trunc('month', current_date)::date, 1000);

-- Test 1: initial check_budget returns ok with full remaining
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM check_budget('ops-cred');
  ASSERT r.status = 'ok', format('expected ok, got %s', r.status);
  ASSERT r.remaining_cents = 1000, format('expected 1000 remaining, got %s', r.remaining_cents);
END $$;

-- Test 2: record usage at 50% -> still ok
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM record_token_usage('ops-cred', 'claude-haiku-4-5', 1000000, 1000000, NULL);
  -- haiku: 80 cents in + 400 cents out per Mtok = 480 cents
  ASSERT r.cost_cents = 480, format('expected cost 480, got %s', r.cost_cents);

  SELECT * INTO r FROM check_budget('ops-cred');
  ASSERT r.status = 'ok' OR r.status = 'warning', format('expected ok or warning at 48%%, got %s', r.status);
END $$;

-- Test 3: cross 80% threshold -> warning emitted (warn_at_pct_emitted = true)
DO $$
DECLARE r RECORD; v_emitted BOOL;
BEGIN
  -- Add another 480 -> 960 / 1000 = 96%
  SELECT * INTO r FROM record_token_usage('ops-cred', 'claude-haiku-4-5', 1000000, 1000000, NULL);

  SELECT warn_at_pct_emitted INTO v_emitted FROM department_budgets
   WHERE department_id = 'ops' AND budget_month = date_trunc('month', current_date)::date;
  ASSERT v_emitted = true, 'warn_at_pct_emitted should be true after 80%% threshold';
END $$;

-- Test 4: cross 100% -> blocked
DO $$
DECLARE r RECORD; v_status TEXT;
BEGIN
  -- Push over: another 480 -> 1440 / 1000 = 144%
  SELECT * INTO r FROM record_token_usage('ops-cred', 'claude-haiku-4-5', 1000000, 1000000, NULL);

  SELECT status INTO v_status FROM department_budgets
   WHERE department_id = 'ops' AND budget_month = date_trunc('month', current_date)::date;
  ASSERT v_status = 'blocked', format('expected blocked, got %s', v_status);

  SELECT * INTO r FROM check_budget('ops-cred');
  ASSERT r.status = 'blocked', format('check_budget should report blocked, got %s', r.status);
END $$;

ROLLBACK;

\echo 'PASS: governor'
