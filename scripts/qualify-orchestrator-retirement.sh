#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
suite_root="$(cd "${repo_root}/.." && pwd)"
ops_repo="${OPS_REPO:-${suite_root}/overnightdesk-ops}"
audit_repo="${AUDIT_REPO:-${suite_root}/overnightdesk-operations-audit}"
standard_repo="${STANDARD_REPO:-${suite_root}/overnightdesk-platform-standard}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "required file missing: $1"
}

for path in "$ops_repo" "$audit_repo" "$standard_repo"; do
  [[ -d "$path" ]] || fail "repository not found: $path"
done

if rg -n \
  'platform-orchestrator|docker-socket-proxy|platform-orchestrator-db-data|orchestrator-fr-snapshots|DOCKER_HOST=tcp://docker-socket-proxy' \
  "${repo_root}/docker-compose.yml"; then
  fail "active Compose still declares the retired control plane"
fi

if rg -n \
  'ORCHESTRATOR_DATABASE_URL|ORCHESTRATOR_FR_TOKEN|ORCHESTRATOR_BASE_URL|get_platform_fr_|trigger_platform_fr_|tools/flight-recorder' \
  "${ops_repo}/src" --glob '!*.test.ts'; then
  fail "Ops still depends on the retired orchestrator or Flight Recorder"
fi

if rg -n 'overnightdesk-platform-orchestrator:8080' \
  "${audit_repo}/standards/network-requirements.yaml"; then
  fail "audit still allows the retired orchestrator upstream"
fi

if rg -n 'overnightdesk-platform-orchestrator$' \
  "${audit_repo}/deploy/collect.sh"; then
  fail "audit log collection still expects the retired orchestrator"
fi

comp_block="$(
  awk '
    /- id: COMP-004/ {capture=1}
    capture {print}
    capture && /constitution_ref:/ {exit}
  ' "${audit_repo}/standards/compliance-requirements.yaml"
)"
if [[ "$comp_block" == *"overnightdesk-docker-socket-proxy"* ]]; then
  fail "Docker socket compliance still grants a proxy exception"
fi

incident_file="${standard_repo}/WHAT/platform-incidents.yaml"
require_file "$incident_file"
incident_count="$(rg -c '^  - id: ' "$incident_file")"
[[ "$incident_count" == "3" ]] ||
  fail "expected 3 preserved incidents, found ${incident_count}"

require_file \
  "${standard_repo}/docs/decisions/007-retire-platform-orchestrator.md"
require_file \
  "${standard_repo}/docs/runbooks/orchestrator-retirement.md"

orchestrator_vhost="${repo_root}/infra/nginx/orchestrator-retired.conf"
require_file "$orchestrator_vhost"
if rg -n 'proxy_pass|upstream' "$orchestrator_vhost"; then
  fail "retired orchestrator vhost must not declare an upstream"
fi
rg -q 'server_name orchestrator\.overnightdesk\.com' "$orchestrator_vhost" ||
  fail "retired orchestrator vhost is not bound to the exact hostname"
rg -q 'return 404;' "$orchestrator_vhost" ||
  fail "retired orchestrator vhost must deny HTTP"
rg -q 'ssl_reject_handshake on;' "$orchestrator_vhost" ||
  fail "retired orchestrator vhost must reject HTTPS before default routing"

provisioner_vhost="${repo_root}/infra/nginx/provisioner.conf"
require_file "$provisioner_vhost"
rg -q 'provision-infra.*deprovision.*restart.*write-secrets' \
  "$provisioner_vhost" ||
  fail "provisioner vhost does not deny all retired lifecycle paths"

rg -q 'separately_approved_infrastructure_outside_aegis_prod' \
  "${standard_repo}/WHAT/tenant-provisioning.yaml" ||
  fail "customer-plane placement policy is missing"

if command -v docker >/dev/null 2>&1 &&
  docker compose version >/dev/null 2>&1; then
  docker compose -f "${repo_root}/docker-compose.yml" config --quiet
fi

echo "PASS: orchestrator retirement source contract"
