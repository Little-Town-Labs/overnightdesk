#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")
image=${TITUS_MEETING_FILER_IMAGE:-overnightdesk/titus-meeting-filer:0.1.0}
base_image=overnightdesk/hermes-agent:0.19.0-coder
marker=/etc/overnightdesk/titus-meeting-filing.enabled

usage() { printf 'usage: %s {prepare|install-disabled|initialize|enable|verify|verify-disabled|disable|rollback|status}\n' "$0" >&2; exit 2; }

prepare() {
  "$root/scripts/qualify.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/titus-meeting-filer-deploy'
  rsync -az --delete \
    --exclude='.git/' --exclude='*.test' --exclude='*.out' \
    --exclude='/titus-meeting-filer' \
    -e "ssh -i $ssh_key" "$root/" "$remote:/tmp/titus-meeting-filer-deploy/"
  "${ssh_cmd[@]}" sudo install -d -o root -g root -m 0755 \
    /opt/titus-meeting-filer /opt/titus-meeting-filer/releases /opt/titus-meeting-filer/bin
  release_dir=$("${ssh_cmd[@]}" sudo bash -s -- \
    promote /tmp/titus-meeting-filer-deploy /opt/titus-meeting-filer/releases 0 0 \
    <"$root/scripts/release-tree.sh")
  release_id=${release_dir##*/}
  [[ $release_dir == "/opt/titus-meeting-filer/releases/$release_id" && $release_id =~ ^[0-9a-f]{64}$ ]]

  "${ssh_cmd[@]}" sudo bash -s -- "$image" "$base_image" "$release_dir" <<'REMOTE'
set -euo pipefail
image=$1
base_image=$2
release_dir=$3
base=/opt/titus-meeting-filer
releases=$base/releases
source_link=$base/source
previous_link=$base/previous
release_id=${release_dir##*/}
test "$release_dir" = "$releases/$release_id"
bash "$release_dir/scripts/release-tree.sh" validate "$release_dir" "$release_id" 0 0

case "$image" in *:*) ;; *) printf 'meeting filer image must use an explicit tag\n' >&2; exit 1;; esac
image_repo=${image%:*}
image_tag=${image##*:}
release_image=$image_repo:$image_tag-$release_id

previous_target=
if test -L "$source_link"; then
  previous_target=$(readlink -f "$source_link")
	previous_id=${previous_target##*/}
	[[ $previous_target == "$releases/$previous_id" && $previous_id =~ ^[0-9a-f]{64}$ ]]
	bash "$previous_target/scripts/release-tree.sh" validate "$previous_target" "$previous_id" 0 0
elif test -e "$source_link"; then
  printf 'meeting filer source path is invalid\n' >&2
  exit 1
fi

docker image inspect "$base_image" >/dev/null
docker build --pull=false --build-arg HERMES_BASE_IMAGE="$base_image" -t "$release_image" "$release_dir"
docker tag "$release_image" "$image"
for script in load-phase-config.sh prepare-volumes.sh initialize-project-paths.sh run-container.sh stop-container.sh; do
  install -o root -g root -m 0755 "$release_dir/runtime/$script" "$base/bin/$script"
done
install -o root -g root -m 0644 "$release_dir/runtime/titus-meeting-filer.service" /etc/systemd/system/titus-meeting-filer.service

if test -n "$previous_target" && test "$previous_target" != "$release_dir"; then
  test ! -e "$previous_link.next" && test ! -L "$previous_link.next"
  ln -s "$previous_target" "$previous_link.next"
  mv -Tf "$previous_link.next" "$previous_link"
fi
test ! -e "$source_link.next" && test ! -L "$source_link.next"
ln -s "$release_dir" "$source_link.next"
mv -Tf "$source_link.next" "$source_link"
test "$(readlink -f "$source_link")" = "$release_dir"
find /tmp/titus-meeting-filer-deploy -mindepth 1 -delete
rmdir /tmp/titus-meeting-filer-deploy
systemctl daemon-reload
REMOTE
}

install_disabled() {
  prepare
  "${ssh_cmd[@]}" sudo bash -s -- "$marker" <<'REMOTE'
set -euo pipefail
marker=$1
getent group titus-meeting-filer >/dev/null || groupadd --system --gid 10005 titus-meeting-filer
id titus-meeting-filer >/dev/null 2>&1 || useradd --system --uid 10005 --gid 10005 --home-dir /nonexistent --shell /usr/sbin/nologin titus-meeting-filer
usermod -aG docker titus-meeting-filer
rm -f -- "$marker"
systemctl disable --now titus-meeting-filer.service >/dev/null 2>&1 || true
if systemctl is-active --quiet titus-meeting-processor.service; then
  /opt/titus-meeting-processor/bin/load-phase-config.sh
  systemctl restart titus-meeting-processor.service
fi
REMOTE
  verify_disabled
}

initialize() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
test "$(systemctl is-active titus-meeting-filer.service 2>/dev/null || true)" != active
/opt/titus-meeting-filer/bin/load-phase-config.sh
/opt/titus-meeting-filer/bin/prepare-volumes.sh
docker volume inspect titus-project-knowledge-data >/dev/null
docker volume inspect hermes-titus-data >/dev/null
docker volume inspect titus-meeting-filer-data >/dev/null
REMOTE
}

enable() {
  if ! "${ssh_cmd[@]}" sudo bash -s -- "$marker" <<'REMOTE'
set -euo pipefail
marker=$1
test -f /etc/overnightdesk/titus-meeting-briefs.enabled
test ! -e "$marker" && test ! -L "$marker"
install -o root -g root -m 0444 /dev/null "$marker.next"
mv -Tf "$marker.next" "$marker"
/opt/titus-meeting-filer/bin/load-phase-config.sh
/opt/titus-meeting-filer/bin/prepare-volumes.sh
/opt/titus-meeting-processor/bin/load-phase-config.sh
systemctl enable --now titus-meeting-filer.service
systemctl restart titus-meeting-processor.service
REMOTE
  then
    disable || true
    return 1
  fi
  if ! verify; then disable || true; return 1; fi
}

verify() {
  "${ssh_cmd[@]}" sudo bash -s -- "$marker" <<'REMOTE'
set -euo pipefail
marker=$1
test -f "$marker" && test ! -L "$marker" && test "$(stat -c %a "$marker")" = 444
systemctl is-active --quiet titus-meeting-filer.service
systemctl is-active --quiet hermes-titus.service
systemctl is-active --quiet titus-meeting-processor.service
for attempt in $(seq 1 30); do
  state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' titus-meeting-filer 2>/dev/null || true)
  test "$state" = healthy && break
  test "$attempt" -lt 30 || exit 1
  sleep 2
done
test -z "$(docker port titus-meeting-filer)"
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' titus-meeting-filer)" = true
mounts=$(docker inspect -f '{{range .Mounts}}{{.Name}}:{{.Destination}} {{end}}' titus-meeting-filer)
case "$mounts" in *titus-project-knowledge-data:/projects*hermes-titus-data:/filer-home/.hermes/kanban*) ;; *) printf '%s\n' "$mounts" >&2; exit 1;; esac
docker exec titus-meeting-filer /opt/hermes/.venv/bin/hermes kanban --board meeting-triage list --json >/tmp/filer-kanban.json
docker exec hermes-titus /opt/hermes/.venv/bin/hermes kanban --board meeting-triage list --json >/tmp/titus-kanban.json
cmp -s /tmp/filer-kanban.json /tmp/titus-kanban.json
rm -f /tmp/filer-kanban.json /tmp/titus-kanban.json
jq -e '.MEETING_FILING_ENABLED == "true"' /run/titus-meeting-processor/runtime.json >/dev/null
printf 'service=titus-meeting-filer status=healthy kanban=shared projects=active\n'
REMOTE
}

