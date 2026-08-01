#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${MEETING_PROCESSOR_RUNTIME_ROOT:-/run/titus-meeting-processor}
output_file=$runtime_dir/runtime.json
phase_app=${MEETING_PROCESSOR_PHASE_APP:-timeless-tech-solutions}
phase_env=${MEETING_PROCESSOR_PHASE_ENVIRONMENT:-production}
phase_path=/agents/hermes-titus/teamsmeetings

die() { printf 'titus meeting processor phase load: %s\n' "$*" >&2; exit 1; }

test "$(id -u)" -eq 0 || die 'must run as root'
test -x "$phase_bin" || die 'Phase CLI unavailable'
test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 400 || die 'Phase token file mode must be 0400'
test "$(stat -c %u "$token_file")" = 10001 || die 'Phase token file owner is invalid'
token_size=$(stat -c %s "$token_file")
test "$token_size" -ge 20 && test "$token_size" -le 8192 || die 'Phase token file size is invalid'
! LC_ALL=C grep -q '[[:space:][:cntrl:]]' "$token_file" || die 'Phase token file contains whitespace or control characters'
command -v jq >/dev/null 2>&1 || die 'jq unavailable'

install -d -o root -g 10003 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'
timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
  --path "$phase_path" --format json >"$work_dir/source.json"
unset PHASE_SERVICE_TOKEN

jq -e 'keys == [
  "MSGRAPH_CLIENT_ID", "MSGRAPH_CLIENT_SECRET", "MSGRAPH_ORGANIZER_USER_IDS",
  "MSGRAPH_TENANT_ID", "MSGRAPH_TEST_JOIN_URL", "MSGRAPH_WEBHOOK_ACCEPTED_RESOURCES",
  "MSGRAPH_WEBHOOK_CLIENT_STATE", "MSGRAPH_WEBHOOK_ENABLED", "MSGRAPH_WEBHOOK_PORT"
]' "$work_dir/source.json" >/dev/null || die 'unexpected Phase key set'

jq -e '
  def uuid: test("^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$");
  . as $source |
  ($source.MSGRAPH_ORGANIZER_USER_IDS | split(",")) as $organizers |
  (all($source[]; type == "string" and length > 0)) and
  ($source.MSGRAPH_TENANT_ID | uuid) and
  ($source.MSGRAPH_CLIENT_ID | uuid) and
  ($source.MSGRAPH_CLIENT_SECRET | length >= 20 and length <= 4096 and (test("[[:cntrl:]]") | not)) and
  $source.MSGRAPH_WEBHOOK_ENABLED == "false" and
  ($source.MSGRAPH_WEBHOOK_PORT | test("^[0-9]{2,5}$")) and
  ($organizers | length == 2 and .[0] != .[1] and all(.[]; uuid))
' "$work_dir/source.json" >/dev/null || die 'Phase meeting configuration invalid'

jq '{
  MSGRAPH_TENANT_ID,
  MSGRAPH_CLIENT_ID,
  MSGRAPH_CLIENT_SECRET,
  MSGRAPH_ORGANIZER_USER_IDS,
  MSGRAPH_POLL_INTERVAL_SECONDS: "300",
  MSGRAPH_INITIAL_LOOKBACK_HOURS: "168"
}' "$work_dir/source.json" >"$work_dir/runtime.json"

install -o root -g 10003 -m 0440 "$work_dir/runtime.json" "$output_file"
printf 'titus meeting processor phase load: ready\n'
