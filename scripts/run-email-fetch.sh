#!/usr/bin/env bash
set -euo pipefail

token_file=${EMAIL_FETCH_PHASE_TOKEN_FILE:-/opt/email-fetch/phase-service-token}
log_file=${EMAIL_FETCH_LOG:-/opt/email-fetch/run.log}

die() { printf 'email-fetch: %s\n' "$*" >&2; exit 1; }

test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 600 || die 'Phase token file mode must be 0600'
test "$(stat -c %u "$token_file")" = "$(id -u)" || die 'Phase token file owner is invalid'
token_size=$(stat -c %s "$token_file")
test "$token_size" -ge 20 && test "$token_size" -le 8192 || die 'Phase token file size is invalid'
! LC_ALL=C grep -q '[[:space:][:cntrl:]]' "$token_file" || die 'Phase token file contains whitespace or control characters'

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'

printf '%s | starting email-fetch run\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$log_file"

exec phase run --app overnightdesk --env production --path /email-fetch -- \
  docker compose -f /opt/overnightdesk/docker-compose.yml \
    run --rm --no-deps email-fetch \
    python scripts/run_fetch_to_staging.py --max-emails 100 \
  >>"$log_file" 2>&1
