#!/usr/bin/env bash
set -euo pipefail

export HERMES_HOME="${HERMES_HOME:-/opt/data}"
export HOME="$HERMES_HOME"
mkdir -p "$HERMES_HOME"/sessions "$HERMES_HOME"/logs "$HERMES_HOME"/skills

if [[ ! -f "$HERMES_HOME/.env" && -f /opt/hermes/.env.example ]]; then
  cp /opt/hermes/.env.example "$HERMES_HOME/.env"
fi

if [[ ! -f "$HERMES_HOME/config.yaml" && -f /opt/hermes/cli-config.yaml.example ]]; then
  cp /opt/hermes/cli-config.yaml.example "$HERMES_HOME/config.yaml"
fi

if [[ -d /opt/hermes/skills ]]; then
  cp -a /opt/hermes/skills/. "$HERMES_HOME/skills/"
fi

/opt/hermes/.venv/bin/hermes gateway run &
gateway_pid=$!
/opt/hermes/.venv/bin/hermes dashboard --host 127.0.0.1 --port 9119 --no-open &
dashboard_pid=$!
/opt/hermes/.venv/bin/python /opt/data/bin/agentmail_poller.py run &
poller_pid=$!

printf 'hermes-titus started: gateway=%s dashboard=%s poller=%s\n' "$gateway_pid" "$dashboard_pid" "$poller_pid"

shutdown() {
  kill "$gateway_pid" "$dashboard_pid" "$poller_pid" 2>/dev/null || true
  wait "$gateway_pid" "$dashboard_pid" "$poller_pid" 2>/dev/null || true
}
trap shutdown EXIT INT TERM

while \
  kill -0 "$gateway_pid" 2>/dev/null && \
  kill -0 "$dashboard_pid" 2>/dev/null && \
  kill -0 "$poller_pid" 2>/dev/null; do
  sleep 5
done

exit 1
