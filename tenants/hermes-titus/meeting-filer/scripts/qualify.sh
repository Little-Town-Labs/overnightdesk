#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
GOCACHE=${GOCACHE:-/tmp/titus-meeting-filer-go-cache} go test ./...
GOCACHE=${GOCACHE:-/tmp/titus-meeting-filer-go-cache} go test -race ./...
GOCACHE=${GOCACHE:-/tmp/titus-meeting-filer-go-cache} go vet ./...
GOCACHE=${GOCACHE:-/tmp/titus-meeting-filer-go-cache} CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o /tmp/titus-meeting-filer ./cmd/titus-meeting-filer
file /tmp/titus-meeting-filer | grep -Fq 'ARM aarch64'
bash -n runtime/*.sh scripts/*.sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
grep -Fq '/opt/hermes/.venv/bin/hermes' internal/policy/config.go
grep -Fq -- '--network overnightdesk_overnightdesk' runtime/run-container.sh
grep -Fq -- '--read-only' runtime/run-container.sh
grep -Fq -- '--volume titus-project-knowledge-data:/projects' runtime/run-container.sh
grep -Fq -- 'initialize-project-paths.sh:/initialize-project-paths.sh:ro' runtime/prepare-volumes.sh
grep -Fq 'dst=/filer-home/.hermes/kanban,volume-subpath=.hermes/kanban' runtime/run-container.sh
grep -Fq 'ExecStart=/opt/titus-meeting-filer/bin/run-container.sh' runtime/titus-meeting-filer.service
grep -Fq 'meeting-triage list --json' scripts/deploy-aegis.sh
grep -Fq -- '--group-add 10004' runtime/run-container.sh
grep -Fq 'previous_link=$base/previous' scripts/deploy-aegis.sh
! grep -R -Eq -- '--publish(=|[[:space:]])|-p[[:space:]]+[0-9]' runtime scripts
printf 'titus meeting filer qualification: passed\n'
