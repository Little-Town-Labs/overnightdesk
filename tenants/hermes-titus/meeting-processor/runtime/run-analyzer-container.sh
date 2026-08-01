#!/usr/bin/env bash
set -euo pipefail

name=hermes-titus-meeting-analyzer
image=overnightdesk/hermes-agent:0.19.0-coder
runtime=${TITUS_MEETING_ANALYZER_ENV:-/run/titus-meeting-analyzer/runtime.env}
config=${TITUS_MEETING_ANALYZER_CONFIG:-/opt/titus-meeting-analyzer/config.yaml}

test -f "$runtime" && test ! -L "$runtime" && test "$(stat -c %a "$runtime")" = 440
test -f "$config" && test ! -L "$config"

exec docker run --rm \
  --name "$name" \
  --hostname "$name" \
  --user 10004:10004 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --tmpfs /tmp/hermes:rw,noexec,nosuid,nodev,size=64m,uid=10004,gid=10004,mode=0700 \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --cpus 1 \
  --memory 768m \
  --env-file "$runtime" \
  --env HERMES_HOME=/tmp/hermes \
  --env API_SERVER_PORT=8642 \
  --volume "$config:/tmp/hermes/config.yaml:ro" \
  --entrypoint /opt/hermes/.venv/bin/hermes \
  "$image" gateway run
