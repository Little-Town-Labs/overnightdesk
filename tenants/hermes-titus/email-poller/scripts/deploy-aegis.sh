#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
instance=${2:-all}
replay_message_id=${3:-}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")
image=${HERMES_EMAIL_INTAKE_IMAGE:-overnightdesk/hermes-email-intake:0.2.0}

usage() {
  printf 'usage: %s {prepare|install|initialize|verify|enable|disable|rollout|status|stop|rollback} [titus|agent|mitchel|all] [replay-message-id]\n' "$0" >&2
  exit 2
}

routes() {
  case "$instance" in
    titus|agent|mitchel) printf '%s\n' "$instance" ;;
    all) printf '%s\n' titus agent mitchel ;;
    *) usage ;;
  esac
}

prepare() {
  "$root/scripts/qualify.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/hermes-email-intake-deploy'
  rsync -az --delete -e "ssh -i $ssh_key" "$root/" "$remote:/tmp/hermes-email-intake-deploy/"
  "${ssh_cmd[@]}" sudo bash -s -- "$image" <<'REMOTE'
set -euo pipefail
image=$1
install -d -o root -g root -m 0755 /opt/hermes-email-intake/source /opt/hermes-email-intake/bin
cp -a /tmp/hermes-email-intake-deploy/. /opt/hermes-email-intake/source/
for script in load-phase-config.sh initialize-container.sh prepare-volume.sh run-once-container.sh run-container.sh stop-container.sh; do
  install -o root -g root -m 0755 "/opt/hermes-email-intake/source/runtime/$script" "/opt/hermes-email-intake/bin/$script"
done
install -o root -g root -m 0644 /opt/hermes-email-intake/source/runtime/hermes-email-intake@.service /etc/systemd/system/hermes-email-intake@.service
docker build --pull -t "$image" /opt/hermes-email-intake/source
for name in hermes-agent hermes-titus hermes-mitchel; do
  docker container inspect "$name" >/dev/null
  docker cp /opt/hermes-email-intake/source/runtime/email-run-approval.sh "$name:/opt/data/bin/hermes-email-run-approval"
  volume_root=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Source}}{{end}}{{end}}' "$name")
  test -n "$volume_root"
  chown 10000:10000 "$volume_root/bin/hermes-email-run-approval"
  chmod 0755 "$volume_root/bin/hermes-email-run-approval"
done
find /opt/hermes-email-intake/source -type d -exec chmod go-w {} +
find /opt/hermes-email-intake/source -type f -exec chmod go-w {} +
find /tmp/hermes-email-intake-deploy -mindepth 1 -delete
rmdir /tmp/hermes-email-intake-deploy
systemctl daemon-reload
REMOTE
}

install_runtime() {
  prepare
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
if getent passwd 10002 >/dev/null && test "$(getent passwd 10002 | cut -d: -f1)" != titus-email-poller; then
  echo 'uid 10002 is already assigned' >&2; exit 1
fi
if getent group 10002 >/dev/null && test "$(getent group 10002 | cut -d: -f1)" != titus-email-poller; then
  echo 'gid 10002 is already assigned' >&2; exit 1
fi
getent group titus-email-poller >/dev/null || groupadd --system --gid 10002 titus-email-poller
id titus-email-poller >/dev/null 2>&1 || useradd --system --uid 10002 --gid 10002 --home-dir /nonexistent --shell /usr/sbin/nologin titus-email-poller
usermod -aG docker titus-email-poller
for route in titus agent mitchel; do
  systemctl enable --now "hermes-email-intake@$route.service"
done
REMOTE
  instance=all verify
}

verify_one() {
  local route=$1
  "${ssh_cmd[@]}" sudo bash -s -- "$route" <<'REMOTE'
set -euo pipefail
route=$1
name=hermes-email-intake-$route
systemctl is-active --quiet "hermes-email-intake@$route.service"
for attempt in $(seq 1 30); do
  state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || true)
  test "$state" = healthy && break
  test "$attempt" -lt 30 || { docker logs --tail 80 "$name" 2>&1; exit 1; }
  sleep 2
