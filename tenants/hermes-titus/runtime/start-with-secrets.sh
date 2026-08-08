#!/usr/bin/env bash
set -euo pipefail

secret_file=${TITUS_SECRET_FILE:-/run/secrets/hermes-titus-runtime}
test -r "$secret_file" || { printf 'hermes-titus: runtime secret file unavailable\n' >&2; exit 1; }

set -a
# shellcheck disable=SC1090
. "$secret_file"
set +a

for key in \
  OPENROUTER_API_KEY AGENTMAIL_API_KEY HERMES_DEFAULT_MODEL CONTROL_TOWER_TOKEN \
  HERMES_API_KEY SECURITY_SERVICE_TOKEN TITUS_DASHBOARD_OIDC_CLIENT_ID; do
  value=${!key:-}
  test -n "$value" && test "$value" != NOT_CONFIGURED || {
    printf 'hermes-titus: required runtime value unavailable: %s\n' "$key" >&2
    exit 1
  }
done

for key in \
  MEMORY_TENCENTDB_EMBEDDING_ENABLED MEMORY_TENCENTDB_EMBEDDING_PROVIDER \
  MEMORY_TENCENTDB_EMBEDDING_BASE_URL MEMORY_TENCENTDB_EMBEDDING_MODEL \
  MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS MEMORY_TENCENTDB_EMBEDDING_SEND_DIMENSIONS \
  MEMORY_TENCENTDB_LLM_MODEL; do
  value=${!key:-}
  test -n "$value" || {
    printf 'hermes-titus: required memory configuration unavailable: %s\n' "$key" >&2
    exit 1
  }
done

case "$MEMORY_TENCENTDB_EMBEDDING_ENABLED" in
  true)
    export TDAI_GATEWAY_CONFIG=/opt/data/config/tdai-gateway.yaml
    ;;
  false)
    unset TDAI_GATEWAY_CONFIG
    ;;
  *)
    printf 'hermes-titus: memory embedding enable flag must be true or false\n' >&2
    exit 1
    ;;
esac

export API_SERVER_ENABLED=true
export API_SERVER_HOST=0.0.0.0
export API_SERVER_PORT=8642
export API_SERVER_KEY=$HERMES_API_KEY

export HOME=/opt/data
export HERMES_HOME=/opt/data
export HERMES_INFERENCE_MODEL=$HERMES_DEFAULT_MODEL
export XDG_CACHE_HOME=/opt/data/.cache
export PYTHONPATH=/opt/data/python-packages:/opt/hermes
export TDAI_LLM_API_KEY=$OPENROUTER_API_KEY
export TDAI_LLM_BASE_URL=https://openrouter.ai/api/v1
export TDAI_LLM_MODEL=$MEMORY_TENCENTDB_LLM_MODEL
export TDAI_DATA_DIR=/opt/data/memory-tencentdb/data
export MEMORY_TENCENTDB_GATEWAY_HOST=127.0.0.1
export MEMORY_TENCENTDB_GATEWAY_PORT=8420
export MEMORY_TENCENTDB_LOG_DIR=/opt/data/logs/memory_tencentdb
memory_root=/opt/data/.memory-tencentdb/tdai-memory-openclaw-plugin
export MEMORY_TENCENTDB_GATEWAY_CMD="sh -c 'cd $memory_root && exec node --import tsx src/gateway/server.ts'"
export TDAI_GATEWAY_API_KEY
TDAI_GATEWAY_API_KEY=$(/opt/hermes/.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))')
export MEMORY_TENCENTDB_GATEWAY_API_KEY=$TDAI_GATEWAY_API_KEY
export MATRIX_ALLOW_ALL_USERS=false
export MATRIX_HOME_ROOM=${MATRIX_ALLOWED_ROOMS:-}
export MATRIX_E2EE_MODE=required
export MATRIX_REQUIRE_MENTION=false
export MATRIX_SESSION_SCOPE=room
export MATRIX_AUTO_THREAD=false
export MATRIX_DM_AUTO_THREAD=false
export MATRIX_DM_MENTION_THREADS=false
export MATRIX_REACTIONS=true
export MATRIX_APPROVAL_REQUIRE_SENDER=true
export MATRIX_ALLOW_ROOM_MENTIONS=false
export MATRIX_ALLOW_PUBLIC_ROOMS=false
export MATRIX_PROCESS_NOTICES=false
export MATRIX_TOOLS_ALLOW_REDACTION=false
export MATRIX_TOOLS_ALLOW_INVITES=false
export MATRIX_TOOLS_ALLOW_ROOM_CREATE=false
export MATRIX_TOOLS_ALLOW_CROSS_ROOM=false
export MATRIX_TOOLS_ALLOW_CROSS_ROOM_DESTRUCTIVE=false
export MATRIX_MAX_MEDIA_BYTES=10485760

