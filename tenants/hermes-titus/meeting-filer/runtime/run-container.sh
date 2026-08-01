#!/usr/bin/env bash
set -euo pipefail
name=titus-meeting-filer
image=${TITUS_MEETING_FILER_IMAGE:-overnightdesk/titus-meeting-filer:0.1.0}
runtime=${TITUS_MEETING_FILER_RUNTIME:-/run/titus-meeting-filer/runtime.json}
runtime_dir=${runtime%/*}
test -d "$runtime_dir" && test ! -L "$runtime_dir" && test "$(stat -c %u:%g:%a "$runtime_dir")" = 0:10005:750
test -f "$runtime" && test ! -L "$runtime" && test "$(stat -c %u:%g:%a "$runtime")" = 0:10004:440
exec docker run --rm \
  --name "$name" --hostname "$name" --user 10000:10000 --group-add 10004 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --network overnightdesk_overnightdesk --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --cpus 0.5 --memory 384m \
  --env HOME=/filer-home --env HERMES_HOME=/filer-home \
  --volume titus-meeting-filer-data:/filer-data \
  --volume titus-project-knowledge-data:/projects \
  --mount type=volume,src=hermes-titus-data,dst=/filer-home/.hermes/kanban,volume-subpath=.hermes/kanban \
  --volume "$runtime:/run/secrets/runtime.json:ro" \
  "$image" serve --config /run/secrets/runtime.json --listen :8090
