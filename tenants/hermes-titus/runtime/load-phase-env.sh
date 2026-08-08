#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${TITUS_RUNTIME_DIR:-/run/hermes-titus}
output_file=${TITUS_RUNTIME_ENV:-/run/hermes-titus/runtime.env}
phase_app=${TITUS_PHASE_APP:-timeless-tech-solutions}
phase_env=${TITUS_PHASE_ENVIRONMENT:-production}
oidc_client_file=${TITUS_DASHBOARD_OIDC_CLIENT_FILE:-/opt/hermes-titus/secrets/dashboard-oidc-client-id}
github_key_file=${TITUS_GITHUB_PRIVATE_KEY_FILE:-/run/hermes-titus/github-app-private-key}
github_manager_key_file=${TITUS_GITHUB_REPOSITORY_MANAGER_PRIVATE_KEY_FILE:-/run/hermes-titus/github-repository-manager-app-private-key}
github_env_file=${TITUS_GITHUB_ENV_FILE:-/run/hermes-titus/github-app.env}
github_manager_env_file=${TITUS_GITHUB_REPOSITORY_MANAGER_ENV_FILE:-/run/hermes-titus/github-repository-manager.env}
github_env_group=${TITUS_GITHUB_ENV_GROUP:-hermes-titus}
phase_timeout=${TITUS_PHASE_TIMEOUT_SECONDS:-30}

die() {
  printf 'hermes-titus phase load: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
case "$phase_timeout" in
  ''|*[!0-9]*) die 'Phase timeout must be a positive integer' ;;
esac
test "$phase_timeout" -ge 1 && test "$phase_timeout" -le 30 ||
  die 'Phase timeout must be between 1 and 30 seconds'
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

install -d -o root -g "$github_env_group" -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'

fetch_path() {
  local path=$1
  local target=$2
  timeout "$phase_timeout" "$phase_bin" secrets export \
    --app "$phase_app" \
    --env "$phase_env" \
    --path "$path" \
    --format json >"$target"
  jq -e 'type == "object"' "$target" >/dev/null || die "invalid Phase export for $path"
}

fetch_optional_path() {
  local path=$1
  local target=$2
  if ! timeout "$phase_timeout" "$phase_bin" secrets export \
    --app "$phase_app" \
    --env "$phase_env" \
    --path "$path" \
    --format json >"$target"; then
    die "Phase export failed for optional path $path"
  fi
  jq -e 'type == "object"' "$target" >/dev/null ||
    die "invalid Phase export for optional path $path"
}

fetch_optional_disabled_path() {
  local path=$1
  local target=$2
  if ! timeout "$phase_timeout" "$phase_bin" secrets export \
    --app "$phase_app" \
    --env "$phase_env" \
    --path "$path" \
    --format json >"$target"; then
    printf '{}\n' >"$target"
    return
  fi
  jq -e 'type == "object"' "$target" >/dev/null 2>&1 ||
    printf '{}\n' >"$target"
}

fetch_path /agents/hermes-titus/runtime "$work_dir/core.json"
fetch_path /agents/hermes-titus/overnightdesk "$work_dir/control-tower.json"
fetch_path /agents/hermes-titus/teams "$work_dir/teams.json"
fetch_path /agents/hermes-titus/matrix "$work_dir/matrix.json"
fetch_optional_disabled_path /agents/hermes-titus/telegram "$work_dir/telegram.json"
fetch_optional_disabled_path /agents/github "$work_dir/github.json"
fetch_path /agents/hermes-titus/memory "$work_dir/memory.json"
fetch_path /agents/hermes-email-intake/titus "$work_dir/email-intake.json"
fetch_optional_path \
  /agents/hermes-titus/linear \
  "$work_dir/linear.json"

jq -e '
  (keys - [
    "AGENTMAIL_API_KEY", "AGENTMAIL_EMAIL_ADDRESS", "AGENTMAIL_INBOX_ID",
    "HERMES_DEFAULT_MODEL", "OPENROUTER_API_KEY", "SECURITY_SERVICE_TOKEN"
  ] | length) == 0
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
telegram_keys_valid=true
if ! jq -e '
  (keys - ["TELEGRAM_ALLOWED_USERS", "TELEGRAM_BOT_TOKEN"] | length) == 0
