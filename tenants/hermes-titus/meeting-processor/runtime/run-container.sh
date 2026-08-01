#!/usr/bin/env bash
set -euo pipefail

name=titus-meeting-processor
image=${TITUS_MEETING_PROCESSOR_IMAGE:-overnightdesk/titus-meeting-processor:0.1.0}
runtime=/run/titus-meeting-processor/runtime.json

test -f "$runtime" && test ! -L "$runtime"
test "$(stat -c %a "$runtime")" = 440
if docker container inspect "$name" >/dev/null 2>&1; then
  test "$(docker inspect -f '{{.State.Running}}' "$name")" = false
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname "$name" \
  --user 10003:10003 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --cpus 0.5 \
  --memory 256m \
  --volume titus-meeting-processor-data:/data \
  --volume "$runtime:/run/secrets/runtime.json:ro" \
  "$image" run \
    --config /run/secrets/runtime.json \
    --state /data/state.json \
    --health /data/health.json \
    --handoff /data/handoff.json
