#!/usr/bin/env bash
set -euo pipefail

secret_file=${OBSIDIAN_SYNC_RUNTIME_ENV:-/run/secrets/obsidian-sync-runtime}

die() {
  printf 'obsidian-sync-titus entrypoint: %s\n' "$*" >&2
  exit 1
}

test -f "$secret_file" && test ! -L "$secret_file" || die 'runtime secret file unavailable'
test "$(stat -c %a "$secret_file")" = 440 || die 'runtime secret file mode must be 0440'
test "$(stat -c %u "$secret_file")" = 0 || die 'runtime secret file owner is invalid'
test "$(stat -c %g "$secret_file")" = 10000 || die 'runtime secret file group is invalid'

set -a
# shellcheck disable=SC1090
. "$secret_file"
set +a

test -n "${OBSIDIAN_AUTH_TOKEN:-}" || die 'Obsidian authentication token unavailable'
test "${#OBSIDIAN_AUTH_TOKEN}" -ge 20 && test "${#OBSIDIAN_AUTH_TOKEN}" -le 8192 || \
  die 'Obsidian authentication token length is invalid'
! LC_ALL=C printf '%s' "$OBSIDIAN_AUTH_TOKEN" | grep -q '[[:space:][:cntrl:]]' || \
  die 'Obsidian authentication token format is invalid'

umask 0077
install -d -m 0700 "$HOME" "$XDG_CONFIG_HOME"

exec ob sync --path /vault --continuous
