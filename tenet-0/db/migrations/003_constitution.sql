-- Tenet-0 constitution versioning and rule tables

CREATE TABLE IF NOT EXISTS constitution_versions (
  version_id BIGSERIAL PRIMARY KEY,
  prose_sha256 TEXT NOT NULL,
  rules_sha256 TEXT NOT NULL,
  prose_text TEXT NOT NULL,
  rules_yaml TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_constitution_active
  ON constitution_versions((1)) WHERE is_active;

-- Attach the deferred FK on events.constitution_version_id
ALTER TABLE events
  ADD CONSTRAINT events_constitution_version_fk
  FOREIGN KEY (constitution_version_id)
  REFERENCES constitution_versions(version_id)
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS constitution_rules (
  id BIGSERIAL PRIMARY KEY,
  constitution_version_id BIGINT NOT NULL REFERENCES constitution_versions(version_id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  event_type_pattern TEXT NOT NULL,
  requires_approval_mode TEXT CHECK (requires_approval_mode IN ('per_action', 'blanket_category', 'none')),
  approval_category TEXT,
  additional_checks_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_const_rules_version_pattern
  ON constitution_rules(constitution_version_id, event_type_pattern);

GRANT SELECT ON constitution_versions TO tenet0_app;
GRANT SELECT ON constitution_rules TO tenet0_app;
GRANT SELECT ON constitution_versions TO tenet0_secops;
GRANT SELECT ON constitution_rules TO tenet0_secops;
