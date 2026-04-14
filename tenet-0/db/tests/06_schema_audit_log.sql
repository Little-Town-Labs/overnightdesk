-- Test: audit_log append-only behavior, role permissions

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO audit_log (actor_id, action, detail_json)
VALUES ('ops', 'event.published', '{"event_id":"e1"}'::jsonb);

INSERT INTO audit_log (actor_id, action, detail_json)
VALUES ('secops', 'secops.violation.namespace', '{"attempted_type":"fin.x"}'::jsonb);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM audit_log WHERE actor_id IN ('ops', 'secops');
  ASSERT v_count = 2, 'expected 2 audit entries';
END $$;

-- Role check: tenet0_app should not have UPDATE or DELETE on audit_log
DO $$
DECLARE v_has_update boolean;
DECLARE v_has_delete boolean;
BEGIN
  SELECT has_table_privilege('tenet0_app', 'audit_log', 'UPDATE') INTO v_has_update;
  SELECT has_table_privilege('tenet0_app', 'audit_log', 'DELETE') INTO v_has_delete;
  ASSERT NOT v_has_update, 'tenet0_app must not have UPDATE on audit_log';
  ASSERT NOT v_has_delete, 'tenet0_app must not have DELETE on audit_log';
END $$;

ROLLBACK;

\echo 'PASS: audit_log'
