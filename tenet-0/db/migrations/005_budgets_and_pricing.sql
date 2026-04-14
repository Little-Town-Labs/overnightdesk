-- Tenet-0 token governor: budgets, usage ledger, pricing

CREATE TABLE IF NOT EXISTS department_budgets (
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  budget_month DATE NOT NULL,            -- first of month UTC
  monthly_limit_cents INTEGER NOT NULL,
  spent_cents INTEGER NOT NULL DEFAULT 0,
  warn_threshold_pct INTEGER NOT NULL DEFAULT 80,
  warn_at_pct_emitted BOOLEAN NOT NULL DEFAULT false,
  extension_cents INTEGER NOT NULL DEFAULT 0,
  extension_approval_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'blocked')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, budget_month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_status ON department_budgets(status);

CREATE TABLE IF NOT EXISTS token_usage (
  id BIGSERIAL PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_dept_recorded ON token_usage(department_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_recorded ON token_usage(recorded_at DESC);

CREATE TABLE IF NOT EXISTS model_pricing (
  model TEXT PRIMARY KEY,
  input_cents_per_mtok NUMERIC(10,4) NOT NULL,
  output_cents_per_mtok NUMERIC(10,4) NOT NULL,
  effective_from DATE NOT NULL DEFAULT current_date
);

-- Seed pricing (cents per million tokens, Anthropic pricing as of 2026-04)
-- Source: https://www.anthropic.com/pricing
INSERT INTO model_pricing (model, input_cents_per_mtok, output_cents_per_mtok, effective_from) VALUES
  ('claude-opus-4-6',     1500.0000, 7500.0000, '2026-01-01'),
  ('claude-sonnet-4-6',    300.0000, 1500.0000, '2026-01-01'),
  ('claude-haiku-4-5',      80.0000,  400.0000, '2026-01-01')
ON CONFLICT (model) DO NOTHING;

GRANT SELECT ON department_budgets TO tenet0_app;
GRANT SELECT ON token_usage TO tenet0_app;
GRANT SELECT ON model_pricing TO tenet0_app;
GRANT SELECT ON department_budgets TO tenet0_secops;
GRANT SELECT ON token_usage TO tenet0_secops;
GRANT SELECT ON model_pricing TO tenet0_secops;
