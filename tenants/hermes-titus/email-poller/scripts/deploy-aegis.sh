#!/usr/bin/env bash
set -euo pipefail

action=${1:-}
replay_message_id=${2:-}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ssh_key=${AEGIS_SSH_KEY:-/home/frosted639/.ssh/ssh-key-2026-03-15}
remote=${AEGIS_SSH_REMOTE:-ubuntu@147.224.183.55}
ssh_cmd=(ssh -i "$ssh_key" "$remote")
image=${TITUS_EMAIL_POLLER_IMAGE:-overnightdesk/titus-email-poller:0.1.0}

usage() {
  printf 'usage: %s {prepare|install|verify|initialize [replay-message-id]|run-once|audit-mailbox|open-intake|close-intake|status|restart|stop|rollback}\n' "$0" >&2
  exit 2
}

audit_mailbox() {
  "${ssh_cmd[@]}" sudo bash -s <<'REMOTE'
set -euo pipefail
runtime=/run/titus-email-poller/runtime.json
api_key=$(jq -r '.AGENTMAIL_API_KEY' "$runtime")
inbox_id=$(jq -r '.AGENTMAIL_INBOX_ID' "$runtime")
encoded_inbox=$(jq -rn --arg value "$inbox_id" '$value | @uri')
url="https://api.agentmail.to/v0/inboxes/$encoded_inbox/messages?limit=100&include_blocked=true&include_unauthenticated=true"
mailbox=$(printf 'header = "Authorization: Bearer %s"\n' "$api_key" | \
  curl --config - --silent --show-error --fail-with-body "$url")
jq -c '{count, messages: [.messages[] | {
  message_id, thread_id, timestamp, from, to, subject, labels, in_reply_to,
  extracted_text_chars: ((.extracted_text // "") | length),
  text_chars: ((.text // "") | length), html_chars: ((.html // "") | length)
}]}' <<<"$mailbox"

latest_sent_id=$(jq -r '.messages[] | select(.labels | index("sent")) | .message_id' <<<"$mailbox" | head -n 1)
if test -n "$latest_sent_id"; then
  encoded_message=$(jq -rn --arg value "$latest_sent_id" '$value | @uri')
  message_url="https://api.agentmail.to/v0/inboxes/$encoded_inbox/messages/$encoded_message"
  sent_detail=$(printf 'header = "Authorization: Bearer %s"\n' "$api_key" | \
    curl --config - --silent --show-error --fail-with-body "$message_url")
  jq -c '{message_id, text_chars: ((.text // "") | length),
    html_chars: ((.html // "") | length), preview_chars: ((.preview // "") | length)}' <<<"$sent_detail"
fi

draft_url="https://api.agentmail.to/v0/inboxes/$encoded_inbox/drafts?limit=100"
drafts=$(printf 'header = "Authorization: Bearer %s"\n' "$api_key" | \
  curl --config - --silent --show-error --fail-with-body "$draft_url")
jq -c '{count, drafts: [.drafts[] | {
  draft_id, client_id, to, subject, in_reply_to, send_status, created_at,
  body_chars: ((.text // "") | length)
}]}' <<<"$drafts"

state_file="$(docker volume inspect -f '{{.Mountpoint}}' titus-email-poller-data)/state.json"
test -f "$state_file"
jq -c '{metadata, messages: [.messages[] | {
  message_id, thread_id, sender, subject, classification, state,
  remote_id, last_error_code, created_at, updated_at
}], approvals: [.approvals[] | {
  queue_id, source_message_id, recipient, state, decided_by, created_at, decided_at
}]}' "$state_file"
REMOTE
}

