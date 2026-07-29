#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
tenant_root="$repo_root/tenants/hermes-titus"
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")
oidc_client_file=${TITUS_DASHBOARD_OIDC_CLIENT_FILE:-}

usage() {
  printf 'usage: %s {prepare|install|install-disabled|verify|verify-private|verify-restart-persistence|enable-route|disable-route|status|restart|email-read-only|email-guarded|stop|rollback|obsidian-install-disabled|obsidian-migrate|obsidian-initialize|obsidian-activate|obsidian-status|obsidian-rollback}\n' "$0" >&2
  exit 2
}

stage_oidc_client() {
  test -n "$oidc_client_file" || {
    printf 'TITUS_DASHBOARD_OIDC_CLIENT_FILE is required\n' >&2
    exit 1
  }
  test -f "$oidc_client_file" && test ! -L "$oidc_client_file" || {
    printf 'Titus dashboard OIDC client file is unavailable\n' >&2
    exit 1
  }
  case $(stat -c %a "$oidc_client_file") in
    400|600) ;;
    *)
      printf 'Titus dashboard OIDC client file mode is invalid\n' >&2
      exit 1
      ;;
  esac
  local client_id
  client_id=$(<"$oidc_client_file")
  test "${#client_id}" -ge 20 && test "${#client_id}" -le 128
  printf '%s' "$client_id" | grep -Eq '^[A-Za-z0-9_-]+$'
  rsync -az -e "ssh -i $ssh_key" \
    "$oidc_client_file" "$remote:/tmp/hermes-titus-dashboard-oidc-client-id"
  "${ssh_cmd[@]}" '
    set -eu
    staged=/tmp/hermes-titus-dashboard-oidc-client-id
    test -f "$staged" && test ! -L "$staged"
    size=$(stat -c %s "$staged")
    test "$size" -ge 20 && test "$size" -le 128
    grep -Eq "^[A-Za-z0-9_-]+$" "$staged"
    sudo install -d -o root -g root -m 0700 /opt/hermes-titus/secrets
    sudo install -o root -g root -m 0400 "$staged" \
      /opt/hermes-titus/secrets/dashboard-oidc-client-id
    rm -f "$staged"
  '
}

prepare() {
  "$tenant_root/scripts/qualify.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/hermes-titus-deploy'
  rsync -az --delete -e "ssh -i $ssh_key" "$tenant_root/" "$remote:/tmp/hermes-titus-deploy/"
  rsync -az -e "ssh -i $ssh_key" \
    "$repo_root/infra/nginx/titus-hermes.conf" \
    "$repo_root/infra/nginx/titus-hermes-http.conf" \
    "$remote:/tmp/hermes-titus-deploy/"
  "${ssh_cmd[@]}" '
    set -eu
    sudo install -d -o root -g root -m 0755 /opt/hermes-titus/source /opt/hermes-titus/bin
    sudo cp -a /tmp/hermes-titus-deploy/. /opt/hermes-titus/source/
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/load-phase-env.sh /opt/hermes-titus/bin/load-phase-env.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/load-obsidian-sync-env.sh /opt/hermes-titus/bin/load-obsidian-sync-env.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/initialize-obsidian-sync.sh /opt/hermes-titus/bin/initialize-obsidian-sync.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/prepare-obsidian-sync.sh /opt/hermes-titus/bin/prepare-obsidian-sync.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/run-obsidian-sync.sh /opt/hermes-titus/bin/run-obsidian-sync.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/stop-obsidian-sync.sh /opt/hermes-titus/bin/stop-obsidian-sync.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/prepare-volume.sh /opt/hermes-titus/bin/prepare-volume.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/run-container.sh /opt/hermes-titus/bin/run-container.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/stop-container.sh /opt/hermes-titus/bin/stop-container.sh
    sudo install -o root -g root -m 0644 /opt/hermes-titus/source/runtime/hermes-titus.service /etc/systemd/system/hermes-titus.service
    sudo install -o root -g root -m 0644 /opt/hermes-titus/source/runtime/obsidian-sync-titus.service /etc/systemd/system/obsidian-sync-titus.service
    sudo find /opt/hermes-titus/source -type d -exec chmod go-w {} +
    sudo find /opt/hermes-titus/source -type f -exec chmod go-w {} +
    find /tmp/hermes-titus-deploy -mindepth 1 -delete
    rmdir /tmp/hermes-titus-deploy
  '
}

