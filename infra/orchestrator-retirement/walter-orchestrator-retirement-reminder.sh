#!/usr/bin/env bash
set -Eeuo pipefail

readonly GRPCURL="/usr/local/bin/grpcurl"
readonly PROTO_ROOT="/home/ubuntu/overnightdesk-communicationmodule/proto"
readonly PROTO_FILE="dispatch/v1/dispatch.proto"
readonly COMM_MODULE_ADDR="127.0.0.1:9090"
readonly REMINDER_METHOD="dispatch.v1.DispatchService/Dispatch"
readonly EXPECTED_CHECK_ERROR=$'ERROR:\n  Code: InvalidArgument\n  Message: title must not be empty'
readonly REMINDER_PAYLOAD='{"title":"Orchestrator retirement observation window ended","summary":"The observation window ended; cleanup remains unapproved pending explicit owner approval.","body":["The observation window ended at 2026-08-09T01:33:03Z.","Retained orchestrator state and rollback evidence remain in place.","Cleanup remains unapproved pending explicit owner approval."],"severity":"SEVERITY_INFO","channels":"CHANNELS_TELEGRAM"}'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

grpcurl_binary() {
  # This override exists only so the repository behavior tests can use a fake.
  printf '%s\n' "${WALTER_REMINDER_TEST_GRPCURL:-$GRPCURL}"
}

require_runtime_contract() {
  [[ -n "${COMM_MODULE_API_KEY:-}" ]] || fail "reminder runtime credentials are unavailable"

  local grpcurl_path
  grpcurl_path=$(grpcurl_binary)
  [[ -x "$grpcurl_path" ]] || fail "reminder transport is unavailable"
}

grpcurl_common_args() {
  printf '%s\n' \
    -plaintext \
    -import-path "$PROTO_ROOT" \
    -proto "$PROTO_FILE" \
    -expand-headers \
    -H 'x-api-key: ${COMM_MODULE_API_KEY}'
}

check_readiness() {
  require_runtime_contract

  local grpcurl_path output
  local -a args
  grpcurl_path=$(grpcurl_binary)
  mapfile -t args < <(grpcurl_common_args)

  if output=$("$grpcurl_path" "${args[@]}" \
    -d '{}' "$COMM_MODULE_ADDR" "$REMINDER_METHOD" 2>&1); then
    fail "reminder communication-module readiness check failed"
  fi

  output="${output%$'\n'}"
  [[ "$output" == "$EXPECTED_CHECK_ERROR" ]] ||
    fail "reminder communication-module readiness check failed"
  printf '%s\n' "reminder transport ready; no notification dispatched"
}

dispatch_reminder() {
  require_runtime_contract

  local grpcurl_path
  local -a args
  grpcurl_path=$(grpcurl_binary)
  mapfile -t args < <(grpcurl_common_args)

  if ! "$grpcurl_path" "${args[@]}" \
    -d "$REMINDER_PAYLOAD" "$COMM_MODULE_ADDR" "$REMINDER_METHOD" >/dev/null 2>&1; then
    fail "reminder communication-module dispatch failed"
  fi
  printf '%s\n' "reminder dispatched through communication module"
}

case "${1:-}" in
  --check)
    [[ $# -eq 1 ]] || fail "usage: $0 --check|--dispatch"
    check_readiness
    ;;
  --dispatch)
    [[ $# -eq 1 ]] || fail "usage: $0 --check|--dispatch"
    dispatch_reminder
    ;;
  *)
    fail "usage: $0 --check|--dispatch"
    ;;
esac
