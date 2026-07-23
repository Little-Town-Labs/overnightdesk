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

reject_pattern() {
  local pattern=$1
  local path=$2
  if grep -Eq -- "$pattern" "$path"; then
    fail "prohibited contract pattern in ${path#$repo_root/}: $pattern"
  fi
}

runtime_files=(
  "$tenant_root/runtime/load-phase-env.sh"
  "$tenant_root/runtime/apply-email-mode.py"
  "$tenant_root/runtime/prepare-volume.sh"
  "$tenant_root/runtime/start-all.sh"
  "$tenant_root/runtime/start-all.loopback.sh"
  "$tenant_root/runtime/start-with-secrets.sh"
  "$tenant_root/runtime/control-tower-session.sh"
  "$tenant_root/runtime/email-run-approval.sh"
  "$tenant_root/runtime/verify-mcp-registry.py"
  "$tenant_root/runtime/hermes-titus.service"
  "$tenant_root/config/config.yaml"
  "$tenant_root/config/tdai-gateway.yaml"
  "$tenant_root/config/SOUL.md"
  "$tenant_root/scripts/deploy-aegis.sh"
  "$tenant_root/README.md"
  "$tenant_root/skills/agentmail-email/SKILL.md"
  "$tenant_root/skills/control-tower-hermes/SKILL.md"
  "$tenant_root/mcp-servers/guarded-agentmail/guarded_email.py"
  "$tenant_root/mcp-servers/guarded-agentmail/service.py"
  "$tenant_root/mcp-servers/guarded-agentmail/server.py"
  "$tenant_root/mcp-servers/guarded-agentmail/tests/test_guarded_email.py"
  "$tenant_root/mcp-servers/guarded-agentmail/tests/test_server_contract.py"
  "$tenant_root/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py"
  "$tenant_root/mcp-servers/guarded-agentmail/tests/test_mcp_registry_verifier.py"
)

for file in "${runtime_files[@]}"; do
  require_file "$file"
done

bash -n \
  "$tenant_root/runtime/load-phase-env.sh" \
  "$tenant_root/runtime/prepare-volume.sh" \
  "$tenant_root/runtime/start-all.sh" \
  "$tenant_root/runtime/start-all.loopback.sh" \
  "$tenant_root/runtime/start-with-secrets.sh" \
  "$tenant_root/runtime/control-tower-session.sh" \
  "$tenant_root/runtime/email-run-approval.sh" \
  "$tenant_root/scripts/deploy-aegis.sh"

PYTHONDONTWRITEBYTECODE=1 \
PYTHONPATH="$tenant_root/mcp-servers/guarded-agentmail" \
  python -m pytest -q "$tenant_root/mcp-servers/guarded-agentmail/tests"
PYTHONDONTWRITEBYTECODE=1 python - \
  "$tenant_root/mcp-servers/guarded-agentmail/guarded_email.py" \
  "$tenant_root/mcp-servers/guarded-agentmail/service.py" \
  "$tenant_root/mcp-servers/guarded-agentmail/server.py" \
  "$tenant_root/runtime/apply-email-mode.py" \
  "$tenant_root/runtime/verify-mcp-registry.py" <<'PY'
from pathlib import Path
import ast
import sys

for raw_path in sys.argv[1:]:
    path = Path(raw_path)
    source = path.read_text()
    compile(source, str(path), "exec")
    if len(source.splitlines()) >= 800:
        raise SystemExit(f"hermes-titus qualification: Python file too long: {path}")
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            span = (node.end_lineno or node.lineno) - node.lineno + 1
            if span > 50:
                raise SystemExit(
                    "hermes-titus qualification: Python function too long: "
                    f"{path}:{node.lineno}:{node.name}"
                )
PY

require_pattern '/agents/hermes-titus/runtime' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'phase_app=\$\{TITUS_PHASE_APP:-timeless-tech-solutions\}' "$tenant_root/runtime/load-phase-env.sh"
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
require_pattern 'SECURITY_SERVICE_TOKEN' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'SECURITY_SERVICE_TOKEN' "$tenant_root/runtime/start-with-secrets.sh"

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
python - "$tenant_root/config/config.yaml" <<'PY'
from pathlib import Path
import sys

expected = [
    "list_inboxes",
    "get_inbox",
    "list_threads",
    "search_threads",
    "get_thread",
    "list_messages",
    "search_messages",
    "get_attachment",
]
lines = Path(sys.argv[1]).read_text().splitlines()
try:
    server_start = lines.index("  agentmail:")
    tools_start = lines.index("    tools:", server_start)
    include_start = lines.index("      include:", tools_start)
except ValueError:
    actual = None
else:
    actual = []
    for line in lines[include_start + 1 :]:
        if line.startswith("        - "):
            actual.append(line.removeprefix("        - "))
            continue
        if line.strip():
            break
