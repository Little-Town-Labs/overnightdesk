#!/usr/bin/env bash
set -euo pipefail

name=hermes-titus
image=${TITUS_IMAGE:-overnightdesk/hermes-agent:0.18.0-coder}

if docker container inspect "$name" >/dev/null 2>&1; then
  running=$(docker inspect -f '{{.State.Running}}' "$name")
  test "$running" = false || { printf '%s is already running\n' "$name" >&2; exit 1; }
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname hermes-titus \
  --user 10000:10000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --cpus 1 \
  --memory 2g \
  --health-cmd '/opt/hermes/.venv/bin/python -c "import urllib.request; [urllib.request.urlopen(u, timeout=2).read() for u in (\"http://127.0.0.1:9119/api/status\", \"http://127.0.0.1:8420/health\")]"' \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 90s \
  --volume hermes-titus-data:/opt/data \
  --volume /run/hermes-titus/runtime.env:/run/secrets/hermes-titus-runtime:ro \
  --entrypoint /usr/bin/bash \
  "$image" /opt/data/bin/start-with-secrets.sh
