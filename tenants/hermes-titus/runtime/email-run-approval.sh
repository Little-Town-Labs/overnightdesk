#!/usr/bin/env bash
set -euo pipefail

run_id=${1:-}
choice=${2:-}
[[ "$run_id" =~ ^run_[0-9a-f]{32}$ ]] || { printf 'invalid Hermes run ID\n' >&2; exit 2; }
case "$choice" in once|session|always|deny) ;; *) printf 'choice must be once, session, always, or deny\n' >&2; exit 2 ;; esac

set -a
# shellcheck disable=SC1091
. /run/secrets/hermes-titus-runtime
set +a
api_key=${API_SERVER_KEY:-${HERMES_API_KEY:-}}
test -n "$api_key" || { printf 'Hermes API key unavailable\n' >&2; exit 1; }
payload=$(printf '{"choice":"%s"}' "$choice")
printf 'header = "Authorization: Bearer %s"\n' "$api_key" | \
  curl --config - --silent --show-error --fail-with-body \
    --header 'Content-Type: application/json' --data "$payload" \
    "http://127.0.0.1:8642/v1/runs/$run_id/approval" | \
  jq -e --arg run_id "$run_id" '.run_id == $run_id and .object == "hermes.run.approval_response" and .resolved > 0' >/dev/null
printf 'Hermes email run %s approval response accepted\n' "$run_id"
