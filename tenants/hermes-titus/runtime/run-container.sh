#!/usr/bin/env bash
set -euo pipefail

name=hermes-titus
image=${TITUS_IMAGE:-overnightdesk/hermes-agent:0.19.0-coder}
knowledge_marker=${TITUS_PROJECT_KNOWLEDGE_MARKER:-/opt/hermes-titus/obsidian-project-knowledge-enabled}
knowledge_mount=()

if test -e "$knowledge_marker" || test -L "$knowledge_marker"; then
  test -f "$knowledge_marker" && test ! -L "$knowledge_marker" || {
    printf 'Titus project knowledge marker is invalid\n' >&2
    exit 1
  }
  test "$(stat -c %a "$knowledge_marker")" = 400 || {
    printf 'Titus project knowledge marker mode must be 0400\n' >&2
    exit 1
  }
  test "$(stat -c %u "$knowledge_marker")" = 0 || {
    printf 'Titus project knowledge marker owner is invalid\n' >&2
    exit 1
  }
  knowledge_mount=(--volume titus-project-knowledge-data:/opt/data/project-briefs)
fi

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
  --health-cmd '/opt/hermes/.venv/bin/python -c "import urllib.request; [urllib.request.urlopen(u, timeout=2).read() for u in (\"http://127.0.0.1:9119/api/status\", \"http://127.0.0.1:8420/health\", \"http://127.0.0.1:8642/health\")]"' \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 90s \
  --volume hermes-titus-data:/opt/data \
  "${knowledge_mount[@]}" \
  --volume /run/hermes-titus/runtime.env:/run/secrets/hermes-titus-runtime:ro \
  --entrypoint /usr/bin/bash \
  "$image" /opt/data/bin/start-with-secrets.sh