' "$work_dir/telegram.json" >/dev/null; then
  telegram_keys_valid=false
fi
jq -e '
  keys == [
    "MEMORY_TENCENTDB_EMBEDDING_BASE_URL",
    "MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS",
    "MEMORY_TENCENTDB_EMBEDDING_ENABLED",
    "MEMORY_TENCENTDB_EMBEDDING_MODEL",
    "MEMORY_TENCENTDB_EMBEDDING_PROVIDER",
    "MEMORY_TENCENTDB_EMBEDDING_SEND_DIMENSIONS",
    "MEMORY_TENCENTDB_LLM_MODEL"
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
  AGENTMAIL_INBOX_ID HERMES_DEFAULT_MODEL SECURITY_SERVICE_TOKEN; do
  require_value "$work_dir/core.json" "$key"
done
require_value "$work_dir/control-tower.json" CONTROL_TOWER_TOKEN
jq -e '.HERMES_DEFAULT_MODEL == "gpt-5.6-sol"' "$work_dir/core.json" >/dev/null || \
  die 'Titus default model does not match the approved route'
jq -e '
  (.MEMORY_TENCENTDB_EMBEDDING_ENABLED == "true" or
   .MEMORY_TENCENTDB_EMBEDDING_ENABLED == "false") and
  .MEMORY_TENCENTDB_LLM_MODEL == "xiaomi/mimo-v2.5-pro" and
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
for key in \
  TEAMS_CLIENT_ID TEAMS_CLIENT_SECRET TEAMS_TENANT_ID \
  TEAMS_ALLOWED_USERS TEAMS_TEAM_ID TEAMS_CHANNEL_ID; do
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

telegram_state=disabled
if jq -e 'length == 0' "$work_dir/telegram.json" >/dev/null; then
  :
elif test "$telegram_keys_valid" = true && jq -e '
  keys == ["TELEGRAM_ALLOWED_USERS", "TELEGRAM_BOT_TOKEN"] and
  (.TELEGRAM_ALLOWED_USERS | type == "string") and
  (.TELEGRAM_ALLOWED_USERS | test("^[0-9]+$")) and
  (.TELEGRAM_BOT_TOKEN | type == "string") and
  (.TELEGRAM_BOT_TOKEN | length >= 20 and length <= 128) and
  (.TELEGRAM_BOT_TOKEN | test("^[0-9]+:[A-Za-z0-9_-]+$") )
' "$work_dir/telegram.json" >/dev/null; then
  jq -s '.[0] * .[1]' \
    "$work_dir/final.json" "$work_dir/telegram.json" >"$work_dir/telegram-final.json"
  mv "$work_dir/telegram-final.json" "$work_dir/final.json"
  telegram_state=ready
else
  telegram_state=invalid
fi

github_state=disabled
github_key_path=/run/secrets/hermes-titus-github-app-private-key
github_manager_state=disabled
github_manager_key_path=$github_manager_key_file
: >"$work_dir/github-key"
: >"$work_dir/github-manager-key"
if ! jq -e 'length == 0' "$work_dir/github.json" >/dev/null; then
  if jq -e '
    (keys - [
      "GITHUB_ALLOWED_REPOSITORIES",
      "GITHUB_APP_CLIENT_ID",
      "GITHUB_APP_ID",
      "GITHUB_APP_INSTALLATION_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_ORGANIZATION",
      "GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES",
      "GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID",
      "GITHUB_REPOSITORY_MANAGER_APP_ID",
      "GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID",
      "GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY",
      "GITHUB_REPOSITORY_MANAGER_ORGANIZATION"
    ] | length) == 0
  ' "$work_dir/github.json" >/dev/null; then
    if jq -e '
      ([
        .GITHUB_APP_ID,
        .GITHUB_APP_CLIENT_ID,
        .GITHUB_APP_INSTALLATION_ID,
        .GITHUB_ORGANIZATION,
        .GITHUB_ALLOWED_REPOSITORIES,
        .GITHUB_APP_PRIVATE_KEY
      ] | all(.[]; type == "string" and length > 0)) and
      (.GITHUB_APP_ID | test("^[0-9]{1,20}$")) and
      (.GITHUB_APP_CLIENT_ID | length >= 10 and length <= 128 and test("^[A-Za-z0-9_-]+$")) and
      (.GITHUB_APP_INSTALLATION_ID | test("^[0-9]{1,20}$")) and
      .GITHUB_ORGANIZATION == "timeless-technology-solutions" and
      (.GITHUB_ALLOWED_REPOSITORIES | test("^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$")) and
      (.GITHUB_APP_PRIVATE_KEY | test("^-----BEGIN (RSA )?PRIVATE KEY-----\\n[\\s\\S]+\\n-----END (RSA )?PRIVATE KEY-----\\n?$"))
    ' "$work_dir/github.json" >/dev/null; then
      jq -er '.GITHUB_APP_PRIVATE_KEY' "$work_dir/github.json" >"$work_dir/github-key"
      chmod 0400 "$work_dir/github-key"
      jq --arg key_path "$github_key_path" \
        '{
          GITHUB_APP_ID,
          GITHUB_APP_CLIENT_ID,
          GITHUB_APP_INSTALLATION_ID,
          GITHUB_ORGANIZATION,
          GITHUB_ALLOWED_REPOSITORIES,
          GITHUB_APP_PRIVATE_KEY_PATH: $key_path
        }' \
        "$work_dir/github.json" >"$work_dir/github-public.json"
      jq -s '.[0] * .[1]' "$work_dir/final.json" "$work_dir/github-public.json" >"$work_dir/github-final.json"
      mv "$work_dir/github-final.json" "$work_dir/final.json"
      github_state=ready
    elif jq -e '
      has("GITHUB_APP_ID") or has("GITHUB_APP_CLIENT_ID") or
      has("GITHUB_APP_INSTALLATION_ID") or has("GITHUB_ORGANIZATION") or
      has("GITHUB_ALLOWED_REPOSITORIES") or has("GITHUB_APP_PRIVATE_KEY")
    ' "$work_dir/github.json" >/dev/null; then
      github_state=invalid
    fi

    if jq -e '
      ([
        .GITHUB_REPOSITORY_MANAGER_APP_ID,
        .GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID,
        .GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID,
        .GITHUB_REPOSITORY_MANAGER_ORGANIZATION,
        .GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES,
        .GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY
      ] | all(.[]; type == "string" and length > 0)) and
      (.GITHUB_REPOSITORY_MANAGER_APP_ID | test("^[0-9]{1,20}$")) and
      (.GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID | length >= 10 and length <= 128 and test("^[A-Za-z0-9_-]+$")) and
      (.GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID | test("^[0-9]{1,20}$")) and
      .GITHUB_REPOSITORY_MANAGER_ORGANIZATION == "timeless-technology-solutions" and
      (.GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES | test("^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$")) and
      (.GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY | test("^-----BEGIN (RSA )?PRIVATE KEY-----\\n[\\s\\S]+\\n-----END (RSA )?PRIVATE KEY-----\\n?$"))
    ' "$work_dir/github.json" >/dev/null; then
      jq -er '.GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY' "$work_dir/github.json" >"$work_dir/github-manager-key"
      chmod 0400 "$work_dir/github-manager-key"
      jq --arg key_path "$github_manager_key_path" \
        '{
          GITHUB_REPOSITORY_MANAGER_APP_ID,
          GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID,
          GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID,
          GITHUB_REPOSITORY_MANAGER_ORGANIZATION,
          GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES,
          GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY_PATH: $key_path
        }' \
        "$work_dir/github.json" >"$work_dir/github-manager-public.json"
      github_manager_state=ready
    elif jq -e '
      has("GITHUB_REPOSITORY_MANAGER_APP_ID") or
      has("GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID") or
      has("GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID") or
      has("GITHUB_REPOSITORY_MANAGER_ORGANIZATION") or
      has("GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES") or
      has("GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY")
    ' "$work_dir/github.json" >/dev/null; then
      github_manager_state=invalid
    fi
  else
    github_state=invalid
    github_manager_state=invalid
  fi
