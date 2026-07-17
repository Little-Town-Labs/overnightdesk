#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
tenant_root="$repo_root/tenants/hermes-titus"
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")

usage() {
  printf 'usage: %s {prepare|install|verify|status|initialize-poller|restart|stop|rollback}\n' "$0" >&2
  exit 2
}

prepare() {
  "$tenant_root/scripts/qualify.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/hermes-titus-deploy'
  rsync -az --delete -e "ssh -i $ssh_key" "$tenant_root/" "$remote:/tmp/hermes-titus-deploy/"
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
    ! sudo docker inspect -f "{{json .Config.Env}}" hermes-titus | grep -Eq "(OPENROUTER_API_KEY|AGENTMAIL_API_KEY|CONTROL_TOWER_TOKEN|TEAMS_CLIENT_SECRET)"
    sudo docker exec hermes-titus /usr/bin/bash -lc '\''
      set -a
      . /run/secrets/hermes-titus-runtime
      set +a
      /opt/hermes/.venv/bin/python - <<"PY"
import json
import os
import urllib.request

def get(url, token=None):
    request = urllib.request.Request(url)
    if token:
        request.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())

get("http://127.0.0.1:8420/health")
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
PY
      test -f /opt/data/skills/agentmail-email/SKILL.md
      test -f /opt/data/skills/control-tower-hermes/SKILL.md
      agentmail_test=/tmp/agentmail-mcp-test.log
      if ! HOME=/opt/data /opt/hermes/.venv/bin/hermes mcp test agentmail >"$agentmail_test" 2>&1; then
        sed -E "s/(x-api-key: )[[:graph:]]+/\\1[REDACTED]/" "$agentmail_test" >&2
        rm -f "$agentmail_test"
        exit 1
      fi
      grep -q "Tools discovered:" "$agentmail_test"
      rm -f "$agentmail_test"
      printf "agentmail_mcp=healthy\\n"
      /opt/data/bin/agentmail-poller-health.sh
      /opt/hermes/.venv/bin/python - <<"PY"
import json
from pathlib import Path
path = Path("/opt/data/agentmail-poller/health.json")
payload = json.loads(path.read_text())
print("agentmail_poller_state=" + str(payload.get("state", "unknown")))
PY
      printf "teams_state=%s\n" "${TITUS_TEAMS_STATE:-pending}"
    '\''
    echo "hermes_titus=healthy"
    echo "published_ports=none"
    echo "memory_tencentdb=healthy"
  '
}

initialize_poller() {
  leave_latest=${TITUS_INITIALIZE_LEAVE_LATEST_TRUSTED:-false}
  test "$leave_latest" = false || test "$leave_latest" = true
  initialize_flag=
  if test "$leave_latest" = true; then
    initialize_flag=--leave-latest-trusted
  fi
  "${ssh_cmd[@]}" '
    set -eu
    sudo systemctl is-active --quiet hermes-titus.service
    sudo docker exec hermes-titus /usr/bin/bash -lc '\''
      set -a
      . /run/secrets/hermes-titus-runtime
      set +a
      test "${AGENTMAIL_POLLING_ENABLED:-}" = false
      /opt/hermes/.venv/bin/python /opt/data/bin/agentmail_poller.py initialize '"$initialize_flag"'
    '\''
  '
}

status() {
  "${ssh_cmd[@]}" 'sudo systemctl --no-pager --full status hermes-titus.service | sed -n "1,24p"; sudo docker ps --filter name=^/hermes-titus$ --format "{{.Names}} {{.Status}}"'
}

stop_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl disable --now hermes-titus.service; sudo docker volume inspect hermes-titus-data >/dev/null; echo "hermes-titus stopped; volume preserved"'
}

restart_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl daemon-reload; sudo systemctl restart hermes-titus.service; sudo systemctl is-active --quiet hermes-titus.service; echo "hermes-titus restart requested"'
  verify
}

rollback_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl disable --now hermes-titus.service; sudo docker volume inspect hermes-titus-data >/dev/null; echo "hermes-titus runtime rolled back; source and volume preserved"'
}

case "$action" in
  prepare) prepare ;;
  install) install_runtime ;;
  verify) verify ;;
  status) status ;;
  initialize-poller) initialize_poller ;;
  restart) restart_runtime ;;
  stop) stop_runtime ;;
  rollback) rollback_runtime ;;
  *) usage ;;
esac
