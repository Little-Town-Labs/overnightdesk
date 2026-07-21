#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runtime_root="$repo_root/infra/open-webui/titus"

fail() {
  printf 'Titus Open WebUI qualification: %s\n' "$*" >&2
  exit 1
}

require_file() {
  test -f "$1" || fail "missing ${1#$repo_root/}"
}

require_pattern() {
  grep -Eq -- "$1" "$2" || fail "missing contract pattern in ${2#$repo_root/}: $1"
}

files=(
  "$runtime_root/load-phase-env.sh"
  "$runtime_root/prepare-volume.sh"
  "$runtime_root/run-container.sh"
  "$runtime_root/stop-container.sh"
  "$runtime_root/open-webui-titus.service"
  "$runtime_root/nginx-http.conf"
  "$runtime_root/nginx.conf"
  "$runtime_root/deploy-aegis.sh"
  "$runtime_root/README.md"
)
for file in "${files[@]}"; do require_file "$file"; done

bash -n \
  "$runtime_root/load-phase-env.sh" \
  "$runtime_root/prepare-volume.sh" \
  "$runtime_root/run-container.sh" \
  "$runtime_root/stop-container.sh" \
  "$runtime_root/deploy-aegis.sh"

image='ghcr\.io/open-webui/open-webui@sha256:0d58a66704d69e52da83f72bcd43869ad4fd0c761313778bc95ef6940a0b81e3'
require_pattern "$image" "$runtime_root/run-container.sh"
require_pattern "$image" "$runtime_root/prepare-volume.sh"
require_pattern '/agents/open-webui/hermes-titus' "$runtime_root/load-phase-env.sh"
require_pattern 'timeless-tech-solutions' "$runtime_root/load-phase-env.sh"
require_pattern 'keys == \["OPENAI_API_KEY", "WEBUI_SECRET_KEY"\]' "$runtime_root/load-phase-env.sh"
require_pattern 'unexpected key in Titus Open WebUI Phase path' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_PERSISTENT_CONFIG=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_LOGIN_FORM=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_SIGNUP=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_OAUTH_SIGNUP=true' "$runtime_root/load-phase-env.sh"
require_pattern 'OAUTH_MERGE_ACCOUNTS_BY_EMAIL=false' "$runtime_root/load-phase-env.sh"
require_pattern 'OAUTH_CODE_CHALLENGE_METHOD=S256' "$runtime_root/load-phase-env.sh"
require_pattern "OAUTH_SCOPES='openid email profile offline_access'" "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_OLLAMA_API=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_DIRECT_CONNECTIONS=false' "$runtime_root/load-phase-env.sh"
require_pattern 'GLOBAL_LOG_LEVEL=ERROR' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_AUDIT_LOGS_FILE=false' "$runtime_root/load-phase-env.sh"
require_pattern 'USER_PERMISSIONS_CHAT_FILE_UPLOAD=false' "$runtime_root/load-phase-env.sh"
require_pattern 'USER_PERMISSIONS_CHAT_SYSTEM_PROMPT=false' "$runtime_root/load-phase-env.sh"
require_pattern 'USER_PERMISSIONS_CHAT_PARAMS=false' "$runtime_root/load-phase-env.sh"
require_pattern 'USER_PERMISSIONS_FEATURES_WEB_SEARCH=false' "$runtime_root/load-phase-env.sh"
require_pattern 'USER_PERMISSIONS_FEATURES_CODE_INTERPRETER=false' "$runtime_root/load-phase-env.sh"
require_pattern 'USER_PERMISSIONS_SETTINGS_INTERFACE=false' "$runtime_root/load-phase-env.sh"
require_pattern 'OPENAI_API_BASE_URL=http://hermes-titus:8642/v1' "$runtime_root/load-phase-env.sh"
require_pattern 'DEFAULT_MODELS=x-ai/grok-4\.3' "$runtime_root/load-phase-env.sh"
require_pattern 'WEBUI_AUTH_SIGNOUT_REDIRECT_URL=https://www\.overnightdesk\.com/dashboard/chat\?workspace=logged-out' "$runtime_root/load-phase-env.sh"
require_pattern 'https://titus-chat\.overnightdesk\.com' "$repo_root/src/lib/auth.ts"

