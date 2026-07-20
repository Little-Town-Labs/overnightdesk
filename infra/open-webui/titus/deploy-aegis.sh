#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
source_root="$repo_root/infra/open-webui/titus"
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")

usage() {
  printf 'usage: %s {prepare|install-disabled|verify-private|enable-route|verify-public|sentinel-logs|rollback|status}\n' "$0" >&2
  exit 2
}

prepare() {
  "$repo_root/infra/open-webui/qualify-titus.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/open-webui-titus-deploy'
  rsync -az --delete -e "ssh -i $ssh_key" "$source_root/" "$remote:/tmp/open-webui-titus-deploy/"
  "${ssh_cmd[@]}" '
    set -eu
    sudo install -d -o root -g root -m 0755 /opt/open-webui-titus/source /opt/open-webui-titus/bin
    sudo cp -a /tmp/open-webui-titus-deploy/. /opt/open-webui-titus/source/
    for script in load-phase-env prepare-volume run-container stop-container; do
      sudo install -o root -g root -m 0755 "/opt/open-webui-titus/source/$script.sh" "/opt/open-webui-titus/bin/$script.sh"
    done
    sudo install -o root -g root -m 0644 /opt/open-webui-titus/source/open-webui-titus.service /etc/systemd/system/open-webui-titus.service
    sudo find /opt/open-webui-titus/source -type d -exec chmod go-w {} +
    sudo find /opt/open-webui-titus/source -type f -exec chmod go-w {} +
    find /tmp/open-webui-titus-deploy -mindepth 1 -delete
    rmdir /tmp/open-webui-titus-deploy
  '
}

install_disabled() {
  prepare
  "${ssh_cmd[@]}" '
    set -eu
    if ! getent group open-webui-titus >/dev/null; then sudo groupadd --system open-webui-titus; fi
    if ! id open-webui-titus >/dev/null 2>&1; then
      sudo useradd --system --gid open-webui-titus --home-dir /nonexistent --shell /usr/sbin/nologin open-webui-titus
    fi
    sudo usermod -aG docker open-webui-titus
    sudo /opt/open-webui-titus/bin/prepare-volume.sh
    sudo systemctl daemon-reload
    sudo systemctl enable --now open-webui-titus.service
  '
  verify_private
}

verify_private() {
  "${ssh_cmd[@]}" '
    set -eu
    sudo systemctl is-active --quiet open-webui-titus.service
    for i in $(seq 1 90); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" open-webui-hermes-titus 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 90 || { sudo docker logs --tail 80 open-webui-hermes-titus 2>&1; exit 1; }
      sleep 2
    done
    test -z "$(sudo docker port open-webui-hermes-titus)"
    test "$(sudo docker inspect -f "{{.Config.User}}" open-webui-hermes-titus)" = 1000:1000
    test "$(sudo docker inspect -f "{{.HostConfig.ReadonlyRootfs}}" open-webui-hermes-titus)" = true
    sudo docker inspect -f "{{json .HostConfig.CapDrop}}" open-webui-hermes-titus | grep -q ALL
    sudo docker inspect -f "{{json .HostConfig.SecurityOpt}}" open-webui-hermes-titus | grep -q no-new-privileges
    sudo docker inspect -f "{{json .NetworkSettings.Networks}}" open-webui-hermes-titus | grep -q overnightdesk_overnightdesk
    ! sudo docker inspect -f "{{json .Config.Env}}" open-webui-hermes-titus | grep -Eq "(OPENAI_API_KEY|WEBUI_SECRET_KEY|PHASE_SERVICE_TOKEN)"
    sudo docker volume inspect open-webui-hermes-titus-data >/dev/null
    sudo docker exec open-webui-hermes-titus /bin/sh -c '\''set -a; . /run/secrets/open-webui-titus; set +a; python - <<"PY"
import json
import os
import urllib.request
request = urllib.request.Request("http://hermes-titus:8642/v1/models")
request.add_header("Authorization", "Bearer " + os.environ["OPENAI_API_KEY"])
with urllib.request.urlopen(request, timeout=10) as response:
    payload = json.loads(response.read())
assert isinstance(payload.get("data"), list)
PY'\''
    echo "open_webui_titus=healthy_private"
    echo "published_ports=none"
  '
}

