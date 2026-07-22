#!/usr/bin/env bash
set -euo pipefail

image=${OPEN_WEBUI_IMAGE:?OPEN_WEBUI_IMAGE is required}
volume=${OPEN_WEBUI_DATA_VOLUME:?OPEN_WEBUI_DATA_VOLUME is required}
config=${OPEN_WEBUI_PERSONA_CONFIG:?OPEN_WEBUI_PERSONA_CONFIG is required}
script=${OPEN_WEBUI_PERSONA_SEED_SCRIPT:?OPEN_WEBUI_PERSONA_SEED_SCRIPT is required}

test -f "$config" && test ! -L "$config"
test -f "$script" && test ! -L "$script"

exec docker run --rm \
  --name "${volume}-persona-verify" \
  --user 1000:1000 \
  --read-only \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 64 \
  --memory 128m \
  --volume "$volume:/app/backend/data" \
  --volume "$config:/run/persona-model.json:ro" \
  --volume "$script:/run/seed-persona-model.py:ro" \
  --entrypoint python3 \
  "$image" /run/seed-persona-model.py \
    --database /app/backend/data/webui.db \
    --config /run/persona-model.json \
    --verify
