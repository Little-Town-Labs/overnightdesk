#!/usr/bin/env bash
set -euo pipefail
image=${TITUS_MEETING_FILER_IMAGE:-overnightdesk/titus-meeting-filer:0.1.0}
script_dir=$(cd "$(dirname "$0")" && pwd)
docker volume inspect titus-project-knowledge-data >/dev/null
docker volume inspect hermes-titus-data >/dev/null
docker volume create titus-meeting-filer-data >/dev/null
docker run --rm --user 0:0 \
  --volume titus-meeting-filer-data:/filer-data \
  --volume hermes-titus-data:/titus-data \
  --volume titus-project-knowledge-data:/projects \
  --volume "$script_dir/initialize-project-paths.sh:/initialize-project-paths.sh:ro" \
  --entrypoint /bin/sh "$image" -c '
    set -eu
    /bin/sh /initialize-project-paths.sh
    mkdir -p /titus-data/.hermes/kanban/boards /filer-data
    chown -R 10000:10000 /titus-data/.hermes/kanban /filer-data
    chmod 0700 /titus-data/.hermes/kanban /titus-data/.hermes/kanban/boards /filer-data
  '
