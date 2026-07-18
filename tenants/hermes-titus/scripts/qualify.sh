#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
tenant_root="$repo_root/tenants/hermes-titus"

fail() {
  printf 'hermes-titus qualification: %s\n' "$*" >&2
  exit 1
}

require_file() {
  local path=$1
  test -f "$path" || fail "missing ${path#$repo_root/}"
}

require_pattern() {
  local pattern=$1
  local path=$2
  grep -Eq -- "$pattern" "$path" || fail "missing contract pattern in ${path#$repo_root/}: $pattern"
}

runtime_files=(
  "$tenant_root/runtime/load-phase-env.sh"
  "$tenant_root/runtime/prepare-volume.sh"
  "$tenant_root/runtime/start-all.sh"
  "$tenant_root/runtime/start-with-secrets.sh"
  "$tenant_root/runtime/control-tower-session.sh"
  "$tenant_root/runtime/email-run-approval.sh"
  "$tenant_root/runtime/hermes-titus.service"
  "$tenant_root/config/config.yaml"
  "$tenant_root/config/tdai-gateway.yaml"
  "$tenant_root/config/SOUL.md"
  "$tenant_root/scripts/deploy-aegis.sh"
  "$tenant_root/README.md"
  "$tenant_root/skills/agentmail-email/SKILL.md"
  "$tenant_root/skills/control-tower-hermes/SKILL.md"
)

for file in "${runtime_files[@]}"; do
  require_file "$file"
done

bash -n \
  "$tenant_root/runtime/load-phase-env.sh" \
  "$tenant_root/runtime/prepare-volume.sh" \
  "$tenant_root/runtime/start-all.sh" \
  "$tenant_root/runtime/start-with-secrets.sh" \
  "$tenant_root/runtime/control-tower-session.sh" \
  "$tenant_root/runtime/email-run-approval.sh" \
  "$tenant_root/scripts/deploy-aegis.sh"

require_pattern '/agents/hermes-titus/runtime' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/agents/hermes-titus/overnightdesk' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/agents/hermes-titus/teams' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/agents/hermes-titus/matrix' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/agents/hermes-titus/memory' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'MEMORY_TENCENTDB_EMBEDDING_MODEL' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'perplexity/pplx-embed-v1-4b' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'NOT_CONFIGURED' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TEAMS_ALLOW_ALL_USERS' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TEAMS_ALLOWED_USERS' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'MATRIX_ACCESS_TOKEN' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'MATRIX_RECOVERY_KEY' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'MATRIX_DEVICE_ID' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'MATRIX_ALLOWED_USERS' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'MATRIX_ALLOWED_ROOMS' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TITUS_MATRIX_STATE' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/run/hermes-titus/runtime.env' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'unexpected key in Titus runtime Phase path' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'Phase token file owner is invalid' "$tenant_root/runtime/load-phase-env.sh"

require_pattern 'memory_tencentdb' "$tenant_root/config/config.yaml"
require_pattern 'reasoning_effort: medium' "$tenant_root/config/config.yaml"
require_pattern 'model: "x-ai/grok-build-0\.1"' "$tenant_root/config/config.yaml"
require_pattern 'x-ai/grok-4\.3' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'HERMES_INFERENCE_MODEL' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'TDAI_GATEWAY_CONFIG' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MEMORY_TENCENTDB_EMBEDDING_ENABLED' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'x-ai/grok-4\.3' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'x-ai/grok-build-0\.1' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'You are Titus' "$tenant_root/config/SOUL.md"
require_pattern 'Control Tower' "$tenant_root/config/SOUL.md"
require_pattern 'Do not expand your authority' "$tenant_root/config/SOUL.md"
require_pattern 'url: "https://mcp\.agentmail\.to/mcp"' "$tenant_root/config/config.yaml"
require_pattern 'x-api-key: "\$\{AGENTMAIL_API_KEY\}"' "$tenant_root/config/config.yaml"
if grep -Eq '(^|[[:space:]])(command:|agentmail-mcp)' "$tenant_root/config/config.yaml"; then
  fail 'AgentMail must use the hosted MCP endpoint rather than a local bridge'
fi
require_pattern 'platforms:' "$tenant_root/config/config.yaml"
require_pattern 'teams:' "$tenant_root/config/config.yaml"
require_pattern 'matrix:' "$tenant_root/config/config.yaml"
require_pattern 'enabled: false' "$tenant_root/config/config.yaml"
require_pattern 'busy_input_mode: queue' "$tenant_root/config/config.yaml"
require_pattern 'session_scope: room' "$tenant_root/config/config.yaml"
require_pattern 'require_mention: false' "$tenant_root/config/config.yaml"

