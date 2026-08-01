#!/usr/bin/env bash
set -euo pipefail

test "$(id -u)" -eq 0
image=${TITUS_MEETING_PROCESSOR_IMAGE:-overnightdesk/titus-meeting-processor:0.1.0}
volume=titus-meeting-processor-data
custody_volume=titus-meeting-custody-data

docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
docker volume inspect "$custody_volume" >/dev/null 2>&1 || docker volume create "$custody_volume" >/dev/null
docker run --rm --user 0:0 --network none --volume "$volume:/data" \
  "$image" init-volume --path /data --uid 10003 --gid 10003
docker run --rm --user 0:0 --network none --volume "$custody_volume:/custody" \
  "$image" init-volume --path /custody --uid 10003 --gid 10003
