#!/usr/bin/env bash
set -euo pipefail

name=open-webui-hermes-titus
image=${OPEN_WEBUI_IMAGE:-ghcr.io/open-webui/open-webui@sha256:0d58a66704d69e52da83f72bcd43869ad4fd0c761313778bc95ef6940a0b81e3}
secret_file=${OPEN_WEBUI_RUNTIME_ENV:-/run/open-webui-titus/runtime.env}

test -r "$secret_file" || {
  printf 'Titus Open WebUI runtime secret file unavailable\n' >&2
  exit 1
}
secret_gid=$(stat -c %g "$secret_file")

if docker container inspect "$name" >/dev/null 2>&1; then
  running=$(docker inspect -f '{{.State.Running}}' "$name")
  test "$running" = false || {
    printf '%s is already running\n' "$name" >&2
    exit 1
  }
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname open-webui-hermes-titus \
  --user 1000:1000 \
  --group-add "$secret_gid" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --cpus 1 \
  --memory 2g \
  --health-cmd 'python -c "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8080/health\", timeout=2).read()"' \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 120s \
  --volume open-webui-hermes-titus-data:/app/backend/data \
  --volume "$secret_file:/run/secrets/open-webui-titus:ro" \
  --entrypoint /bin/sh \
  "$image" -c 'set -a; . /run/secrets/open-webui-titus; set +a; exec bash start.sh'
