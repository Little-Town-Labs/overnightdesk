#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")
image=${TITUS_MEETING_PROCESSOR_IMAGE:-overnightdesk/titus-meeting-processor:0.1.0}
analyzer_image=overnightdesk/hermes-agent:0.19.0-coder
content_marker=/etc/overnightdesk/titus-meeting-transcript-content.enabled
brief_marker=/etc/overnightdesk/titus-meeting-briefs.enabled
filing_marker=/etc/overnightdesk/titus-meeting-filing.enabled

usage() {
  printf 'usage: %s {prepare|install-disabled|install-feature-035-disabled|initialize|enable|verify|verify-disabled|verify-content-disabled|verify-feature-035-disabled|enable-content|verify-content|enable-brief|verify-brief|disable-brief|retention-sweep|restart-verify|disable-content|status|disable|rollback}\n' "$0" >&2
  exit 2
}

deactivate_feature035() {
  "${ssh_cmd[@]}" sudo install -d -o root -g root -m 0755 /etc/overnightdesk
  "${ssh_cmd[@]}" sudo bash -s -- "$brief_marker" "$filing_marker" <<'REMOTE'
set -euo pipefail
brief_marker=$1
filing_marker=$2
if getent passwd 10003 >/dev/null && test "$(getent passwd 10003 | cut -d: -f1)" != titus-meeting-processor; then
  echo 'uid 10003 is already assigned' >&2; exit 1
fi
if getent group 10003 >/dev/null && test "$(getent group 10003 | cut -d: -f1)" != titus-meeting-processor; then
  echo 'gid 10003 is already assigned' >&2; exit 1
fi
getent group titus-meeting-processor >/dev/null || groupadd --system --gid 10003 titus-meeting-processor
id titus-meeting-processor >/dev/null 2>&1 || useradd --system --uid 10003 --gid 10003 --home-dir /nonexistent --shell /usr/sbin/nologin titus-meeting-processor
usermod -aG docker titus-meeting-processor
getent group titus-meeting-analyzer >/dev/null || groupadd --system --gid 10004 titus-meeting-analyzer
id titus-meeting-analyzer >/dev/null 2>&1 || useradd --system --uid 10004 --gid 10004 --home-dir /nonexistent --shell /usr/sbin/nologin titus-meeting-analyzer
usermod -aG docker titus-meeting-analyzer
rm -f -- "$brief_marker" "$filing_marker"
systemctl disable --now titus-meeting-analyzer.service titus-meeting-filer.service >/dev/null 2>&1 || true
for unit in titus-meeting-analyzer.service titus-meeting-filer.service; do
  test "$(systemctl is-enabled "$unit" 2>/dev/null || true)" != enabled
  unit_state=$(systemctl is-active "$unit" 2>/dev/null || true)
  case "$unit_state" in inactive|failed|unknown) ;; *) printf '%s remains %s\n' "$unit" "$unit_state" >&2; exit 1;; esac
done
test -z "$(docker ps --filter name=^/hermes-titus-meeting-analyzer$ --filter name=^/titus-meeting-filer$ --format '{{.Names}}')"
if systemctl is-active --quiet titus-meeting-processor.service; then
  systemctl restart titus-meeting-processor.service
  jq -e '(has("MEETING_BRIEF_ENABLED") | not) and (has("MEETING_FILING_ENABLED") | not)' /run/titus-meeting-processor/runtime.json >/dev/null
fi
if systemctl is-active --quiet hermes-email-intake@titus.service; then
  systemctl restart hermes-email-intake@titus.service
  jq -e '
    (has("MEETING_REVIEW_ENABLED") | not) and
    (has("MEETING_REVIEW_BASE_URL") | not) and
    (has("MEETING_REVIEW_BEARER") | not) and
    (has("MEETING_REVIEW_SIGNING_SECRET") | not)
  ' /run/hermes-email-intake/titus/runtime.json >/dev/null
fi
REMOTE
}

