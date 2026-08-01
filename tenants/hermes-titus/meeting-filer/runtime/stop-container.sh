#!/usr/bin/env bash
set -euo pipefail
if docker container inspect titus-meeting-filer >/dev/null 2>&1; then
  docker stop --time 20 titus-meeting-filer >/dev/null || true
fi
