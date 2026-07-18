#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
old_name=hermes-agent
new_name=hermes-walter
volume_name=hermes-agent-data
nginx_container=overnightdesk-nginx
nginx_source="$repo_root/infra/nginx/walter-hermes.conf"
nginx_live=${WALTER_NGINX_LIVE_PATH:-/opt/overnightdesk/nginx/conf.d/default.conf}
nginx_backup=${nginx_live}.pre-walter
persona_source="$repo_root/tenants/hermes-walter/SOUL.md"

usage() {
  printf 'usage: %s {preflight|activate|verify|rollback}\n' "$0" >&2
  exit 2
}

container_exists() { docker container inspect "$1" >/dev/null 2>&1; }

mounted_data_volume() {
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Name}}{{end}}{{end}}' "$1"
}

assert_exactly_one_runtime() {
  local count=0
  container_exists "$old_name" && count=$((count + 1))
  container_exists "$new_name" && count=$((count + 1))
  test "$count" -eq 1 || {
    printf 'expected exactly one platform runtime identity; found %s\n' "$count" >&2
    exit 1
  }
}

assert_intake_exclusive() {
  local agent_state walter_state
  agent_state=$(systemctl is-active hermes-email-intake@agent.service 2>/dev/null || true)
  walter_state=$(systemctl is-active hermes-email-intake@walter.service 2>/dev/null || true)
  if test "$agent_state" = active && test "$walter_state" = active; then
    printf 'Agent and Walter intake services must not be active together\n' >&2
    exit 1
  fi
  printf 'agent_intake=%s walter_intake=%s\n' "$agent_state" "$walter_state"
}

preflight() {
  test "$(id -u)" -eq 0 || { printf 'run as root\n' >&2; exit 1; }
  test -f "$nginx_source" && test -f "$persona_source"
  test -f "$nginx_live" && test ! -L "$nginx_live"
  docker volume inspect "$volume_name" >/dev/null
  docker container inspect "$nginx_container" >/dev/null
  assert_exactly_one_runtime
  local runtime=$old_name
  container_exists "$new_name" && runtime=$new_name
  test "$(mounted_data_volume "$runtime")" = "$volume_name"
  assert_intake_exclusive
  printf 'runtime=%s volume=%s preflight=pass\n' "$runtime" "$volume_name"
}

verify() {
  preflight
  container_exists "$new_name" || { printf 'Walter runtime is not active\n' >&2; exit 1; }
  test "$(docker inspect -f '{{.State.Running}}' "$new_name")" = true
  test "$(mounted_data_volume "$new_name")" = "$volume_name"
  docker exec "$nginx_container" nginx -t >/dev/null
  grep -Fq 'http://hermes-walter:9119' "$nginx_live"
  grep -Fq 'http://hermes-walter:8642/v1/' "$nginx_live"
  for attempt in $(seq 1 30); do
    if curl --silent --show-error --fail --max-time 15 \
      https://aegis-prod.overnightdesk.com/api/status >/dev/null; then
      break
    fi
    test "$attempt" -lt 30 || { printf 'public status did not recover\n' >&2; exit 1; }
    sleep 2
  done
  printf 'runtime=%s public_status=healthy verification=pass\n' "$new_name"
}

activate() {
  test "${WALTER_CREDENTIAL_GATE:-}" = approved || {
    printf 'WALTER_CREDENTIAL_GATE=approved is required after owner-approved remediation\n' >&2
    exit 1
  }
  preflight
  if container_exists "$new_name"; then
    verify
    return
  fi
  test "$(systemctl is-active hermes-email-intake@agent.service 2>/dev/null || true)" != active || {
    printf 'stop Agent intake before activating Walter\n' >&2
    exit 1
  }
  test "$(systemctl is-active hermes-email-intake@walter.service 2>/dev/null || true)" != active || {
    printf 'Walter intake must remain stopped during runtime cutover\n' >&2
    exit 1
  }
  test -e "$nginx_backup" || install -o root -g root -m 0644 "$nginx_live" "$nginx_backup"
  volume_root=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Source}}{{end}}{{end}}' "$old_name")
  test -n "$volume_root" && test -d "$volume_root"
  test -e "$volume_root/SOUL.md.pre-walter" || \
    install -o 10000 -g 10000 -m 0644 "$volume_root/SOUL.md" "$volume_root/SOUL.md.pre-walter"
  install -o 10000 -g 10000 -m 0644 "$persona_source" "$volume_root/SOUL.md"
  docker rename "$old_name" "$new_name"
  docker restart "$new_name" >/dev/null
  install -o root -g root -m 0644 "$nginx_source" "$nginx_live"
  docker exec "$nginx_container" nginx -t >/dev/null
  docker kill --signal HUP "$nginx_container" >/dev/null
  verify
}

rollback() {
  preflight
  container_exists "$old_name" && {
    printf 'runtime=%s rollback=already-complete\n' "$old_name"
    return
  }
  test "$(systemctl is-active hermes-email-intake@walter.service 2>/dev/null || true)" != active || {
    printf 'stop Walter intake before rollback\n' >&2
    exit 1
  }
  test -f "$nginx_backup" && test ! -L "$nginx_backup"
  volume_root=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Source}}{{end}}{{end}}' "$new_name")
  test -f "$volume_root/SOUL.md.pre-walter"
  install -o 10000 -g 10000 -m 0644 "$volume_root/SOUL.md.pre-walter" "$volume_root/SOUL.md"
  docker rename "$new_name" "$old_name"
  docker restart "$old_name" >/dev/null
  install -o root -g root -m 0644 "$nginx_backup" "$nginx_live"
  docker exec "$nginx_container" nginx -t >/dev/null
  docker kill --signal HUP "$nginx_container" >/dev/null
  test "$(mounted_data_volume "$old_name")" = "$volume_name"
  printf 'runtime=%s volume=%s rollback=complete\n' "$old_name" "$volume_name"
}

case "$action" in
  preflight) preflight ;;
  activate) activate ;;
  verify) verify ;;
  rollback) rollback ;;
  *) usage ;;
esac