promote() {
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/titus-meeting-processor-deploy'
  rsync -az --delete \
    --exclude='.git/' --exclude='__pycache__/' --exclude='*.py[co]' \
    --exclude='*.test' --exclude='*.out' --exclude='/titus-meeting-processor' \
    -e "ssh -i $ssh_key" "$root/" "$remote:/tmp/titus-meeting-processor-deploy/"
  rsync -az -e "ssh -i $ssh_key" "$root/../config/meeting-analyzer.yaml" "$remote:/tmp/titus-meeting-analyzer.yaml"
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
install -d -o root -g root -m 0755 /opt/titus-meeting-analyzer/bin
install -o root -g root -m 0755 "$release_dir/runtime/load-analyzer-phase-env.sh" /opt/titus-meeting-analyzer/bin/load-phase-env.sh
install -o root -g root -m 0755 "$release_dir/runtime/run-analyzer-container.sh" /opt/titus-meeting-analyzer/bin/run-container.sh
install -o root -g root -m 0755 "$release_dir/runtime/stop-analyzer-container.sh" /opt/titus-meeting-analyzer/bin/stop-container.sh
install -o root -g root -m 0644 "$release_dir/runtime/titus-meeting-analyzer.service" /etc/systemd/system/titus-meeting-analyzer.service
install -o root -g root -m 0644 /tmp/titus-meeting-analyzer.yaml /opt/titus-meeting-analyzer/config.yaml
rm -f /tmp/titus-meeting-analyzer.yaml

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

prepare() {
  "$root/scripts/qualify.sh"
  promote
}

install_disabled() {
  "$root/scripts/qualify.sh"
  deactivate_feature035
  promote
  if "${ssh_cmd[@]}" sudo systemctl is-active --quiet titus-meeting-processor.service; then
    "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service
  fi
  verify_feature035_disabled
}

install_feature035_disabled() {
  install_disabled
  "$root/../meeting-filer/scripts/deploy-aegis.sh" install-disabled
  "$root/../meeting-filer/scripts/deploy-aegis.sh" initialize
  verify_feature035_disabled
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
! docker inspect -f '{{json .Config.Env}}' titus-meeting-processor | grep -Eq '(MSGRAPH|PHASE|TEAMS_|SECURITY_SERVICE_TOKEN|HERMES_API_KEY)'
docker exec titus-meeting-processor /titus-meeting-processor health --health /data/health.json --max-age 10m
printf 'service=titus-meeting-processor status=healthy ports=none\n'
REMOTE
}

verify_content_disabled() {
  verify
  "${ssh_cmd[@]}" sudo bash -s -- "$content_marker" <<'REMOTE'
set -euo pipefail
marker=$1
test ! -e "$marker" && test ! -L "$marker"
jq -e 'keys == [
  "MSGRAPH_CLIENT_ID", "MSGRAPH_CLIENT_SECRET", "MSGRAPH_INITIAL_LOOKBACK_HOURS",
  "MSGRAPH_ORGANIZER_USER_IDS", "MSGRAPH_POLL_INTERVAL_SECONDS", "MSGRAPH_TENANT_ID"
]' /run/titus-meeting-processor/runtime.json >/dev/null
for attempt in $(seq 1 60); do
  status=$(docker exec titus-meeting-processor /titus-meeting-processor content-status --health /data/health.json 2>/dev/null || true)
  case "$status" in
    titus_meeting_content_enabled=false\ *) break ;;
  esac
  test "$attempt" -lt 60 || { printf '%s\n' "$status" >&2; exit 1; }
  sleep 2
done
printf 'service=titus-meeting-processor content=disabled metadata=active\n'
REMOTE
}

verify_feature035_disabled() {
  if "${ssh_cmd[@]}" sudo systemctl is-active --quiet titus-meeting-processor.service; then
    if "${ssh_cmd[@]}" sudo test -e "$content_marker"; then verify_content; else verify_content_disabled; fi
  else
    verify_disabled
  fi
  "${ssh_cmd[@]}" sudo bash -s -- "$brief_marker" "$filing_marker" <<'REMOTE'
set -euo pipefail
brief_marker=$1
filing_marker=$2
test ! -e "$brief_marker" && test ! -L "$brief_marker"
test ! -e "$filing_marker" && test ! -L "$filing_marker"
test "$(systemctl is-active titus-meeting-analyzer.service 2>/dev/null || true)" != active
test "$(systemctl is-active titus-meeting-filer.service 2>/dev/null || true)" != active
test -z "$(docker ps --filter name=^/hermes-titus-meeting-analyzer$ --filter name=^/titus-meeting-filer$ --format '{{.Names}}')"
if systemctl is-active --quiet titus-meeting-processor.service; then
  jq -e '(has("MEETING_BRIEF_ENABLED") | not) and (has("MEETING_FILING_ENABLED") | not)' /run/titus-meeting-processor/runtime.json >/dev/null
fi
systemctl is-active --quiet hermes-titus.service
systemctl is-active --quiet hermes-email-intake@titus.service
jq -e '
  (has("MEETING_REVIEW_ENABLED") | not) and
  (has("MEETING_REVIEW_BASE_URL") | not) and
  (has("MEETING_REVIEW_BEARER") | not) and
  (has("MEETING_REVIEW_SIGNING_SECRET") | not)
' /run/hermes-email-intake/titus/runtime.json >/dev/null
printf 'feature=035 status=disabled markers=absent private_services=stopped unrelated_titus=healthy\n'
REMOTE
}

