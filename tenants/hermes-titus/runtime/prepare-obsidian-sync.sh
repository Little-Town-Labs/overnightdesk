#!/usr/bin/env bash
set -euo pipefail

action=${1:-prepare}
image=${OBSIDIAN_SYNC_IMAGE:-overnightdesk/obsidian-sync-titus:0.0.13}
source_volume=${TITUS_VOLUME:-hermes-titus-data}
vault_volume=${TITUS_PROJECT_KNOWLEDGE_VOLUME:-titus-project-knowledge-data}
state_volume=${TITUS_OBSIDIAN_SYNC_STATE_VOLUME:-titus-obsidian-sync-state}
evidence_root=${TITUS_OBSIDIAN_MIGRATION_EVIDENCE:-/var/lib/overnightdesk/titus-obsidian-migration}

die() {
  printf 'obsidian-sync-titus preparation: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
docker image inspect "$image" >/dev/null 2>&1 || die 'pinned sidecar image unavailable'
docker volume inspect "$source_volume" >/dev/null 2>&1 || die 'Titus source volume unavailable'
docker volume inspect "$vault_volume" >/dev/null 2>&1 || docker volume create "$vault_volume" >/dev/null
docker volume inspect "$state_volume" >/dev/null 2>&1 || docker volume create "$state_volume" >/dev/null

docker run --rm \
  --user 0:0 \
  --network none \
  --volume "$vault_volume:/vault" \
  --volume "$state_volume:/state" \
  --entrypoint /usr/bin/bash \
  "$image" -euo pipefail -c '
    install -d -o 10000 -g 10000 -m 0750 /vault
    install -d -o 10000 -g 10000 -m 0700 /state /state/home /state/config
    chown 10000:10000 /vault /state /state/home /state/config
  '

case "$action" in
  prepare)
    printf 'obsidian_sync_volumes=prepared\n'
    ;;
  migrate|verify)
    test "$(docker inspect -f '{{.State.Running}}' hermes-titus 2>/dev/null || true)" != true || \
      die 'migration refused while Titus is running'
    test "$(docker inspect -f '{{.State.Running}}' obsidian-sync-titus 2>/dev/null || true)" != true || \
      die 'migration refused while sidecar is running'
    install -d -o root -g root -m 0700 "$evidence_root"
    docker run --rm \
      --user 0:0 \
      --network none \
      --volume "$source_volume:/source-data:ro" \
      --volume "$vault_volume:/target" \
      --volume "$evidence_root:/evidence" \
      --entrypoint /usr/bin/bash \
      "$image" -euo pipefail -c '
        source_dir=/source-data/project-briefs
        test -d "$source_dir" || {
          printf "source project briefs are unavailable\n" >&2
          exit 1
        }
        manifest() {
          local root=$1
          local output=$2
          (
            cd "$root"
            find . -path "./.obsidian" -prune -o -type f -print0 |
              sort -z |
              xargs -0 -r sha256sum
          ) >"$output"
        }
        if test "$1" = verify; then
          for proof in /evidence/source.sha256 /evidence/target.sha256 \
            /evidence/vault-baseline.sha256 /evidence/migration-verified; do
            test -f "$proof" && test ! -L "$proof" || {
              printf "migration proof is unavailable or invalid\n" >&2
              exit 1
            }
            test "$(stat -c %u "$proof")" = 0 || {
              printf "migration proof owner is invalid\n" >&2
              exit 1
            }
          done
          test "$(stat -c %a /evidence/source.sha256)" = 600
          test "$(stat -c %a /evidence/target.sha256)" = 600
          test "$(stat -c %a /evidence/vault-baseline.sha256)" = 600
          test "$(stat -c %a /evidence/migration-verified)" = 400
          cmp -s /evidence/source.sha256 /evidence/target.sha256 || {
            printf "saved project knowledge manifests do not match\n" >&2
            exit 1
          }
          marker=/target/.obsidian/.overnightdesk-migration-baseline
          test -f "$marker" && test ! -L "$marker" || {
            printf "knowledge volume migration marker is unavailable or invalid\n" >&2
            exit 1
          }
          test "$(stat -c %a "$marker")" = 400
          test "$(stat -c %u "$marker")" = 0
          cmp -s /evidence/vault-baseline.sha256 "$marker" || {
            printf "knowledge volume does not match saved migration identity\n" >&2
            exit 1
          }
          exit 0
        fi
        if find "$source_dir" -mindepth 1 ! -type f ! -type d -print -quit |
          grep -q .; then
          printf "source project briefs contain a symlink or special file\n" >&2
          exit 1
        fi
        if find /target -mindepth 1 -path /target/.obsidian -prune -o \
          ! -type f ! -type d -print -quit | grep -q .; then
          printf "target knowledge volume contains a symlink or special file\n" >&2
          exit 1
        fi
        if test -e /target/.obsidian || test -L /target/.obsidian; then
          test -d /target/.obsidian && test ! -L /target/.obsidian || {
            printf "target Obsidian directory is invalid\n" >&2
            exit 1
          }
        fi
        manifest "$source_dir" /evidence/source.sha256
        if find /target -mindepth 1 -maxdepth 1 ! -name .obsidian -print -quit | grep -q .; then
          manifest /target /evidence/target.sha256
          cmp -s /evidence/source.sha256 /evidence/target.sha256 || {
            printf "target knowledge volume is nonempty and does not match source\n" >&2
            exit 1
          }
        else
          cp -a "$source_dir"/. /target/
        fi
        chown -R 10000:10000 /target
        manifest /target /evidence/target.sha256
        cmp -s /evidence/source.sha256 /evidence/target.sha256 || {
          printf "project knowledge manifests do not match\n" >&2
          exit 1
        }
        chmod 0600 /evidence/source.sha256 /evidence/target.sha256
        sha256sum /evidence/target.sha256 |
          cut -d " " -f 1 > /evidence/vault-baseline.sha256
        chmod 0600 /evidence/vault-baseline.sha256
        install -d -o 10000 -g 10000 -m 0750 /target/.obsidian
        install -o root -g root -m 0400 \
          /evidence/vault-baseline.sha256 \
          /target/.obsidian/.overnightdesk-migration-baseline
        install -o root -g root -m 0400 /dev/null /evidence/migration-verified
      ' -- "$action"
    printf 'obsidian_sync_migration=verified\n'
    ;;
  *)
    die 'usage: prepare-obsidian-sync.sh {prepare|migrate|verify}'
    ;;
esac