fi

linear_state=disabled
if jq -e 'length == 0' "$work_dir/linear.json" >/dev/null; then
  :
elif jq -e '
  keys == ["LINEAR_ENABLED"] and .LINEAR_ENABLED == "false"
' "$work_dir/linear.json" >/dev/null; then
  :
elif jq -e '
  keys == [
    "LINEAR_API_KEY",
    "LINEAR_ENABLED",
    "LINEAR_TEAM_KEY",
    "LINEAR_WORKSPACE_NAME"
  ] and
  .LINEAR_ENABLED == "true" and
  .LINEAR_WORKSPACE_NAME == "Timeless Technology Solutions" and
  .LINEAR_TEAM_KEY == "TTS" and
  (.LINEAR_API_KEY | type == "string") and
  (.LINEAR_API_KEY | length >= 20 and length <= 512) and
  (.LINEAR_API_KEY != "NOT_CONFIGURED") and
  (.LINEAR_API_KEY | test("\\s") | not)
' "$work_dir/linear.json" >/dev/null; then
  jq -s '.[0] * .[1]' \
    "$work_dir/final.json" "$work_dir/linear.json" >"$work_dir/linear-final.json"
  mv "$work_dir/linear-final.json" "$work_dir/final.json"
  linear_state=ready
else
  die 'Titus Linear profile is invalid'
