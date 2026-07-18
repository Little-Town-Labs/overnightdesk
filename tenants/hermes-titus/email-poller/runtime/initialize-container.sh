#!/usr/bin/env bash
set -euo pipefail

instance=${1:?route instance required}
case "$instance" in titus|agent|walter|mitchel) ;; *) exit 2 ;; esac
image=${HERMES_EMAIL_INTAKE_IMAGE:-overnightdesk/hermes-email-intake:0.2.0}
replay_message_id=
IFS= read -r replay_message_id || true
args=(initialize --config /run/secrets/runtime.json --state /data/state.json --health /data/health.json)
test -z "$replay_message_id" || args+=(--replay-message-id "$replay_message_id")

exec docker run --rm \
  --name "hermes-email-intake-$instance-initialize" \
  --user 10002:10002 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --network overnightdesk_overnightdesk --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --cpus 0.5 --memory 128m \
  --volume "hermes-email-intake-$instance-data:/data" \
  --volume "/run/hermes-email-intake/$instance/runtime.json:/run/secrets/runtime.json:ro" \
  "$image" "${args[@]}"