enable_route() {
  "${ssh_cmd[@]}" '
    set -eu
    conf_dir=/opt/overnightdesk/nginx/conf.d
    source=/opt/open-webui-titus/source
    sudo install -o root -g root -m 0644 "$source/nginx-http.conf" "$conf_dir/titus-chat.conf"
    sudo docker exec overnightdesk-nginx nginx -t
    sudo docker exec overnightdesk-nginx nginx -s reload
    if ! sudo test -f /opt/overnightdesk/certbot/conf/live/titus-chat.overnightdesk.com/fullchain.pem; then
      cd /opt/overnightdesk
      sudo docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
        -d titus-chat.overnightdesk.com --non-interactive --agree-tos
    fi
    sudo install -o root -g root -m 0644 "$source/nginx.conf" "$conf_dir/titus-chat.conf"
    sudo docker exec overnightdesk-nginx nginx -t
    sudo docker exec overnightdesk-nginx nginx -s reload
  '
}

verify_public() {
  headers=$(mktemp)
  trap 'rm -f "$headers"' EXIT
  curl -sS --connect-timeout 10 --max-time 20 -D "$headers" -o /dev/null \
    https://titus-chat.overnightdesk.com/
  code=$(awk '/^HTTP\// { value=$2 } END { print value }' "$headers")
  case "$code" in
    401|403) ;;
    *)
      printf 'Unexpected unauthenticated Titus Open WebUI status: %s\n' "${code:-none}" >&2
      exit 1
      ;;
  esac
  echo "open_webui_titus_unauthenticated_status=$code"
}

sentinel_logs() {
  "${ssh_cmd[@]}" '
    set -eu
    sentinel="OD_T020E_SENTINEL_$(date +%s)_$RANDOM"
    since=$(date -u +%FT%TZ)
    sudo docker exec open-webui-hermes-titus /bin/sh -c "python - <<PY
import urllib.error
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
    curl -ksS -o /dev/null \
      -H "Cookie: better-auth.session_token=$sentinel" \
      "https://titus-chat.overnightdesk.com/oauth/oidc/callback?code=$sentinel&state=$sentinel" || true
    tmp=$(mktemp)
    trap '\''rm -f "$tmp"'\'' EXIT
    sudo docker logs --since "$since" open-webui-hermes-titus >"$tmp" 2>&1 || true
    sudo docker logs --since "$since" overnightdesk-nginx >>"$tmp" 2>&1 || true
    if grep -Fq "$sentinel" "$tmp"; then
      echo "Titus Open WebUI sentinel appeared in production logs" >&2
      exit 1
    fi
    echo "open_webui_titus_log_sentinel=absent"
  '
}

rollback() {
  "${ssh_cmd[@]}" '
    set -eu
    conf=/opt/overnightdesk/nginx/conf.d/titus-chat.conf
    disabled=/opt/open-webui-titus/disabled
    sudo install -d -o root -g root -m 0750 "$disabled"
    if sudo test -f "$conf"; then
      stamp=$(date -u +%Y%m%dT%H%M%SZ)
      sudo mv "$conf" "$disabled/titus-chat.conf.$stamp.disabled"
      sudo docker exec overnightdesk-nginx nginx -t
      sudo docker exec overnightdesk-nginx nginx -s reload
    fi
    sudo systemctl disable --now open-webui-titus.service || true
    sudo docker volume inspect open-webui-hermes-titus-data >/dev/null
    sudo systemctl is-active --quiet hermes-titus.service
    sudo systemctl is-active --quiet hermes-email-intake@titus.service
    echo "Titus Open WebUI rolled back; volume, Hermes, Matrix, and email state preserved"
  '
}

status() {
  "${ssh_cmd[@]}" 'sudo systemctl --no-pager --full status open-webui-titus.service | sed -n "1,28p"; sudo docker ps --filter name=^/open-webui-hermes-titus$ --format "{{.Names}} {{.Status}}"; sudo docker volume inspect open-webui-hermes-titus-data >/dev/null && echo volume=present'
}

case "$action" in
  prepare) prepare ;;
  install-disabled) install_disabled ;;
  verify-private) verify_private ;;
  enable-route) enable_route ;;
  verify-public) verify_public ;;
  sentinel-logs) sentinel_logs ;;
  rollback) rollback ;;
  status) status ;;
  *) usage ;;
esac