export TELEGRAM_ALLOW_ALL_USERS=false
case "${TITUS_TELEGRAM_STATE:-disabled}" in
  disabled|invalid|failed)
    unset TELEGRAM_BOT_TOKEN TELEGRAM_ALLOWED_USERS
    ;;
  ready)
    test -n "${TELEGRAM_BOT_TOKEN:-}" || {
      printf 'hermes-titus: Telegram bot token unavailable\n' >&2
      exit 1
    }
    test -n "${TELEGRAM_ALLOWED_USERS:-}" || {
      printf 'hermes-titus: Telegram allowed user unavailable\n' >&2
      exit 1
    }
    ;;
  *)
    printf 'hermes-titus: Telegram state is invalid\n' >&2
    exit 1
    ;;
esac

case "${TITUS_GITHUB_STATE:-disabled}" in
  disabled|invalid|failed)
    unset GITHUB_APP_ID GITHUB_APP_CLIENT_ID GITHUB_APP_INSTALLATION_ID \
      GITHUB_ORGANIZATION GITHUB_ALLOWED_REPOSITORIES GITHUB_APP_PRIVATE_KEY_PATH
    test -z "${GITHUB_APP_PRIVATE_KEY:-}" || {
      printf 'hermes-titus: GitHub private key must not be injected as an environment value\n' >&2
      exit 1
    }
    unset GITHUB_APP_PRIVATE_KEY
    ;;
  ready)
    for key in \
      GITHUB_APP_ID GITHUB_APP_CLIENT_ID GITHUB_APP_INSTALLATION_ID \
      GITHUB_ORGANIZATION GITHUB_ALLOWED_REPOSITORIES GITHUB_APP_PRIVATE_KEY_PATH; do
      value=${!key:-}
      test -n "$value" && test "$value" != NOT_CONFIGURED || {
        printf 'hermes-titus: required GitHub App value unavailable: %s\n' "$key" >&2
        exit 1
      }
    done
    test "$GITHUB_APP_PRIVATE_KEY_PATH" = /run/secrets/hermes-titus-github-app-private-key || {
      printf 'hermes-titus: GitHub private key path is not the protected mount\n' >&2
      exit 1
    }
    test -f "$GITHUB_APP_PRIVATE_KEY_PATH" && test ! -L "$GITHUB_APP_PRIVATE_KEY_PATH" || {
      printf 'hermes-titus: GitHub private key file unavailable\n' >&2
      exit 1
    }
    test -z "${GITHUB_APP_PRIVATE_KEY:-}" || {
      printf 'hermes-titus: GitHub private key must not be injected as an environment value\n' >&2
      exit 1
    }
    ;;
  *)
    printf 'hermes-titus: GitHub state is invalid\n' >&2
    exit 1
    ;;
esac

install -d -m 0700 /opt/data/.cache /opt/data/logs/memory_tencentdb /opt/data/memory-tencentdb/data
test -x /opt/data/bin/hermes-email-run-approval || {
  printf 'hermes-titus: email run approval helper unavailable\n' >&2
  exit 1
}

/opt/hermes/.venv/bin/python - <<'PY'
import os
from pathlib import Path
import tempfile
import yaml

