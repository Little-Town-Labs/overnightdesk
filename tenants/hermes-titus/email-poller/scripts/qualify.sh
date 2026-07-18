#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cache=${GOCACHE:-/tmp/hermes-email-intake-go-cache}
module_cache=${GOMODCACHE:-/tmp/hermes-email-go-mod}
binary=/tmp/hermes-email-intake-qualify
fixtures=$(mktemp -d /tmp/hermes-email-intake-fixtures.XXXXXX)
trap 'rm -f "$binary"; rm -rf "$fixtures"' EXIT

cd "$root"
test -f go.mod && test -f go.sum && test -f Dockerfile
GOCACHE="$cache" GOMODCACHE="$module_cache" go test ./...
GOCACHE="$cache" GOMODCACHE="$module_cache" go test -race ./...
GOCACHE="$cache" GOMODCACHE="$module_cache" go vet ./...
GOCACHE="$cache" GOMODCACHE="$module_cache" CGO_ENABLED=0 go build -trimpath -o "$binary" ./cmd/titus-email-poller

bash -n runtime/*.sh scripts/*.sh
grep -Eq '^FROM docker\.io/library/golang:1\.24\.4-alpine3\.22@sha256:[0-9a-f]{64} AS build$' Dockerfile
grep -Eq '^FROM scratch$' Dockerfile
grep -Eq '^USER 10002:10002$' Dockerfile
grep -Eq '^HEALTHCHECK .*--interval=30s' Dockerfile
grep -Eq -- '--network overnightdesk_overnightdesk' runtime/run-container.sh
grep -Eq -- '--read-only' runtime/run-container.sh
grep -Eq -- '--cap-drop ALL' runtime/run-container.sh
grep -Eq 'no-new-privileges' runtime/run-container.sh
grep -Fq '/agents/hermes-email-intake/$instance' runtime/load-phase-config.sh
grep -Fq 'hermes-email-intake@.service' scripts/deploy-aegis.sh
grep -Fq 'read -r route <&3' scripts/deploy-aegis.sh
grep -Fq 'disable --now titus-email-poller.service' scripts/deploy-aegis.sh
grep -Fq 'instance=mitchel set_enabled true' scripts/deploy-aegis.sh
grep -Fq 'instance=mitchel set_enabled false || true' scripts/deploy-aegis.sh
grep -Fq 'titus) default_phase_app=timeless-tech-solutions' runtime/load-phase-config.sh
grep -Fq 'agent|mitchel) default_phase_app=overnightdesk' runtime/load-phase-config.sh
grep -Fq 'phase_app=${EMAIL_INTAKE_PHASE_APP:-$default_phase_app}' runtime/load-phase-config.sh
grep -Fq 'phase_app_for_route()' scripts/deploy-aegis.sh
grep -Fq "titus) printf '%s\\n' timeless-tech-solutions" scripts/deploy-aegis.sh
grep -Fq "agent|mitchel) printf '%s\\n' overnightdesk" scripts/deploy-aegis.sh
! grep -R -Eq -- '--publish|-p [0-9]' runtime scripts

for route in titus agent mitchel; do
  case "$route" in
    titus) address=titus-operations@agentmail.to; target=hermes-titus; senders=garyb@timelesstechs.com,austin@timelesstechs.com ;;
    agent) address=acerockstar@agentmail.to; target=hermes-agent; senders=netgleb@gmail.com ;;
    mitchel) address=thediamondguy@agentmail.to; target=hermes-mitchel; senders=mitchelcbrown88@gmail.com ;;
  esac
  jq -n --arg route "$route" --arg address "$address" --arg target "$target" --arg senders "$senders" '{
    AGENTMAIL_API_KEY:"fixture-key", AGENTMAIL_EMAIL_ADDRESS:$address,
    AGENTMAIL_INBOX_ID:("fixture-"+$route), AGENTMAIL_MAX_MESSAGES_PER_CYCLE:"10",
    AGENTMAIL_POLLING_ENABLED:"false", AGENTMAIL_POLL_INTERVAL_SECONDS:"60",
    DATABASE_URL:"postgresql://fixture:fixture@database:5432/fixture",
    EMAIL_ALLOWED_SENDERS:$senders, EMAIL_MAX_CLEAN_CLAIMS_PER_CYCLE:"5",
    EMAIL_ROUTE_ID:$route, HERMES_API_KEY:"fixture-hermes-key",
    HERMES_BASE_URL:("http://"+$target+":8642"), HERMES_RUN_TIMEOUT_SECONDS:"300",
    HERMES_TARGET_AGENT:$target
  }' >"$fixtures/$route.json"
  "$binary" run-once --config "$fixtures/$route.json" --state "$fixtures/$route-state.json" --health "$fixtures/$route-health.json" \
    | jq -e '.state == "disabled" and .sends == 0' >/dev/null
done

while IFS= read -r file; do
  lines=$(wc -l <"$file")
  test "$lines" -lt 800 || { printf 'file exceeds 800 lines: %s (%s)\n' "$file" "$lines" >&2; exit 1; }
done < <(find cmd internal -type f -name '*.go' -print)

if grep -ERq --exclude='*_test.go' --exclude=qualify.sh '(sk-or-v1-|am_[A-Za-z0-9]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,})' \
  cmd internal runtime scripts Dockerfile; then
  printf 'possible credential literal found\n' >&2
  exit 1
fi

git diff --check
printf 'hermes-email-intake qualification: PASS\n'
