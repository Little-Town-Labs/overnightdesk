#!/usr/bin/env bash
set -euo pipefail

phase_bin=${PHASE_BIN:-/usr/bin/phase}
token_file=${PHASE_TOKEN_FILE:-/opt/control-tower/secrets/phase-service-token}
runtime_dir=${MEETING_PROCESSOR_RUNTIME_ROOT:-/run/titus-meeting-processor}
output_file=$runtime_dir/runtime.json
phase_app=${MEETING_PROCESSOR_PHASE_APP:-timeless-tech-solutions}
phase_env=${MEETING_PROCESSOR_PHASE_ENVIRONMENT:-production}
phase_path=/agents/hermes-titus/teamsmeetings
content_marker=${MEETING_PROCESSOR_CONTENT_MARKER:-/etc/overnightdesk/titus-meeting-transcript-content.enabled}
brief_marker=${MEETING_PROCESSOR_BRIEF_MARKER:-/etc/overnightdesk/titus-meeting-briefs.enabled}
filing_marker=${MEETING_PROCESSOR_FILING_MARKER:-/etc/overnightdesk/titus-meeting-filing.enabled}

die() { printf 'titus meeting processor phase load: %s\n' "$*" >&2; exit 1; }

test "$(id -u)" -eq 0 || die 'must run as root'
test -x "$phase_bin" || die 'Phase CLI unavailable'
test -f "$token_file" && test ! -L "$token_file" || die 'Phase token file unavailable'
test "$(stat -c %a "$token_file")" = 400 || die 'Phase token file mode must be 0400'
test "$(stat -c %u "$token_file")" = 10001 || die 'Phase token file owner is invalid'
token_size=$(stat -c %s "$token_file")
test "$token_size" -ge 20 && test "$token_size" -le 8192 || die 'Phase token file size is invalid'
! LC_ALL=C grep -q '[[:space:][:cntrl:]]' "$token_file" || die 'Phase token file contains whitespace or control characters'
command -v jq >/dev/null 2>&1 || die 'jq unavailable'

install -d -o root -g 10003 -m 0750 "$runtime_dir"
work_dir=$(mktemp -d "$runtime_dir/.load.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT
chmod 0700 "$work_dir"

PHASE_SERVICE_TOKEN=$(<"$token_file")
export PHASE_SERVICE_TOKEN
test -n "$PHASE_SERVICE_TOKEN" || die 'Phase token is empty'
timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
  --path "$phase_path" --format json >"$work_dir/source.json"

content_enabled=false
brief_enabled=false
filing_enabled=false
if test -e "$content_marker" || test -L "$content_marker"; then
  test -f "$content_marker" && test ! -L "$content_marker" || die 'content marker is invalid'
  test "$(stat -c %u "$content_marker")" = 0 || die 'content marker owner is invalid'
  test "$(stat -c %a "$content_marker")" = 444 || die 'content marker mode is invalid'
  test "$(stat -c %s "$content_marker")" = 0 || die 'content marker must be empty'
  content_enabled=true
  timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
    --path /agents/hermes-titus/runtime --format json >"$work_dir/core.json"
  timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
    --path /agents/hermes-email-intake/titus --format json >"$work_dir/email.json"
fi
if test -e "$brief_marker" || test -L "$brief_marker"; then
  test -f "$brief_marker" && test ! -L "$brief_marker" || die 'brief marker is invalid'
  test "$(stat -c %u "$brief_marker")" = 0 || die 'brief marker owner is invalid'
  test "$(stat -c %a "$brief_marker")" = 444 || die 'brief marker mode is invalid'
  test "$(stat -c %s "$brief_marker")" = 0 || die 'brief marker must be empty'
  brief_enabled=true
  timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
    --path /agents/hermes-titus/runtime --format json >"$work_dir/core.json"
  timeout 30 "$phase_bin" secrets export --app "$phase_app" --env "$phase_env" \
    --path /agents/hermes-titus/meetingbriefs --format json >"$work_dir/brief.json"
fi
if test -e "$filing_marker" || test -L "$filing_marker"; then
  test -f "$filing_marker" && test ! -L "$filing_marker" || die 'filing marker is invalid'
  test "$(stat -c %u "$filing_marker")" = 0 || die 'filing marker owner is invalid'
  test "$(stat -c %a "$filing_marker")" = 444 || die 'filing marker mode is invalid'
  test "$(stat -c %s "$filing_marker")" = 0 || die 'filing marker must be empty'
  $brief_enabled || die 'filing requires brief processing'
  filing_enabled=true
fi
if $brief_enabled && ! $content_enabled; then
  die 'brief processing requires transcript content'
fi
unset PHASE_SERVICE_TOKEN

jq -e 'keys == [
  "MSGRAPH_CLIENT_ID", "MSGRAPH_CLIENT_SECRET", "MSGRAPH_ORGANIZER_USER_IDS",
  "MSGRAPH_TENANT_ID", "MSGRAPH_TEST_JOIN_URL", "MSGRAPH_WEBHOOK_ACCEPTED_RESOURCES",
  "MSGRAPH_WEBHOOK_CLIENT_STATE", "MSGRAPH_WEBHOOK_ENABLED", "MSGRAPH_WEBHOOK_PORT"
]' "$work_dir/source.json" >/dev/null || die 'unexpected Phase key set'

