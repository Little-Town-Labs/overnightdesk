#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${TITUS_EMAIL_POLLER_RUNTIME_DIR:-/run/titus-email-poller}
output_file=${TITUS_EMAIL_POLLER_RUNTIME_CONFIG:-/run/titus-email-poller/runtime.json}
phase_app=${TITUS_PHASE_APP:-azure-ops}
phase_env=${TITUS_PHASE_ENVIRONMENT:-production}

die() { printf 'titus email poller phase load: %s\n' "$*" >&2; exit 1; }

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
  --path /agents/hermes-titus/runtime --format json >"$work_dir/core.json"
timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
  --path /agents/hermes-titus/email --format json >"$work_dir/email.json"

jq -e 'keys == ["AGENTMAIL_API_KEY", "AGENTMAIL_EMAIL_ADDRESS", "AGENTMAIL_INBOX_ID", "HERMES_DEFAULT_MODEL", "OPENROUTER_API_KEY"]' \
  "$work_dir/core.json" >/dev/null || die 'unexpected core key set'
jq -e 'keys == ["AGENTMAIL_APPROVAL_ALLOWED_SENDERS", "AGENTMAIL_APPROVAL_SIGNING_SECRET", "AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS", "AGENTMAIL_MAX_MESSAGES_PER_CYCLE", "AGENTMAIL_POLLING_ENABLED", "AGENTMAIL_POLL_INTERVAL_SECONDS"]' \
  "$work_dir/email.json" >/dev/null || die 'unexpected email key set'

jq -s '.[0] * .[1]' "$work_dir/core.json" "$work_dir/email.json" >"$work_dir/runtime.json"
jq -e '
  all(.[]; type == "string" and length > 0) and
  (.AGENTMAIL_POLLING_ENABLED == "true" or .AGENTMAIL_POLLING_ENABLED == "false") and
  (.HERMES_DEFAULT_MODEL == "x-ai/grok-4.3") and
  (.AGENTMAIL_APPROVAL_SIGNING_SECRET | length >= 32)
' "$work_dir/runtime.json" >/dev/null || die 'invalid runtime value'

unset PHASE_SERVICE_TOKEN
install -o root -g 10002 -m 0440 "$work_dir/runtime.json" "$output_file"
printf 'titus email poller phase load: ready\n'
