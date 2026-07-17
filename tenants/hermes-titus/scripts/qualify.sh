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
  "$tenant_root/runtime/hermes-titus.service"
  "$tenant_root/config/config.yaml"
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
  "$tenant_root/scripts/deploy-aegis.sh"

require_pattern '/agents/hermes-titus/runtime' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/agents/hermes-titus/overnightdesk' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/agents/hermes-titus/teams' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'NOT_CONFIGURED' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TEAMS_ALLOW_ALL_USERS' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TEAMS_ALLOWED_USERS' "$tenant_root/runtime/load-phase-env.sh"
require_pattern '/run/hermes-titus/runtime.env' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'unexpected key in Titus runtime Phase path' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'Phase token file owner is invalid' "$tenant_root/runtime/load-phase-env.sh"

require_pattern 'memory_tencentdb' "$tenant_root/config/config.yaml"
require_pattern 'url: "https://mcp\.agentmail\.to/mcp"' "$tenant_root/config/config.yaml"
require_pattern 'x-api-key: "\$\{AGENTMAIL_API_KEY\}"' "$tenant_root/config/config.yaml"
if grep -Eq '(^|[[:space:]])(command:|agentmail-mcp)' "$tenant_root/config/config.yaml"; then
  fail 'AgentMail must use the hosted MCP endpoint rather than a local bridge'
fi
require_pattern 'platforms:' "$tenant_root/config/config.yaml"
require_pattern 'teams:' "$tenant_root/config/config.yaml"
require_pattern 'enabled: false' "$tenant_root/config/config.yaml"

require_pattern '@tencentdb-agent-memory/memory-tencentdb@0\.3\.6' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'npm pkg delete scripts\.postinstall' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'microsoft-teams-apps==2\.0\.13\.4' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'aiohttp==3\.14\.1' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'memory_tencentdb' "$tenant_root/runtime/prepare-volume.sh"

require_pattern 'User=hermes-titus' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStartPre=.*/load-phase-env\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStart=.*/run-container\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStop=.*/stop-container\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'dashboard --host 127\.0\.0\.1' "$tenant_root/runtime/start-all.sh"

require_pattern 'explicit human approval' "$tenant_root/skills/agentmail-email/SKILL.md"
require_pattern 'never request, print, log, persist, or pass the key' "$tenant_root/skills/agentmail-email/SKILL.md"
require_pattern 'GET http://control-tower:8080/v1/session' "$tenant_root/skills/control-tower-hermes/SKILL.md"

require_pattern '--network overnightdesk_overnightdesk' "$tenant_root/runtime/run-container.sh"
require_pattern '--cap-drop ALL' "$tenant_root/runtime/run-container.sh"
require_pattern 'no-new-privileges' "$tenant_root/runtime/run-container.sh"
require_pattern 'hermes-titus-data:/opt/data' "$tenant_root/runtime/run-container.sh"
require_pattern '/run/hermes-titus/runtime.env:/run/secrets/hermes-titus-runtime:ro' "$tenant_root/runtime/run-container.sh"
require_pattern 'restart_runtime' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'rollback_runtime' "$tenant_root/scripts/deploy-aegis.sh"

if grep -ERq '(sk-or-v1-|am_[A-Za-z0-9]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,}|TEAMS_CLIENT_SECRET=[^N$])' \
  "$tenant_root/config" "$tenant_root/runtime" "$tenant_root/skills" "$tenant_root/README.md"; then
  fail 'possible credential literal found in tenant source'
fi

printf 'hermes-titus qualification: PASS\n'
