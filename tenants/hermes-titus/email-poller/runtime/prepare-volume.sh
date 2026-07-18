#!/usr/bin/env bash
set -euo pipefail

instance=${1:?route instance required}
case "$instance" in titus|agent|walter|mitchel) ;; *) exit 2 ;; esac
image=${HERMES_EMAIL_INTAKE_IMAGE:-overnightdesk/hermes-email-intake:0.2.0}
volume=hermes-email-intake-$instance-data
test "$(id -u)" -eq 0 || exit 1
docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
docker run --rm --user 0:0 --network none --volume "$volume:/data" \
  "$image" init-volume --path /data --uid 10002 --gid 10002