enable_content() {
  "${ssh_cmd[@]}" sudo bash -s -- "$content_marker" <<'REMOTE'
set -euo pipefail
marker=$1
systemctl is-active --quiet titus-meeting-processor.service
test ! -e "$marker" && test ! -L "$marker"
install -d -o root -g root -m 0755 "$(dirname "$marker")"
next=$marker.next
test ! -e "$next" && test ! -L "$next"
install -o root -g root -m 0444 /dev/null "$next"
mv -Tf "$next" "$marker"
if ! /opt/titus-meeting-processor/bin/load-phase-config.sh; then
  rm -f -- "$marker"
  /opt/titus-meeting-processor/bin/load-phase-config.sh
  exit 1
fi
systemctl restart titus-meeting-processor.service
REMOTE
  if ! verify_content; then
    "${ssh_cmd[@]}" sudo rm -f -- "$content_marker"
    "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service
    verify_content_disabled
    return 1
  fi
}

verify_content() {
  verify
  "${ssh_cmd[@]}" sudo bash -s -- "$content_marker" <<'REMOTE'
set -euo pipefail
marker=$1
test -f "$marker" && test ! -L "$marker"
test "$(stat -c %u "$marker")" = 0
test "$(stat -c %a "$marker")" = 444
test "$(stat -c %s "$marker")" = 0
jq -e '
  .TRANSCRIPT_CONTENT_ENABLED == "true" and
  .SECURITYTEAM_BASE_URL == "http://overnightdesk-securityteam:4700" and
  .HERMES_BASE_URL == "http://hermes-titus:8642" and
  .TRANSCRIPT_MAX_BYTES == "1000000" and
  .SECURITYTEAM_MAX_RESPONSE_BYTES == "1250000" and
  .TITUS_MAX_OUTPUT_BYTES == "65536" and
  (.SECURITY_SERVICE_TOKEN | type == "string" and length >= 32) and
  (.HERMES_API_KEY | type == "string" and length >= 32)
' /run/titus-meeting-processor/runtime.json >/dev/null
for attempt in $(seq 1 150); do
  status=$(docker exec titus-meeting-processor /titus-meeting-processor content-status --health /data/health.json 2>/dev/null || true)
  case "$status" in
    titus_meeting_content_enabled=true\ *) break ;;
  esac
  test "$attempt" -lt 150 || { printf '%s\n' "$status" >&2; exit 1; }
  sleep 2
done
printf 'service=titus-meeting-processor content=enabled projection=valid\n'
REMOTE
}

disable_content() {
  "${ssh_cmd[@]}" sudo rm -f -- "$content_marker"
  "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service
  verify_content_disabled
}

restore_brief_disabled() {
  local status=0
  "${ssh_cmd[@]}" sudo rm -f -- "$brief_marker" "$filing_marker" || status=1
  "${ssh_cmd[@]}" sudo systemctl disable --now titus-meeting-filer.service titus-meeting-analyzer.service >/dev/null 2>&1 || status=1
  "${ssh_cmd[@]}" sudo /opt/titus-meeting-processor/bin/load-phase-config.sh || status=1
  "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service || status=1
  "${ssh_cmd[@]}" sudo systemctl restart hermes-email-intake@titus.service || status=1
  return "$status"
}

enable_brief() {
  if ! "${ssh_cmd[@]}" sudo bash -s -- "$brief_marker" "$analyzer_image" <<'REMOTE'
set -euo pipefail
marker=$1
analyzer_image=$2
docker image inspect "$analyzer_image" >/dev/null
test ! -e "$marker" && test ! -L "$marker"
install -o root -g root -m 0444 /dev/null "$marker.next"
mv -Tf "$marker.next" "$marker"
/opt/titus-meeting-analyzer/bin/load-phase-env.sh
/opt/titus-meeting-processor/bin/load-phase-config.sh
systemctl enable --now titus-meeting-analyzer.service
systemctl restart titus-meeting-processor.service
systemctl restart hermes-email-intake@titus.service
REMOTE
  then
    restore_brief_disabled || true
    return 1
  fi
  if ! verify_brief; then
    restore_brief_disabled || true
    return 1
  fi
}

