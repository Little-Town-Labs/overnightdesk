#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
approval=${2:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runtime=hermes-walter
volume=hermes-agent-data
network=overnightdesk_overnightdesk
candidate_image=overnightdesk/hermes-agent:0.19.0-coder-intake-candidate
phase_bin=${PHASE_BIN:-/usr/bin/phase}
phase_env=${WALTER_PHASE_ENV_FILE:-/home/ubuntu/.config/overnightdesk-production-guardian/phase.env}
phase_app=${WALTER_PHASE_APP:-overnightdesk}
phase_environment=${WALTER_PHASE_ENVIRONMENT:-production}
phase_path=${WALTER_PHASE_PATH:-/overnightdesk-production-guardian}
nginx_source=$repo_root/infra/nginx/walter-hermes.conf
nginx_live=${WALTER_NGINX_LIVE_PATH:-/opt/overnightdesk/nginx/conf.d/default.conf}
state_dir=${WALTER_INTAKE_STATE_DIR:-/var/lib/overnightdesk-production-guardian}
state_file=$state_dir/walter-intake-rollback
nginx_backup=$state_dir/walter-nginx.pre-intake
data_root=/var/lib/docker/volumes/hermes-agent-data/_data
profile_source=${WALTER_PROFILE_SOURCE:-/home/ubuntu/overnightdesk-ops/services/platform-code-worker}
profile_migration=$profile_source/scripts/migrate_profile.py
walter_intake_unit=hermes-email-intake@walter.service

fail() {
  printf 'walter intake deploy: %s\n' "$*" >&2
  exit 1
}

require_root() {
  test "$(id -u)" -eq 0 || fail "run as root"
}

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

mounted_volume() {
  docker inspect -f \
    '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Name}}{{end}}{{end}}' "$1"
}

preflight() {
  require_root
  test -x "$phase_bin" || fail "Phase CLI is unavailable"
  test -f "$phase_env" && test ! -L "$phase_env" ||
    fail "Phase bootstrap file is unavailable"
  test "$(stat -c %a "$phase_env")" = 400 ||
    fail "Phase bootstrap file must have mode 0400"
  test -f "$nginx_source" && test -f "$nginx_live" ||
    fail "Nginx source or live configuration is unavailable"
  test -f "$profile_migration" && test -f "$profile_source/profile-overlay.yaml" &&
    test -f "$profile_source/SOUL.md" ||
    fail "platform worker migration source is unavailable"
  container_exists "$runtime" || fail "$runtime is unavailable"
  test "$(docker inspect -f '{{.State.Running}}' "$runtime")" = true ||
    fail "$runtime is not running"
  test "$(mounted_volume "$runtime")" = "$volume" ||
    fail "$runtime does not own the expected data volume"
  docker network inspect "$network" >/dev/null
  docker container inspect overnightdesk-nginx >/dev/null
  docker exec overnightdesk-nginx nginx -t >/dev/null
  test "$(systemctl is-active "$walter_intake_unit")" = active ||
    fail "Walter email intake is not active"
  migration_plan=$(python3 "$profile_migration" plan \
    --data-root "$data_root" --source-root "$profile_source")
  test "$(jq -r '.source_exists' <<<"$migration_plan")" = true ||
    fail "old coding profile is unavailable"
  test "$(jq -r '.target_exists' <<<"$migration_plan")" = false ||
    fail "new coding profile already exists"
  test "$(jq -r '.active_tasks' <<<"$migration_plan")" = 0 ||
    fail "old coding profile has active tasks"
  test ! -e "$state_file" ||
    fail "an unresolved Walter intake rollback state already exists"
  printf 'runtime=%s phase_bootstrap=present preflight=pass\n' "$runtime"
}

prepare() {
  preflight
  docker build --pull=false --tag "$candidate_image" "$repo_root/infra/hermes-coder"
  docker run --rm --entrypoint /opt/hermes/.venv/bin/python "$candidate_image" \
    -c 'import hermes_cli; print("candidate_import=pass")'
  docker run --rm \
    --volume "$repo_root:/workspace:ro" \
    --entrypoint /opt/hermes/.venv/bin/python \
    "$candidate_image" \
    -m unittest discover -s /workspace/infra/hermes-coder/tests -v
  printf 'image=%s candidate=qualified\n' "$candidate_image"
}

phase_runtime_env() {
  local output=$1 work_dir=$2 phase_json=$3 current_env=$4 token
  set -a
  # shellcheck disable=SC1090
  . "$phase_env"
  set +a
  timeout 30 "$phase_bin" secrets export \
    --app "$phase_app" \
    --env "$phase_environment" \
    --path "$phase_path" \
    --format json >"$phase_json"
  unset PHASE_SERVICE_TOKEN
  jq -e '
    has("WALTER_INTAKE_TOKEN") and
    (.WALTER_INTAKE_TOKEN |
      type == "string" and
      test("^[A-Za-z0-9_-]{43,128}$"))
  ' "$phase_json" >/dev/null ||
    fail "Phase path lacks a valid WALTER_INTAKE_TOKEN"
  token=$(jq -er '.WALTER_INTAKE_TOKEN' "$phase_json")
  awk -F= '$1!="PLATFORM_TASK_INTAKE_TOKEN" {print}' "$current_env" >"$output"
  printf 'PLATFORM_TASK_INTAKE_TOKEN=%s\n' "$token" >>"$output"
  unset token
  chmod 0600 "$output"
  test -s "$work_dir/runtime.env"
}

verify_route() {
  docker exec "$runtime" /opt/hermes/.venv/bin/python -c '
import json
import os
import urllib.error
import urllib.request
token = os.environ["PLATFORM_TASK_INTAKE_TOKEN"]
assert len(token) >= 43
request = urllib.request.Request(
    "http://127.0.0.1:9119/api/plugins/platform-task-intake/tasks",
    data=b"{}",
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    method="POST",
)
try:
    urllib.request.urlopen(request, timeout=5)
except urllib.error.HTTPError as error:
    assert error.code == 422, error.code
else:
    raise AssertionError("empty request unexpectedly accepted")
print("private_intake=authenticated")
'
}

verify() {
  require_root
  container_exists "$runtime" || fail "$runtime is unavailable"
  test "$(docker inspect -f '{{.State.Running}}' "$runtime")" = true
  test "$(mounted_volume "$runtime")" = "$volume"
  test "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$runtime")" = "$network"
  test -n "$(docker inspect -f \
    '{{range .Config.Env}}{{if eq (index (split . "=") 0) "PLATFORM_TASK_INTAKE_TOKEN"}}present{{end}}{{end}}' \
    "$runtime")"
  grep -Fq \
    'location = /api/plugins/platform-task-intake/tasks { return 404; }' "$nginx_live"
  grep -Fq \
    'location = /api/plugins/platform-task-intake/resolve { return 404; }' "$nginx_live"
  docker exec overnightdesk-nginx nginx -t >/dev/null
  verify_route
  test "$(systemctl is-active "$walter_intake_unit")" = active
  curl --silent --show-error --fail --max-time 15 \
    https://aegis-prod.overnightdesk.com/api/status >/dev/null
  printf 'runtime=%s intake=healthy public_ingress=denied verification=pass\n' "$runtime"
}

