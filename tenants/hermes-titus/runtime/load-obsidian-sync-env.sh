#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${OBSIDIAN_SYNC_RUNTIME_DIR:-/run/obsidian-sync-titus}
output_file=${OBSIDIAN_SYNC_RUNTIME_ENV:-/run/obsidian-sync-titus/runtime.env}
phase_app=${TITUS_PHASE_APP:-timeless-tech-solutions}
phase_env=${TITUS_PHASE_ENVIRONMENT:-production}
phase_path=/agents/hermes-titus/obsidian-sync

die() {
  printf 'obsidian-sync-titus phase load: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
test -x "$phase_bin" || die 'Phase CLI unavailable'
test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 400 || die 'Phase token file mode must be 0400'
test "$(stat -c %u "$token_file")" = 10001 || die 'Phase token file owner is invalid'
token_size=$(stat -c %s "$token_file")
test "$token_size" -ge 20 && test "$token_size" -le 8192 || die 'Phase token file size is invalid'
! LC_ALL=C grep -q '[[:space:][:cntrl:]]' "$token_file" || \
  die 'Phase token file contains whitespace or control characters'
command -v jq >/dev/null 2>&1 || die 'jq unavailable'

install -d -o root -g 10000 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'

timeout 30 "$phase_bin" secrets export \
  --app "$phase_app" \
  --env "$phase_env" \
  --path "$phase_path" \
  --format json >"$work_dir/obsidian-sync.json"

jq -e 'type == "object" and keys == ["OBSIDIAN_AUTH_TOKEN"]' \
  "$work_dir/obsidian-sync.json" >/dev/null || \
  die 'unexpected key in Titus Obsidian Sync Phase path'
jq -e '
  .OBSIDIAN_AUTH_TOKEN | type == "string" and
  length >= 20 and length <= 8192 and
  (test("[[:space:][:cntrl:]]") | not)
' "$work_dir/obsidian-sync.json" >/dev/null || \
  die 'Obsidian authentication token is unavailable or invalid'

quoted_token=$(jq -r '.OBSIDIAN_AUTH_TOKEN | @sh' "$work_dir/obsidian-sync.json")
printf 'OBSIDIAN_AUTH_TOKEN=%s\n' "$quoted_token" >"$work_dir/runtime.env"
temporary_output="$runtime_dir/.runtime.env.$$"
install -o root -g 10000 -m 0440 "$work_dir/runtime.env" "$temporary_output"
mv -Tf "$temporary_output" "$output_file"
printf 'obsidian_sync_runtime=prepared\n'
