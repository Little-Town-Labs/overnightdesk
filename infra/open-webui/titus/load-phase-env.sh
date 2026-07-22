#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${OPEN_WEBUI_RUNTIME_DIR:-/run/open-webui-titus}
output_file=${OPEN_WEBUI_RUNTIME_ENV:-/run/open-webui-titus/runtime.env}
phase_app=${OPEN_WEBUI_PHASE_APP:-timeless-tech-solutions}
phase_env=${OPEN_WEBUI_PHASE_ENVIRONMENT:-production}
phase_path=${OPEN_WEBUI_PHASE_PATH:-/agents/open-webui/hermes-titus}

die() {
  printf 'Titus Open WebUI phase load: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
test -x "$phase_bin" || die 'Phase CLI unavailable'
test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 400 || die 'Phase token file mode must be 0400'
test "$(stat -c %u "$token_file")" = 10001 || die 'Phase token file owner is invalid'
command -v jq >/dev/null 2>&1 || die 'jq unavailable'

install -d -o root -g docker -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'
timeout 30 "$phase_bin" secrets export \
  --app "$phase_app" \
  --env "$phase_env" \
  --path "$phase_path" \
  --format json >"$work_dir/secrets.json"
unset PHASE_SERVICE_TOKEN

jq -e 'type == "object" and keys == ["OPENAI_API_KEY", "WEBUI_SECRET_KEY"]' \
  "$work_dir/secrets.json" >/dev/null || die 'unexpected key in Titus Open WebUI Phase path'
jq -e '
  (.OPENAI_API_KEY | type == "string" and length >= 32) and
  (.WEBUI_SECRET_KEY | type == "string" and length >= 32)
' "$work_dir/secrets.json" >/dev/null || die 'required Titus Open WebUI secret is unavailable'

{
  jq -r 'to_entries[] | "\(.key)=\(.value | @sh)"' "$work_dir/secrets.json"
  cat <<'CONFIG'
WEBUI_URL=https://titus-chat.overnightdesk.com
WEBUI_NAME=OvernightDesk Titus
OPENID_PROVIDER_URL=https://www.overnightdesk.com/api/auth/.well-known/openid-configuration
OPENID_REDIRECT_URI=https://titus-chat.overnightdesk.com/oauth/oidc/callback
OAUTH_CLIENT_ID=overnightdesk-open-webui-titus-v1
OAUTH_CLIENT_SECRET=''
OAUTH_CODE_CHALLENGE_METHOD=S256
OAUTH_SCOPES='openid email profile offline_access'
OAUTH_MERGE_ACCOUNTS_BY_EMAIL=false
ENABLE_OAUTH_PERSISTENT_CONFIG=false
ENABLE_OAUTH_ID_TOKEN_COOKIE=false
ENABLE_OAUTH_SIGNUP=true
ENABLE_SIGNUP=false
ENABLE_LOGIN_FORM=false
OAUTH_AUTO_REDIRECT=true
WEBUI_AUTH_COOKIE_SAME_SITE=lax
WEBUI_AUTH_COOKIE_SECURE=true
WEBUI_AUTH_SIGNOUT_REDIRECT_URL=https://www.overnightdesk.com/dashboard/chat?workspace=logged-out
ENABLE_PERSISTENT_CONFIG=false
GLOBAL_LOG_LEVEL=ERROR
ENABLE_AUDIT_LOGS_FILE=false
AUDIT_LOG_LEVEL=NONE
ENABLE_OLLAMA_API=false
ENABLE_DIRECT_CONNECTIONS=false
OPENAI_API_BASE_URL=http://hermes-titus:8642/v1
DEFAULT_MODELS=hermes-agent
DEFAULT_USER_ROLE=user
ENABLE_EVALUATION_ARENA_MODELS=false
EVALUATION_ARENA_MODELS=[]
ENABLE_COMMUNITY_SHARING=false
ENABLE_MESSAGE_RATING=false
ENABLE_TITLE_GENERATION=false
ENABLE_TAGS_GENERATION=false
ENABLE_FOLLOW_UP_GENERATION=false
ENABLE_SEARCH_QUERY_GENERATION=false
ENABLE_RETRIEVAL_QUERY_GENERATION=false
ENABLE_IMAGE_PROMPT_GENERATION=false
ENABLE_AUTOCOMPLETE_GENERATION=false
USER_PERMISSIONS_WORKSPACE_MODELS_ACCESS=false
USER_PERMISSIONS_WORKSPACE_KNOWLEDGE_ACCESS=false
USER_PERMISSIONS_WORKSPACE_PROMPTS_ACCESS=false
USER_PERMISSIONS_WORKSPACE_TOOLS_ACCESS=false
USER_PERMISSIONS_WORKSPACE_SKILLS_ACCESS=false
USER_PERMISSIONS_CHAT_CONTROLS=false
USER_PERMISSIONS_CHAT_VALVES=false
USER_PERMISSIONS_CHAT_SYSTEM_PROMPT=false
USER_PERMISSIONS_CHAT_PARAMS=false
USER_PERMISSIONS_CHAT_FILE_UPLOAD=false
USER_PERMISSIONS_CHAT_WEB_UPLOAD=false
USER_PERMISSIONS_CHAT_SHARE=false
USER_PERMISSIONS_CHAT_ALLOW_PUBLIC_SHARING=false
USER_PERMISSIONS_CHAT_EXPORT=false
USER_PERMISSIONS_CHAT_IMPORT=false
USER_PERMISSIONS_CHAT_STT=false
USER_PERMISSIONS_CHAT_TTS=false
USER_PERMISSIONS_CHAT_CALL=false
USER_PERMISSIONS_CHAT_MULTIPLE_MODELS=false
USER_PERMISSIONS_FEATURES_DIRECT_TOOL_SERVERS=false
USER_PERMISSIONS_FEATURES_WEB_SEARCH=false
USER_PERMISSIONS_FEATURES_IMAGE_GENERATION=false
USER_PERMISSIONS_FEATURES_CODE_INTERPRETER=false
USER_PERMISSIONS_FEATURES_FOLDERS=false
USER_PERMISSIONS_FEATURES_NOTES=false
USER_PERMISSIONS_FEATURES_CHANNELS=false
USER_PERMISSIONS_FEATURES_API_KEYS=false
USER_PERMISSIONS_FEATURES_MEMORIES=false
USER_PERMISSIONS_FEATURES_AUTOMATIONS=false
USER_PERMISSIONS_FEATURES_CALENDAR=false
USER_PERMISSIONS_FEATURES_USER_WEBHOOKS=false
USER_PERMISSIONS_SETTINGS_INTERFACE=false
USER_PERMISSIONS_ACCESS_GRANTS_ALLOW_USERS=false
OFFLINE_MODE=true
HF_HUB_OFFLINE=1
RAG_EMBEDDING_MODEL_AUTO_UPDATE=false
RAG_EMBEDDING_MODEL_TRUST_REMOTE_CODE=false
HOME=/app/backend/data
XDG_CACHE_HOME=/app/backend/data/.cache
CONFIG
} >"$work_dir/runtime.env"

install -o root -g docker -m 0440 "$work_dir/runtime.env" "$output_file"
printf 'Titus Open WebUI phase load: ready\n'
