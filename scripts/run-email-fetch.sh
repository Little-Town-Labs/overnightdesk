#!/usr/bin/env bash
set -euo pipefail

env_file=${EMAIL_FETCH_BOOTSTRAP_ENV:-/opt/email-fetch/.env}
log_file=${EMAIL_FETCH_LOG:-/opt/email-fetch/run.log}

if test ! -f "$env_file"; then
  printf 'email-fetch: bootstrap env not found at %s\n' "$env_file" >&2
  exit 1
fi

set -a
. "$env_file"
set +a
: "${PHASE_SERVICE_TOKEN:?email-fetch: PHASE_SERVICE_TOKEN missing}"

printf '%s | starting email-fetch run\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$log_file"

exec phase run --app overnightdesk --env production --path /email-fetch -- \
  docker compose -f /opt/overnightdesk/docker-compose.yml \
    run --rm --no-deps email-fetch \
    python scripts/run_fetch_to_staging.py --max-emails 100 \
  >>"$log_file" 2>&1