obsidian_install_disabled() {
  prepare
  "${ssh_cmd[@]}" '
    set -eu
    marker=/opt/hermes-titus/obsidian-project-knowledge-enabled
    test ! -e "$marker" && test ! -L "$marker" || {
      echo "refusing disabled installation over an activated vault" >&2
      exit 1
    }
    sudo docker build \
      --tag overnightdesk/obsidian-sync-titus:0.0.13 \
      /opt/hermes-titus/source/obsidian-sync
    installed_version=$(sudo docker run --rm \
      --user 10000:10000 \
      --read-only \
      --network none \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --entrypoint ob \
      overnightdesk/obsidian-sync-titus:0.0.13 \
      --version 2>/dev/null)
    test "$installed_version" = 0.0.13
    sudo /opt/hermes-titus/bin/prepare-obsidian-sync.sh prepare
    sudo systemctl daemon-reload
    sudo systemctl disable --now obsidian-sync-titus.service
    test "$(sudo systemctl is-enabled obsidian-sync-titus.service 2>/dev/null || true)" = disabled
    test "$(sudo systemctl is-active obsidian-sync-titus.service 2>/dev/null || true)" = inactive
    sudo docker volume inspect titus-project-knowledge-data >/dev/null
    sudo docker volume inspect titus-obsidian-sync-state >/dev/null
    titus_was_active=false
    if sudo systemctl is-active --quiet hermes-titus.service; then
      titus_was_active=true
      sudo systemctl stop hermes-titus.service
    fi
    restore_titus() {
      if test "$titus_was_active" = true; then sudo systemctl start hermes-titus.service; fi
    }
    trap restore_titus EXIT
    sudo /opt/hermes-titus/bin/prepare-volume.sh
    if test "$titus_was_active" = true; then
      sudo systemctl start hermes-titus.service
      for i in $(seq 1 60); do
        titus_state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" hermes-titus 2>/dev/null || true)
        test "$titus_state" = healthy && break
        test "$i" -lt 60 || exit 1
        sleep 2
      done
      sudo docker exec hermes-titus \
        test -f /opt/data/skills/titus-project-knowledge/SKILL.md
      sudo docker exec hermes-titus \
        grep -Fq "titus-project-knowledge" /opt/data/SOUL.md
      titus_was_active=false
    fi
    echo "obsidian_sync=installed_disabled"
    echo "titus_project_knowledge_skill=installed"
  '
}

obsidian_migrate() {
  "${ssh_cmd[@]}" '
    set -eu
    test "$(sudo systemctl is-enabled obsidian-sync-titus.service 2>/dev/null || true)" = disabled
    sidecar_state=$(sudo systemctl is-active obsidian-sync-titus.service 2>/dev/null || true)
    test "$sidecar_state" = inactive
    titus_was_active=false
    if sudo systemctl is-active --quiet hermes-titus.service; then
      titus_was_active=true
      sudo systemctl stop hermes-titus.service
    fi
    restore_titus() {
      if test "$titus_was_active" = true; then sudo systemctl start hermes-titus.service; fi
    }
    trap restore_titus EXIT
    sudo /opt/hermes-titus/bin/prepare-obsidian-sync.sh migrate
    if test "$titus_was_active" = true; then
      sudo systemctl start hermes-titus.service
      for i in $(seq 1 60); do
        titus_state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" hermes-titus 2>/dev/null || true)
        test "$titus_state" = healthy && break
        test "$i" -lt 60 || exit 1
        sleep 2
      done
      titus_was_active=false
    fi
    test ! -e /opt/hermes-titus/obsidian-project-knowledge-enabled &&
      test ! -L /opt/hermes-titus/obsidian-project-knowledge-enabled
    echo "obsidian_sync_migration=verified_source_retained"
  '
}

obsidian_initialize() {
  test "${TITUS_OBSIDIAN_INITIALIZE_CONFIRM:-}" = INITIALIZE_TITUS_OBSIDIAN_SYNC || {
    printf 'TITUS_OBSIDIAN_INITIALIZE_CONFIRM must equal INITIALIZE_TITUS_OBSIDIAN_SYNC\n' >&2
    return 1
  }
  ssh -t -i "$ssh_key" "$remote" '
    set -eu
    cleanup_runtime() {
      sudo rm -f /run/obsidian-sync-titus/runtime.env
    }
    trap cleanup_runtime EXIT
    sudo /opt/hermes-titus/bin/load-obsidian-sync-env.sh
    sudo /opt/hermes-titus/bin/initialize-obsidian-sync.sh
  '
}