jq -e '
  def uuid: test("^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$");
  . as $source |
  ($source.MSGRAPH_ORGANIZER_USER_IDS | split(",")) as $organizers |
  (all($source[]; type == "string" and length > 0)) and
  ($source.MSGRAPH_TENANT_ID | uuid) and
  ($source.MSGRAPH_CLIENT_ID | uuid) and
  ($source.MSGRAPH_CLIENT_SECRET | length >= 20 and length <= 4096 and (test("[[:cntrl:]]") | not)) and
  $source.MSGRAPH_WEBHOOK_ENABLED == "false" and
  ($source.MSGRAPH_WEBHOOK_PORT | test("^[0-9]{2,5}$")) and
  ($organizers | length == 2 and .[0] != .[1] and all(.[]; uuid))
' "$work_dir/source.json" >/dev/null || die 'Phase meeting configuration invalid'

jq '{
  MSGRAPH_TENANT_ID,
  MSGRAPH_CLIENT_ID,
  MSGRAPH_CLIENT_SECRET,
  MSGRAPH_ORGANIZER_USER_IDS,
  MSGRAPH_POLL_INTERVAL_SECONDS: "300",
  MSGRAPH_INITIAL_LOOKBACK_HOURS: "168"
}' "$work_dir/source.json" >"$work_dir/runtime-base.json"

if $content_enabled; then
  jq -e '
    (keys - [
      "AGENTMAIL_API_KEY", "AGENTMAIL_EMAIL_ADDRESS", "AGENTMAIL_INBOX_ID",
      "HERMES_DEFAULT_MODEL", "OPENROUTER_API_KEY", "SECURITY_SERVICE_TOKEN"
    ] | length) == 0 and
    (.SECURITY_SERVICE_TOKEN | type == "string" and length >= 32 and length <= 4096 and (test("[[:cntrl:]]") | not))
  ' "$work_dir/core.json" >/dev/null || die 'content SecurityTeam configuration invalid'
  jq -e '
    (.HERMES_API_KEY | type == "string" and length >= 32 and length <= 4096 and (test("[[:cntrl:]]") | not)) and
    .HERMES_BASE_URL == "http://hermes-titus:8642"
  ' "$work_dir/email.json" >/dev/null || die 'content Titus configuration invalid'
  jq -s '.[0] * {
    TRANSCRIPT_CONTENT_ENABLED: "true",
    SECURITYTEAM_BASE_URL: "http://overnightdesk-securityteam:4700",
    SECURITY_SERVICE_TOKEN: .[1].SECURITY_SERVICE_TOKEN,
    HERMES_BASE_URL: .[2].HERMES_BASE_URL,
    HERMES_API_KEY: .[2].HERMES_API_KEY,
    TRANSCRIPT_MAX_BYTES: "1000000",
    SECURITYTEAM_MAX_RESPONSE_BYTES: "1250000",
    TITUS_MAX_OUTPUT_BYTES: "65536"
  }' "$work_dir/runtime-base.json" "$work_dir/core.json" "$work_dir/email.json" >"$work_dir/runtime.json"
else
  mv "$work_dir/runtime-base.json" "$work_dir/runtime.json"
fi