if actual != expected:
    raise SystemExit(
        "hermes-titus qualification: AgentMail hosted tool allowlist "
        "must be the exact approved read-only set"
    )
try:
    server_end = lines.index("  guarded_agentmail:", server_start + 1)
except ValueError:
    raise SystemExit(
        "hermes-titus qualification: guarded AgentMail server is unavailable"
    )
if any(line.startswith("    command:") for line in lines[server_start:server_end]):
    raise SystemExit(
        "hermes-titus qualification: hosted AgentMail must not use a local command"
    )
PY
require_pattern '^  guarded_agentmail:$' "$tenant_root/config/config.yaml"
require_pattern 'command: "/opt/hermes/\.venv/bin/python"' "$tenant_root/config/config.yaml"
require_pattern '/opt/data/mcp-servers/guarded-agentmail/server\.py' "$tenant_root/config/config.yaml"
require_pattern 'AGENTMAIL_API_KEY: "\$\{AGENTMAIL_API_KEY\}"' "$tenant_root/config/config.yaml"
require_pattern 'AGENTMAIL_INBOX_ID: "\$\{AGENTMAIL_INBOX_ID\}"' "$tenant_root/config/config.yaml"
require_pattern 'SECURITY_SERVICE_TOKEN: "\$\{SECURITY_SERVICE_TOKEN\}"' "$tenant_root/config/config.yaml"
require_pattern 'TITUS_GUARDED_EMAIL_STATE: "/opt/data/guarded-agentmail/attempts\.sqlite3"' "$tenant_root/config/config.yaml"
python - "$tenant_root/config/config.yaml" <<'PY'
from pathlib import Path
import sys

import yaml

config = yaml.safe_load(Path(sys.argv[1]).read_text()) or {}
guarded = (config.get("mcp_servers") or {}).get("guarded_agentmail") or {}
expected_env = {
    "AGENTMAIL_API_KEY": "${AGENTMAIL_API_KEY}",
    "AGENTMAIL_INBOX_ID": "${AGENTMAIL_INBOX_ID}",
    "SECURITY_SERVICE_TOKEN": "${SECURITY_SERVICE_TOKEN}",
    "TITUS_GUARDED_EMAIL_STATE": "/opt/data/guarded-agentmail/attempts.sqlite3",
    "PYTHONDONTWRITEBYTECODE": "1",
}
if guarded.get("command") != "/opt/hermes/.venv/bin/python":
    raise SystemExit("hermes-titus qualification: unexpected guarded MCP command")
if guarded.get("args") != ["/opt/data/mcp-servers/guarded-agentmail/server.py"]:
    raise SystemExit("hermes-titus qualification: unexpected guarded MCP arguments")
if guarded.get("env") != expected_env:
    raise SystemExit("hermes-titus qualification: unexpected guarded MCP environment")
expected_tools = {
    "include": [
        "titus_prepare_email_approval",
        "titus_send_approved_email",
    ],
    "resources": False,
    "prompts": False,
}
if guarded.get("tools") != expected_tools:
    raise SystemExit("hermes-titus qualification: unexpected guarded MCP tool surface")
elicitation = guarded.get("elicitation") or {}
if elicitation.get("enabled") is not True:
    raise SystemExit("hermes-titus qualification: owner elicitation must be enabled")
approval_timeout = elicitation.get("timeout")
tool_timeout = guarded.get("timeout")
if (
    not isinstance(approval_timeout, int)
    or not isinstance(tool_timeout, int)
    or tool_timeout < approval_timeout + 45
):
    raise SystemExit(
        "hermes-titus qualification: guarded MCP timeout cannot cover owner "
        "approval plus bounded external verification"
    )
PY
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
require_pattern '/source/mcp-servers/guarded-agentmail/guarded_email\.py' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/mcp-servers/guarded-agentmail/service\.py' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/mcp-servers/guarded-agentmail/server\.py' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'install -d -m 0700 /opt/data/guarded-agentmail' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/runtime/verify-mcp-registry\.py' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'guarded-email-read-only' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/source/runtime/apply-email-mode\.py' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'TITUS_GUARDED_EMAIL_MODE' "$tenant_root/runtime/prepare-volume.sh"

