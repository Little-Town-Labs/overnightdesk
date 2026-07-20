#!/usr/bin/env bash
set -euo pipefail

image=${OPEN_WEBUI_IMAGE:-ghcr.io/open-webui/open-webui@sha256:0d58a66704d69e52da83f72bcd43869ad4fd0c761313778bc95ef6940a0b81e3}
volume=open-webui-hermes-titus-data

docker pull "$image" >/dev/null
docker volume create "$volume" >/dev/null
docker run --rm \
  --user 0:0 \
  --network none \
  --read-only \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add FOWNER \
  --security-opt no-new-privileges \
  --pids-limit 32 \
  --memory 128m \
  --volume "$volume:/app/backend/data" \
  --entrypoint /bin/sh \
  "$image" -c 'chown -R 1000:1000 /app/backend/data && chmod 0700 /app/backend/data'

printf 'Titus Open WebUI volume: ready\n'
