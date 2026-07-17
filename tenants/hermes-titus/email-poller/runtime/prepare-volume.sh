#!/usr/bin/env bash
set -euo pipefail

image=${TITUS_EMAIL_POLLER_IMAGE:-overnightdesk/titus-email-poller:0.1.0}
volume=${TITUS_EMAIL_POLLER_VOLUME:-titus-email-poller-data}

test "$(id -u)" -eq 0 || { printf 'volume preparation must run as root\n' >&2; exit 1; }
docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
docker run --rm --user 0:0 --network none --volume "$volume:/data" \
  "$image" init-volume --path /data --uid 10002 --gid 10002
