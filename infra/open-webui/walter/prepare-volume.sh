#!/usr/bin/env bash
set -euo pipefail

image=${OPEN_WEBUI_IMAGE:-ghcr.io/open-webui/open-webui@sha256:dcd09c38681c57a876866a2a95a4b35d16cd0c24eda434b9d9d14f3a292a6c5c}
volume=open-webui-hermes-walter-data

docker pull "$image" >/dev/null
docker volume create "$volume" >/dev/null
docker run --rm \
  --user 0:0 \
  --network none \
  --read-only \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --security-opt no-new-privileges \
  --pids-limit 32 \
  --memory 128m \
  --volume "$volume:/app/backend/data" \
  --entrypoint /bin/sh \
  "$image" -c 'chown -R 1000:1000 /app/backend/data && chmod 0700 /app/backend/data'

printf 'Walter Open WebUI volume: ready\n'
