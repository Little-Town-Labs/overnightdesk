#!/usr/bin/env bash
set -euo pipefail

name=titus-email-poller
image=${TITUS_EMAIL_POLLER_IMAGE:-overnightdesk/titus-email-poller:0.1.0}

if docker container inspect "$name" >/dev/null 2>&1; then
  test "$(docker inspect -f '{{.State.Running}}' "$name")" = false || {
    printf '%s is already running\n' "$name" >&2
    exit 1
  }
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname titus-email-poller \
  --user 10002:10002 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --cpus 0.5 \
  --memory 256m \
  --volume titus-email-poller-data:/data \
  --volume /run/titus-email-poller/runtime.json:/run/secrets/runtime.json:ro \
  "$image" run --config /run/secrets/runtime.json --state /data/state.json --health /data/health.json
