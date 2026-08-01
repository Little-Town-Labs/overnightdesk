#!/usr/bin/env bash
set -euo pipefail
if docker container inspect hermes-titus-meeting-analyzer >/dev/null 2>&1; then
  docker stop --time 20 hermes-titus-meeting-analyzer >/dev/null || true
fi
