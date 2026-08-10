#!/usr/bin/env bash
set -euo pipefail

key_path=/home/powerbox2/.ssh/ssh-key-2026-03-15
host_name=147.224.183.55
remote_user=ubuntu
since_window=6h

usage() {
  cat <<'USAGE'
Usage: check-status.sh [--key PATH] [--host HOST] [--user USER] [--since WINDOW]

Perform a read-only, content-free Titus meeting-processor status check on Aegis.
USAGE
}

while (($# > 0)); do
  case "$1" in
    --key)
      (($# >= 2)) || { usage >&2; exit 2; }
      key_path=$2
      shift 2
      ;;
    --host)
      (($# >= 2)) || { usage >&2; exit 2; }
      host_name=$2
      shift 2
      ;;
    --user)
      (($# >= 2)) || { usage >&2; exit 2; }
      remote_user=$2
      shift 2
      ;;
    --since)
      (($# >= 2)) || { usage >&2; exit 2; }
      since_window=$2
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$key_path" ]]; then
  printf 'status=blocked reason=ssh_key_missing path=%s\n' "$key_path"
  exit 2
fi

if [[ "$(stat -c '%a' "$key_path")" != 600 ]]; then
  printf 'status=blocked reason=ssh_key_permissions path=%s\n' "$key_path"
  exit 2
fi

ssh_output=$(mktemp)
ssh_errors=$(mktemp)
cleanup() { rm -f "$ssh_output" "$ssh_errors"; }
trap cleanup EXIT

if ! ssh -i "$key_path" -o BatchMode=yes -o ConnectTimeout=10 \
  "$remote_user@$host_name" bash -s -- "$since_window" >"$ssh_output" 2>"$ssh_errors" <<'REMOTE'
set -u

since_window=$1
printf 'observed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

service_enabled=$(systemctl is-enabled titus-meeting-processor.service 2>/dev/null || true)
service_active=$(systemctl is-active titus-meeting-processor.service 2>/dev/null || true)
printf 'service=meeting_processor enabled=%s active=%s\n' "$service_enabled" "$service_active"
docker inspect -f 'container=meeting_processor status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} ports={{json .NetworkSettings.Ports}}' titus-meeting-processor 2>/dev/null || printf '%s\n' 'container=meeting_processor status=unavailable'

docker inspect -f 'container=hermes_titus status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' hermes-titus 2>/dev/null || printf '%s\n' 'container=hermes_titus status=unavailable'
printf 'service=titus_email_intake active=%s\n' "$(systemctl is-active hermes-email-intake@titus.service 2>/dev/null || true)"
docker inspect -f 'container=titus_email_intake status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' hermes-email-intake-titus 2>/dev/null || printf '%s\n' 'container=titus_email_intake status=unavailable'

mountpoint=$(docker volume inspect -f '{{.Mountpoint}}' titus-meeting-processor-data 2>/dev/null || true)
health_path="$mountpoint/health.json"
if sudo test -f "$health_path" && command -v jq >/dev/null 2>&1; then
  sudo jq -c '{health_state:.state,health_timestamp:.timestamp,token_health,meeting:(.meeting|{enabled,custody_retained,custody_deleted,custody_blocked,custody_overdue,custody_missing_key,analysis_pending,luna_running,sol_qa_pending,cleanup_retryable,cleanup_blocked,pending_review,approved,held,filed,blocked,recordings_verified}),content:(.content|{enabled,pending,processed,blocked,retryable_error}),streams:[.streams[]|{organizer_slot,artifact_type,state,cursor_present,last_success_at,new_count,known_count,total_count,retry_count,safe_error_code}]}' "$health_path" 2>/dev/null || printf '%s\n' 'aggregate_health=invalid'
else
  printf '%s\n' 'aggregate_health=unavailable'
fi

docker exec titus-meeting-processor /titus-meeting-processor health --health /data/health.json --max-age 10m 2>&1 || true

printf '%s\n' 'recent_safe_events='
docker logs -t --since "$since_window" titus-meeting-processor 2>&1 |
  while IFS=' ' read -r log_timestamp payload; do
    printf '%s\n' "$payload" |
      jq -r --arg log_timestamp "$log_timestamp" 'select((.event // "") | (startswith("cycle_") or startswith("meeting_"))) | [$log_timestamp, .event, (.state // ""), (.safe_error_code // "")] | @tsv' 2>/dev/null || true
  done |
  tail -20
REMOTE
then
  printf 'status=blocked reason=ssh_connection_failed host=%s\n' "$host_name"
  exit 2
fi

cat "$ssh_output"