verify_disabled() {
  "${ssh_cmd[@]}" sudo bash -s -- "$marker" <<'REMOTE'
set -euo pipefail
marker=$1
test ! -e "$marker" && test ! -L "$marker"
test "$(systemctl is-active titus-meeting-filer.service 2>/dev/null || true)" != active
test -z "$(docker ps --filter name=^/titus-meeting-filer$ --format '{{.Names}}')"
if systemctl is-active --quiet titus-meeting-processor.service; then
  jq -e 'has("MEETING_FILING_ENABLED") | not' /run/titus-meeting-processor/runtime.json >/dev/null
fi
systemctl is-active --quiet hermes-titus.service
printf 'service=titus-meeting-filer status=disabled titus=healthy\n'
REMOTE
}

disable() {
  "${ssh_cmd[@]}" sudo rm -f -- "$marker"
  "${ssh_cmd[@]}" sudo systemctl disable --now titus-meeting-filer.service >/dev/null 2>&1 || true
  "${ssh_cmd[@]}" sudo /opt/titus-meeting-processor/bin/load-phase-config.sh
  "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service
  verify_disabled
}

rollback() {
  disable
  "${ssh_cmd[@]}" sudo bash -s -- "$image" <<'REMOTE'
set -euo pipefail
image=$1
base=/opt/titus-meeting-filer
source_link=$base/source
previous_link=$base/previous
docker volume inspect titus-meeting-filer-data >/dev/null
if test ! -L "$previous_link"; then
  printf 'service=titus-meeting-filer rollback=disabled state=retained previous_source=absent\n'
  exit 0
fi
current_target=$(readlink -f "$source_link")
previous_target=$(readlink -f "$previous_link")
previous_id=${previous_target##*/}
[[ $previous_id =~ ^[0-9a-f]{64}$ ]]
bash "$previous_target/scripts/release-tree.sh" validate "$previous_target" "$previous_id" 0 0
case "$image" in *:*) ;; *) exit 1;; esac
image_repo=${image%:*}
image_tag=${image##*:}
previous_image=$image_repo:$image_tag-$previous_id
docker image inspect "$previous_image" >/dev/null
for script in load-phase-config.sh prepare-volumes.sh initialize-project-paths.sh run-container.sh stop-container.sh; do
  install -o root -g root -m 0755 "$previous_target/runtime/$script" "$base/bin/$script"
done
install -o root -g root -m 0644 "$previous_target/runtime/titus-meeting-filer.service" /etc/systemd/system/titus-meeting-filer.service
test ! -e "$source_link.next" && test ! -L "$source_link.next"
ln -s "$previous_target" "$source_link.next"
mv -Tf "$source_link.next" "$source_link"
test ! -e "$previous_link.next" && test ! -L "$previous_link.next"
ln -s "$current_target" "$previous_link.next"
mv -Tf "$previous_link.next" "$previous_link"
docker tag "$previous_image" "$image"
systemctl daemon-reload
printf 'service=titus-meeting-filer rollback=disabled state=retained previous_source=restored\n'
REMOTE
}
status() { "${ssh_cmd[@]}" sudo systemctl status --no-pager titus-meeting-filer.service || true; }

case "$action" in
  prepare) prepare;; install-disabled) install_disabled;; initialize) initialize;; enable) enable;; verify) verify;;
  verify-disabled) verify_disabled;; disable) disable;; rollback) rollback;; status) status;; *) usage;;
esac
