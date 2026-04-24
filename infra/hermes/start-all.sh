#!/usr/bin/bash
# Combined gateway + dashboard startup script for hermes-agent containers.
# Deployed to: /opt/{tenant}/bin/start-all.sh on aegis-prod
# Used as: docker run --entrypoint /usr/bin/bash ... /opt/data/bin/start-all.sh
set -e
export HERMES_HOME="${HERMES_HOME:-/opt/data}"
export HERMES_WEB_DIST="/opt/hermes/hermes_cli/web_dist"
export PYTHONUNBUFFERED=1

source /opt/hermes/.venv/bin/activate

# Idempotent directory setup
mkdir -p "$HERMES_HOME"/{cron,sessions,logs,hooks,memories,skills,skins,plans,workspace,home}
[ ! -f "$HERMES_HOME/.env" ]        && cp /opt/hermes/.env.example "$HERMES_HOME/.env" 2>/dev/null || true
[ ! -f "$HERMES_HOME/config.yaml" ] && cp /opt/hermes/cli-config.yaml.example "$HERMES_HOME/config.yaml" 2>/dev/null || true
[ ! -f "$HERMES_HOME/SOUL.md" ]     && cp /opt/hermes/docker/SOUL.md "$HERMES_HOME/SOUL.md" 2>/dev/null || true

# Sync bundled skills
python3 /opt/hermes/tools/skills_sync.py 2>/dev/null || true

# Clear stale PID/lock files from previous container run
rm -f "$HERMES_HOME/gateway.pid" "$HERMES_HOME/auth.lock"

# Clean shutdown handler
shutdown() {
    echo "Shutting down hermes..."
    kill "$GATEWAY_PID" "$DASHBOARD_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" "$DASHBOARD_PID" 2>/dev/null || true
    exit 0
}
trap shutdown SIGTERM SIGINT

# Start gateway + dashboard in the same container so the dashboard
# can detect the gateway process and report correct status
hermes gateway run &
GATEWAY_PID=$!
hermes dashboard --host 0.0.0.0 --port 9119 --no-open --insecure &
DASHBOARD_PID=$!

echo "hermes started: gateway=$GATEWAY_PID dashboard=$DASHBOARD_PID"

# Keep container alive until both processes exit
wait $GATEWAY_PID $DASHBOARD_PID