if $brief_enabled; then
  jq -e '
    (keys - ["AGENTMAIL_API_KEY", "AGENTMAIL_EMAIL_ADDRESS", "AGENTMAIL_INBOX_ID", "HERMES_DEFAULT_MODEL", "OPENROUTER_API_KEY", "SECURITY_SERVICE_TOKEN"] | length) == 0 and
    (.AGENTMAIL_API_KEY | type == "string" and length >= 32) and
    (.AGENTMAIL_INBOX_ID | type == "string" and length > 0) and
    (.SECURITY_SERVICE_TOKEN | type == "string" and length >= 32)
  ' "$work_dir/core.json" >/dev/null || die 'meeting shared configuration invalid'
  jq -e '
    (keys - ["MEETING_ANALYZER_API_KEY", "MEETING_ANALYZER_MODEL"]) == ["MEETING_AUSTIN_EMAIL", "MEETING_FILER_API_TOKEN", "MEETING_GARY_EMAIL", "MEETING_PROJECT_ROUTES_JSON", "MEETING_RAW_CUSTODY_ACTIVE_KEY_ID", "MEETING_RAW_CUSTODY_KEYS_JSON", "MEETING_REVIEW_API_TOKEN", "MEETING_REVIEW_SIGNING_SECRET"] and
    ((has("MEETING_ANALYZER_API_KEY") and has("MEETING_ANALYZER_MODEL")) or ((has("MEETING_ANALYZER_API_KEY") or has("MEETING_ANALYZER_MODEL")) | not)) and
    all(.[]; type == "string" and length > 0) and
    ((has("MEETING_ANALYZER_API_KEY") | not) or (.MEETING_ANALYZER_API_KEY | length >= 32)) and
    (.MEETING_FILER_API_TOKEN | length >= 32) and
    (.MEETING_REVIEW_API_TOKEN | length >= 32) and (.MEETING_REVIEW_SIGNING_SECRET | length >= 32)
  ' "$work_dir/brief.json" >/dev/null || die 'meeting brief configuration invalid'
  jq -s '.[0] * {
    MEETING_BRIEF_ENABLED: "true",
    SECURITYTEAM_BASE_URL: "http://overnightdesk-securityteam:4700",
    SECURITY_SERVICE_TOKEN: .[1].SECURITY_SERVICE_TOKEN,
    SECURITYTEAM_MAX_RESPONSE_BYTES: "1250000",
    MEETING_RAW_CUSTODY_ACTIVE_KEY_ID: .[2].MEETING_RAW_CUSTODY_ACTIVE_KEY_ID,
    MEETING_RAW_CUSTODY_KEYS_JSON: .[2].MEETING_RAW_CUSTODY_KEYS_JSON,
    MEETING_PROJECT_ROUTES_JSON: .[2].MEETING_PROJECT_ROUTES_JSON,
    MEETING_AGENTMAIL_API_KEY: .[1].AGENTMAIL_API_KEY,
    MEETING_AGENTMAIL_INBOX_ID: .[1].AGENTMAIL_INBOX_ID,
    MEETING_GARY_EMAIL: .[2].MEETING_GARY_EMAIL,
    MEETING_AUSTIN_EMAIL: .[2].MEETING_AUSTIN_EMAIL,
    MEETING_REVIEW_BEARER: .[2].MEETING_REVIEW_API_TOKEN,
    MEETING_REVIEW_SIGNING_SECRET: .[2].MEETING_REVIEW_SIGNING_SECRET,
    MEETING_RECORDING_MAX_BYTES: "2147483648"
  }' "$work_dir/runtime.json" "$work_dir/core.json" "$work_dir/brief.json" >"$work_dir/runtime-brief.json"
  mv "$work_dir/runtime-brief.json" "$work_dir/runtime.json"
fi
if $filing_enabled; then
  jq -s '.[0] * {MEETING_FILING_ENABLED: "true", MEETING_FILER_BASE_URL: "http://titus-meeting-filer:8090", MEETING_FILER_BEARER: .[1].MEETING_FILER_API_TOKEN}' \
    "$work_dir/runtime.json" "$work_dir/brief.json" >"$work_dir/runtime-filing.json"
  mv "$work_dir/runtime-filing.json" "$work_dir/runtime.json"
fi

install -o root -g 10003 -m 0440 "$work_dir/runtime.json" "$output_file"
printf 'titus meeting processor phase load: ready\n'