fi

{
  jq -r 'to_entries[] | "\(.key)=\(.value | @sh)"' "$work_dir/final.json"
  printf 'TITUS_TEAMS_STATE=%q\n' "$teams_state"
  printf 'TITUS_MATRIX_STATE=%q\n' "$matrix_state"
  printf 'TITUS_TELEGRAM_STATE=%q\n' "$telegram_state"
  printf 'TITUS_GITHUB_STATE=%q\n' "$github_state"
  printf 'TITUS_MEMORY_EMBEDDING_STATE=%q\n' "$memory_state"
  printf 'TITUS_LINEAR_STATE=%q\n' "$linear_state"
  printf 'TITUS_DASHBOARD_OIDC_CLIENT_ID=%q\n' "$oidc_client_id"
} >"$work_dir/runtime.env"

{
  printf 'TITUS_GITHUB_STATE=%s\n' "$github_state"
  if test "$github_state" = ready; then
    jq -r 'to_entries[] | "\(.key)=\(.value)"' "$work_dir/github-public.json"
  fi
} >"$work_dir/github.env"

{
  printf 'TITUS_GITHUB_REPOSITORY_MANAGER_STATE=%s\n' "$github_manager_state"
  if test "$github_manager_state" = ready; then
    jq -r 'to_entries[] | "\(.key)=\(.value)"' "$work_dir/github-manager-public.json"
  fi
} >"$work_dir/github-manager.env"

unset PHASE_SERVICE_TOKEN
install -o root -g 10000 -m 0440 "$work_dir/runtime.env" "$output_file"
install -o root -g 10000 -m 0440 "$work_dir/github-key" "$github_key_file"
install -o root -g root -m 0400 "$work_dir/github-manager-key" "$github_manager_key_file"
install -o root -g "$github_env_group" -m 0440 "$work_dir/github.env" "$github_env_file"
install -o root -g root -m 0400 "$work_dir/github-manager.env" "$github_manager_env_file"
printf 'hermes-titus phase load: core=ready teams=%s matrix=%s telegram=%s github=%s github_repository_manager=%s memory_embedding=%s linear=%s\n' \
  "$teams_state" "$matrix_state" "$telegram_state" "$github_state" "$github_manager_state" "$memory_state" "$linear_state"
