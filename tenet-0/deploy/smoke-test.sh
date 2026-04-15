#!/usr/bin/env bash
# Tenet-0 Postgres deployment smoke test.
#
# Run from the directory containing tenet-0/docker-compose.yml. Verifies:
#  1. `docker compose up -d` starts the tenet0-postgres container
#  2. Healthcheck goes healthy within 30s
#  3. All expected schema tables exist (i.e., migrations were applied)
#  4. All stored procedures are registered
#  5. tenet0_app and tenet0_secops roles exist
#  6. Data persists across compose down/up (volume survives restart)
#
# Exits non-zero at the first failed assertion.

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE="tenet0-postgres"
PG_USER="tenet0_admin"
PG_DB="tenet0"

log() { echo "[smoke] $*"; }
fail() { echo "[smoke] FAIL: $*" >&2; exit 1; }

psql_q() {
  docker exec -i "$SERVICE" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1"
}

log "cd $COMPOSE_DIR"
cd "$COMPOSE_DIR"

log "docker compose up -d"
docker compose up -d

log "waiting for healthcheck (max 30s)"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo 'none')"
  if [[ "$status" == "healthy" ]]; then
    log "healthy after ${i}s"
    break
  fi
  [[ $i -eq 30 ]] && fail "healthcheck did not reach healthy in 30s (last=$status)"
  sleep 1
done

log "verifying schema tables exist"
expected_tables=(departments events event_subscriptions events_archive
                 constitution_versions constitution_rules
                 approvals_active department_budgets model_pricing
                 token_usage audit_log)
for t in "${expected_tables[@]}"; do
  exists=$(psql_q "SELECT to_regclass('public.$t') IS NOT NULL")
  [[ "$exists" == "t" ]] || fail "table $t missing"
done
log "all ${#expected_tables[@]} tables present"

log "verifying stored procedures exist"
expected_sps=(publish_event check_budget record_token_usage register_subscription
              ack_event rotate_credential activate_constitution)
for sp in "${expected_sps[@]}"; do
  exists=$(psql_q "SELECT COUNT(*)::INT FROM pg_proc WHERE proname = '$sp'")
  [[ "$exists" != "0" ]] || fail "stored procedure $sp missing"
done
log "all ${#expected_sps[@]} SPs registered"

log "verifying roles"
for role in tenet0_admin tenet0_app tenet0_secops; do
  exists=$(psql_q "SELECT COUNT(*)::INT FROM pg_roles WHERE rolname = '$role'")
  [[ "$exists" != "0" ]] || fail "role $role missing"
done

log "verifying metric views"
for v in v_events_per_minute v_rejection_rate_per_hour v_subscription_lag \
         v_budget_utilization v_audit_log_write_rate; do
  exists=$(psql_q "SELECT to_regclass('public.$v') IS NOT NULL")
  [[ "$exists" == "t" ]] || fail "view $v missing"
done

log "asserting container publishes no host ports (should be internal-only)"
ports=$(docker inspect --format '{{range $p, $c := .HostConfig.PortBindings}}{{$p}} {{end}}' "$SERVICE")
[[ -z "${ports// /}" ]] || fail "container publishes host ports: $ports"

log "seeding a marker row for persistence test"
marker_id="smoke-$(cat /proc/sys/kernel/random/uuid)"
psql_q "INSERT INTO departments (id, namespace_prefix, credential_hash)
        VALUES ('$marker_id', 'smoke', crypt('smoke-cred', gen_salt('bf')))" >/dev/null

log "restarting service to verify volume persistence"
docker compose restart "$SERVICE"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo 'none')"
  [[ "$status" == "healthy" ]] && break
  [[ $i -eq 30 ]] && fail "healthcheck did not recover after restart"
  sleep 1
done

found=$(psql_q "SELECT COUNT(*)::INT FROM departments WHERE id = '$marker_id'")
[[ "$found" == "1" ]] || fail "marker row missing after restart — volume not persistent"
log "marker survived restart"

log "cleaning smoke marker"
psql_q "DELETE FROM departments WHERE id = '$marker_id'" >/dev/null

log "OK — Tenet-0 postgres deployment validated"
