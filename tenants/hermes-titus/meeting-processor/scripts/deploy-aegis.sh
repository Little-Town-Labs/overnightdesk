#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")
image=${TITUS_MEETING_PROCESSOR_IMAGE:-overnightdesk/titus-meeting-processor:0.1.0}

usage() {
  printf 'usage: %s {prepare|install-disabled|initialize|enable|verify|verify-disabled|restart-verify|status|disable|rollback}\n' "$0" >&2
  exit 2
}

prepare() {
  "$root/scripts/qualify.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/titus-meeting-processor-deploy'
  rsync -az --delete \
    --exclude='.git/' --exclude='__pycache__/' --exclude='*.py[co]' \
    --exclude='*.test' --exclude='*.out' --exclude='/titus-meeting-processor' \
    -e "ssh -i $ssh_key" "$root/" "$remote:/tmp/titus-meeting-processor-deploy/"
  "${ssh_cmd[@]}" sudo install -d -o root -g root -m 0755 \
    /opt/titus-meeting-processor /opt/titus-meeting-processor/releases /opt/titus-meeting-processor/bin
  release_dir=$("${ssh_cmd[@]}" sudo bash -s -- \
    promote /tmp/titus-meeting-processor-deploy /opt/titus-meeting-processor/releases 0 0 \
    <"$root/scripts/release-tree.sh")
  release_id=${release_dir##*/}
  [[ $release_dir == "/opt/titus-meeting-processor/releases/$release_id" && $release_id =~ ^[0-9a-f]{64}$ ]]

  "${ssh_cmd[@]}" sudo bash -s -- "$image" "$release_dir" <<'REMOTE'
set -euo pipefail
image=$1
release_dir=$2
base=/opt/titus-meeting-processor
releases=$base/releases
source_link=$base/source
previous_link=$base/previous
release_id=${release_dir##*/}
test "$release_dir" = "$releases/$release_id"
bash "$release_dir/scripts/release-tree.sh" validate "$release_dir" "$release_id" 0 0

previous_target=
if test -L "$source_link"; then
  previous_target=$(readlink -f "$source_link")
elif test -d "$source_link"; then
  legacy=$releases/legacy-initial
  test ! -e "$legacy" && test ! -L "$legacy"
  mv "$source_link" "$legacy"
  previous_target=$legacy
elif test -e "$source_link"; then
  printf 'meeting processor source path is invalid\n' >&2
  exit 1
fi

docker build --pull -t "$image" "$release_dir"
for script in load-phase-config.sh prepare-volume.sh run-container.sh stop-container.sh; do
  install -o root -g root -m 0755 "$release_dir/runtime/$script" "$base/bin/$script"
done
install -o root -g root -m 0644 "$release_dir/runtime/titus-meeting-processor.service" /etc/systemd/system/titus-meeting-processor.service

if test -n "$previous_target" && test "$previous_target" != "$release_dir"; then
  test ! -e "$previous_link.next" && test ! -L "$previous_link.next"
  ln -s "$previous_target" "$previous_link.next"
  mv -Tf "$previous_link.next" "$previous_link"
fi
test ! -e "$source_link.next" && test ! -L "$source_link.next"
ln -s "$release_dir" "$source_link.next"
mv -Tf "$source_link.next" "$source_link"
test "$(readlink -f "$source_link")" = "$release_dir"
find /tmp/titus-meeting-processor-deploy -mindepth 1 -delete
rmdir /tmp/titus-meeting-processor-deploy
systemctl daemon-reload
REMOTE
}

install_disabled() {
  prepare
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
if getent passwd 10003 >/dev/null && test "$(getent passwd 10003 | cut -d: -f1)" != titus-meeting-processor; then
  echo 'uid 10003 is already assigned' >&2; exit 1
fi
if getent group 10003 >/dev/null && test "$(getent group 10003 | cut -d: -f1)" != titus-meeting-processor; then
  echo 'gid 10003 is already assigned' >&2; exit 1
fi
getent group titus-meeting-processor >/dev/null || groupadd --system --gid 10003 titus-meeting-processor
id titus-meeting-processor >/dev/null 2>&1 || useradd --system --uid 10003 --gid 10003 --home-dir /nonexistent --shell /usr/sbin/nologin titus-meeting-processor
usermod -aG docker titus-meeting-processor
systemctl disable --now titus-meeting-processor.service 2>/dev/null || true
REMOTE
  verify_disabled
}

initialize() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
test "$(systemctl is-active titus-meeting-processor.service 2>/dev/null || true)" != active
/opt/titus-meeting-processor/bin/load-phase-config.sh
/opt/titus-meeting-processor/bin/prepare-volume.sh
test -f /run/titus-meeting-processor/runtime.json
docker volume inspect titus-meeting-processor-data >/dev/null
REMOTE
}

enable() {
  initialize
  "${ssh_cmd[@]}" sudo systemctl enable --now titus-meeting-processor.service
  verify
}

verify() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
systemctl is-active --quiet titus-meeting-processor.service
for attempt in $(seq 1 30); do
  state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' titus-meeting-processor 2>/dev/null || true)
  test "$state" = healthy && break
  test "$attempt" -lt 30 || { docker logs --tail 80 titus-meeting-processor 2>&1; exit 1; }
  sleep 2
done
test -z "$(docker port titus-meeting-processor)"
test "$(docker inspect -f '{{.Config.User}}' titus-meeting-processor)" = 10003:10003
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' titus-meeting-processor)" = true
docker inspect -f '{{json .HostConfig.CapDrop}}' titus-meeting-processor | grep -q ALL
docker inspect -f '{{json .HostConfig.SecurityOpt}}' titus-meeting-processor | grep -q no-new-privileges
! docker inspect -f '{{json .Config.Env}}' titus-meeting-processor | grep -Eq '(MSGRAPH|PHASE|TEAMS_)'
docker exec titus-meeting-processor /titus-meeting-processor health --health /data/health.json --max-age 10m
printf 'service=titus-meeting-processor status=healthy ports=none content=disabled\n'
REMOTE
}

verify_disabled() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
test "$(systemctl is-enabled titus-meeting-processor.service 2>/dev/null || true)" != enabled
test "$(systemctl is-active titus-meeting-processor.service 2>/dev/null || true)" != active
test -z "$(docker ps --filter name=^/titus-meeting-processor$ --format '{{.Names}}')"
printf 'service=titus-meeting-processor status=disabled\n'
REMOTE
}

restart_verify() {
  "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service
  verify
}

status() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
systemctl is-enabled titus-meeting-processor.service 2>/dev/null || true
systemctl is-active titus-meeting-processor.service 2>/dev/null || true
docker ps --filter name=^/titus-meeting-processor$ --format '{{.Names}} {{.Status}}'
REMOTE
}

disable() {
  "${ssh_cmd[@]}" sudo systemctl disable --now titus-meeting-processor.service
  verify_disabled
}

rollback() {
  disable
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
docker volume inspect titus-meeting-processor-data >/dev/null
previous=absent
test ! -L /opt/titus-meeting-processor/previous || previous=retained
printf 'service=titus-meeting-processor rollback=disabled state=retained previous_source=%s\n' "$previous"
REMOTE
}

case "$action" in
  prepare) prepare ;;
  install-disabled) install_disabled ;;
  initialize) initialize ;;
  enable) enable ;;
  verify) verify ;;
  verify-disabled) verify_disabled ;;
  restart-verify) restart_verify ;;
  status) status ;;
  disable) disable ;;
  rollback) rollback ;;
  *) usage ;;
esac
