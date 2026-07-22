#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_root="$repo_root/infra/open-webui/walter"
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")

usage() {
  printf 'usage: %s {prepare|install-disabled|verify-private|verify-restart-persistence|enable-route|verify-public|sentinel-logs|rollback|status}\n' "$0" >&2
  exit 2
}

verify_restart_persistence() {
  "${ssh_cmd[@]}" '
    set -eu
    test ! -e /opt/overnightdesk/nginx/conf.d/walter-chat.conf
    walter_started=$(sudo docker inspect -f "{{.State.StartedAt}}" hermes-walter)
    sudo docker exec open-webui-hermes-walter /bin/sh -c '\''printf %s feature023-private-restart > /app/backend/data/.feature023-private-restart'\''
    sudo systemctl restart open-webui-walter.service
    for i in $(seq 1 90); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" open-webui-hermes-walter 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 90 || { sudo docker logs --tail 80 open-webui-hermes-walter 2>&1; exit 1; }
      sleep 2
    done
    test "$(sudo docker exec open-webui-hermes-walter /bin/sh -c '\''cat /app/backend/data/.feature023-private-restart'\'')" = feature023-private-restart
    sudo docker exec open-webui-hermes-walter /bin/sh -c '\''rm /app/backend/data/.feature023-private-restart'\''
    test "$(sudo docker inspect -f "{{.State.StartedAt}}" hermes-walter)" = "$walter_started"
    echo "open_webui_walter_restart_persistence=passed"
    echo "hermes_walter_restart=not_performed"
  '
  verify_private
}

prepare() {
  "$repo_root/infra/open-webui/qualify-walter.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/open-webui-walter-deploy'
  rsync -az --delete -e "ssh -i $ssh_key" "$source_root/" "$remote:/tmp/open-webui-walter-deploy/"
  "${ssh_cmd[@]}" '
    set -eu
    sudo install -d -o root -g root -m 0755 /opt/open-webui-walter/source /opt/open-webui-walter/bin
    sudo cp -a /tmp/open-webui-walter-deploy/. /opt/open-webui-walter/source/
    sudo chown -R root:root /opt/open-webui-walter/source
    for script in load-phase-env prepare-volume run-container stop-container; do
      sudo install -o root -g root -m 0755 "/opt/open-webui-walter/source/$script.sh" "/opt/open-webui-walter/bin/$script.sh"
    done
    sudo install -o root -g root -m 0644 /opt/open-webui-walter/source/open-webui-walter.service /etc/systemd/system/open-webui-walter.service
    sudo systemctl daemon-reload
    sudo find /opt/open-webui-walter/source -type d -exec chmod go-w {} +
    sudo find /opt/open-webui-walter/source -type f -exec chmod go-w {} +
    find /tmp/open-webui-walter-deploy -mindepth 1 -delete
    rmdir /tmp/open-webui-walter-deploy
  '
}

install_disabled() {
  prepare
  "${ssh_cmd[@]}" '
    set -eu
    test ! -e /opt/overnightdesk/nginx/conf.d/walter-chat.conf
    if ! getent group open-webui-walter >/dev/null; then sudo groupadd --system open-webui-walter; fi
    if ! id open-webui-walter >/dev/null 2>&1; then
      sudo useradd --system --gid open-webui-walter --home-dir /nonexistent --shell /usr/sbin/nologin open-webui-walter
    fi
    sudo usermod -aG docker open-webui-walter
    sudo /opt/open-webui-walter/bin/prepare-volume.sh
    sudo systemctl daemon-reload
    sudo systemctl enable --now open-webui-walter.service
  '
  verify_private
}

