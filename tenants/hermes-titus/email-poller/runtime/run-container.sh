#!/usr/bin/env bash
set -euo pipefail

instance=${1:?route instance required}
case "$instance" in titus|agent|walter|mitchel) ;; *) exit 2 ;; esac
name=hermes-email-intake-$instance
image=${HERMES_EMAIL_INTAKE_IMAGE:-overnightdesk/hermes-email-intake:0.2.0}

if docker container inspect "$name" >/dev/null 2>&1; then
  test "$(docker inspect -f '{{.State.Running}}' "$name")" = false || exit 1
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname "$name" \
  --user 10002:10002 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --cpus 0.5 \
  --memory 256m \
  --volume "hermes-email-intake-$instance-data:/data" \
  --volume "/run/hermes-email-intake/$instance/runtime.json:/run/secrets/runtime.json:ro" \
  "$image" run --config /run/secrets/runtime.json --state /data/state.json --health /data/health.json
