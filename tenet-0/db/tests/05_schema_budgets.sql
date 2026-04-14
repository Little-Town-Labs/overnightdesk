-- Test: department_budgets, token_usage, model_pricing

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO departments (id, namespace_prefix, credential_hash) VALUES ('ops', 'ops', 'h');

-- Composite PK: (department_id, budget_month)
INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents)
VALUES ('ops', '2026-04-01', 5000);

-- Duplicate should violate PK
DO $$
BEGIN
  BEGIN
    INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents)
    VALUES ('ops', '2026-04-01', 1000);
    RAISE EXCEPTION 'expected PK violation';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- Different month is OK
INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents)
VALUES ('ops', '2026-05-01', 5000);

-- model_pricing seeded
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM model_pricing;
  ASSERT v_count > 0, 'model_pricing should have seed rows';
END $$;

-- token_usage insert with optional event_id NULL
INSERT INTO token_usage (department_id, model, input_tokens, output_tokens, cost_cents)
VALUES ('ops', 'claude-sonnet-4-6', 1000, 500, 12);

DO $$
DECLARE v_tokens int;
BEGIN
  SELECT input_tokens INTO v_tokens FROM token_usage WHERE department_id = 'ops' LIMIT 1;
  ASSERT v_tokens = 1000, 'input_tokens should match insert';
END $$;

ROLLBACK;

\echo 'PASS: budgets'