done
test -z "$(docker port "$name")"
test "$(docker inspect -f '{{.Config.User}}' "$name")" = 10002:10002
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$name")" = true
docker inspect -f '{{json .HostConfig.CapDrop}}' "$name" | grep -q ALL
docker inspect -f '{{json .HostConfig.SecurityOpt}}' "$name" | grep -q no-new-privileges
docker inspect -f '{{json .NetworkSettings.Networks}}' "$name" | grep -q overnightdesk_overnightdesk
! docker inspect -f '{{json .Config.Env}}' "$name" | grep -Eq '(AGENTMAIL|DATABASE_URL|HERMES_API_KEY)'
docker exec "$name" /app/titus-email-poller health --health /data/health.json --max-age 180s
docker volume inspect "hermes-email-intake-$route-data" >/dev/null
printf 'route=%s status=healthy ports=none\n' "$route"
REMOTE
}

verify() { while IFS= read -r route <&3; do verify_one "$route"; done 3< <(routes); }

initialize() {
  while IFS= read -r route <&3; do
    "${ssh_cmd[@]}" sudo bash -s -- "$route" <<'REMOTE'
set -euo pipefail
route=$1
systemctl stop "hermes-email-intake@$route.service"
/opt/hermes-email-intake/bin/load-phase-config.sh "$route"
test "$(jq -r '.AGENTMAIL_POLLING_ENABLED' "/run/hermes-email-intake/$route/runtime.json")" = false
/opt/hermes-email-intake/bin/prepare-volume.sh "$route"
REMOTE
    printf '%s\n' "$replay_message_id" | "${ssh_cmd[@]}" sudo /opt/hermes-email-intake/bin/initialize-container.sh "$route"
    "${ssh_cmd[@]}" sudo systemctl start "hermes-email-intake@$route.service"
    verify_one "$route"
  done 3< <(routes)
}

set_enabled() {
  local value=$1
  while IFS= read -r route <&3; do
    "${ssh_cmd[@]}" sudo bash -s -- "$route" "$value" <<'REMOTE'
set -euo pipefail
route=$1
value=$2
export PHASE_SERVICE_TOKEN=$(</opt/control-tower/secrets/phase-service-token)
printf '%s' "$value" | phase secrets update AGENTMAIL_POLLING_ENABLED \
  --app azure-ops --env production --path "/agents/hermes-email-intake/$route" >/dev/null
unset PHASE_SERVICE_TOKEN
systemctl restart "hermes-email-intake@$route.service"
REMOTE
    verify_one "$route"
  done 3< <(routes)
}

rollout() {
  instance=all initialize
  "${ssh_cmd[@]}" sudo systemctl disable --now titus-email-poller.service
  instance=titus
  if ! set_enabled true; then
    instance=titus set_enabled false || true
    "${ssh_cmd[@]}" sudo systemctl enable --now titus-email-poller.service
    return 1
  fi
  if ! instance=agent set_enabled true; then
    instance=agent set_enabled false || true
    return 1
  fi
  if ! instance=mitchel set_enabled true; then
    instance=mitchel set_enabled false || true
    return 1
  fi
}

rollback() {
  local restore_titus=false
  case "$instance" in titus|all) restore_titus=true ;; esac
  set_enabled false
  if "$restore_titus"; then
    "${ssh_cmd[@]}" sudo systemctl enable --now titus-email-poller.service
  fi
}

status() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
for route in titus agent mitchel; do
  systemctl is-active "hermes-email-intake@$route.service" || true
  docker ps --filter "name=^/hermes-email-intake-$route$" --format '{{.Names}} {{.Status}}'
done
REMOTE
}

stop_runtime() {
  while IFS= read -r route <&3; do
    "${ssh_cmd[@]}" sudo systemctl disable --now "hermes-email-intake@$route.service"
  done 3< <(routes)
}

case "$action" in
  prepare) prepare ;;
  install) install_runtime ;;
  initialize) initialize ;;
  verify) verify ;;
  enable) set_enabled true ;;
  disable) set_enabled false ;;
  rollout) rollout ;;
  status) status ;;
  stop) stop_runtime ;;
  rollback) rollback ;;
  *) usage ;;
esac