path = Path('/opt/data/config.yaml')
config = yaml.safe_load(path.read_text()) or {}
config.setdefault('model', {})['default'] = os.environ['HERMES_DEFAULT_MODEL']
config['model']['provider'] = 'openai-codex'
config['model']['base_url'] = 'https://chatgpt.com/backend-api/codex'
delegation = config.setdefault('delegation', {})
delegation['provider'] = 'openai-codex'
delegation['base_url'] = 'https://chatgpt.com/backend-api/codex'
delegation['model'] = 'gpt-5.6-luna'
delegation['reasoning_effort'] = 'high'
delegation['orchestrator_enabled'] = True
delegation['max_concurrent_children'] = 3
delegation['max_iterations'] = 30
delegation['max_spawn_depth'] = 1
delegation['child_timeout_seconds'] = 600
delegation['inherit_mcp_toolsets'] = True
delegation['subagent_auto_approve'] = False
config.setdefault('memory', {})['provider'] = 'memory_tencentdb'
matrix = config.setdefault('platforms', {}).setdefault('matrix', {})
matrix['enabled'] = os.environ.get('TITUS_MATRIX_STATE') == 'ready'
matrix_extra = matrix.setdefault('extra', {})
matrix_extra['require_mention'] = False
matrix_extra['session_scope'] = 'room'
matrix_extra['auto_thread'] = False
teams = config.setdefault('platforms', {}).setdefault('teams', {})
teams['enabled'] = os.environ.get('TITUS_TEAMS_STATE') == 'ready'
extra = teams.setdefault('extra', {})
extra['port'] = int(os.environ.get('TEAMS_PORT', '3978'))
extra['allow_all_users'] = False
extra['require_mention'] = True
telegram = config.setdefault('platforms', {}).setdefault('telegram', {})
telegram['enabled'] = os.environ.get('TITUS_TELEGRAM_STATE') == 'ready'
telegram_extra = telegram.setdefault('extra', {})
telegram_extra['allow_from'] = (
    [os.environ['TELEGRAM_ALLOWED_USERS']]
    if telegram['enabled']
    else []
)
telegram_extra['group_allow_from'] = []
telegram_extra['require_mention'] = False
telegram_extra['guest_mode'] = False
telegram_extra['observe_unmentioned_group_messages'] = False
telegram_extra['disable_link_previews'] = True
dashboard = config.setdefault('dashboard', {})
dashboard['public_url'] = 'https://titus-dashboard.overnightdesk.com'
oauth = dashboard.setdefault('oauth', {})
oauth['provider'] = 'self-hosted'
self_hosted = oauth.setdefault('self_hosted', {})
self_hosted['issuer'] = 'https://www.overnightdesk.com/api/auth'
self_hosted['client_id'] = os.environ['TITUS_DASHBOARD_OIDC_CLIENT_ID']
self_hosted['scopes'] = 'openid profile email'
with tempfile.NamedTemporaryFile(
    mode='w',
    dir=path.parent,
    prefix='.config.yaml.',
    delete=False,
) as handle:
    yaml.safe_dump(config, handle, sort_keys=False)
    handle.flush()
    os.fsync(handle.fileno())
    temporary = Path(handle.name)
temporary.chmod(0o600)
os.replace(temporary, path)
PY

/opt/hermes/.venv/bin/python /opt/data/bin/apply-email-mode.py \
  linear "${TITUS_LINEAR_STATE:-disabled}" /opt/data/config.yaml

(
  cd "$memory_root"
  exec node --import tsx src/gateway/server.ts
) >>/opt/data/logs/memory_tencentdb/gateway.stdout.log \
  2>>/opt/data/logs/memory_tencentdb/gateway.stderr.log &

memory_pid=$!
for _ in $(seq 1 30); do
  if /opt/hermes/.venv/bin/python - <<'PY' >/dev/null 2>&1
import urllib.request
with urllib.request.urlopen('http://127.0.0.1:8420/health', timeout=1) as response:
    assert response.status == 200
PY
  then
    exec /opt/data/bin/start-all.sh
  fi
  kill -0 "$memory_pid" 2>/dev/null || {
    printf 'hermes-titus: memory gateway exited during startup\n' >&2
    exit 1
  }
  sleep 1
done

printf 'hermes-titus: memory gateway did not become healthy\n' >&2
exit 1