verify_brief() {
  verify
  "${ssh_cmd[@]}" sudo bash -s -- "$brief_marker" "$analyzer_image" <<'REMOTE'
set -euo pipefail
marker=$1
analyzer_image=$2
test -f "$marker" && test ! -L "$marker" && test "$(stat -c %a "$marker")" = 444
systemctl is-active --quiet titus-meeting-analyzer.service
systemctl is-active --quiet hermes-email-intake@titus.service
test "$(docker inspect -f '{{.Config.Image}}' hermes-titus-meeting-analyzer)" = "$analyzer_image"
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' hermes-titus-meeting-analyzer)" = true
test -z "$(docker port hermes-titus-meeting-analyzer)"
! docker inspect -f '{{json .Mounts}}' hermes-titus-meeting-analyzer | grep -Eq '(hermes-titus-data|project-knowledge|sessions)'
jq -e '.MEETING_BRIEF_ENABLED == "true" and .MEETING_ANALYZER_BASE_URL == "http://hermes-titus-meeting-analyzer:8642"' /run/titus-meeting-processor/runtime.json >/dev/null
jq -e '
  .MEETING_REVIEW_ENABLED == "true" and
  .MEETING_REVIEW_BASE_URL == "http://titus-meeting-processor:8080" and
  (.MEETING_REVIEW_BEARER | type == "string" and length >= 32) and
  (.MEETING_REVIEW_SIGNING_SECRET | type == "string" and length >= 32)
' /run/hermes-email-intake/titus/runtime.json >/dev/null
docker volume inspect titus-meeting-custody-data >/dev/null
printf 'service=titus-meeting-processor meeting_briefs=enabled analyzer=isolated\n'
REMOTE
}

retention_sweep() {
  "${ssh_cmd[@]}" sudo bash -s -- "$image" <<'REMOTE'
set -euo pipefail
image=$1
test -f /run/titus-meeting-processor/runtime.json
docker run --rm --user 10003:10003 --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --volume titus-meeting-processor-data:/data --volume titus-meeting-custody-data:/custody \
  --volume /run/titus-meeting-processor/runtime.json:/run/secrets/runtime.json:ro \
  "$image" retention-sweep --config /run/secrets/runtime.json --brief-state /data/meeting-brief-state.json --custody-dir /custody
REMOTE
}

disable_brief() {
  "${ssh_cmd[@]}" sudo rm -f -- "$filing_marker" "$brief_marker"
  "${ssh_cmd[@]}" sudo systemctl disable --now titus-meeting-filer.service titus-meeting-analyzer.service >/dev/null 2>&1 || true
  "${ssh_cmd[@]}" sudo /opt/titus-meeting-processor/bin/load-phase-config.sh
  "${ssh_cmd[@]}" sudo systemctl restart titus-meeting-processor.service
  "${ssh_cmd[@]}" sudo systemctl restart hermes-email-intake@titus.service
  retention_sweep
  if "${ssh_cmd[@]}" sudo test -e "$content_marker"; then verify_content; else verify_content_disabled; fi
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
  if "${ssh_cmd[@]}" sudo test -e "$brief_marker"; then verify_brief; elif "${ssh_cmd[@]}" sudo test -e "$content_marker"; then verify_content; else verify_content_disabled; fi
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
  retention_sweep
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
  install-feature-035-disabled) install_feature035_disabled ;;
  initialize) initialize ;;
  enable) enable ;;
  verify) verify ;;
  verify-disabled) verify_disabled ;;
  verify-content-disabled) verify_content_disabled ;;
  verify-feature-035-disabled) verify_feature035_disabled ;;
  enable-content) enable_content ;;
  verify-content) verify_content ;;
  enable-brief) enable_brief ;;
  verify-brief) verify_brief ;;
  disable-brief) disable_brief ;;
  retention-sweep) retention_sweep ;;
  restart-verify) restart_verify ;;
  disable-content) disable_content ;;
  status) status ;;
  disable) disable ;;
  rollback) rollback ;;
  *) usage ;;
esac
