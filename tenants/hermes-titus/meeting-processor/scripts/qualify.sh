#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cache=${GOCACHE:-/tmp/titus-meeting-processor-go-cache}
module_cache=${GOMODCACHE:-/tmp/titus-meeting-processor-go-mod}
binary=/tmp/titus-meeting-processor-qualify
image=${TITUS_MEETING_PROCESSOR_QUALIFY_IMAGE:-overnightdesk/titus-meeting-processor:feature-035-qualify}
container=titus-meeting-processor-qualify
container_cli=${CONTAINER_CLI:-docker}
case "$container_cli" in docker|podman) ;; *) printf 'unsupported container CLI\n' >&2; exit 2 ;; esac

cleanup() {
  rm -f -- "$binary"
  "$container_cli" rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$root"
test -f go.mod && test -f Dockerfile
GOCACHE="$cache" GOMODCACHE="$module_cache" go test ./...
GOCACHE="$cache" GOMODCACHE="$module_cache" go test -race ./...
GOCACHE="$cache" GOMODCACHE="$module_cache" go vet ./...
GOCACHE="$cache" GOMODCACHE="$module_cache" CGO_ENABLED=0 go build -trimpath -o "$binary" ./cmd/titus-meeting-processor
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
bash -n runtime/*.sh scripts/*.sh

grep -Eq '^FROM --platform=\$BUILDPLATFORM docker\.io/library/golang:1\.24\.4-alpine3\.22@sha256:[0-9a-f]{64} AS build$' Dockerfile
grep -Eq '^FROM scratch$' Dockerfile
grep -Eq '^USER 10003:10003$' Dockerfile
grep -Eq '^HEALTHCHECK .*--interval=30s' Dockerfile
grep -Fq '/agents/hermes-titus/teamsmeetings' runtime/load-phase-config.sh
grep -Eq -- '--network overnightdesk_overnightdesk' runtime/run-container.sh
grep -Eq -- '--read-only' runtime/run-container.sh
grep -Eq -- '--cap-drop ALL' runtime/run-container.sh
grep -Eq 'no-new-privileges' runtime/run-container.sh
grep -Eq -- '--pids-limit 128' runtime/run-container.sh
grep -Eq -- '--cpus 0.5' runtime/run-container.sh
grep -Eq -- '--memory 256m' runtime/run-container.sh
grep -Fq -- '--volume titus-meeting-custody-data:/custody' runtime/run-container.sh
grep -Fq -- '--custody-dir /custody' runtime/run-container.sh
grep -Fq 'MEETING_ANALYZER_MODEL' runtime/load-analyzer-phase-env.sh
grep -Fq 'api_server: [no_mcp]' ../config/meeting-analyzer.yaml
grep -Fq 'memory_enabled: false' ../config/meeting-analyzer.yaml
grep -Fq 'ExecStart=/opt/titus-meeting-analyzer/bin/run-container.sh' runtime/titus-meeting-analyzer.service
grep -Fq 'enable-brief' scripts/deploy-aegis.sh
grep -Fq 'retention-sweep' scripts/deploy-aegis.sh
! grep -R -Eq -- '--publish(=|[[:space:]])|-p[[:space:]]+[0-9]' runtime scripts
! grep -R -Eq --exclude='*_test.go' --exclude=qualify.sh --exclude=content.go --exclude=recording.go --exclude-dir=testfixture '/content([?"'"'"'/[:space:]]|$)|changeNotifications|/subscriptions' cmd internal runtime scripts Dockerfile
grep -Fq '"/transcripts/" + url.PathEscape(transcriptID) + "/content"' internal/graph/content.go
! grep -Eqi 'recordings/.*/content|/recordings/' internal/graph/content.go
grep -Fq '"/recordings/" + url.PathEscape(recordingID) + "/content"' internal/graph/recording.go
! grep -R -Eq --exclude='*_test.go' --exclude=qualify.sh --exclude-dir=testfixture '(sk-or-v1-|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9_.~-]{16,})' cmd internal runtime scripts Dockerfile
! grep -R -Eq --exclude='*_test.go' --exclude=qualify.sh --exclude-dir=testfixture 'TEAMS_(CLIENT_ID|CLIENT_SECRET|TENANT_ID)' cmd internal runtime scripts Dockerfile

while IFS= read -r file; do
  lines=$(wc -l <"$file")
  test "$lines" -lt 800 || { printf 'file exceeds 800 lines: %s (%s)\n' "$file" "$lines" >&2; exit 1; }
done < <(find cmd internal -type f -name '*.go' -print)

if test "${SKIP_CONTAINER_BUILD:-false}" != true; then
  build_format=()
  test "$container_cli" != podman || build_format=(--format docker)
  "$container_cli" build "${build_format[@]}" --platform linux/arm64 -t "$image" .
  test "$("$container_cli" image inspect -f '{{.Config.User}}' "$image")" = 10003:10003
  exposed_ports=$("$container_cli" image inspect -f '{{json .Config.ExposedPorts}}' "$image")
  test "$exposed_ports" = null || test "$exposed_ports" = '{}'
  "$container_cli" image inspect -f '{{json .Config.Healthcheck.Test}}' "$image" | grep -Fq '/titus-meeting-processor'
  "$container_cli" create --name "$container" "$image" >/dev/null
  test "$("$container_cli" inspect -f '{{.Config.User}}' "$container")" = 10003:10003
  test -z "$("$container_cli" port "$container")"
  ! "$container_cli" inspect -f '{{json .Config.Env}}' "$container" | grep -Eq '(MSGRAPH|PHASE|TEAMS_)'
fi

git diff --check
printf 'titus meeting processor qualification: PASS\n'