manage_intake() {
  local mode=$1
  "${ssh_cmd[@]}" sudo bash -s -- "$mode" <<'REMOTE'
set -euo pipefail
mode=$1
runtime=/run/titus-email-poller/runtime.json
test -f "$runtime"
test "$(jq -r '.AGENTMAIL_POLLING_ENABLED' "$runtime")" = false
api_key=$(jq -r '.AGENTMAIL_API_KEY' "$runtime")
inbox_id=$(jq -r '.AGENTMAIL_INBOX_ID' "$runtime")
configured=$(jq -r '.AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS' "$runtime")
expected=$(printf '%s\n' "$configured" | tr ',' '\n' | jq -Rsc 'split("\n") | map(select(length > 0) | ascii_downcase) | sort')
test "$(jq -r 'length' <<<"$expected")" -eq 2
encoded_inbox=$(jq -rn --arg value "$inbox_id" '$value | @uri')
base_url="https://api.agentmail.to/v0/inboxes/$encoded_inbox/lists/receive/allow"

request() {
  local method=$1
  local url=$2
  local data=${3:-}
  local options=(--config - --silent --show-error --fail-with-body --request "$method" "$url")
  if test -n "$data"; then
    options+=(--header 'Content-Type: application/json' --data "$data")
  fi
  printf 'header = "Authorization: Bearer %s"\n' "$api_key" | curl "${options[@]}"
}

current=$(request GET "$base_url?limit=100")
actual=$(jq -c '[.entries[].entry | ascii_downcase] | sort' <<<"$current")
if test "$mode" = open; then
  test "$actual" = "$expected" || { echo 'receive allowlist differs from configured operator set' >&2; exit 1; }
  while IFS= read -r entry; do
    encoded_entry=$(jq -rn --arg value "$entry" '$value | @uri')
    request DELETE "$base_url/$encoded_entry" >/dev/null
  done < <(jq -r '.[]' <<<"$expected")
  final=$(request GET "$base_url?limit=100")
  jq -e '.count == 0 and (.entries | length == 0)' <<<"$final" >/dev/null
  echo agentmail_receive_allowlist=open
elif test "$mode" = close; then
  test "$actual" = '[]' || { echo 'receive allowlist is not empty' >&2; exit 1; }
  while IFS= read -r entry; do
    payload=$(jq -cn --arg entry "$entry" '{entry: $entry}')
    request POST "$base_url" "$payload" >/dev/null
  done < <(jq -r '.[]' <<<"$expected")
  final=$(request GET "$base_url?limit=100")
  test "$(jq -c '[.entries[].entry | ascii_downcase] | sort' <<<"$final")" = "$expected"
  echo agentmail_receive_allowlist=closed
else
  echo 'invalid intake mode' >&2
  exit 2
fi
REMOTE
}

prepare() {
  "$root/scripts/qualify.sh"
  "${ssh_cmd[@]}" 'install -d -m 0700 /tmp/titus-email-poller-deploy'
  rsync -az --delete -e "ssh -i $ssh_key" "$root/" "$remote:/tmp/titus-email-poller-deploy/"
  "${ssh_cmd[@]}" '
    set -eu
    sudo install -d -o root -g root -m 0755 /opt/titus-email-poller/source /opt/titus-email-poller/bin
    sudo cp -a /tmp/titus-email-poller-deploy/. /opt/titus-email-poller/source/
    sudo install -o root -g root -m 0755 /opt/titus-email-poller/source/runtime/load-phase-config.sh /opt/titus-email-poller/bin/load-phase-config.sh
    sudo install -o root -g root -m 0755 /opt/titus-email-poller/source/runtime/initialize-container.sh /opt/titus-email-poller/bin/initialize-container.sh
    sudo install -o root -g root -m 0755 /opt/titus-email-poller/source/runtime/prepare-volume.sh /opt/titus-email-poller/bin/prepare-volume.sh
    sudo install -o root -g root -m 0755 /opt/titus-email-poller/source/runtime/run-once-container.sh /opt/titus-email-poller/bin/run-once-container.sh
    sudo install -o root -g root -m 0755 /opt/titus-email-poller/source/runtime/run-container.sh /opt/titus-email-poller/bin/run-container.sh
    sudo install -o root -g root -m 0755 /opt/titus-email-poller/source/runtime/stop-container.sh /opt/titus-email-poller/bin/stop-container.sh
    sudo install -o root -g root -m 0644 /opt/titus-email-poller/source/runtime/titus-email-poller.service /etc/systemd/system/titus-email-poller.service
    sudo docker build --pull -t overnightdesk/titus-email-poller:0.1.0 /opt/titus-email-poller/source
    sudo find /opt/titus-email-poller/source -type d -exec chmod go-w {} +
    sudo find /opt/titus-email-poller/source -type f -exec chmod go-w {} +
    find /tmp/titus-email-poller-deploy -mindepth 1 -delete
    rmdir /tmp/titus-email-poller-deploy
  '
}

install_runtime() {
  prepare
  "${ssh_cmd[@]}" '
    set -eu
    if getent passwd 10002 >/dev/null && test "$(getent passwd 10002 | cut -d: -f1)" != titus-email-poller; then
      echo "uid 10002 is already assigned" >&2; exit 1
    fi
    if getent group 10002 >/dev/null && test "$(getent group 10002 | cut -d: -f1)" != titus-email-poller; then
      echo "gid 10002 is already assigned" >&2; exit 1
    fi
    getent group titus-email-poller >/dev/null || sudo groupadd --system --gid 10002 titus-email-poller
    id titus-email-poller >/dev/null 2>&1 || sudo useradd --system --uid 10002 --gid 10002 --home-dir /nonexistent --shell /usr/sbin/nologin titus-email-poller
    sudo usermod -aG docker titus-email-poller
    sudo systemctl daemon-reload
    sudo systemctl enable --now titus-email-poller.service
  '
  verify
}

