#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runtime_root="$repo_root/infra/open-webui/walter"
common_root="$repo_root/infra/open-webui/common"

fail() {
  printf 'Walter Open WebUI qualification: %s\n' "$*" >&2
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
  "$runtime_root/open-webui-walter.service"
  "$runtime_root/nginx-http.conf"
  "$runtime_root/nginx.conf"
  "$runtime_root/deploy-aegis.sh"
  "$runtime_root/README.md"
  "$runtime_root/persona-model.json"
  "$common_root/seed-persona-model.sh"
  "$common_root/verify-persona-model.sh"
  "$common_root/seed_persona_model.py"
  "$common_root/test_seed_persona_model.py"
)
for file in "${files[@]}"; do require_file "$file"; done

bash -n \
  "$runtime_root/load-phase-env.sh" \
  "$runtime_root/prepare-volume.sh" \
  "$runtime_root/run-container.sh" \
  "$runtime_root/stop-container.sh" \
  "$runtime_root/deploy-aegis.sh" \
  "$common_root/seed-persona-model.sh" \
  "$common_root/verify-persona-model.sh"

python -m unittest "$common_root/test_seed_persona_model.py"
jq -e 'keys == ["modelId", "name", "profileImageUrl"] and .modelId == "hermes-agent" and .name == "Walter" and .profileImageUrl == "https://www.overnightdesk.com/api/agent-identity/walter/logo"' \
  "$runtime_root/persona-model.json" >/dev/null || fail 'invalid Walter persona model config'

image='ghcr\.io/open-webui/open-webui@sha256:0d58a66704d69e52da83f72bcd43869ad4fd0c761313778bc95ef6940a0b81e3'
require_pattern "$image" "$runtime_root/run-container.sh"
require_pattern "$image" "$runtime_root/prepare-volume.sh"
require_pattern '/opt/overnightdesk/secrets/phase-service-token' "$runtime_root/load-phase-env.sh"
require_pattern '/agents/open-webui/hermes-walter' "$runtime_root/load-phase-env.sh"
require_pattern 'phase_app=\$\{OPEN_WEBUI_PHASE_APP:-overnightdesk\}' "$runtime_root/load-phase-env.sh"
require_pattern 'install -d -o root -g open-webui-walter -m 0750' "$runtime_root/load-phase-env.sh"
require_pattern 'install -o root -g open-webui-walter -m 0440' "$runtime_root/load-phase-env.sh"
require_pattern 'keys == \["OPENAI_API_KEY", "WEBUI_SECRET_KEY"\]' "$runtime_root/load-phase-env.sh"
require_pattern 'unexpected key in Walter Open WebUI Phase path' "$runtime_root/load-phase-env.sh"
require_pattern 'WEBUI_URL=https://walter-chat\.overnightdesk\.com' "$runtime_root/load-phase-env.sh"
require_pattern 'OAUTH_CLIENT_ID=overnightdesk-open-webui-walter-v1' "$runtime_root/load-phase-env.sh"
require_pattern 'OPENID_REDIRECT_URI=https://walter-chat\.overnightdesk\.com/oauth/oidc/callback' "$runtime_root/load-phase-env.sh"
require_pattern 'OAUTH_CODE_CHALLENGE_METHOD=S256' "$runtime_root/load-phase-env.sh"
require_pattern "OAUTH_SCOPES='openid email profile offline_access'" "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_PERSISTENT_CONFIG=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_LOGIN_FORM=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_SIGNUP=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_OAUTH_SIGNUP=true' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_OLLAMA_API=false' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_DIRECT_CONNECTIONS=false' "$runtime_root/load-phase-env.sh"
require_pattern 'GLOBAL_LOG_LEVEL=ERROR' "$runtime_root/load-phase-env.sh"
require_pattern 'OPENAI_API_BASE_URL=http://hermes-walter:8642/v1' "$runtime_root/load-phase-env.sh"
require_pattern 'DEFAULT_MODELS=hermes-agent' "$runtime_root/load-phase-env.sh"
require_pattern 'ENABLE_EVALUATION_ARENA_MODELS=false' "$runtime_root/load-phase-env.sh"
require_pattern 'EVALUATION_ARENA_MODELS=\[\]' "$runtime_root/load-phase-env.sh"
require_pattern 'WEBUI_AUTH_SIGNOUT_REDIRECT_URL=https://www\.overnightdesk\.com/dashboard/chat\?workspace=logged-out' "$runtime_root/load-phase-env.sh"

require_pattern 'name=open-webui-hermes-walter' "$runtime_root/run-container.sh"
require_pattern '--user 1000:1000' "$runtime_root/run-container.sh"
require_pattern '--read-only' "$runtime_root/run-container.sh"
require_pattern '--cap-drop ALL' "$runtime_root/run-container.sh"
require_pattern 'no-new-privileges' "$runtime_root/run-container.sh"
require_pattern '--network overnightdesk_overnightdesk' "$runtime_root/run-container.sh"
require_pattern 'open-webui-hermes-walter-data:/app/backend/data' "$runtime_root/run-container.sh"
require_pattern 'secret_file=\$\{OPEN_WEBUI_RUNTIME_ENV:-/run/open-webui-walter/runtime\.env\}' "$runtime_root/run-container.sh"
require_pattern '\$secret_file:/run/secrets/open-webui-walter:ro' "$runtime_root/run-container.sh"
if grep -Eq -- '--publish|-p[[:space:]]+[0-9]' "$runtime_root/run-container.sh"; then
  fail 'Walter Open WebUI must not publish a host port'