obsidian_activate() {
  test "${TITUS_OBSIDIAN_ACTIVATION_CONFIRM:-}" = ACTIVATE_TITUS_OBSIDIAN_SYNC || {
    printf 'TITUS_OBSIDIAN_ACTIVATION_CONFIRM must equal ACTIVATE_TITUS_OBSIDIAN_SYNC\n' >&2
    return 1
  }
  "${ssh_cmd[@]}" '
    set -eu
    marker=/opt/hermes-titus/obsidian-project-knowledge-enabled
    restore_gate=/var/lib/overnightdesk/titus-obsidian-migration/backup-restore-qualified
    test ! -e "$marker" && test ! -L "$marker"
    sudo test -f "$restore_gate" && ! sudo test -L "$restore_gate"
    test "$(sudo stat -c %a "$restore_gate")" = 400
    test "$(sudo stat -c %u "$restore_gate")" = 0
    sudo grep -Fq "/var/lib/docker/volumes/titus-project-knowledge-data/_data" \
      /etc/overnightdesk/recovery/backup-producer.json
    sudo grep -Fq "quiesce-titus-obsidian-sync.sh stop-if-active" \
      /etc/systemd/system/aegis-backup-producer.service
    ! sudo grep -Fq "titus-obsidian-sync-state" \
      /etc/overnightdesk/recovery/backup-producer.json
    sudo systemctl stop obsidian-sync-titus.service
    sudo systemctl stop hermes-titus.service
    rollback_activation() {
      sudo systemctl disable --now obsidian-sync-titus.service >/dev/null 2>&1 || true
      if sudo test -f "$marker" && ! sudo test -L "$marker"; then sudo rm -f "$marker"; fi
      sudo systemctl start hermes-titus.service >/dev/null 2>&1 || true
    }
    trap rollback_activation EXIT
    sudo /opt/hermes-titus/bin/prepare-obsidian-sync.sh verify
    sudo docker run --rm \
      --user 10000:10000 \
      --read-only \
      --network none \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --env OBSIDIAN_HEALTH_REQUIRE_LOCK=false \
      --volume titus-project-knowledge-data:/vault:ro \
      --volume titus-obsidian-sync-state:/state:ro \
      --entrypoint /usr/local/bin/healthcheck \
      overnightdesk/obsidian-sync-titus:0.0.13
    sudo install -o root -g root -m 0400 /dev/null "$marker"
    sudo systemctl start hermes-titus.service
    sudo systemctl enable --now obsidian-sync-titus.service
    for i in $(seq 1 60); do
      titus_state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" hermes-titus 2>/dev/null || true)
      sync_state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" obsidian-sync-titus 2>/dev/null || true)
      test "$titus_state" = healthy && test "$sync_state" = healthy && break
      test "$i" -lt 60 || exit 1
      sleep 2
    done
    sudo docker inspect -f "{{range .Mounts}}{{println .Name .Destination}}{{end}}" hermes-titus |
      grep -Fq "titus-project-knowledge-data /opt/data/project-briefs"
    sudo docker inspect -f "{{range .Mounts}}{{println .Name .Destination}}{{end}}" obsidian-sync-titus |
      grep -Fq "titus-obsidian-sync-state /state"
    test -z "$(sudo docker port obsidian-sync-titus)"
    test "$(sudo docker inspect -f "{{.Config.User}}" obsidian-sync-titus)" = "10000:10000"
    test "$(sudo docker inspect -f "{{.HostConfig.ReadonlyRootfs}}" obsidian-sync-titus)" = true
    test "$(sudo docker inspect -f "{{.HostConfig.NetworkMode}}" obsidian-sync-titus)" = bridge
    test "$(sudo docker inspect -f "{{.HostConfig.LogConfig.Type}}" obsidian-sync-titus)" = none
    test "$(sudo docker inspect -f "{{.HostConfig.NanoCpus}}" obsidian-sync-titus)" = 500000000
    test "$(sudo docker inspect -f "{{.HostConfig.Memory}}" obsidian-sync-titus)" = 536870912
    test "$(sudo docker inspect -f "{{.HostConfig.PidsLimit}}" obsidian-sync-titus)" = 128
    sudo docker inspect -f "{{json .HostConfig.CapDrop}}" obsidian-sync-titus |
      grep -Eq "^\[[\"]ALL[\"]\]$"
    sudo docker inspect -f "{{json .HostConfig.SecurityOpt}}" obsidian-sync-titus |
      grep -Fq "no-new-privileges"
    test "$(sudo docker inspect -f "{{len .Mounts}}" obsidian-sync-titus)" = 3
    ! sudo docker inspect -f "{{range .Mounts}}{{println .Source .Destination}}{{end}}" obsidian-sync-titus |
      grep -Eq "docker[.]sock|hermes-titus-data"
    ! sudo docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" obsidian-sync-titus |
      grep -Eq "^OBSIDIAN_AUTH_TOKEN="
    ! sudo docker inspect -f "{{range .Mounts}}{{println .Name .Destination}}{{end}}" hermes-titus |
      grep -Fq "titus-obsidian-sync-state /state"
    trap - EXIT
    echo "obsidian_sync=healthy_active"
    echo "obsidian_sync_isolation=verified"
    echo "titus_project_knowledge=dedicated_volume"
  '
}

