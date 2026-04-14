-- Tenet-0 stored procedures
-- The single mutation surface for all client libraries.
-- All security and constitutional enforcement happens here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for crypt() / gen_salt()

-- ---------------------------------------------------------------------------
-- Internal helper: resolve a credential to a department, or return NULL.
-- Verifies bcrypt hash against active credential or grace-window previous.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _verify_credential(p_credential TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dept_id TEXT;
BEGIN
  SELECT id INTO v_dept_id
    FROM departments
   WHERE crypt(p_credential, credential_hash) = credential_hash
      OR (
        previous_credential_hash IS NOT NULL
        AND previous_valid_until > now()
        AND crypt(p_credential, previous_credential_hash) = previous_credential_hash
      )
   LIMIT 1;
  RETURN v_dept_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal helper: append to audit_log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _audit(p_actor TEXT, p_action TEXT, p_detail JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO audit_log (actor_id, action, detail_json) VALUES (p_actor, p_action, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- Internal helper: walk causality chain, return depth or NULL on cycle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _causality_depth(p_event_id TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_depth INT := 0;
  v_cur TEXT := p_event_id;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  WHILE v_cur IS NOT NULL AND v_depth <= 12 LOOP
    IF v_cur = ANY(v_seen) THEN
      RETURN -1;  -- cycle
    END IF;
    v_seen := array_append(v_seen, v_cur);
    SELECT parent_event_id INTO v_cur FROM events WHERE id = v_cur;
    v_depth := v_depth + 1;
  END LOOP;
  RETURN v_depth;
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal helper: find matching constitution rule for an event_type
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _matching_rule(p_event_type TEXT)
RETURNS TABLE (rule_id TEXT, requires_approval_mode TEXT, approval_category TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_version BIGINT;
BEGIN
  SELECT version_id INTO v_version FROM constitution_versions WHERE is_active LIMIT 1;
  IF v_version IS NULL THEN
    RETURN;
  END IF;

  -- Exact match first
  RETURN QUERY
    SELECT cr.rule_id, cr.requires_approval_mode, cr.approval_category
      FROM constitution_rules cr
     WHERE cr.constitution_version_id = v_version
       AND cr.event_type_pattern = p_event_type
     LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Wildcard suffix match (e.g., secops.violation.* matches secops.violation.namespace)
  RETURN QUERY
    SELECT cr.rule_id, cr.requires_approval_mode, cr.approval_category
      FROM constitution_rules cr
     WHERE cr.constitution_version_id = v_version
       AND cr.event_type_pattern LIKE '%.*'
       AND p_event_type LIKE replace(cr.event_type_pattern, '*', '%')
     LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- publish_event: the central enforcement point
-- Returns: status ('ok', 'rejected_*'), event_id, error_msg
-- ---------------------------------------------------------------------------
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
  -- Step 1: authenticate
  v_dept := _verify_credential(p_credential);
  IF v_dept IS NULL THEN
    PERFORM _audit('unknown', 'secops.violation.unauthenticated',
                   jsonb_build_object('event_type', p_event_type));
    RETURN QUERY SELECT 'rejected_unauthenticated'::TEXT, NULL::TEXT, 'invalid credential'::TEXT;
    RETURN;
  END IF;

  -- Step 2: namespace check
  SELECT namespace_prefix INTO v_namespace FROM departments WHERE id = v_dept;
  IF p_event_type !~ ('^' || v_namespace || '\.') THEN
    PERFORM _audit(v_dept, 'event.rejected.namespace',
                   jsonb_build_object('event_type', p_event_type, 'expected_prefix', v_namespace));
    RETURN QUERY SELECT 'rejected_namespace'::TEXT, NULL::TEXT,
                        format('event_type %s does not start with %s.', p_event_type, v_namespace);
    RETURN;
  END IF;

  -- Step 3: causality chain depth (only if parent provided)
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

  -- Step 4: constitutional rule check
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
    -- Mark approval consumed (single-use)
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

  -- Step 5: get active constitution version
  SELECT version_id INTO v_version FROM constitution_versions WHERE is_active LIMIT 1;
  IF v_version IS NULL THEN
    RETURN QUERY SELECT 'rejected_no_constitution'::TEXT, NULL::TEXT, 'no active constitution'::TEXT;
    RETURN;
  END IF;

  -- Step 6: insert event
  v_new_id := gen_random_uuid()::TEXT;
  INSERT INTO events (id, event_type, source_department_id, payload, parent_event_id, constitution_version_id)
  VALUES (v_new_id, p_event_type, v_dept, p_payload, p_parent_event_id, v_version);

  -- Step 7: side effects — record approval grants in approvals_active
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
      (p_payload->>'expires_at')::timestamptz  -- NULL means indefinite
    );
  ELSIF p_event_type = 'president.authorization.revoked' THEN
    UPDATE approvals_active
       SET revoked_at = now()
     WHERE kind = 'blanket'
       AND category = p_payload->>'category'
       AND revoked_at IS NULL;
  END IF;

  -- Step 8: audit + notify
  PERFORM _audit(v_dept, 'event.published',
                 jsonb_build_object('event_id', v_new_id, 'event_type', p_event_type));
  PERFORM pg_notify('event_bus', v_new_id);

  RETURN QUERY SELECT 'ok'::TEXT, v_new_id, NULL::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- check_budget: read-only pre-call check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_budget(p_credential TEXT)
RETURNS TABLE (status TEXT, limit_cents INT, spent_cents INT, remaining_cents INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dept TEXT;
  v_month DATE := date_trunc('month', current_date)::date;
  v_budget RECORD;
BEGIN
  v_dept := _verify_credential(p_credential);
  IF v_dept IS NULL THEN
    RETURN QUERY SELECT 'unauthenticated'::TEXT, 0, 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_budget FROM department_budgets
   WHERE department_id = v_dept AND budget_month = v_month;
  IF NOT FOUND THEN
    -- No budget configured = effectively unlimited (warn departments to set one)
    RETURN QUERY SELECT 'ok'::TEXT, 0, 0, 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_budget.status::TEXT,
    (v_budget.monthly_limit_cents + v_budget.extension_cents),
    v_budget.spent_cents,
    GREATEST(0, (v_budget.monthly_limit_cents + v_budget.extension_cents) - v_budget.spent_cents);
END;
$$;

-- ---------------------------------------------------------------------------
-- record_token_usage: post-call accounting + threshold enforcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_token_usage(
  p_credential TEXT,
  p_model TEXT,
  p_input_tokens INT,
  p_output_tokens INT,
  p_event_id TEXT
)
RETURNS TABLE (cost_cents INT, budget_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dept TEXT;
  v_month DATE := date_trunc('month', current_date)::date;
  v_pricing RECORD;
  v_cost INT;
  v_budget RECORD;
  v_pct NUMERIC;
  v_new_status TEXT;
  v_warn_emit BOOL;
BEGIN
  v_dept := _verify_credential(p_credential);
  IF v_dept IS NULL THEN
    RETURN QUERY SELECT 0, 'unauthenticated'::TEXT;
    RETURN;
  END IF;

  -- Compute cost
  SELECT * INTO v_pricing FROM model_pricing WHERE model = p_model;
  IF v_pricing IS NULL THEN
    -- Unknown model; record zero cost but log it
    v_cost := 0;
    PERFORM _audit(v_dept, 'governor.unknown_model', jsonb_build_object('model', p_model));
  ELSE
    v_cost := CEIL(
      (p_input_tokens::NUMERIC * v_pricing.input_cents_per_mtok / 1000000.0)
      + (p_output_tokens::NUMERIC * v_pricing.output_cents_per_mtok / 1000000.0)
    )::INT;
  END IF;

  -- Append to ledger
  INSERT INTO token_usage (department_id, model, input_tokens, output_tokens, cost_cents, event_id)
  VALUES (v_dept, p_model, p_input_tokens, p_output_tokens, v_cost, p_event_id);

  -- Update or create budget row for this month
  INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents, spent_cents)
  VALUES (v_dept, v_month, 0, v_cost)
  ON CONFLICT (department_id, budget_month) DO UPDATE
    SET spent_cents = department_budgets.spent_cents + v_cost,
        updated_at = now();

  SELECT * INTO v_budget FROM department_budgets
   WHERE department_id = v_dept AND budget_month = v_month;

  -- Compute % and decide status transitions
  IF (v_budget.monthly_limit_cents + v_budget.extension_cents) > 0 THEN
    v_pct := v_budget.spent_cents::NUMERIC / (v_budget.monthly_limit_cents + v_budget.extension_cents) * 100.0;
  ELSE
    v_pct := 0;
  END IF;

  v_new_status := v_budget.status;
  v_warn_emit := false;

  IF v_pct >= 100.0 AND v_budget.status != 'blocked' THEN
    v_new_status := 'blocked';
    PERFORM _audit(v_dept, 'budget.blocked',
                   jsonb_build_object('spent_cents', v_budget.spent_cents, 'limit_cents', v_budget.monthly_limit_cents));
  ELSIF v_pct >= v_budget.warn_threshold_pct AND NOT v_budget.warn_at_pct_emitted THEN
    v_new_status := CASE WHEN v_new_status = 'blocked' THEN 'blocked' ELSE 'warning' END;
    v_warn_emit := true;
    PERFORM _audit(v_dept, 'budget.warned',
                   jsonb_build_object('spent_cents', v_budget.spent_cents, 'pct', v_pct));
  END IF;

  IF v_new_status != v_budget.status OR v_warn_emit THEN
    UPDATE department_budgets
       SET status = v_new_status,
           warn_at_pct_emitted = warn_at_pct_emitted OR v_warn_emit,
           updated_at = now()
     WHERE department_id = v_dept AND budget_month = v_month;
  END IF;

  RETURN QUERY SELECT v_cost, v_new_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- register_subscription
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_subscription(
  p_credential TEXT, p_subscription_key TEXT, p_pattern TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dept TEXT;
  v_id BIGINT;
BEGIN
  v_dept := _verify_credential(p_credential);
  IF v_dept IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO event_subscriptions (department_id, subscription_key, pattern)
  VALUES (v_dept, p_subscription_key, p_pattern)
  ON CONFLICT (department_id, subscription_key) DO UPDATE SET pattern = EXCLUDED.pattern
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- ack_event: subscriber confirms processing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ack_event(
  p_credential TEXT, p_subscription_key TEXT, p_event_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_dept TEXT;
BEGIN
  v_dept := _verify_credential(p_credential);
  IF v_dept IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  UPDATE event_subscriptions
     SET last_consumed_event_id = p_event_id,
         last_heartbeat_at = now()
   WHERE department_id = v_dept AND subscription_key = p_subscription_key;
END;
$$;

-- ---------------------------------------------------------------------------
-- rotate_credential: admin-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rotate_credential(
  p_department_id TEXT, p_new_credential_hash TEXT, p_grace_minutes INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE departments
     SET previous_credential_hash = credential_hash,
         previous_valid_until = now() + (p_grace_minutes || ' minutes')::interval,
         credential_hash = p_new_credential_hash,
         credential_rotated_at = now(),
         updated_at = now()
   WHERE id = p_department_id;
  PERFORM _audit(p_department_id, 'credential.rotated',
                 jsonb_build_object('grace_minutes', p_grace_minutes));
END;
$$;

-- ---------------------------------------------------------------------------
-- activate_constitution: admin-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_constitution(p_version_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE constitution_versions SET is_active = false WHERE is_active;
  UPDATE constitution_versions SET is_active = true WHERE version_id = p_version_id;
  PERFORM _audit('admin', 'constitution.activated',
                 jsonb_build_object('version_id', p_version_id));
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants for app role: EXECUTE on public SPs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION publish_event(TEXT, TEXT, JSONB, TEXT, TEXT) TO tenet0_app;
GRANT EXECUTE ON FUNCTION check_budget(TEXT) TO tenet0_app;
GRANT EXECUTE ON FUNCTION record_token_usage(TEXT, TEXT, INT, INT, TEXT) TO tenet0_app;
GRANT EXECUTE ON FUNCTION register_subscription(TEXT, TEXT, TEXT) TO tenet0_app;
GRANT EXECUTE ON FUNCTION ack_event(TEXT, TEXT, TEXT) TO tenet0_app;
-- rotate_credential and activate_constitution are admin-only (no grant to app)