fi

require_pattern '--network none' "$runtime_root/prepare-volume.sh"
require_pattern '--cap-drop ALL' "$runtime_root/prepare-volume.sh"
require_pattern '--cap-add CHOWN' "$runtime_root/prepare-volume.sh"
require_pattern 'User=open-webui-walter' "$runtime_root/open-webui-walter.service"
require_pattern 'ExecStartPre=\+.*/load-phase-env\.sh' "$runtime_root/open-webui-walter.service"
require_pattern 'ExecStartPre=\+.*/seed-persona-model\.sh' "$runtime_root/open-webui-walter.service"
require_pattern 'ExecStart=.*/run-container\.sh' "$runtime_root/open-webui-walter.service"
require_pattern 'OPEN_WEBUI_DATA_VOLUME=open-webui-hermes-walter-data' "$runtime_root/open-webui-walter.service"
require_pattern '--network none' "$common_root/seed-persona-model.sh"
require_pattern '--read-only' "$common_root/seed-persona-model.sh"
require_pattern '--cap-drop ALL' "$common_root/seed-persona-model.sh"
require_pattern '--verify' "$common_root/verify-persona-model.sh"
require_pattern "principal_id = '\*' AND permission = 'write'" "$common_root/seed_persona_model.py"
require_pattern "'user', '\*', 'read'" "$common_root/seed_persona_model.py"

require_pattern 'server_name walter-chat\.overnightdesk\.com' "$runtime_root/nginx.conf"
require_pattern 'auth_request /auth-verify' "$runtime_root/nginx.conf"
require_pattern '/api/auth/verify-workspace' "$runtime_root/nginx.conf"
require_pattern 'client_max_body_size 64k' "$runtime_root/nginx.conf"
require_pattern "frame-ancestors 'self' https://overnightdesk\.com https://www\.overnightdesk\.com" "$runtime_root/nginx.conf"
require_pattern 'proxy_hide_header X-Frame-Options' "$runtime_root/nginx.conf"
require_pattern 'proxy_hide_header Content-Security-Policy' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header X-User-Email ""' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header X-User-Name ""' "$runtime_root/nginx.conf"
require_pattern 'proxy_set_header X-User-Id ""' "$runtime_root/nginx.conf"
require_pattern 'proxy_pass http://open-webui-hermes-walter:8080' "$runtime_root/nginx.conf"

require_pattern 'install-disabled' "$runtime_root/deploy-aegis.sh"
require_pattern 'reconcile-persona' "$runtime_root/deploy-aegis.sh"
require_pattern 'verify-persona-model\.sh' "$runtime_root/deploy-aegis.sh"
require_pattern 'verify-private' "$runtime_root/deploy-aegis.sh"
require_pattern 'verify-restart-persistence' "$runtime_root/deploy-aegis.sh"
require_pattern 'feature023-private-restart' "$runtime_root/deploy-aegis.sh"
require_pattern 'sentinel-logs' "$runtime_root/deploy-aegis.sh"
require_pattern 'enable-route' "$runtime_root/deploy-aegis.sh"
require_pattern 'verify-public' "$runtime_root/deploy-aegis.sh"
require_pattern 'rollback' "$runtime_root/deploy-aegis.sh"
require_pattern 'docker volume inspect open-webui-hermes-walter-data' "$runtime_root/deploy-aegis.sh"
require_pattern 'certbot certonly.*--webroot' "$runtime_root/deploy-aegis.sh"
require_pattern 'walter-chat\.conf' "$runtime_root/deploy-aegis.sh"
require_pattern 'nginx -s reload' "$runtime_root/deploy-aegis.sh"
require_pattern 'mv .*walter-chat\.conf.*disabled' "$runtime_root/deploy-aegis.sh"
require_pattern 'model\.provider.*openai-codex' "$runtime_root/deploy-aegis.sh"
require_pattern 'model\.default.*gpt-5\.6-sol' "$runtime_root/deploy-aegis.sh"
require_pattern 'auth\.get\("active_provider"\).*openai-codex' "$runtime_root/deploy-aegis.sh"
require_pattern 'openai-codex.*providers' "$runtime_root/deploy-aegis.sh"
if grep -Fq '. /run/secrets/open-webui-walter' "$runtime_root/deploy-aegis.sh"; then
  fail 'private verification must not shell-source the Docker env file'
fi

if grep -ERq \
  'open-webui-hermes-titus|titus-chat\.overnightdesk\.com|/run/open-webui-titus|/opt/control-tower/secrets/phase-service-token|timeless-tech-solutions|http://hermes-titus:8642' \
  "$runtime_root"; then
  fail 'Walter source reuses a Titus-scoped resource'
fi
if grep -ERq --exclude=qualify-walter.sh \
  '(^|[^a-z])sk-[A-Za-z0-9_-]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,}|WEBUI_SECRET_KEY=[A-Za-z0-9_-]{16,}|OPENAI_API_KEY=[A-Za-z0-9_-]{16,}' \
  "$runtime_root"; then
  fail 'possible credential literal found in Walter Open WebUI source'
fi

printf 'Walter Open WebUI qualification: PASS\n'
