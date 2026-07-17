#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cache=${GOCACHE:-/tmp/titus-email-poller-go-cache}
binary=/tmp/titus-email-poller-qualify
trap 'rm -f "$binary"' EXIT

cd "$root"
test -f go.mod
test -f Dockerfile
test "$(go list -m all | wc -l)" -eq 1

GOCACHE="$cache" go test ./...
GOCACHE="$cache" go test -race ./...
GOCACHE="$cache" go vet ./...
GOCACHE="$cache" CGO_ENABLED=0 go build -trimpath -o "$binary" ./cmd/titus-email-poller

bash -n runtime/*.sh scripts/*.sh
grep -Eq '^FROM docker\.io/library/golang:1\.24\.4-alpine3\.22@sha256:[0-9a-f]{64} AS build$' Dockerfile
grep -Eq '^FROM scratch$' Dockerfile
grep -Eq '^USER 10002:10002$' Dockerfile
grep -Eq '^HEALTHCHECK .*--interval=30s' Dockerfile
grep -Eq -- '--network overnightdesk_overnightdesk' runtime/run-container.sh
grep -Eq -- '--read-only' runtime/run-container.sh
grep -Eq -- '--cap-drop ALL' runtime/run-container.sh
grep -Eq 'no-new-privileges' runtime/run-container.sh
grep -Eq '/agents/hermes-titus/email' runtime/load-phase-config.sh
grep -Eq 'AGENTMAIL_APPROVAL_SIGNING_SECRET' runtime/load-phase-config.sh
grep -Eq 'x-ai/grok-4\.3' runtime/load-phase-config.sh
grep -Eq '^exec docker run --rm' runtime/initialize-container.sh
grep -Eq '^exec docker run --rm' runtime/run-once-container.sh
grep -Eq 'systemctl stop titus-email-poller.service' scripts/deploy-aegis.sh
grep -Eq 'phase secrets update AGENTMAIL_POLLING_ENABLED' scripts/deploy-aegis.sh

while IFS= read -r file; do
  lines=$(wc -l <"$file")
  test "$lines" -lt 800 || { printf 'file exceeds 800 lines: %s (%s)\n' "$file" "$lines" >&2; exit 1; }
done < <(find cmd internal -type f -name '*.go' -print)

if grep -ERq --exclude='*_test.go' --exclude=qualify.sh '(sk-or-v1-|am_[A-Za-z0-9]{16,}|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,})' \
  cmd internal runtime scripts Dockerfile; then
  printf 'possible credential literal found\n' >&2
  exit 1
fi

printf 'titus-email-poller qualification: PASS\n'
