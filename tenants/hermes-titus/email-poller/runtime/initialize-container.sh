#!/usr/bin/env bash
set -euo pipefail

image=${TITUS_EMAIL_POLLER_IMAGE:-overnightdesk/titus-email-poller:0.1.0}
replay_message_id=
IFS= read -r replay_message_id || true
args=(initialize --config /run/secrets/runtime.json --state /data/state.json --health /data/health.json)
if test -n "$replay_message_id"; then
  args+=(--replay-message-id "$replay_message_id")
fi

exec docker run --rm \
  --name titus-email-poller-initialize \
  --user 10002:10002 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 64 \
  --cpus 0.5 \
  --memory 128m \
  --volume titus-email-poller-data:/data \
  --volume /run/titus-email-poller/runtime.json:/run/secrets/runtime.json:ro \
  "$image" "${args[@]}"
