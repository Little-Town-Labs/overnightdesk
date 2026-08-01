#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${TITUS_MEETING_ANALYZER_RUNTIME_ROOT:-/run/titus-meeting-analyzer}
phase_app=${MEETING_PROCESSOR_PHASE_APP:-timeless-tech-solutions}
phase_env=${MEETING_PROCESSOR_PHASE_ENVIRONMENT:-production}

test "$(id -u)" -eq 0
test -x "$phase_bin" && test -f "$token_file" && test ! -L "$token_file"
test "$(stat -c %a "$token_file")" = 400 && test "$(stat -c %u "$token_file")" = 10001
install -d -o root -g 10004 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT
chmod 0700 "$work_dir"
PHASE_SERVICE_TOKEN=$(<"$token_file"); export PHASE_SERVICE_TOKEN
timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" --path /agents/hermes-titus/runtime --format json >"$work_dir/core.json"
timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" --path /agents/hermes-titus/meetingbriefs --format json >"$work_dir/brief.json"
unset PHASE_SERVICE_TOKEN
jq -e '(.OPENROUTER_API_KEY | type == "string" and length >= 32) and (.HERMES_DEFAULT_MODEL | type == "string" and length > 0)' "$work_dir/core.json" >/dev/null
jq -e '(.MEETING_ANALYZER_API_KEY | type == "string" and length >= 32) and (.MEETING_ANALYZER_MODEL | type == "string" and test("^[a-z0-9_.-]+/[A-Za-z0-9_.:-]+$"))' "$work_dir/brief.json" >/dev/null
jq -nr --arg key "$(jq -r .OPENROUTER_API_KEY "$work_dir/core.json")" --arg model "$(jq -r .MEETING_ANALYZER_MODEL "$work_dir/brief.json")" --arg api "$(jq -r .MEETING_ANALYZER_API_KEY "$work_dir/brief.json")" '
  ["OPENROUTER_API_KEY=" + $key, "HERMES_DEFAULT_MODEL=" + $model, "HERMES_INFERENCE_MODEL=" + $model, "API_SERVER_ENABLED=true", "API_SERVER_HOST=0.0.0.0", "API_SERVER_KEY=" + $api] | .[]
' >"$work_dir/runtime.env"
install -o root -g 10004 -m 0440 "$work_dir/runtime.env" "$runtime_dir/runtime.env"
printf 'titus meeting analyzer phase load: ready\n'