obsidian_status() {
  "${ssh_cmd[@]}" '
    set -eu
    enabled=$(sudo systemctl is-enabled obsidian-sync-titus.service 2>/dev/null || true)
    active=$(sudo systemctl is-active obsidian-sync-titus.service 2>/dev/null || true)
    health=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" obsidian-sync-titus 2>/dev/null || echo absent)
    restart_count=$(sudo systemctl show --property=NRestarts --value obsidian-sync-titus.service 2>/dev/null || echo unknown)
    installed_version=$(sudo docker run --rm \
      --user 10000:10000 \
      --read-only \
      --network none \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --entrypoint ob \
      overnightdesk/obsidian-sync-titus:0.0.13 \
      --version 2>/dev/null)
    test "$installed_version" = 0.0.13
    recent_activity=stale_or_absent
    marker=absent
    marker_path=/opt/hermes-titus/obsidian-project-knowledge-enabled
    if sudo test -e "$marker_path" || sudo test -L "$marker_path"; then
      marker=invalid
      if sudo test -f "$marker_path" &&
         ! sudo test -L "$marker_path" &&
         test "$(sudo stat -c %a "$marker_path")" = 400 &&
         test "$(sudo stat -c %u "$marker_path")" = 0; then
        marker=present
      fi
    fi
    backup_coverage=invalid
    if sudo grep -Fq "/var/lib/docker/volumes/titus-project-knowledge-data/_data" \
         /etc/overnightdesk/recovery/backup-producer.json 2>/dev/null &&
       ! sudo grep -Fq "titus-obsidian-sync-state" \
         /etc/overnightdesk/recovery/backup-producer.json 2>/dev/null &&
       sudo grep -Fq "quiesce-titus-obsidian-sync.sh stop-if-active" \
         /etc/systemd/system/aegis-backup-producer.service 2>/dev/null; then
      backup_coverage=verified
    fi
    sudo docker volume inspect titus-project-knowledge-data >/dev/null
    sudo docker volume inspect titus-obsidian-sync-state >/dev/null
    if sudo docker run --rm \
      --user 10000:10000 \
      --read-only \
      --network none \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --volume titus-obsidian-sync-state:/state:ro \
      --entrypoint /bin/sh \
      overnightdesk/obsidian-sync-titus:0.0.13 \
      -c "find /state -type f -name sync.log -mmin -15 -print -quit | grep -q ." \
      >/dev/null 2>&1; then
      recent_activity=recent
    fi
    printf "obsidian_headless_version=%s\n" "$installed_version"
    printf "obsidian_sync_enabled=%s\n" "$enabled"
    printf "obsidian_sync_active=%s\n" "$active"
    printf "obsidian_sync_health=%s\n" "$health"
    printf "obsidian_sync_restarts=%s\n" "$restart_count"
    printf "obsidian_sync_activity=%s\n" "$recent_activity"
    printf "titus_knowledge_marker=%s\n" "$marker"
    printf "knowledge_backup_coverage=%s\n" "$backup_coverage"
    echo "knowledge_volume=present"
    echo "sync_state_volume=present_excluded_from_backup"
  '
}

obsidian_rollback() {
  test "${TITUS_OBSIDIAN_ROLLBACK_CONFIRM:-}" = ROLLBACK_TITUS_OBSIDIAN_SYNC || {
    printf 'TITUS_OBSIDIAN_ROLLBACK_CONFIRM must equal ROLLBACK_TITUS_OBSIDIAN_SYNC\n' >&2
    return 1
  }
  "${ssh_cmd[@]}" '
    set -eu
    marker=/opt/hermes-titus/obsidian-project-knowledge-enabled
    sudo systemctl disable --now obsidian-sync-titus.service
    if sudo test -e "$marker" || sudo test -L "$marker"; then
      sudo test -f "$marker" && ! sudo test -L "$marker"
      test "$(sudo stat -c %a "$marker")" = 400
      test "$(sudo stat -c %u "$marker")" = 0
      sudo rm -f "$marker"
    fi
    sudo systemctl restart hermes-titus.service
    sudo systemctl is-active --quiet hermes-titus.service
    ! sudo docker inspect -f "{{range .Mounts}}{{println .Name .Destination}}{{end}}" hermes-titus |
      grep -Fq "titus-project-knowledge-data /opt/data/project-briefs"
    sudo docker volume inspect titus-project-knowledge-data >/dev/null
    sudo docker volume inspect titus-obsidian-sync-state >/dev/null
    echo "obsidian_sync=rolled_back_disabled"
    echo "retained_volumes=verified"
  '
}

install_disabled() {
  prepare
  stage_oidc_client
  "${ssh_cmd[@]}" '
    set -eu
    test ! -e /opt/overnightdesk/nginx/conf.d/titus-dashboard.conf
    sudo systemctl stop hermes-titus.service
    sudo rm -f /opt/hermes-titus/rollback-loopback-dashboard
    sudo /opt/hermes-titus/bin/prepare-volume.sh
    sudo systemctl start hermes-titus.service
  '
  verify_private
}

verify_private() {
  "${ssh_cmd[@]}" '
    set -eu
    sudo systemctl is-active --quiet hermes-titus.service
    for i in $(seq 1 60); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" hermes-titus 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 60 || { sudo docker logs --tail 80 hermes-titus 2>&1; exit 1; }
      sleep 2
    done
    test -z "$(sudo docker port hermes-titus)"
    sudo docker volume inspect hermes-titus-data >/dev/null
    sudo docker inspect -f "{{json .NetworkSettings.Networks}}" hermes-titus | grep -q overnightdesk_overnightdesk
    sudo docker exec -i hermes-titus /opt/hermes/.venv/bin/python - <<"PY"
import json
import urllib.request
from pathlib import Path
import yaml

with urllib.request.urlopen("http://127.0.0.1:9119/api/status", timeout=5) as response:
    status = json.loads(response.read())
assert status.get("auth_required") is True
assert "self-hosted" in status.get("auth_providers", [])
config = yaml.safe_load(Path("/opt/data/config.yaml").read_text())
pid1_env = {}
for entry in Path("/proc/1/environ").read_bytes().split(b"\0"):
    if b"=" in entry:
        key, value = entry.split(b"=", 1)
        pid1_env[key.decode()] = value.decode()
assert config["dashboard"]["public_url"] == "https://titus-dashboard.overnightdesk.com"
assert config["dashboard"]["oauth"]["provider"] == "self-hosted"
assert config["dashboard"]["oauth"]["self_hosted"]["issuer"] == "https://www.overnightdesk.com/api/auth"
assert config["dashboard"]["oauth"]["self_hosted"]["client_id"] == pid1_env["TITUS_DASHBOARD_OIDC_CLIENT_ID"]
assert config["dashboard"]["oauth"]["self_hosted"]["scopes"] == "openid profile email"
PY
    sudo docker exec overnightdesk-nginx wget -qO- http://hermes-titus:9119/api/status >/dev/null
    test ! -e /opt/overnightdesk/nginx/conf.d/titus-dashboard.conf
    echo "titus_dashboard=healthy_private_disabled"
    echo "published_ports=none"
  '
}