verify_private() {
  "${ssh_cmd[@]}" '
    set -eu
    test ! -e /opt/overnightdesk/nginx/conf.d/walter-chat.conf
    sudo systemctl is-active --quiet open-webui-walter.service
    for i in $(seq 1 90); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" open-webui-hermes-walter 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 90 || { sudo docker logs --tail 80 open-webui-hermes-walter 2>&1; exit 1; }
      sleep 2
    done
    test -z "$(sudo docker port open-webui-hermes-walter)"
    test "$(sudo docker inspect -f "{{.Config.User}}" open-webui-hermes-walter)" = 1000:1000
    test "$(sudo docker inspect -f "{{.HostConfig.ReadonlyRootfs}}" open-webui-hermes-walter)" = true
    sudo docker inspect -f "{{json .HostConfig.CapDrop}}" open-webui-hermes-walter | grep -q ALL
    sudo docker inspect -f "{{json .HostConfig.SecurityOpt}}" open-webui-hermes-walter | grep -q no-new-privileges
    sudo docker inspect -f "{{json .NetworkSettings.Networks}}" open-webui-hermes-walter | grep -q overnightdesk_overnightdesk
    ! sudo docker inspect -f "{{json .Config.Env}}" open-webui-hermes-walter | grep -Eq "(OPENAI_API_KEY|WEBUI_SECRET_KEY|PHASE_SERVICE_TOKEN|OPENROUTER_API_KEY)"
    sudo docker volume inspect open-webui-hermes-walter-data >/dev/null
    test "$(sudo docker inspect -f "{{range .Mounts}}{{if eq .Destination \"/app/backend/data\"}}{{.Name}}{{end}}{{end}}" open-webui-hermes-walter)" = open-webui-hermes-walter-data
    sudo docker exec open-webui-hermes-walter /bin/sh -c '\''python - <<"PY"
import json
import shlex
import urllib.request
from pathlib import Path

api_key = None
for raw_line in Path("/run/secrets/open-webui-walter").read_text().splitlines():
    if not raw_line or raw_line.startswith("#") or "=" not in raw_line:
        continue
    key, value = raw_line.split("=", 1)
    if key != "OPENAI_API_KEY":
        continue
    parsed = shlex.split(value)
    assert len(parsed) == 1
    api_key = parsed[0]
    break
assert api_key is not None and len(api_key) >= 32
request = urllib.request.Request("http://hermes-walter:8642/v1/models")
request.add_header("Authorization", "Bearer " + api_key)
with urllib.request.urlopen(request, timeout=10) as response:
    payload = json.loads(response.read())
assert isinstance(payload.get("data"), list) and payload["data"]
PY'\''
    sudo docker exec hermes-walter /opt/hermes/.venv/bin/python -c '\''import json,yaml; from pathlib import Path; config=yaml.safe_load(Path("/opt/data/config.yaml").read_text()) or {}; model=config.get("model") or {}; assert model.get("provider") == "openai-codex"; assert model.get("default") == "gpt-5.6-sol"; auth=json.loads(Path("/opt/data/auth.json").read_text()); providers=(auth.get("providers") or {}); assert auth.get("active_provider") == "openai-codex"; assert "openai-codex" in providers; print("model.provider=openai-codex"); print("model.default=gpt-5.6-sol"); print("auth.active_provider=openai-codex"); print("openai-codex present in providers")'\''
    echo "open_webui_walter=healthy_private"
    echo "published_ports=none"
    echo "public_route=absent"
  '
}

enable_route() {
  "${ssh_cmd[@]}" '
    set -eu
    conf_dir=/opt/overnightdesk/nginx/conf.d
    source=/opt/open-webui-walter/source
    sudo systemctl is-active --quiet open-webui-walter.service
    sudo install -o root -g root -m 0644 "$source/nginx-http.conf" "$conf_dir/walter-chat.conf"
    sudo docker exec overnightdesk-nginx nginx -t
    sudo docker exec overnightdesk-nginx nginx -s reload
    if ! sudo test -f /opt/overnightdesk/certbot/conf/live/walter-chat.overnightdesk.com/fullchain.pem; then
      cd /opt/overnightdesk
      sudo docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
        -d walter-chat.overnightdesk.com --non-interactive --agree-tos
    fi
    sudo install -o root -g root -m 0644 "$source/nginx.conf" "$conf_dir/walter-chat.conf"
    sudo docker exec overnightdesk-nginx nginx -t
    sudo docker exec overnightdesk-nginx nginx -s reload
  '
}

verify_public() {
  headers=$(mktemp)
  trap 'rm -f "$headers"' EXIT
  curl -sS --connect-timeout 10 --max-time 20 -D "$headers" -o /dev/null \
    https://walter-chat.overnightdesk.com/
  code=$(awk '/^HTTP\// { value=$2 } END { print value }' "$headers")
  case "$code" in
    401|403) ;;
    *)
      printf 'Unexpected unauthenticated Walter Open WebUI status: %s\n' "${code:-none}" >&2
      exit 1
      ;;
  esac
  echo "open_webui_walter_unauthenticated_status=$code"
}

