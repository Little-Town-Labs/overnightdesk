#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${TITUS_RUNTIME_DIR:-/run/hermes-titus}
output_file=${TITUS_RUNTIME_ENV:-/run/hermes-titus/runtime.env}
phase_app=${TITUS_PHASE_APP:-timeless-tech-solutions}
phase_env=${TITUS_PHASE_ENVIRONMENT:-production}
oidc_client_file=${TITUS_DASHBOARD_OIDC_CLIENT_FILE:-/opt/hermes-titus/secrets/dashboard-oidc-client-id}

die() {
  printf 'hermes-titus phase load: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
test -x "$phase_bin" || die 'Phase CLI unavailable'
test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 400 || die 'Phase token file mode must be 0400'
test "$(stat -c %u "$token_file")" = 10001 || die 'Phase token file owner is invalid'
token_size=$(stat -c %s "$token_file")
test "$token_size" -ge 20 && test "$token_size" -le 8192 || die 'Phase token file size is invalid'
! LC_ALL=C grep -q '[[:space:][:cntrl:]]' "$token_file" || die 'Phase token file contains whitespace or control characters'
command -v jq >/dev/null 2>&1 || die 'jq unavailable'
test -f "$oidc_client_file" && test ! -L "$oidc_client_file" || \
  die 'Titus dashboard OIDC client file unavailable'
test "$(stat -c %a "$oidc_client_file")" = 400 || \
  die 'Titus dashboard OIDC client file mode must be 0400'
test "$(stat -c %u "$oidc_client_file")" = 0 || \
  die 'Titus dashboard OIDC client file owner is invalid'
oidc_client_id=$(<"$oidc_client_file")
test "${#oidc_client_id}" -ge 20 && test "${#oidc_client_id}" -le 128 || \
  die 'Titus dashboard OIDC client ID length is invalid'
printf '%s' "$oidc_client_id" | grep -Eq '^[A-Za-z0-9_-]+$' || \
  die 'Titus dashboard OIDC client ID format is invalid'

install -d -o root -g 10000 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'

fetch_path() {
  local path=$1
  local target=$2
  timeout 30 "$phase_bin" secrets export \
    --app "$phase_app" \
    --env "$phase_env" \
    --path "$path" \
    --format json >"$target"
  jq -e 'type == "object"' "$target" >/dev/null || die "invalid Phase export for $path"
}

fetch_path /agents/hermes-titus/runtime "$work_dir/core.json"
fetch_path /agents/hermes-titus/overnightdesk "$work_dir/control-tower.json"
fetch_path /agents/hermes-titus/teams "$work_dir/teams.json"
fetch_path /agents/hermes-titus/matrix "$work_dir/matrix.json"
fetch_path /agents/hermes-titus/memory "$work_dir/memory.json"
fetch_path /agents/hermes-email-intake/titus "$work_dir/email-intake.json"

jq -e '
  (keys - ["AGENTMAIL_API_KEY", "AGENTMAIL_EMAIL_ADDRESS", "AGENTMAIL_INBOX_ID", "HERMES_DEFAULT_MODEL", "OPENROUTER_API_KEY"] | length) == 0
' "$work_dir/core.json" >/dev/null || die 'unexpected key in Titus runtime Phase path'
jq -e 'keys == ["CONTROL_TOWER_TOKEN"]' "$work_dir/control-tower.json" >/dev/null || die 'unexpected key in Titus Control Tower Phase path'
jq -e '
  (keys - [
    "TEAMS_ALLOWED_USERS", "TEAMS_ALLOWED_USER_EMAILS", "TEAMS_ALLOW_ALL_USERS",
    "TEAMS_CHANNEL_ID", "TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET",
    "TEAMS_DELIVERY_MODE", "TEAMS_HOME_CHANNEL", "TEAMS_HOME_CHANNEL_NAME",
    "TEAMS_PORT", "TEAMS_TEAM_ID", "TEAMS_TENANT_ID"
  ] | length) == 0
' "$work_dir/teams.json" >/dev/null || die 'unexpected key in Titus Teams Phase path'
jq -e '
  (keys - [
    "MATRIX_ACCESS_TOKEN", "MATRIX_ALLOWED_ROOMS", "MATRIX_ALLOWED_USERS",
    "MATRIX_DEVICE_ID", "MATRIX_ENABLED", "MATRIX_HOMESERVER", "MATRIX_RECOVERY_KEY",
    "MATRIX_USER_ID"
  ] | length) == 0
' "$work_dir/matrix.json" >/dev/null || die 'unexpected key in Titus Matrix Phase path'
jq -e '
  keys == [
    "MEMORY_TENCENTDB_EMBEDDING_BASE_URL",
    "MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS",
    "MEMORY_TENCENTDB_EMBEDDING_ENABLED",
    "MEMORY_TENCENTDB_EMBEDDING_MODEL",
    "MEMORY_TENCENTDB_EMBEDDING_PROVIDER",
    "MEMORY_TENCENTDB_EMBEDDING_SEND_DIMENSIONS"
  ]
' "$work_dir/memory.json" >/dev/null || die 'unexpected key in Titus memory Phase path'
jq -e 'has("HERMES_API_KEY") and (.HERMES_API_KEY | type == "string" and length >= 32)' \
  "$work_dir/email-intake.json" >/dev/null || die 'Titus API server key is unavailable'

require_value() {
  local file=$1
  local key=$2
  jq -e --arg key "$key" '
    has($key) and (.[$key] | type == "string") and
    (.[$key] | length > 0) and
    ((.[$key] | ascii_upcase) != "NOT_CONFIGURED")
  ' "$file" >/dev/null || die "required Phase key is unavailable: $key"
}

for key in \
  OPENROUTER_API_KEY AGENTMAIL_API_KEY AGENTMAIL_EMAIL_ADDRESS \
  AGENTMAIL_INBOX_ID HERMES_DEFAULT_MODEL; do
  require_value "$work_dir/core.json" "$key"
done
require_value "$work_dir/control-tower.json" CONTROL_TOWER_TOKEN
jq -e '.HERMES_DEFAULT_MODEL == "x-ai/grok-4.3"' "$work_dir/core.json" >/dev/null || \
  die 'Titus default model does not match the approved route'
jq -e '
  (.MEMORY_TENCENTDB_EMBEDDING_ENABLED == "true" or
   .MEMORY_TENCENTDB_EMBEDDING_ENABLED == "false") and
  .MEMORY_TENCENTDB_EMBEDDING_PROVIDER == "openrouter" and
  .MEMORY_TENCENTDB_EMBEDDING_BASE_URL == "https://openrouter.ai/api/v1" and
  .MEMORY_TENCENTDB_EMBEDDING_MODEL == "perplexity/pplx-embed-v1-4b" and
  .MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS == "1536" and
  .MEMORY_TENCENTDB_EMBEDDING_SEND_DIMENSIONS == "true"
' "$work_dir/memory.json" >/dev/null || die 'Titus memory embedding route does not match the approved contract'

jq -s '.[0] * .[1]' "$work_dir/core.json" "$work_dir/control-tower.json" >"$work_dir/merged.json"
jq -s '.[0] * {HERMES_API_KEY: .[1].HERMES_API_KEY}' \
  "$work_dir/merged.json" "$work_dir/email-intake.json" >"$work_dir/api-merged.json"
mv "$work_dir/api-merged.json" "$work_dir/merged.json"

teams_state=pending
teams_ready=true
for key in TEAMS_CLIENT_ID TEAMS_CLIENT_SECRET TEAMS_TENANT_ID TEAMS_ALLOWED_USERS; do
  if ! jq -e --arg key "$key" '
    has($key) and (.[$key] | type == "string") and
    (.[$key] | length > 0) and
    ((.[$key] | ascii_upcase) != "NOT_CONFIGURED")
  ' "$work_dir/teams.json" >/dev/null; then
    teams_ready=false
  fi
done
if ! jq -e '.TEAMS_ALLOW_ALL_USERS == "false"' "$work_dir/teams.json" >/dev/null; then
  teams_ready=false
fi

if "$teams_ready"; then
  teams_state=ready
  jq -s '.[0] * .[1]' "$work_dir/merged.json" "$work_dir/teams.json" >"$work_dir/final.json"
else
  cp "$work_dir/merged.json" "$work_dir/final.json"
fi

jq -s '.[0] * .[1]' "$work_dir/final.json" "$work_dir/memory.json" >"$work_dir/memory-final.json"
mv "$work_dir/memory-final.json" "$work_dir/final.json"
memory_state=disabled
if test "$(jq -r '.MEMORY_TENCENTDB_EMBEDDING_ENABLED' "$work_dir/memory.json")" = true; then
  memory_state=ready
fi

matrix_state=disabled
matrix_enabled=$(jq -r '.MATRIX_ENABLED // "false"' "$work_dir/matrix.json")
case "$matrix_enabled" in
  false)
    ;;
  true)
    for key in \
      MATRIX_ACCESS_TOKEN MATRIX_ALLOWED_ROOMS MATRIX_ALLOWED_USERS MATRIX_DEVICE_ID \
      MATRIX_HOMESERVER MATRIX_RECOVERY_KEY MATRIX_USER_ID; do
      require_value "$work_dir/matrix.json" "$key"
    done
    jq -e '
      .MATRIX_HOMESERVER == "https://matrix-client.matrix.org" and
      .MATRIX_USER_ID == "@hermes-titus:matrix.org" and
      .MATRIX_DEVICE_ID == "HERMESTITUS01" and
      .MATRIX_ALLOWED_USERS == "@frozensolo:matrix.org" and
      .MATRIX_ALLOWED_ROOMS == "!LuLWlULPVgtogXtKbP:matrix.org"
    ' "$work_dir/matrix.json" >/dev/null || die 'Titus Matrix identity or allowlist does not match the approved channel'
    jq -s '.[0] * .[1]' "$work_dir/final.json" "$work_dir/matrix.json" >"$work_dir/matrix-final.json"
    mv "$work_dir/matrix-final.json" "$work_dir/final.json"
    matrix_state=ready
    ;;
  *)
    die 'MATRIX_ENABLED must be true or false'
    ;;
esac

{
  jq -r 'to_entries[] | "\(.key)=\(.value | @sh)"' "$work_dir/final.json"
  printf 'TITUS_TEAMS_STATE=%q\n' "$teams_state"
  printf 'TITUS_MATRIX_STATE=%q\n' "$matrix_state"
  printf 'TITUS_MEMORY_EMBEDDING_STATE=%q\n' "$memory_state"
  printf 'TITUS_DASHBOARD_OIDC_CLIENT_ID=%q\n' "$oidc_client_id"
} >"$work_dir/runtime.env"

unset PHASE_SERVICE_TOKEN
install -o root -g 10000 -m 0440 "$work_dir/runtime.env" "$output_file"
printf 'hermes-titus phase load: core=ready teams=%s matrix=%s memory_embedding=%s\n' \
  "$teams_state" "$matrix_state" "$memory_state"
