#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${TITUS_MEETING_FILER_RUNTIME_ROOT:-/run/titus-meeting-filer}
marker=${TITUS_MEETING_FILER_MARKER:-/etc/overnightdesk/titus-meeting-filing.enabled}
test "$(id -u)" -eq 0
test -x "$phase_bin" && test -f "$token_file" && test ! -L "$token_file"
test "$(stat -c %a "$token_file")" = 400 && test "$(stat -c %u "$token_file")" = 10001
install -d -o root -g 10005 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT
chmod 0700 "$work_dir"
enabled=false
if test -e "$marker" || test -L "$marker"; then
  test -f "$marker" && test ! -L "$marker" && test "$(stat -c %u "$marker")" = 0 && test "$(stat -c %a "$marker")" = 444 && test "$(stat -c %s "$marker")" = 0
  enabled=true
fi
PHASE_SERVICE_TOKEN=$(<"$token_file"); export PHASE_SERVICE_TOKEN
timeout 30 "$phase_bin" secrets export --app timeless-tech-solutions --env production --path /agents/hermes-titus/meetingbriefs --format json >"$work_dir/brief.json"
unset PHASE_SERVICE_TOKEN
jq -e '(.MEETING_PROJECT_ROUTES_JSON | type == "string" and length > 0) and (.MEETING_FILER_API_TOKEN | type == "string" and length >= 32) and (.MEETING_GARY_EMAIL | type == "string" and contains("@")) and (.MEETING_AUSTIN_EMAIL | type == "string" and contains("@")) and (.MEETING_GARY_EMAIL | ascii_downcase) != (.MEETING_AUSTIN_EMAIL | ascii_downcase)' "$work_dir/brief.json" >/dev/null
if $enabled; then
  jq '{MEETING_FILER_ENABLED:"true",MEETING_FILER_BEARER:.MEETING_FILER_API_TOKEN,MEETING_PROJECTS_ROOT:"/projects",HERMES_BINARY:"/opt/hermes/.venv/bin/hermes",MEETING_FILER_LEDGER_PATH:"/filer-data/ledger.json",MEETING_PROJECT_ROUTES_JSON,MEETING_FILER_PROTECTED_VALUES_JSON:([.MEETING_GARY_EMAIL,.MEETING_AUSTIN_EMAIL]|tojson)}' "$work_dir/brief.json" >"$work_dir/runtime.json"
else
  jq '{MEETING_FILER_ENABLED:"false",MEETING_PROJECTS_ROOT:"/projects",HERMES_BINARY:"/opt/hermes/.venv/bin/hermes",MEETING_FILER_LEDGER_PATH:"/filer-data/ledger.json",MEETING_PROJECT_ROUTES_JSON}' "$work_dir/brief.json" >"$work_dir/runtime.json"
fi
install -o root -g 10004 -m 0440 "$work_dir/runtime.json" "$runtime_dir/runtime.json"
test "$(stat -c %u:%g:%a "$runtime_dir")" = 0:10005:750
test "$(stat -c %u:%g:%a "$runtime_dir/runtime.json")" = 0:10004:440
printf 'titus meeting filer phase load: ready\n'