require_pattern "platforms.*matrix" "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_E2EE_MODE' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_MAX_MEDIA_BYTES' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern '10485760' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_APPROVAL_REQUIRE_SENDER' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_HOME_ROOM' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_ALLOW_PUBLIC_ROOMS' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_TOOLS_ALLOW_REDACTION' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_TOOLS_ALLOW_INVITES' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_TOOLS_ALLOW_ROOM_CREATE' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_TOOLS_ALLOW_CROSS_ROOM' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'MATRIX_TOOLS_ALLOW_CROSS_ROOM_DESTRUCTIVE' "$tenant_root/runtime/start-with-secrets.sh"

require_pattern '@tencentdb-agent-memory/memory-tencentdb@0\.3\.6' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'npm pkg delete scripts\.postinstall' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'microsoft-teams-apps==2\.0\.13\.4' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'aiohttp==3\.14\.1' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'memory_tencentdb' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/config/tdai-gateway.yaml' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/opt/data/config/tdai-gateway.yaml' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/config/SOUL.md' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/opt/data/SOUL.md' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'volume preparation refused while the gateway is running' "$tenant_root/runtime/prepare-volume.sh"

require_pattern 'User=hermes-titus' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStartPre=.*/load-phase-env\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStart=.*/run-container\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStop=.*/stop-container\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'dashboard --host 127\.0\.0\.1' "$tenant_root/runtime/start-all.sh"

require_pattern 'explicit human approval' "$tenant_root/skills/agentmail-email/SKILL.md"
require_pattern 'never request, print, log, persist, or pass the key' "$tenant_root/skills/agentmail-email/SKILL.md"
require_pattern 'GET http://control-tower:8080/v1/session' "$tenant_root/skills/control-tower-hermes/SKILL.md"
require_pattern '/opt/data/bin/control-tower-session' "$tenant_root/skills/control-tower-hermes/SKILL.md"
require_pattern '/run/secrets/hermes-titus-runtime' "$tenant_root/runtime/control-tower-session.sh"
require_pattern 'http://control-tower:8080/v1/session' "$tenant_root/runtime/control-tower-session.sh"
require_pattern 'observe.monitoring-summary.read' "$tenant_root/runtime/control-tower-session.sh"
require_pattern '/source/runtime/control-tower-session.sh' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/runtime/email-run-approval.sh' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/v1/runs/.*/approval' "$tenant_root/runtime/email-run-approval.sh"

require_pattern '--network overnightdesk_overnightdesk' "$tenant_root/runtime/run-container.sh"
require_pattern '--cap-drop ALL' "$tenant_root/runtime/run-container.sh"
require_pattern 'no-new-privileges' "$tenant_root/runtime/run-container.sh"
require_pattern 'hermes-titus-data:/opt/data' "$tenant_root/runtime/run-container.sh"
require_pattern '/run/hermes-titus/runtime.env:/run/secrets/hermes-titus-runtime:ro' "$tenant_root/runtime/run-container.sh"
require_pattern 'restart_runtime' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'rollback_runtime' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'MATRIX_ACCESS_TOKEN' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'MATRIX_RECOVERY_KEY' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern '_matrix/client/v3/account/whoami' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern '_matrix/client/v3/joined_rooms' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'm\.room\.encryption' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'TITUS_MATRIX_STATE' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'hermes-email-intake-.*-data' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'embeddingService' "$tenant_root/scripts/deploy-aegis.sh"

require_pattern 'provider: "\$\{MEMORY_TENCENTDB_EMBEDDING_PROVIDER\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'baseUrl: "\$\{MEMORY_TENCENTDB_EMBEDDING_BASE_URL\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'apiKey: "\$\{OPENROUTER_API_KEY\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'model: "\$\{MEMORY_TENCENTDB_EMBEDDING_MODEL\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'dimensions: 1536' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'sendDimensions: true' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'maxInputChars: 32000' "$tenant_root/config/tdai-gateway.yaml"

if grep -ERq --exclude-dir=__pycache__ '(sk-or-v1-|am_[A-Za-z0-9]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,}|TEAMS_CLIENT_SECRET=[^N$])' \
  "$tenant_root/config" "$tenant_root/runtime" "$tenant_root/skills" "$tenant_root/README.md"; then
  fail 'possible credential literal found in tenant source'
fi

printf 'hermes-titus qualification: PASS\n'
