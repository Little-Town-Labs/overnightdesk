#!/usr/bin/env bash
set -euo pipefail

exec /opt/hermes/.venv/bin/python -c '
import sys
sys.path.insert(0, "/opt/data/bin")
from agentmail_poller import health_status
healthy, state = health_status("/opt/data/agentmail-poller/health.json", max_age=180)
print("agentmail_poller=" + state)
raise SystemExit(0 if healthy else 1)
'
