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
  printf 'usage: %s {prepare|install|install-disabled|verify|verify-private|verify-restart-persistence|enable-route|disable-route|status|restart|stop|rollback}\n' "$0" >&2
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
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/prepare-volume.sh /opt/hermes-titus/bin/prepare-volume.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/run-container.sh /opt/hermes-titus/bin/run-container.sh
    sudo install -o root -g root -m 0755 /opt/hermes-titus/source/runtime/stop-container.sh /opt/hermes-titus/bin/stop-container.sh
    sudo install -o root -g root -m 0644 /opt/hermes-titus/source/runtime/hermes-titus.service /etc/systemd/system/hermes-titus.service
    sudo find /opt/hermes-titus/source -type d -exec chmod go-w {} +
    sudo find /opt/hermes-titus/source -type f -exec chmod go-w {} +
    find /tmp/hermes-titus-deploy -mindepth 1 -delete
    rmdir /tmp/hermes-titus-deploy
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
    ! sudo docker inspect -f "{{json .Config.Env}}" hermes-titus | grep -Eq "(OPENROUTER_API_KEY|AGENTMAIL_API_KEY|CONTROL_TOWER_TOKEN|TEAMS_CLIENT_SECRET|MATRIX_ACCESS_TOKEN|MATRIX_RECOVERY_KEY)"
    sudo docker volume inspect hermes-titus-data >/dev/null
    for route in titus agent mitchel; do
      sudo systemctl is-active --quiet "hermes-email-intake@$route.service"
      sudo docker volume inspect "hermes-email-intake-$route-data" >/dev/null
    done
    sudo docker exec hermes-titus /usr/bin/bash -lc '\''
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
pid1_env = {}
for entry in Path("/proc/1/environ").read_bytes().split(b"\0"):
    if b"=" in entry:
        key, value = entry.split(b"=", 1)
        pid1_env[key.decode()] = value.decode()
assert pid1_env.get("HERMES_INFERENCE_MODEL") == "x-ai/grok-4.3", "unexpected effective Titus model"
assert (config.get("agent") or {}).get("reasoning_effort") == "medium", "unexpected Titus reasoning effort"
assert (config.get("delegation") or {}).get("provider") == "openrouter", "unexpected Titus delegation provider"
assert (config.get("delegation") or {}).get("model") == "x-ai/grok-build-0.1", "unexpected Titus delegation model"
print("effective_model_route=x-ai/grok-4.3")
print("reasoning_effort=medium")
print("delegation_route=x-ai/grok-build-0.1")
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
      agentmail_test=/tmp/agentmail-mcp-test.log
      agentmail_ok=false
      for attempt in 1 2 3; do
        if HOME=/opt/data /opt/hermes/.venv/bin/hermes mcp test agentmail >"$agentmail_test" 2>&1 && \
          grep -Eq "Tools discovered: [1-9][0-9]*" "$agentmail_test"; then
          agentmail_ok=true
          break
        fi
        sleep 2
      done
      if test "$agentmail_ok" != true; then
        sed -E "s/(x-api-key: )[[:graph:]]+/\\1[REDACTED]/" "$agentmail_test" >&2
        rm -f "$agentmail_test"
        exit 1
      fi
      rm -f "$agentmail_test"
      printf "agentmail_mcp=healthy\\n"
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
  "${ssh_cmd[@]}" 'sudo systemctl disable --now hermes-titus.service; sudo docker volume inspect hermes-titus-data >/dev/null; for route in titus agent mitchel; do sudo docker volume inspect "hermes-email-intake-$route-data" >/dev/null; done; echo "hermes-titus stopped; Matrix state and routed email-intake volumes preserved"'
}

restart_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl daemon-reload; sudo systemctl restart hermes-titus.service; sudo systemctl is-active --quiet hermes-titus.service; echo "hermes-titus restart requested"'
  verify
}

rollback_runtime() {
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
    for route in titus agent mitchel; do sudo docker volume inspect "hermes-email-intake-$route-data" >/dev/null; done
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
  stop) stop_runtime ;;
  rollback) rollback_runtime ;;
  *) usage ;;
esac