require_pattern 'User=hermes-titus' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStartPre=.*/load-phase-env\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStart=.*/run-container\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'ExecStop=.*/stop-container\.sh' "$tenant_root/runtime/hermes-titus.service"
require_pattern 'dashboard --host 0\.0\.0\.0 --port 9119 --no-open' "$tenant_root/runtime/start-all.sh"
require_pattern 'dashboard --host 127\.0\.0\.1 --port 9119 --no-open' "$tenant_root/runtime/start-all.loopback.sh"
reject_pattern '--insecure' "$tenant_root/runtime/start-all.sh"
reject_pattern '--insecure' "$tenant_root/runtime/start-all.loopback.sh"
require_pattern 'public_url: "https://titus-dashboard\.overnightdesk\.com"' "$tenant_root/config/config.yaml"
require_pattern 'provider: self-hosted' "$tenant_root/config/config.yaml"
require_pattern 'issuer: "https://www\.overnightdesk\.com/api/auth"' "$tenant_root/config/config.yaml"
require_pattern 'client_id: "__TITUS_DASHBOARD_OIDC_CLIENT_ID__"' "$tenant_root/config/config.yaml"
require_pattern 'scopes: "openid profile email"' "$tenant_root/config/config.yaml"
require_pattern 'os\.replace\(temporary, path\)' "$tenant_root/runtime/start-with-secrets.sh"
require_pattern "self_hosted\\['client_id'\\] = os\\.environ\\['TITUS_DASHBOARD_OIDC_CLIENT_ID'\\]" "$tenant_root/runtime/start-with-secrets.sh"
require_pattern 'dashboard-oidc-client-id' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TITUS_DASHBOARD_OIDC_CLIENT_ID' "$tenant_root/runtime/load-phase-env.sh"
require_pattern 'TITUS_DASHBOARD_OIDC_CLIENT_FILE' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'rollback-loopback-dashboard' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'TITUS_DASHBOARD_LAUNCHER' "$tenant_root/runtime/prepare-volume.sh"
require_pattern 'hermes dashboard --host 127\.0\.0\.1 --port 9119 --no-open' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern '/source/runtime/start-all\.loopback\.sh' "$tenant_root/runtime/prepare-volume.sh"
require_pattern '/opt/data/bin/start-all\.loopback\.sh' "$tenant_root/runtime/prepare-volume.sh"
reject_pattern '(^|[[:space:]])(-p|--publish)([=[:space:]]|$)' "$tenant_root/runtime/run-container.sh"
require_pattern '--network overnightdesk_overnightdesk' "$tenant_root/runtime/run-container.sh"
require_pattern 'systemctl restart hermes-titus\.service' "$tenant_root/scripts/deploy-aegis.sh"
reject_pattern 'systemctl restart (hermes-walter|open-webui)' "$tenant_root/scripts/deploy-aegis.sh"

require_pattern 'explicit owner approval' "$tenant_root/skills/agentmail-email/SKILL.md"
require_pattern 'Do not call `titus_send_approved_email` in the same turn as preparation' "$tenant_root/skills/agentmail-email/SKILL.md"
require_pattern 'Report success only for an exact `verified_sent` result' "$tenant_root/skills/agentmail-email/SKILL.md"
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
require_pattern 'email_read_only' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'email_guarded' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'guarded-email-read-only' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern '/opt/data/bin/verify-mcp-registry\.py' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'guarded_agentmail_mcp=read_only_rollback' "$tenant_root/runtime/verify-mcp-registry.py"
require_pattern 'MATRIX_ACCESS_TOKEN' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'MATRIX_RECOVERY_KEY' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern '_matrix/client/v3/account/whoami' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern '_matrix/client/v3/joined_rooms' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'm\.room\.encryption' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'TITUS_MATRIX_STATE' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'hermes-email-intake-.*-data' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'for route in titus walter mitchel; do' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'agent_state=.*hermes-email-intake@agent\.service' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'test "\$agent_state" = inactive' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'for route in titus walter mitchel agent; do' "$tenant_root/scripts/deploy-aegis.sh"
reject_pattern 'for route in titus agent mitchel; do' "$tenant_root/scripts/deploy-aegis.sh"
require_pattern 'embeddingService' "$tenant_root/scripts/deploy-aegis.sh"

require_pattern 'provider: "\$\{MEMORY_TENCENTDB_EMBEDDING_PROVIDER\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'baseUrl: "\$\{MEMORY_TENCENTDB_EMBEDDING_BASE_URL\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'apiKey: "\$\{OPENROUTER_API_KEY\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'model: "\$\{MEMORY_TENCENTDB_EMBEDDING_MODEL\}"' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'dimensions: 1536' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'sendDimensions: true' "$tenant_root/config/tdai-gateway.yaml"
require_pattern 'maxInputChars: 32000' "$tenant_root/config/tdai-gateway.yaml"

if grep -ERq --exclude-dir=__pycache__ '(sk-or-v1-|am_[A-Za-z0-9]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,}|TEAMS_CLIENT_SECRET=[^N$])' \
  "$tenant_root/config" "$tenant_root/runtime" "$tenant_root/skills" \
  "$tenant_root/mcp-servers" "$tenant_root/README.md"; then
  fail 'possible credential literal found in tenant source'
fi

printf 'hermes-titus qualification: PASS\n'