verify_restart_persistence() {
  "${ssh_cmd[@]}" '
    set -eu
    before=$(sudo docker volume inspect -f "{{.Name}}" hermes-titus-data)
    sudo systemctl restart hermes-titus.service
    test "$before" = "$(sudo docker volume inspect -f "{{.Name}}" hermes-titus-data)"
  '
  verify_private
}

require_route_confirmation() {
  test "${TITUS_DASHBOARD_ROUTE_CONFIRM:-}" = ENABLE_TITUS_DASHBOARD_ROUTE || {
    printf 'TITUS_DASHBOARD_ROUTE_CONFIRM must equal ENABLE_TITUS_DASHBOARD_ROUTE\n' >&2
    exit 1
  }
}

enable_route() {
  require_route_confirmation
  verify_private
  "${ssh_cmd[@]}" '
    set -eu
    conf_dir=/opt/overnightdesk/nginx/conf.d
    source=/opt/hermes-titus/source
    sudo install -o root -g root -m 0644 "$source/titus-hermes-http.conf" "$conf_dir/titus-dashboard.conf"
    sudo docker exec overnightdesk-nginx nginx -t
    sudo docker exec overnightdesk-nginx nginx -s reload
    if ! sudo test -f /opt/overnightdesk/certbot/conf/live/titus-dashboard.overnightdesk.com/fullchain.pem; then
      cd /opt/overnightdesk
      sudo docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
        -d titus-dashboard.overnightdesk.com --non-interactive --agree-tos
    fi
    sudo install -o root -g root -m 0644 "$source/titus-hermes.conf" "$conf_dir/titus-dashboard.conf"
    sudo docker exec overnightdesk-nginx nginx -t
    sudo docker exec overnightdesk-nginx nginx -s reload
    echo "titus_dashboard_route=enabled"
  '
}

disable_route() {
  "${ssh_cmd[@]}" '
    set -eu
    conf=/opt/overnightdesk/nginx/conf.d/titus-dashboard.conf
    disabled=/opt/hermes-titus/disabled
    sudo install -d -o root -g root -m 0750 "$disabled"
    if sudo test -f "$conf"; then
      stamp=$(date -u +%Y%m%dT%H%M%SZ)
      sudo mv "$conf" "$disabled/titus-dashboard.conf.$stamp.disabled"
      sudo docker exec overnightdesk-nginx nginx -t
      sudo docker exec overnightdesk-nginx nginx -s reload
    fi
    echo "titus_dashboard_route=disabled"
  '
}

install_runtime() {
  prepare
  "${ssh_cmd[@]}" '
    set -eu
    if ! getent group hermes-titus >/dev/null; then sudo groupadd --system hermes-titus; fi
    if ! id hermes-titus >/dev/null 2>&1; then sudo useradd --system --gid hermes-titus --home-dir /nonexistent --shell /usr/sbin/nologin hermes-titus; fi
    sudo usermod -aG docker hermes-titus
    sudo systemctl daemon-reload
    sudo systemctl enable --now hermes-titus.service
  '
  verify
}

