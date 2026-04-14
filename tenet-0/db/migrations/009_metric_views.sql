-- Metric views consumed by the SDK Metrics API. Per data-model.md, these are
-- read-only derivations from existing tables — no new state.
-- Granted to tenet0_app (for per-department Snapshot) and tenet0_secops.

CREATE OR REPLACE VIEW v_events_per_minute AS
SELECT source_department_id, COUNT(*)::INT AS events_per_minute
  FROM events
 WHERE published_at > now() - INTERVAL '1 minute'
 GROUP BY source_department_id;

CREATE OR REPLACE VIEW v_rejection_rate_per_hour AS
SELECT actor_id, action, COUNT(*)::INT AS rejections
  FROM audit_log
 WHERE recorded_at > now() - INTERVAL '1 hour'
   AND action LIKE 'event.rejected%'
 GROUP BY actor_id, action;

-- v_subscription_lag: cursor lookup happens once per subscription via the
-- LEFT JOIN (was a per-row subquery). The COUNT is still per subscription —
-- acceptable at Tenet-0 scale (<= 8 departments × a few subscriptions each)
-- but if the bus ever opens to many subscribers, denormalize
-- last_consumed_published_at onto event_subscriptions and update in
-- ack_event() to make this O(subs).
CREATE OR REPLACE VIEW v_subscription_lag AS
WITH cursors AS (
  SELECT
    es.department_id,
    es.subscription_key,
    COALESCE(ev.published_at, '1970-01-01'::timestamptz) AS cursor_at
  FROM event_subscriptions es
  LEFT JOIN events ev ON ev.id = es.last_consumed_event_id
)
SELECT
  c.department_id,
  c.subscription_key,
  COALESCE(
    (SELECT COUNT(*) FROM events e WHERE e.published_at > c.cursor_at),
    0
  )::INT AS lag_events
FROM cursors c;

-- Current-month budget utilization only. Historical months stay in
-- department_budgets but aren't surfaced through this view to keep
-- snapshot size bounded.
CREATE OR REPLACE VIEW v_budget_utilization AS
SELECT
  department_id,
  budget_month,
  spent_cents,
  (monthly_limit_cents + extension_cents) AS limit_cents,
  CASE WHEN (monthly_limit_cents + extension_cents) > 0
       THEN ROUND(spent_cents::NUMERIC
                  / (monthly_limit_cents + extension_cents) * 100, 2)
       ELSE 0
  END AS pct_utilized,
  status
  FROM department_budgets
 WHERE budget_month = date_trunc('month', current_date)::date;

CREATE OR REPLACE VIEW v_audit_log_write_rate AS
SELECT COUNT(*)::INT AS writes_per_minute
  FROM audit_log
 WHERE recorded_at > now() - INTERVAL '1 minute';

GRANT SELECT ON v_events_per_minute       TO tenet0_app;
GRANT SELECT ON v_rejection_rate_per_hour TO tenet0_app;
GRANT SELECT ON v_subscription_lag        TO tenet0_app;
GRANT SELECT ON v_budget_utilization      TO tenet0_app;
GRANT SELECT ON v_audit_log_write_rate    TO tenet0_app;

GRANT SELECT ON v_events_per_minute       TO tenet0_secops;
GRANT SELECT ON v_rejection_rate_per_hour TO tenet0_secops;
GRANT SELECT ON v_subscription_lag        TO tenet0_secops;
GRANT SELECT ON v_budget_utilization      TO tenet0_secops;
GRANT SELECT ON v_audit_log_write_rate    TO tenet0_secops;
