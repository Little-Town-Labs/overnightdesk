#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${CAMOFOX_CONTAINER:-camofox-browser}"
HEALTH_URL="${CAMOFOX_HEALTH_URL:-http://127.0.0.1:9377/health}"
TIMEOUT_SECONDS="${CAMOFOX_HEALTH_TIMEOUT_SECONDS:-8}"
LOG_FILE="${CAMOFOX_WATCHDOG_LOG:-/var/log/camofox-health-watchdog.log}"
LOCK_FILE="${CAMOFOX_WATCHDOG_LOCK:-/tmp/camofox-health-watchdog.lock}"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE"
}

if ! command -v docker >/dev/null 2>&1; then
  log "docker command unavailable"
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  log "$CONTAINER is missing"
  exit 1
fi

if docker exec "$CONTAINER" curl -fsS --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" >/dev/null; then
  exit 0
fi

log "$CONTAINER health probe failed or hung; restarting"
docker restart "$CONTAINER" >/dev/null
sleep 5

if docker exec "$CONTAINER" curl -fsS --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" >/dev/null; then
  log "$CONTAINER recovered after restart"
else
  log "$CONTAINER still failing after restart"
  exit 1
fi