verify() {
  "${ssh_cmd[@]}" '
    set -eu
    sudo systemctl is-active --quiet hermes-titus.service
    for i in $(seq 1 60); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" hermes-titus 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 60 || { sudo docker logs --tail 80 hermes-titus 2>&1; exit 1; }
      sleep 2
    done
    test -z "$(sudo docker port hermes-titus)"
    test "$(sudo docker inspect -f "{{.Config.User}}" hermes-titus)" = 10000:10000
    test "$(sudo docker inspect -f "{{.HostConfig.ReadonlyRootfs}}" hermes-titus)" = true
    sudo docker inspect -f "{{json .HostConfig.CapDrop}}" hermes-titus | grep -q ALL
    sudo docker inspect -f "{{json .HostConfig.SecurityOpt}}" hermes-titus | grep -q no-new-privileges
    sudo docker inspect -f "{{json .NetworkSettings.Networks}}" hermes-titus | grep -q overnightdesk_overnightdesk
    ! sudo docker inspect -f "{{json .Config.Env}}" hermes-titus | grep -Eq "(OPENROUTER_API_KEY|AGENTMAIL_API_KEY|SECURITY_SERVICE_TOKEN|CONTROL_TOWER_TOKEN|TEAMS_CLIENT_SECRET|MATRIX_ACCESS_TOKEN|MATRIX_RECOVERY_KEY)"
    sudo docker volume inspect hermes-titus-data >/dev/null
    for route in titus walter mitchel; do
      sudo systemctl is-active --quiet "hermes-email-intake@$route.service"
      sudo docker volume inspect "hermes-email-intake-$route-data" >/dev/null
    done
    agent_state=$(sudo systemctl is-active "hermes-email-intake@agent.service" 2>/dev/null || true)
    test "$agent_state" = inactive
    sudo docker volume inspect hermes-email-intake-agent-data >/dev/null
    guarded_email_expect=guarded
    guarded_email_marker=/opt/hermes-titus/guarded-email-read-only
    if sudo test -e "$guarded_email_marker" || sudo test -L "$guarded_email_marker"; then
      sudo test -f "$guarded_email_marker" && ! sudo test -L "$guarded_email_marker"
      test "$(sudo stat -c %a "$guarded_email_marker")" = 400
      test "$(sudo stat -c %u "$guarded_email_marker")" = 0
      guarded_email_expect=read_only
    fi
    sudo docker exec --env TITUS_GUARDED_EMAIL_EXPECT="$guarded_email_expect" hermes-titus /usr/bin/bash -lc '\''
      set -euo pipefail
      set -a
      . /run/secrets/hermes-titus-runtime
      set +a
      /opt/hermes/.venv/bin/python - <<"PY"
import json
import os
from pathlib import Path
import time
from urllib.parse import quote
import urllib.request
import yaml

def get(url, token=None):
    request = urllib.request.Request(url)
    if token:
        request.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())

memory_health = get("http://127.0.0.1:8420/health")
assert memory_health.get("stores", {}).get("vectorStore") is True, "memory vector store unavailable"
get("http://127.0.0.1:9119/api/status")
session_response = get("http://control-tower:8080/v1/session", os.environ["CONTROL_TOWER_TOKEN"])
session = session_response.get("data") or session_response
print("control_tower_agent=" + str(session.get("agentId", "unknown")))
print("control_tower_workspace=" + str(session.get("workspaceId", "unknown")))
print("control_tower_profile=" + str(session.get("capabilityProfileId", "unknown")))

inboxes = get("https://api.agentmail.to/v0/inboxes?limit=100", os.environ["AGENTMAIL_API_KEY"])
items = inboxes.get("inboxes") or []
matches = [i for i in items if "titus" in (str(i.get("display_name", "")) + " " + str(i.get("inbox_id", ""))).lower()]
print("agentmail_inbox_count=" + str(len(items)))
print("agentmail_titus_inbox=" + ("present" if matches else "not_identified"))

matrix_state = os.environ.get("TITUS_MATRIX_STATE", "disabled")
config = yaml.safe_load(Path("/opt/data/config.yaml").read_text()) or {}
auth_file = Path("/opt/data/auth.json")
assert auth_file.is_file() and not auth_file.is_symlink(), "Titus auth file unavailable"
auth_stat = auth_file.stat()
assert auth_stat.st_mode & 0o777 == 0o600, "unexpected Titus auth file mode"
assert auth_stat.st_uid == 10000, "unexpected Titus auth file owner"
assert auth_stat.st_gid == 10000, "unexpected Titus auth file group"
auth = json.loads(auth_file.read_text())
assert auth.get("active_provider") == "openai-codex", "unexpected Titus active auth provider"
credentials = (auth.get("credential_pool") or {}).get("openai-codex") or []
assert len(credentials) == 1, "unexpected Titus Codex credential count"
credential = credentials[0]
assert credential.get("auth_type") == "oauth", "unexpected Titus Codex auth type"
assert str(credential.get("source", "")).endswith("device_code"), "unexpected Titus Codex auth source"
assert credential.get("access_token"), "missing Titus Codex access token"
assert credential.get("refresh_token"), "missing Titus Codex refresh token"
guarded_email_expected = os.environ["TITUS_GUARDED_EMAIL_EXPECT"]
guarded_email_configured = "guarded_agentmail" in (config.get("mcp_servers") or {})
assert guarded_email_configured == (guarded_email_expected == "guarded"), "unexpected guarded email mode"
if guarded_email_configured:
    guarded_email = config["mcp_servers"]["guarded_agentmail"]
    assert guarded_email["command"] == "/opt/hermes/.venv/bin/python", "unexpected guarded MCP command"
    assert guarded_email["args"] == ["/opt/data/mcp-servers/guarded-agentmail/server.py"], "unexpected guarded MCP arguments"
    assert guarded_email["elicitation"]["enabled"] is True, "owner elicitation disabled"
    assert guarded_email["timeout"] >= guarded_email["elicitation"]["timeout"] + 45, "guarded MCP timeout too short"
print("guarded_email_mode=" + guarded_email_expected)
pid1_env = {}
for entry in Path("/proc/1/environ").read_bytes().split(b"\0"):
    if b"=" in entry:
        key, value = entry.split(b"=", 1)
        pid1_env[key.decode()] = value.decode()
