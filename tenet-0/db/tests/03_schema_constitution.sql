-- Test: constitution_versions and constitution_rules tables

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by)
VALUES ('abc', 'def', 'principles...', 'version: 1', 'gary');

INSERT INTO constitution_rules (
  constitution_version_id, rule_id, event_type_pattern,
  requires_approval_mode, approval_category, additional_checks_json
) VALUES (
  (SELECT max(version_id) FROM constitution_versions),
  'fin-payment-outbound',
  'fin.payment.outbound',
  'per_action',
  NULL,
  '{"required_payload_fields":["amount_cents"]}'::jsonb
);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM constitution_rules
    WHERE rule_id = 'fin-payment-outbound';
  ASSERT v_count = 1, 'rule should exist';
END $$;

ROLLBACK;

\echo 'PASS: constitution'