sentinel_logs() {
  "${ssh_cmd[@]}" '
    set -eu
    sentinel="OD_WALTER_OPEN_WEBUI_SENTINEL_$(date +%s)_$RANDOM"
    since=$(date -u +%FT%TZ)
    sudo docker exec open-webui-hermes-walter /bin/sh -c "python - <<PY
import urllib.request
sentinel = \"$sentinel\"
request = urllib.request.Request(
    \"http://127.0.0.1:8080/oauth/oidc/callback?code=\" + sentinel + \"&state=\" + sentinel,
    headers={\"Cookie\": \"token=\" + sentinel},
)
try:
    urllib.request.urlopen(request, timeout=10).read()
except Exception:
    pass
PY"
    tmp=$(mktemp)
    trap '\''rm -f "$tmp"'\'' EXIT
    sudo docker logs --since "$since" open-webui-hermes-walter >"$tmp" 2>&1 || true
    if grep -Fq "$sentinel" "$tmp"; then
      echo "Walter Open WebUI sentinel appeared in production logs" >&2
      exit 1
    fi
    echo "open_webui_walter_log_sentinel=absent"
  '
}

rollback() {
  "${ssh_cmd[@]}" '
    set -eu
    conf=/opt/overnightdesk/nginx/conf.d/walter-chat.conf
    disabled=/opt/open-webui-walter/disabled
    sudo install -d -o root -g root -m 0750 "$disabled"
    if sudo test -f "$conf"; then
      stamp=$(date -u +%Y%m%dT%H%M%SZ)
      sudo mv "$conf" "$disabled/walter-chat.conf.$stamp.disabled"
      sudo docker exec overnightdesk-nginx nginx -t
      sudo docker exec overnightdesk-nginx nginx -s reload
    fi
    sudo systemctl disable --now open-webui-walter.service || true
    sudo docker volume inspect open-webui-hermes-walter-data >/dev/null
    test "$(sudo docker inspect -f "{{.State.Running}}" hermes-walter)" = true
    echo "Walter Open WebUI disabled rollback complete; volume and native Walter runtime preserved"
  '
}

status() {
  "${ssh_cmd[@]}" 'sudo systemctl --no-pager --full status open-webui-walter.service | sed -n "1,28p"; sudo docker ps --filter name=^/open-webui-hermes-walter$ --format "{{.Names}} {{.Status}}"; sudo docker volume inspect open-webui-hermes-walter-data >/dev/null && echo volume=present; if sudo test -e /opt/overnightdesk/nginx/conf.d/walter-chat.conf; then echo public_route=present; else echo public_route=absent; fi'
}

case "$action" in
  prepare) prepare ;;
  install-disabled) install_disabled ;;
  verify-private) verify_private ;;
  verify-restart-persistence) verify_restart_persistence ;;
  enable-route) enable_route ;;
  verify-public) verify_public ;;
  sentinel-logs) sentinel_logs ;;
  rollback) rollback ;;
  status) status ;;
  *) usage ;;
esac
