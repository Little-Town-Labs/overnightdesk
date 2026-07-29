#!/usr/bin/env bash
set -euo pipefail

name=obsidian-sync-titus
image=${OBSIDIAN_SYNC_IMAGE:-overnightdesk/obsidian-sync-titus:0.0.13}
runtime_env=${OBSIDIAN_SYNC_RUNTIME_ENV:-/run/obsidian-sync-titus/runtime.env}
knowledge_marker=${TITUS_PROJECT_KNOWLEDGE_MARKER:-/opt/hermes-titus/obsidian-project-knowledge-enabled}

test -f "$runtime_env" && test ! -L "$runtime_env" || {
  printf 'obsidian-sync-titus runtime file unavailable\n' >&2
  exit 1
}
test -f "$knowledge_marker" && test ! -L "$knowledge_marker" || {
  printf 'Titus project knowledge marker is unavailable or invalid\n' >&2
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

if docker container inspect "$name" >/dev/null 2>&1; then
  running=$(docker inspect -f '{{.State.Running}}' "$name")
  test "$running" = false || { printf '%s is already running\n' "$name" >&2; exit 1; }
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname obsidian-sync-titus \
  --user 10000:10000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --network bridge \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --cpus 0.5 \
  --memory 512m \
  --log-driver none \
  --health-cmd /usr/local/bin/healthcheck \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 60s \
  --volume titus-project-knowledge-data:/vault \
  --volume titus-obsidian-sync-state:/state \
  --volume /run/obsidian-sync-titus/runtime.env:/run/secrets/obsidian-sync-runtime:ro \
  "$image" >/dev/null 2>&1
