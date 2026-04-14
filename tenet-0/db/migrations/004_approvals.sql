-- Tenet-0 active approvals (per-action + blanket)

CREATE TABLE IF NOT EXISTS approvals_active (
  id BIGSERIAL PRIMARY KEY,
  approval_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('per_action', 'blanket')),
  scope_event_type TEXT,         -- for per_action
  target_event_id TEXT,          -- for per_action
  category TEXT,                 -- for blanket
  constraints_json JSONB,        -- for blanket
  expires_at TIMESTAMPTZ,        -- NULL = indefinite (blanket only)
  consumed_at TIMESTAMPTZ,       -- per_action: when used
  revoked_at TIMESTAMPTZ,        -- blanket: when revoked
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    (kind = 'per_action' AND scope_event_type IS NOT NULL AND target_event_id IS NOT NULL)
    OR
    (kind = 'blanket' AND category IS NOT NULL)
  )
);

-- Fast per-action lookup
CREATE INDEX IF NOT EXISTS idx_approvals_per_action_lookup
  ON approvals_active(kind, scope_event_type, target_event_id)
  WHERE kind = 'per_action';

-- Fast blanket-category lookup
CREATE INDEX IF NOT EXISTS idx_approvals_blanket_lookup
  ON approvals_active(kind, category)
  WHERE kind = 'blanket';

-- Active-approval partial index
CREATE INDEX IF NOT EXISTS idx_approvals_active_only
  ON approvals_active(scope_event_type, category)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

GRANT SELECT ON approvals_active TO tenet0_app;
GRANT SELECT ON approvals_active TO tenet0_secops;
