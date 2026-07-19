#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
old_name=hermes-agent
new_name=hermes-walter
github_rotation_backup=hermes-agent-pre-github-rotation
volume_name=hermes-agent-data
nginx_container=overnightdesk-nginx
nginx_source="$repo_root/infra/nginx/walter-hermes.conf"
nginx_live=${WALTER_NGINX_LIVE_PATH:-/opt/overnightdesk/nginx/conf.d/default.conf}
nginx_backup=${nginx_live}.pre-walter
persona_source="$repo_root/tenants/hermes-walter/SOUL.md"
phase_token_file=${WALTER_PHASE_TOKEN_FILE:-/opt/overnightdesk/secrets/phase-service-token}
phase_app=${WALTER_PHASE_APP:-overnightdesk}
phase_path=${WALTER_PHASE_PATH:-/tenant-0}
github_token_key=GITHUB_TOKEN_CODER
github_repositories=(
  overnightdesk
  overnightdesk-engine
  overnightdesk-ops
  overnightdesk-platform-standard
  overnightdesk-communicationmodule
  overnightdesk-securityteam
  overnightdesk-SecurityCouncil
  overnightdesk-operations-audit
  overnightdesk-flightrecorder
)

usage() {
  printf 'usage: %s {preflight|rotate-github|activate|verify|rollback}\n' "$0" >&2
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

assert_platform_intakes_stopped() {
  local route state
  for route in agent walter; do
    state=$(systemctl is-active "hermes-email-intake@$route.service" 2>/dev/null || true)
    test "$state" != active || {
      printf '%s intake must be stopped for credential rotation\n' "$route" >&2
      exit 1
    }
  done
}

wait_for_running() {
  local container=$1 attempt
  for attempt in $(seq 1 40); do
    test "$(docker inspect -f '{{.State.Running}}' "$container")" = true && return
    test "$attempt" -lt 40 || return 1
    sleep 1
  done
}

wait_for_public_status() {
  local attempt
  for attempt in $(seq 1 30); do
    curl --silent --show-error --fail --max-time 15 \
      https://aegis-prod.overnightdesk.com/api/status >/dev/null && return
    test "$attempt" -lt 30 || return 1
    sleep 2
  done
}

wait_for_intake() {
  local route=$1 attempt state
  for attempt in $(seq 1 40); do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "hermes-email-intake-$route" 2>/dev/null || true)
    test "$state" = healthy && return
    test "$attempt" -lt 40 || return 1
    sleep 2
  done
}

runtime_contract() {
  docker inspect "$1" | jq -S '.[0] | {
    image: .Config.Image,
    entrypoint: .Config.Entrypoint,
    cmd: .Config.Cmd,
    user: .Config.User,
    working_dir: .Config.WorkingDir,
    env: (.Config.Env | map(
      if startswith("GH_TOKEN=") then "GH_TOKEN=[ROTATED]"
      elif startswith("GITHUB_TOKEN=") then "GITHUB_TOKEN=[ROTATED]"
      else . end) | sort),
    labels: .Config.Labels,
    restart: .HostConfig.RestartPolicy,
    readonly: .HostConfig.ReadonlyRootfs,
    cap_add: .HostConfig.CapAdd,
    cap_drop: .HostConfig.CapDrop,
    security_opt: .HostConfig.SecurityOpt,
    memory: .HostConfig.Memory,
    nano_cpus: .HostConfig.NanoCpus,
    pids_limit: .HostConfig.PidsLimit,
    privileged: .HostConfig.Privileged,
    network_mode: .HostConfig.NetworkMode,
    ports: .HostConfig.PortBindings,
    mounts: [.Mounts[] | {type: .Type, name: .Name, destination: .Destination, rw: .RW}]
  }'
}