require_pattern '--user 1000:1000' "$runtime_root/run-container.sh"
require_pattern '--read-only' "$runtime_root/run-container.sh"
require_pattern '--cap-drop ALL' "$runtime_root/run-container.sh"
require_pattern 'no-new-privileges' "$runtime_root/run-container.sh"
require_pattern '--network overnightdesk_overnightdesk' "$runtime_root/run-container.sh"
require_pattern 'open-webui-hermes-titus-data:/app/backend/data' "$runtime_root/run-container.sh"
require_pattern 'secret_file=\$\{OPEN_WEBUI_RUNTIME_ENV:-/run/open-webui-titus/runtime\.env\}' "$runtime_root/run-container.sh"
require_pattern '\$secret_file:/run/secrets/open-webui-titus:ro' "$runtime_root/run-container.sh"
if grep -Eq -- '--publish|-p[[:space:]]+[0-9]' "$runtime_root/run-container.sh"; then
  fail 'Open WebUI must not publish a host port'
fi

require_pattern '--network none' "$runtime_root/prepare-volume.sh"
require_pattern '--cap-drop ALL' "$runtime_root/prepare-volume.sh"
require_pattern '--cap-add CHOWN' "$runtime_root/prepare-volume.sh"

require_pattern 'User=open-webui-titus' "$runtime_root/open-webui-titus.service"
require_pattern 'ExecStartPre=\+.*/load-phase-env\.sh' "$runtime_root/open-webui-titus.service"
require_pattern 'ExecStart=.*/run-container\.sh' "$runtime_root/open-webui-titus.service"

require_pattern 'server_name titus-chat\.overnightdesk\.com' "$runtime_root/nginx.conf"
require_pattern 'auth_request /auth-verify' "$runtime_root/nginx.conf"
require_pattern '/api/auth/verify-workspace' "$runtime_root/nginx.conf"
require_pattern 'client_max_body_size 64k' "$runtime_root/nginx.conf"
require_pattern 'limit_req_zone .* rate=300r/m' "$runtime_root/nginx.conf"
require_pattern 'limit_conn titus_open_webui_conn 32' "$runtime_root/nginx.conf"
require_pattern 'limit_req zone=titus_open_webui_req burst=300 nodelay' "$runtime_root/nginx.conf"
require_pattern "frame-ancestors 'self' https://overnightdesk\.com https://www\.overnightdesk\.com" "$runtime_root/nginx.conf"
require_pattern 'proxy_hide_header X-Frame-Options' "$runtime_root/nginx.conf"
require_pattern 'proxy_hide_header Content-Security-Policy' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header X-User-Email ""' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header X-User-Name ""' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header X-User-Id ""' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header Connection "upgrade"' "$runtime_root/nginx.conf"
require_pattern 'proxy_pass http://open-webui-hermes-titus:8080' "$runtime_root/nginx.conf"
if grep -Fq '$connection_upgrade' "$runtime_root/nginx.conf"; then
  fail 'Titus vhost must not depend on an undefined connection_upgrade map'
fi

require_pattern 'install-disabled' "$runtime_root/deploy-aegis.sh"
require_pattern 'verify-private' "$runtime_root/deploy-aegis.sh"
require_pattern 'enable-route' "$runtime_root/deploy-aegis.sh"
require_pattern 'sentinel-logs' "$runtime_root/deploy-aegis.sh"
require_pattern 'rollback' "$runtime_root/deploy-aegis.sh"
require_pattern 'docker volume inspect open-webui-hermes-titus-data' "$runtime_root/deploy-aegis.sh"
require_pattern 'mv .*titus-chat\.conf.*disabled' "$runtime_root/deploy-aegis.sh"
if grep -Fq '. /run/secrets/open-webui-titus' "$runtime_root/deploy-aegis.sh"; then
  fail 'private verification must not shell-source the Docker env file'
fi

if grep -ERq --exclude=qualify-titus.sh \
  '(^|[^a-z])sk-[A-Za-z0-9_-]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,}|WEBUI_SECRET_KEY=[A-Za-z0-9_-]{16,}|OPENAI_API_KEY=[A-Za-z0-9_-]{16,}' \
  "$runtime_root"; then
  fail 'possible credential literal found in Titus Open WebUI source'
fi

printf 'Titus Open WebUI qualification: PASS\n'