assert pid1_env.get("HERMES_INFERENCE_MODEL") == "gpt-5.6-sol", "unexpected effective Titus model"
assert (config.get("model") or {}).get("provider") == "openai-codex", "unexpected Titus model provider"
assert (config.get("model") or {}).get("base_url") == "https://chatgpt.com/backend-api/codex", "unexpected Titus model base URL"
assert (config.get("model") or {}).get("default") == "gpt-5.6-sol", "unexpected Titus configured model"
assert (config.get("agent") or {}).get("reasoning_effort") == "medium", "unexpected Titus reasoning effort"
delegation = config.get("delegation") or {}
assert delegation.get("provider") == "openai-codex", "unexpected Titus delegation provider"
assert delegation.get("base_url") == "https://chatgpt.com/backend-api/codex", "unexpected Titus delegation base URL"
assert delegation.get("model") == "gpt-5.6-luna", "unexpected Titus delegation model"
assert delegation.get("reasoning_effort") == "high", "unexpected Titus delegation reasoning effort"
assert delegation.get("orchestrator_enabled") is True, "Titus delegation orchestrator disabled"
assert delegation.get("max_concurrent_children") == 3, "unexpected Titus child concurrency"
assert delegation.get("max_iterations") == 30, "unexpected Titus delegation iteration bound"
assert delegation.get("max_spawn_depth") == 1, "unexpected Titus delegation depth"
assert delegation.get("child_timeout_seconds") == 600, "unexpected Titus child timeout"
assert delegation.get("inherit_mcp_toolsets") is True, "Titus delegation toolsets not inherited"
assert delegation.get("subagent_auto_approve") is False, "Titus subagent auto approval enabled"
assert pid1_env.get("TDAI_LLM_MODEL") == "xiaomi/mimo-v2.5-pro", "unexpected memory LLM model"
assert pid1_env.get("TDAI_LLM_BASE_URL") == "https://openrouter.ai/api/v1", "unexpected memory LLM base URL"
print("provider=openai-codex")
print("auth_mode=chatgpt")
print("effective_model_route=gpt-5.6-sol")
print("reasoning_effort=medium")
print("delegation_route=gpt-5.6-luna")
print("delegation_reasoning_effort=high")
print("memory_llm_route=xiaomi/mimo-v2.5-pro")
embedding_enabled = os.environ.get("MEMORY_TENCENTDB_EMBEDDING_ENABLED") == "true"
assert memory_health.get("stores", {}).get("embeddingService") is embedding_enabled, "unexpected memory embedding health"
assert os.environ.get("MEMORY_TENCENTDB_EMBEDDING_MODEL") == "perplexity/pplx-embed-v1-4b", "unexpected memory embedding model"
assert os.environ.get("MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS") == "1536", "unexpected memory embedding dimensions"
assert (pid1_env.get("TDAI_GATEWAY_CONFIG") == "/opt/data/config/tdai-gateway.yaml") == embedding_enabled, "unexpected memory gateway config state"
print("memory_embedding=" + ("perplexity/pplx-embed-v1-4b" if embedding_enabled else "disabled"))
print("memory_embedding_dimensions=1536")
matrix_config = (config.get("platforms") or {}).get("matrix") or {}
assert bool(matrix_config.get("enabled")) == (matrix_state == "ready")
if matrix_state == "ready":
    homeserver = os.environ["MATRIX_HOMESERVER"].rstrip("/")
    access_token = os.environ["MATRIX_ACCESS_TOKEN"]
    room_id = os.environ["MATRIX_ALLOWED_ROOMS"]
    expected_device_id = os.environ["MATRIX_DEVICE_ID"]
    assert room_id == "!LuLWlULPVgtogXtKbP:matrix.org", "unexpected Matrix room"
    assert os.environ.get("MATRIX_RECOVERY_KEY"), "Matrix recovery key unavailable"
    for attempt in range(30):
        try:
            whoami = get(homeserver + "/_matrix/client/v3/account/whoami", access_token)
            assert whoami.get("user_id") == "@hermes-titus:matrix.org", "unexpected Matrix identity"
            assert whoami.get("device_id") == expected_device_id, "unexpected Matrix device identity"
            joined = get(homeserver + "/_matrix/client/v3/joined_rooms", access_token)
            assert room_id in joined.get("joined_rooms", []), "Matrix room not joined"
            encryption = get(
                homeserver + "/_matrix/client/v3/rooms/" + quote(room_id, safe="") +
                "/state/m.room.encryption/",
                access_token,
            )
            assert encryption.get("algorithm") == "m.megolm.v1.aes-sha2", "Matrix room is not encrypted"
            assert Path("/opt/data/platforms/matrix/store").is_dir(), "Matrix crypto store unavailable"
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(2)
    print("matrix_identity=@hermes-titus:matrix.org")
    print("matrix_room=joined_encrypted")
