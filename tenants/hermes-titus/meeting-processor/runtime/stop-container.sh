#!/usr/bin/env bash
set -euo pipefail

name=titus-meeting-processor
if docker container inspect "$name" >/dev/null 2>&1; then
  docker stop --time 20 "$name" >/dev/null || true
fi
