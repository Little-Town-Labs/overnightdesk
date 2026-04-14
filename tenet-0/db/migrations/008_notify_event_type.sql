-- Extend the NOTIFY payload to include event_type so subscribers can filter
-- without first fetching the row. Payload format: "<event_id>:<event_type>".
-- 8KB limit is plenty — UUID (36) + ":" + type (<64 typical) << 8192.
--
-- The body of publish_event is otherwise unchanged; only the final pg_notify
-- line differs.

CREATE OR REPLACE FUNCTION publish_event(
  p_credential TEXT,
  p_event_type TEXT,
  p_payload JSONB,
  p_parent_event_id TEXT,
  p_approval_event_id TEXT
)
RETURNS TABLE (status TEXT, event_id TEXT, error_msg TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dept TEXT;
  v_namespace TEXT;
  v_rule RECORD;
  v_approval RECORD;
  v_depth INT;
  v_new_id TEXT;
  v_version BIGINT;
BEGIN
  v_dept := _verify_credential(p_credential);
  IF v_dept IS NULL THEN
    PERFORM _audit('unknown', 'secops.violation.unauthenticated',
                   jsonb_build_object('event_type', p_event_type));
    RETURN QUERY SELECT 'rejected_unauthenticated'::TEXT, NULL::TEXT, 'invalid credential'::TEXT;
    RETURN;
  END IF;

  SELECT namespace_prefix INTO v_namespace FROM departments WHERE id = v_dept;
  IF p_event_type !~ ('^' || v_namespace || '\.') THEN
    PERFORM _audit(v_dept, 'event.rejected.namespace',
                   jsonb_build_object('event_type', p_event_type, 'expected_prefix', v_namespace));
    RETURN QUERY SELECT 'rejected_namespace'::TEXT, NULL::TEXT,
                        format('event_type %s does not start with %s.', p_event_type, v_namespace);
    RETURN;
  END IF;

  IF p_parent_event_id IS NOT NULL THEN
    v_depth := _causality_depth(p_parent_event_id);
    IF v_depth = -1 THEN
      PERFORM _audit(v_dept, 'event.rejected.causality_cycle',
                     jsonb_build_object('parent_id', p_parent_event_id));
      RETURN QUERY SELECT 'rejected_causality'::TEXT, NULL::TEXT, 'causality cycle detected'::TEXT;
      RETURN;
    ELSIF v_depth >= 10 THEN
      PERFORM _audit(v_dept, 'event.rejected.causality_depth',
                     jsonb_build_object('parent_id', p_parent_event_id, 'depth', v_depth));
      RETURN QUERY SELECT 'rejected_causality'::TEXT, NULL::TEXT,
                          format('causality depth %s exceeds limit', v_depth);
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_rule FROM _matching_rule(p_event_type) LIMIT 1;
  IF v_rule.requires_approval_mode = 'per_action' THEN
    IF p_approval_event_id IS NULL THEN
      PERFORM _audit(v_dept, 'event.rejected.constitution',
                     jsonb_build_object('event_type', p_event_type, 'reason', 'per_action approval required'));
      RETURN QUERY SELECT 'rejected_constitution'::TEXT, NULL::TEXT,
                          'per_action approval required but not provided'::TEXT;
      RETURN;
    END IF;
    SELECT * INTO v_approval FROM approvals_active
     WHERE approval_event_id = p_approval_event_id
       AND kind = 'per_action'
       AND scope_event_type = p_event_type
       AND consumed_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1;
    IF v_approval IS NULL THEN
      PERFORM _audit(v_dept, 'event.rejected.constitution',
                     jsonb_build_object('event_type', p_event_type, 'approval_id', p_approval_event_id, 'reason', 'approval invalid/expired/consumed'));
      RETURN QUERY SELECT 'rejected_constitution'::TEXT, NULL::TEXT,
                          'approval invalid, expired, or already consumed'::TEXT;
      RETURN;
    END IF;
    UPDATE approvals_active SET consumed_at = now() WHERE id = v_approval.id;
  ELSIF v_rule.requires_approval_mode = 'blanket_category' THEN
    IF NOT EXISTS (
      SELECT 1 FROM approvals_active
       WHERE kind = 'blanket'
         AND category = v_rule.approval_category
         AND consumed_at IS NULL
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
    ) THEN
      PERFORM _audit(v_dept, 'event.rejected.constitution',
                     jsonb_build_object('event_type', p_event_type, 'category', v_rule.approval_category, 'reason', 'no blanket authorization'));
      RETURN QUERY SELECT 'rejected_constitution'::TEXT, NULL::TEXT,
                          format('no active blanket authorization for category %s', v_rule.approval_category);
      RETURN;
    END IF;
  END IF;

  SELECT version_id INTO v_version FROM constitution_versions WHERE is_active LIMIT 1;
  IF v_version IS NULL THEN
    RETURN QUERY SELECT 'rejected_no_constitution'::TEXT, NULL::TEXT, 'no active constitution'::TEXT;
    RETURN;
  END IF;

  v_new_id := gen_random_uuid()::TEXT;
  INSERT INTO events (id, event_type, source_department_id, payload, parent_event_id, constitution_version_id)
  VALUES (v_new_id, p_event_type, v_dept, p_payload, p_parent_event_id, v_version);

  IF p_event_type = 'president.approved' THEN
    INSERT INTO approvals_active (
      approval_event_id, kind, scope_event_type, target_event_id, expires_at
    ) VALUES (
      v_new_id,
      'per_action',
      p_payload->>'scope',
      p_payload->>'approves_event_id',
      COALESCE((p_payload->>'expires_at')::timestamptz, now() + interval '10 minutes')
    );
  ELSIF p_event_type = 'president.authorization.granted' THEN
    INSERT INTO approvals_active (
      approval_event_id, kind, category, constraints_json, expires_at
    ) VALUES (
      v_new_id,
      'blanket',
      p_payload->>'category',
      p_payload->'constraints',
      (p_payload->>'expires_at')::timestamptz
    );
  ELSIF p_event_type = 'president.authorization.revoked' THEN
    UPDATE approvals_active
       SET revoked_at = now()
     WHERE kind = 'blanket'
       AND category = p_payload->>'category'
       AND revoked_at IS NULL;
  END IF;

  PERFORM _audit(v_dept, 'event.published',
                 jsonb_build_object('event_id', v_new_id, 'event_type', p_event_type));
  -- Include event_type in payload so subscribers can filter without fetching.
  PERFORM pg_notify('event_bus', v_new_id || ':' || p_event_type);

  RETURN QUERY SELECT 'ok'::TEXT, v_new_id, NULL::TEXT;
END;
$$;
