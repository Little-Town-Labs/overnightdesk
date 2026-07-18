#!/usr/bin/env bash
set -euo pipefail

instance=${1:?route instance required}
case "$instance" in
  titus) default_phase_app=timeless-tech-solutions; default_token_file=/opt/control-tower/secrets/phase-service-token ;;
  agent|walter|mitchel) default_phase_app=overnightdesk; default_token_file=/opt/overnightdesk/secrets/phase-service-token ;;
  *) printf 'invalid route instance\n' >&2; exit 2 ;;
esac

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-$default_token_file}
runtime_dir=${EMAIL_INTAKE_RUNTIME_ROOT:-/run/hermes-email-intake}/$instance
output_file=$runtime_dir/runtime.json
phase_app=${EMAIL_INTAKE_PHASE_APP:-$default_phase_app}
phase_env=${EMAIL_INTAKE_PHASE_ENVIRONMENT:-production}
phase_path=/agents/hermes-email-intake/$instance

die() { printf 'hermes email intake %s phase load: %s\n' "$instance" "$*" >&2; exit 1; }

test "$(id -u)" -eq 0 || die 'must run as root'
test -x "$phase_bin" || die 'Phase CLI unavailable'
test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 400 || die 'Phase token file mode must be 0400'
test "$(stat -c %u "$token_file")" = 10001 || die 'Phase token file owner is invalid'
token_size=$(stat -c %s "$token_file")
test "$token_size" -ge 20 && test "$token_size" -le 8192 || die 'Phase token file size is invalid'
! LC_ALL=C grep -q '[[:space:][:cntrl:]]' "$token_file" || die 'Phase token file contains whitespace or control characters'
command -v jq >/dev/null 2>&1 || die 'jq unavailable'

install -d -o root -g 10002 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'
timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
  --path "$phase_path" --format json >"$work_dir/runtime.json"
unset PHASE_SERVICE_TOKEN

jq -e 'keys == [
  "AGENTMAIL_API_KEY", "AGENTMAIL_EMAIL_ADDRESS", "AGENTMAIL_INBOX_ID",
  "AGENTMAIL_MAX_MESSAGES_PER_CYCLE", "AGENTMAIL_POLLING_ENABLED",
  "AGENTMAIL_POLL_INTERVAL_SECONDS", "DATABASE_URL", "EMAIL_ALLOWED_SENDERS",
  "EMAIL_MAX_CLEAN_CLAIMS_PER_CYCLE", "EMAIL_ROUTE_ID", "HERMES_API_KEY",
  "HERMES_BASE_URL", "HERMES_RUN_TIMEOUT_SECONDS", "HERMES_TARGET_AGENT"
]' "$work_dir/runtime.json" >/dev/null || die 'unexpected runtime key set'
jq -e --arg route "$instance" '
  all(.[]; type == "string" and length > 0) and
  .EMAIL_ROUTE_ID == $route and
  (.AGENTMAIL_POLLING_ENABLED == "true" or .AGENTMAIL_POLLING_ENABLED == "false")
' "$work_dir/runtime.json" >/dev/null || die 'runtime must be complete and route-consistent'

install -o root -g 10002 -m 0440 "$work_dir/runtime.json" "$output_file"
printf 'hermes email intake %s phase load: ready\n' "$instance"