rotate_github() {
  test "$(id -u)" -eq 0 || { printf 'run as root\n' >&2; exit 1; }
  container_exists "$old_name" || { printf '%s is required\n' "$old_name" >&2; exit 1; }
  ! container_exists "$new_name" || { printf '%s already exists\n' "$new_name" >&2; exit 1; }
  ! container_exists "$github_rotation_backup" || {
    printf '%s already exists; refusing to overwrite rollback state\n' "$github_rotation_backup" >&2
    exit 1
  }
  assert_platform_intakes_stopped
  test -f "$phase_token_file" && test ! -L "$phase_token_file"
  test "$(mounted_data_volume "$old_name")" = "$volume_name"

  local temp_dir phase_json current_env runtime_env_file key_response curl_config
  local volume_root hosts_file auth_file hosts_old auth_old hosts_new auth_new
  local replacement old_gh old_github image user workdir entrypoint network restart memory nano_cpus cpus revision
  local hosts_mode hosts_uid hosts_gid auth_mode auth_uid auth_gid
  local oauth_token_count oauth_tokens_seen token_value prefix
  local created=false renamed=false success=false repo code
  temp_dir=$(mktemp -d /tmp/hermes-github-rotation.XXXXXX)
  chmod 0700 "$temp_dir"
  phase_json="$temp_dir/phase.json"
  current_env="$temp_dir/current.env"
  runtime_env_file="$temp_dir/runtime.env"
  key_response="$temp_dir/github-user.json"
  curl_config="$temp_dir/curl.conf"
  volume_root=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Source}}{{end}}{{end}}' "$old_name")
  hosts_file="$volume_root/.config/gh/hosts.yml"
  auth_file="$volume_root/auth.json"
  hosts_old="$temp_dir/hosts.old"
  auth_old="$temp_dir/auth.old"
  hosts_new="$temp_dir/hosts.new"
  auth_new="$temp_dir/auth.new"
  hosts_mode=$(stat -c %a "$hosts_file")
  hosts_uid=$(stat -c %u "$hosts_file")
  hosts_gid=$(stat -c %g "$hosts_file")
  auth_mode=$(stat -c %a "$auth_file")
  auth_uid=$(stat -c %u "$auth_file")
  auth_gid=$(stat -c %g "$auth_file")

  cleanup_rotation() {
    trap - ERR INT TERM
    unset PHASE_SERVICE_TOKEN replacement old_gh old_github
    if test "$success" != true; then
      if test "$created" = true && container_exists "$old_name"; then
        docker stop -t 30 "$old_name" >/dev/null 2>&1 || true
        docker rm "$old_name" >/dev/null 2>&1 || true
      fi
      if test "$renamed" = true && container_exists "$github_rotation_backup"; then
        docker rename "$github_rotation_backup" "$old_name" >/dev/null 2>&1 || true
      fi
      test ! -f "$hosts_old" || install -o "$hosts_uid" -g "$hosts_gid" -m "$hosts_mode" "$hosts_old" "$hosts_file"
      test ! -f "$auth_old" || install -o "$auth_uid" -g "$auth_gid" -m "$auth_mode" "$auth_old" "$auth_file"
      container_exists "$old_name" && docker start "$old_name" >/dev/null 2>&1 || true
    fi
    find "$temp_dir" -type f -delete 2>/dev/null || true
    rmdir "$temp_dir" 2>/dev/null || true
    systemctl start hermes-email-intake@agent.service >/dev/null 2>&1 || true
  }
  trap cleanup_rotation ERR INT TERM

  export PHASE_SERVICE_TOKEN=$(<"$phase_token_file")
  HOME=/home/ubuntu phase secrets export --app "$phase_app" --env production \
    --path "$phase_path" --format json >"$phase_json"
  unset PHASE_SERVICE_TOKEN
  replacement=$(jq -er --arg key "$github_token_key" '.[$key]' "$phase_json")
  printf 'header = "Authorization: Bearer %s"\n' "$replacement" >"$curl_config"
  printf 'header = "Accept: application/vnd.github+json"\n' >>"$curl_config"
  printf 'header = "X-GitHub-Api-Version: 2022-11-28"\n' >>"$curl_config"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$old_name" >"$current_env"
  old_gh=$(awk -F= '$1=="GH_TOKEN" {sub(/^[^=]*=/, ""); print; exit}' "$current_env")
  old_github=$(awk -F= '$1=="GITHUB_TOKEN" {sub(/^[^=]*=/, ""); print; exit}' "$current_env")
  test -n "$old_gh" && test "$old_gh" = "$old_github" && test "$replacement" != "$old_gh"
  printf 'github_rotation_stage=credential-shape status=pass\n'
  test "$(curl --silent --show-error --config "$curl_config" --output "$key_response" \
    --write-out '%{http_code}' https://api.github.com/user)" = 200
  for repo in "${github_repositories[@]}"; do
    code=$(curl --silent --show-error --config "$curl_config" \
      --output "$temp_dir/repo.json" --write-out '%{http_code}' \
      "https://api.github.com/repos/Little-Town-Labs/$repo")
    test "$code" = 200 || { printf 'staged token cannot access %s\n' "$repo" >&2; return 1; }
  done
  printf 'github_rotation_stage=staged-token-access status=pass repositories=%s\n' \
    "${#github_repositories[@]}"

  local seen_gh=false seen_github=false line
  while IFS= read -r line || test -n "$line"; do
    case "$line" in
      GH_TOKEN=*) printf 'GH_TOKEN=%s\n' "$replacement"; seen_gh=true ;;
      GITHUB_TOKEN=*) printf 'GITHUB_TOKEN=%s\n' "$replacement"; seen_github=true ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <"$current_env" >"$runtime_env_file"
  test "$seen_gh" = true && test "$seen_github" = true
  install -m 0600 "$hosts_file" "$hosts_old"
  install -m 0600 "$auth_file" "$auth_old"
  oauth_token_count=$(grep -c '^[[:space:]]*oauth_token:' "$hosts_file")
  test "$oauth_token_count" -gt 0
  while IFS= read -r token_value; do
    test "$token_value" = "$old_gh" || {
      printf 'GitHub CLI token entries do not match the active runtime credential\n' >&2
      return 1
    }
  done < <(awk '$1=="oauth_token:" {print $2}' "$hosts_file")
  oauth_tokens_seen=0
  while IFS= read -r line || test -n "$line"; do
    case "$line" in
      *oauth_token:*)
        prefix=${line%%oauth_token:*}
        printf '%soauth_token: %s\n' "$prefix" "$replacement"
        oauth_tokens_seen=$((oauth_tokens_seen + 1))
        ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <"$hosts_file" >"$hosts_new"
  test "$oauth_tokens_seen" -eq "$oauth_token_count"
  test "$(grep -c '^[[:space:]]*oauth_token:' "$hosts_new")" -eq "$oauth_token_count"
  jq --slurpfile phase "$phase_json" --arg key "$github_token_key" '
    .credential_pool.copilot |= map(.access_token = $phase[0][$key])
  ' "$auth_file" >"$auth_new"
  jq empty "$auth_new"
  test "$(jq '.credential_pool.copilot | length' "$auth_new")" -gt 0
  printf 'github_rotation_stage=auth-transform status=pass gh_entries=%s\n' \
    "$oauth_token_count"

  image=$(docker inspect -f '{{.Config.Image}}' "$old_name")
  user=$(docker inspect -f '{{.Config.User}}' "$old_name")
  workdir=$(docker inspect -f '{{.Config.WorkingDir}}' "$old_name")
  entrypoint=$(docker inspect -f '{{index .Config.Entrypoint 0}}' "$old_name")
  network=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$old_name")
  restart=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$old_name")
  memory=$(docker inspect -f '{{.HostConfig.Memory}}' "$old_name")
  nano_cpus=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$old_name")
  cpus=$(awk -v nano="$nano_cpus" 'BEGIN { printf "%.3f", nano / 1000000000 }')
  revision=$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$old_name")

  docker stop -t 60 "$old_name" >/dev/null
  docker rename "$old_name" "$github_rotation_backup"
  renamed=true
  docker create --name "$old_name" --user "$user" --workdir "$workdir" \
    --entrypoint "$entrypoint" --env-file "$runtime_env_file" --network "$network" \
    --mount "type=volume,source=$volume_name,destination=/opt/data" --restart "$restart" \
    --cap-drop ALL --security-opt no-new-privileges:true --memory "$memory" --cpus "$cpus" \
    --label "org.opencontainers.image.revision=$revision" "$image" >/dev/null
  created=true
  install -o "$hosts_uid" -g "$hosts_gid" -m "$hosts_mode" "$hosts_new" "$hosts_file"
  install -o "$auth_uid" -g "$auth_gid" -m "$auth_mode" "$auth_new" "$auth_file"
  test "$(runtime_contract "$old_name" | sha256sum | cut -d' ' -f1)" = \
    "$(runtime_contract "$github_rotation_backup" | sha256sum | cut -d' ' -f1)"
  printf 'github_rotation_stage=runtime-contract status=pass\n'
  docker start "$old_name" >/dev/null
  wait_for_running "$old_name"
  wait_for_public_status
  docker exec "$old_name" gh api user >/dev/null
  for repo in "${github_repositories[@]}"; do
    docker exec "$old_name" gh api "repos/Little-Town-Labs/$repo" >/dev/null
  done
  docker exec "$old_name" gh issue list --repo Little-Town-Labs/overnightdesk --limit 1 >/dev/null
  docker exec "$old_name" gh pr list --repo Little-Town-Labs/overnightdesk --limit 1 >/dev/null
  docker exec "$old_name" gh run list --repo Little-Town-Labs/overnightdesk --limit 1 >/dev/null
  printf 'github_rotation_stage=runtime-verification status=pass\n'
  test "$(docker inspect -f '{{.State.Running}}' "$github_rotation_backup")" = false
  success=true
  cleanup_rotation
  wait_for_intake agent
  printf 'runtime=%s github=rotated rollback_container=%s status=healthy\n' \
    "$old_name" "$github_rotation_backup"
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
  rotate-github) rotate_github ;;
  activate) activate ;;
  verify) verify ;;
  rollback) rollback ;;
  *) usage ;;
esac