verify() {
  "${ssh_cmd[@]}" '
    set -eu
    sudo systemctl is-active --quiet titus-email-poller.service
    for i in $(seq 1 30); do
      state=$(sudo docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" titus-email-poller 2>/dev/null || true)
      test "$state" = healthy && break
      test "$i" -lt 30 || { sudo docker logs --tail 80 titus-email-poller 2>&1; exit 1; }
      sleep 2
    done
    test -z "$(sudo docker port titus-email-poller)"
    test "$(sudo docker inspect -f "{{.Config.User}}" titus-email-poller)" = 10002:10002
    test "$(sudo docker inspect -f "{{.HostConfig.ReadonlyRootfs}}" titus-email-poller)" = true
    sudo docker inspect -f "{{json .HostConfig.CapDrop}}" titus-email-poller | grep -q ALL
    sudo docker inspect -f "{{json .HostConfig.SecurityOpt}}" titus-email-poller | grep -q no-new-privileges
    sudo docker inspect -f "{{json .NetworkSettings.Networks}}" titus-email-poller | grep -q overnightdesk_overnightdesk
    ! sudo docker inspect -f "{{json .Config.Env}}" titus-email-poller | grep -Eq "(AGENTMAIL|OPENROUTER|SIGNING_SECRET)"
    sudo docker exec titus-email-poller /app/titus-email-poller health --health /data/health.json --max-age 180s
    sudo docker volume inspect titus-email-poller-data >/dev/null
    echo titus_email_poller=healthy
    echo published_ports=none
  '
}

initialize() {
  "${ssh_cmd[@]}" '
    set -eu
    sudo systemctl daemon-reload
    sudo systemctl stop titus-email-poller.service
    sudo /opt/titus-email-poller/bin/load-phase-config.sh
    sudo jq -e ".AGENTMAIL_POLLING_ENABLED == \"false\"" /run/titus-email-poller/runtime.json >/dev/null
    sudo /opt/titus-email-poller/bin/prepare-volume.sh
  '
  printf '%s\n' "$replay_message_id" | "${ssh_cmd[@]}" sudo /opt/titus-email-poller/bin/initialize-container.sh
  "${ssh_cmd[@]}" 'sudo systemctl start titus-email-poller.service'
  verify
}

run_once() {
  "${ssh_cmd[@]}" '
    set -eu
    ! sudo systemctl is-active --quiet titus-email-poller.service
    sudo jq -e ".AGENTMAIL_POLLING_ENABLED == \"true\"" /run/titus-email-poller/runtime.json >/dev/null
    sudo /opt/titus-email-poller/bin/run-once-container.sh
  '
}

status() {
  "${ssh_cmd[@]}" 'sudo systemctl --no-pager --full status titus-email-poller.service | sed -n "1,24p"; sudo docker ps --filter name=^/titus-email-poller$ --format "{{.Names}} {{.Status}}"'
}

restart_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl daemon-reload; sudo systemctl restart titus-email-poller.service; sudo systemctl is-active --quiet titus-email-poller.service; echo "titus-email-poller restart requested"'
  verify
}

stop_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl disable --now titus-email-poller.service; sudo docker volume inspect titus-email-poller-data >/dev/null; echo "titus-email-poller stopped; volume preserved"'
}

rollback_runtime() {
  "${ssh_cmd[@]}" 'sudo systemctl disable --now titus-email-poller.service'
  "${ssh_cmd[@]}" 'sudo bash -lc '\''
    set -eu
    export PHASE_SERVICE_TOKEN=$(</opt/control-tower/secrets/phase-service-token)
    printf "%s" false | phase secrets update AGENTMAIL_POLLING_ENABLED \
      --app azure-ops --env production --path /agents/hermes-titus/email >/dev/null
    /opt/titus-email-poller/bin/load-phase-config.sh
    jq -e ".AGENTMAIL_POLLING_ENABLED == \"false\"" /run/titus-email-poller/runtime.json >/dev/null
  '\'''
  "${ssh_cmd[@]}" 'sudo docker volume inspect titus-email-poller-data >/dev/null; echo "titus-email-poller rolled back disabled; source and volume preserved"'
}

case "$action" in
  prepare) prepare ;;
  install) install_runtime ;;
  verify) verify ;;
  initialize) initialize ;;
  run-once) run_once ;;
  audit-mailbox) audit_mailbox ;;
  open-intake) manage_intake open ;;
  close-intake) manage_intake close ;;
  status) status ;;
  restart) restart_runtime ;;
  stop) stop_runtime ;;
  rollback) rollback_runtime ;;
  *) usage ;;
esac