restore_previous() {
  local rollback_container
  test -f "$state_file" || fail "rollback state is unavailable"
  rollback_container=$(<"$state_file")
  container_exists "$rollback_container" ||
    fail "rollback container is unavailable"
  systemctl stop "$walter_intake_unit" >/dev/null 2>&1 || true
  if container_exists "$runtime"; then
    docker stop -t 60 "$runtime" >/dev/null 2>&1 || true
    docker rm "$runtime" >/dev/null
  fi
  docker rename "$rollback_container" "$runtime"
  if test -d "$data_root/profiles/platform_code_worker" &&
     test ! -e "$data_root/profiles/the_guardian"; then
    python3 "$profile_migration" rollback --data-root "$data_root" \
      --source-root "$profile_source" >/dev/null
  fi
  docker start "$runtime" >/dev/null
  if test -f "$nginx_backup"; then
    install -o root -g root -m 0644 "$nginx_backup" "$nginx_live"
    docker exec overnightdesk-nginx nginx -t >/dev/null
    docker kill --signal HUP overnightdesk-nginx >/dev/null
  fi
  systemctl start "$walter_intake_unit"
  rm -f "$state_file"
  printf 'runtime=%s rollback=complete\n' "$runtime"
}

activate() {
  require_root
  test "$approval" = "--approve-walter-restart" ||
    fail "activate requires --approve-walter-restart"
  preflight
  docker image inspect "$candidate_image" >/dev/null ||
    fail "qualified candidate image is unavailable"

  local work_dir phase_json current_env runtime_env rollback_container
  local user workdir entrypoint restart memory nano_cpus cpus
  local activation_succeeded=false
  local intake_was_active=true
  work_dir=$(mktemp -d /run/walter-intake.XXXXXX)
  chmod 0700 "$work_dir"
  phase_json=$work_dir/phase.json
  current_env=$work_dir/current.env
  runtime_env=$work_dir/runtime.env
  rollback_container=hermes-walter-pre-intake-$(date -u +%Y%m%dT%H%M%SZ)
  activation_cleanup() {
    local status=$?
    trap - EXIT INT TERM
    if test "$activation_succeeded" != true && test -f "$state_file"; then
      restore_previous >/dev/null 2>&1 || true
    fi
    if test "$intake_was_active" = true &&
       test "$(systemctl is-active "$walter_intake_unit" 2>/dev/null || true)" != active; then
      systemctl start "$walter_intake_unit" >/dev/null 2>&1 || true
    fi
    find "$work_dir" -type f -delete 2>/dev/null || true
    rmdir "$work_dir" 2>/dev/null || true
    exit "$status"
  }
  trap activation_cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$runtime" >"$current_env"
  phase_runtime_env "$runtime_env" "$work_dir" "$phase_json" "$current_env"
  user=$(docker inspect -f '{{.Config.User}}' "$runtime")
  workdir=$(docker inspect -f '{{.Config.WorkingDir}}' "$runtime")
  entrypoint=$(docker inspect -f '{{index .Config.Entrypoint 0}}' "$runtime")
  restart=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$runtime")
  memory=$(docker inspect -f '{{.HostConfig.Memory}}' "$runtime")
  nano_cpus=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$runtime")
  cpus=$(awk -v nano="$nano_cpus" 'BEGIN { printf "%.3f", nano / 1000000000 }')

  install -d -o root -g root -m 0755 "$state_dir"
  install -o root -g root -m 0644 "$nginx_live" "$nginx_backup"
  systemctl stop "$walter_intake_unit"
  docker stop -t 60 "$runtime" >/dev/null
  docker rename "$runtime" "$rollback_container"
  printf '%s\n' "$rollback_container" >"$state_file"
  chmod 0600 "$state_file"
  if ! python3 "$profile_migration" apply --data-root "$data_root" \
    --source-root "$profile_source" >/dev/null; then
    restore_previous
    fail "platform worker profile migration failed"
  fi

  if ! docker create \
    --name "$runtime" \
    --hostname "$runtime" \
    --user "$user" \
    --workdir "$workdir" \
    --entrypoint "$entrypoint" \
    --env-file "$runtime_env" \
    --network "$network" \
    --mount "type=volume,source=$volume,destination=/opt/data" \
    --restart "$restart" \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --memory "$memory" \
    --cpus "$cpus" \
    "$candidate_image" >/dev/null; then
    restore_previous
    fail "candidate container creation failed"
  fi

  if ! docker start "$runtime" >/dev/null; then
    restore_previous
    fail "candidate Walter failed to start"
  fi
  install -o root -g root -m 0644 "$nginx_source" "$nginx_live"
  if ! docker exec overnightdesk-nginx nginx -t >/dev/null; then
    restore_previous
    fail "candidate Nginx configuration failed"
  fi
  docker kill --signal HUP overnightdesk-nginx >/dev/null
  systemctl start "$walter_intake_unit"
  for attempt in $(seq 1 60); do
    if verify >/dev/null 2>&1; then
      activation_succeeded=true
      printf 'runtime=%s rollback_container=%s activation=pass\n' \
        "$runtime" "$rollback_container"
      return
    fi
    test "$attempt" -lt 60 || break
    sleep 2
  done
  restore_previous
  fail "candidate Walter failed verification and was rolled back"
}

case "$action" in
  preflight) preflight ;;
  prepare) prepare ;;
  activate) activate ;;
  verify) verify ;;
  rollback) require_root; restore_previous ;;
  *) fail "usage: $0 preflight|prepare|activate --approve-walter-restart|verify|rollback" ;;
esac