print("matrix_state=" + matrix_state)
PY
      test -f /opt/data/skills/agentmail-email/SKILL.md
      test -f /opt/data/skills/control-tower-hermes/SKILL.md
      test -f /opt/data/mcp-servers/guarded-agentmail/guarded_email.py
      test -f /opt/data/mcp-servers/guarded-agentmail/service.py
      test -f /opt/data/mcp-servers/guarded-agentmail/server.py
      test -f /opt/data/bin/verify-mcp-registry.py
      test -d /opt/data/guarded-agentmail
      test "$(stat -c %a /opt/data/guarded-agentmail)" = 700
      test "$(stat -c %u:%g /opt/data/guarded-agentmail)" = 10000:10000
      HOME=/opt/data /opt/hermes/.venv/bin/python \
        /opt/data/bin/verify-mcp-registry.py
      printf "teams_state=%s\n" "${TITUS_TEAMS_STATE:-pending}"
    '\''
    echo "hermes_titus=healthy"
    echo "published_ports=none"
    echo "memory_tencentdb=healthy"
  '
}

status() {
  "${ssh_cmd[@]}" 'sudo systemctl --no-pager --full status hermes-titus.service | sed -n "1,24p"; sudo docker ps --filter name=^/hermes-titus$ --format "{{.Names}} {{.Status}}"'
}

stop_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl disable --now hermes-titus.service; sudo docker volume inspect hermes-titus-data >/dev/null; for route in titus walter mitchel agent; do sudo docker volume inspect "hermes-email-intake-$route-data" >/dev/null; done; echo "hermes-titus stopped; Matrix state and routed email-intake volumes preserved"'
}

restart_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl daemon-reload; sudo systemctl restart hermes-titus.service; sudo systemctl is-active --quiet hermes-titus.service; echo "hermes-titus restart requested"'
  verify
}

email_read_only() {
  "${ssh_cmd[@]}" '
    set -eu
    marker=/opt/hermes-titus/guarded-email-read-only
    sudo install -o root -g root -m 0400 /dev/null "$marker"
    sudo systemctl restart hermes-titus.service
    sudo systemctl is-active --quiet hermes-titus.service
    echo "guarded_email=read_only_restart_requested"
  '
  verify
}

email_guarded() {
  "${ssh_cmd[@]}" '
    set -eu
    marker=/opt/hermes-titus/guarded-email-read-only
    if sudo test -e "$marker" || sudo test -L "$marker"; then
      sudo test -f "$marker" && ! sudo test -L "$marker"
      test "$(sudo stat -c %a "$marker")" = 400
      test "$(sudo stat -c %u "$marker")" = 0
      sudo rm -f "$marker"
    fi
    sudo systemctl restart hermes-titus.service
    sudo systemctl is-active --quiet hermes-titus.service
    echo "guarded_email=guarded_restart_requested"
  '
  verify
}

rollback_runtime() {
  test "${TITUS_DASHBOARD_OIDC_CONFIRM:-}" = DISABLE_TITUS_DASHBOARD_OIDC || {
    printf 'TITUS_DASHBOARD_OIDC_CONFIRM must equal DISABLE_TITUS_DASHBOARD_OIDC\n' >&2
    return 1
  }
  (
    cd "$repo_root"
    npm run identity:titus:dashboard-oidc:disable
    npm run identity:titus:dashboard-oidc:verify-disabled
  )
  disable_route
  "${ssh_cmd[@]}" '
    set -eu
    sudo install -o root -g root -m 0400 /dev/null \
      /opt/hermes-titus/rollback-loopback-dashboard
    sudo systemctl stop hermes-titus.service
    sudo systemctl start hermes-titus.service
    for i in $(seq 1 60); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" hermes-titus 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 60 || { sudo docker logs --tail 80 hermes-titus 2>&1; exit 1; }
      sleep 2
    done
    sudo docker exec hermes-titus cmp -s \
      /opt/data/bin/start-all.sh /opt/data/bin/start-all.loopback.sh
    sudo docker exec hermes-titus ps -eo args | \
      grep -F "hermes dashboard --host 127.0.0.1 --port 9119 --no-open" >/dev/null
    test -z "$(sudo docker port hermes-titus)"
    test ! -e /opt/overnightdesk/nginx/conf.d/titus-dashboard.conf
    sudo docker volume inspect hermes-titus-data >/dev/null
    for route in titus walter mitchel agent; do sudo docker volume inspect "hermes-email-intake-$route-data" >/dev/null; done
    echo "titus_dashboard=healthy_loopback_rollback"
    echo "published_ports=none"
    echo "retained_state=verified"
  '
}

case "$action" in
  prepare) prepare ;;
  install) install_runtime ;;
  install-disabled) install_disabled ;;
  verify) verify ;;
  verify-private) verify_private ;;
  verify-restart-persistence) verify_restart_persistence ;;
  enable-route) enable_route ;;
  disable-route) disable_route ;;
  status) status ;;
  restart) restart_runtime ;;
  email-read-only) email_read_only ;;
  email-guarded) email_guarded ;;
  stop) stop_runtime ;;
  rollback) rollback_runtime ;;
  obsidian-install-disabled) obsidian_install_disabled ;;
  obsidian-migrate) obsidian_migrate ;;
  obsidian-initialize) obsidian_initialize ;;
  obsidian-activate) obsidian_activate ;;
  obsidian-status) obsidian_status ;;
  obsidian-rollback) obsidian_rollback ;;
  *) usage ;;
esac
