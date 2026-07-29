#!/usr/bin/env bash
set -euo pipefail

image=${OBSIDIAN_SYNC_IMAGE:-overnightdesk/obsidian-sync-titus:0.0.13}
runtime_env=${OBSIDIAN_SYNC_RUNTIME_ENV:-/run/obsidian-sync-titus/runtime.env}

die() {
  printf 'obsidian-sync-titus initialization: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
test -t 0 && test -t 1 || die 'interactive terminal required'
test -f "$runtime_env" && test ! -L "$runtime_env" || die 'runtime secret file unavailable'
test "$(docker inspect -f '{{.State.Running}}' obsidian-sync-titus 2>/dev/null || true)" != true || \
  die 'continuous sidecar must be stopped'

config_count=$(docker run --rm \
  --user 0:0 \
  --network none \
  --volume titus-obsidian-sync-state:/state:ro \
  --entrypoint /usr/bin/bash \
  "$image" -euo pipefail -c '
    root=/state/config/obsidian-headless/sync
    test -d "$root" || { printf "0\n"; exit 0; }
    find "$root" -mindepth 2 -maxdepth 2 -type f -name config.json -printf . |
      wc -c
  ')
test "$config_count" = 0 || die 'sync state is already initialized'

read -r -p 'Immutable remote Obsidian vault ID: ' remote_vault_id
printf '\n'
printf '%s' "$remote_vault_id" | grep -Eq '^[A-Za-z0-9_-]{8,128}$' || \
  die 'remote vault ID format is invalid'

docker run --rm -it \
  --name obsidian-sync-titus-initialize \
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
  --env OBSIDIAN_REMOTE_VAULT_ID="$remote_vault_id" \
  --volume titus-project-knowledge-data:/vault \
  --volume titus-obsidian-sync-state:/state \
  --volume "$runtime_env:/run/secrets/obsidian-sync-runtime:ro" \
  --entrypoint /usr/bin/bash \
  "$image" -euo pipefail -c '
    set -a
    . /run/secrets/obsidian-sync-runtime
    set +a
    export HOME=/state/home
    export XDG_CONFIG_HOME=/state/config
    umask 0077
    ob login
    ob sync-setup \
      --vault "$OBSIDIAN_REMOTE_VAULT_ID" \
      --path /vault \
      --device-name "Titus Aegis Sidecar"
    ob sync-config \
      --path /vault \
      --mode bidirectional \
      --conflict-strategy conflict \
      --configs "" \
      --device-name "Titus Aegis Sidecar"
    ob sync --path /vault
    OBSIDIAN_HEALTH_REQUIRE_LOCK=false /usr/local/bin/healthcheck
  '

printf 'obsidian_sync_initialization=verified\n'
