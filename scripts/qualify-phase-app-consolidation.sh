#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runner="$repo_root/scripts/run-email-fetch.sh"

fail() {
  printf 'phase app consolidation qualification: %s\n' "$*" >&2
  exit 1
}

test -f "$runner" || fail 'missing source-owned email-fetch runner'
bash -n "$runner"
grep -Fq -- 'phase run --app overnightdesk --env production --path /email-fetch --' "$runner" ||
  fail 'email-fetch must select overnightdesk:/email-fetch'
! grep -Fq -- '--app Infrastructure' "$runner" ||
  fail 'email-fetch still selects Infrastructure'

git -C "$repo_root" diff --check
printf 'phase app consolidation qualification: PASS\n'
