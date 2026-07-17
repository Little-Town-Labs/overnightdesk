#!/usr/bin/env bash
set -euo pipefail

test "$#" -eq 0 || {
  printf 'control-tower-session: arguments are not accepted\n' >&2
  exit 2
}

secret_file=/run/secrets/hermes-titus-runtime
test -r "$secret_file" || {
  printf 'control-tower-session: protected runtime file unavailable\n' >&2
  exit 1
}

# Source the root-created runtime file only inside this fixed-purpose helper.
# The caller never receives the bearer token and the token never enters argv.
# shellcheck disable=SC1090
. "$secret_file"
test -n "${CONTROL_TOWER_TOKEN:-}" && test "$CONTROL_TOWER_TOKEN" != NOT_CONFIGURED || {
  printf 'control-tower-session: protected token unavailable\n' >&2
  exit 1
}

export TITUS_CONTROL_TOWER_TOKEN=$CONTROL_TOWER_TOKEN
unset CONTROL_TOWER_TOKEN

exec /opt/hermes/.venv/bin/python - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

url = "http://control-tower:8080/v1/session"
request = urllib.request.Request(url)
request.add_header("Authorization", "Bearer " + os.environ["TITUS_CONTROL_TOWER_TOKEN"])

try:
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read())
except urllib.error.HTTPError as exc:
    print(f"control-tower-session: request failed with HTTP status {exc.code}", file=sys.stderr)
    raise SystemExit(1)
except Exception:
    print("control-tower-session: request failed", file=sys.stderr)
    raise SystemExit(1)

session = payload.get("data") or payload
agent_id = session.get("agentId")
workspace_id = session.get("workspaceId")
profile_id = session.get("capabilityProfileId")
capabilities = session.get("capabilityIds") or []

if (
    agent_id != "hermes-titus"
    or workspace_id != "overnightdesk"
    or profile_id != "read-hermes-monitoring"
    or "observe.monitoring-summary.read" not in capabilities
):
    print("control-tower-session: authority boundary mismatch", file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "agentId": agent_id,
    "workspaceId": workspace_id,
    "capabilityProfileId": profile_id,
    "capabilityIds": capabilities,
}, separators=(",", ":"), sort_keys=True))
PY
