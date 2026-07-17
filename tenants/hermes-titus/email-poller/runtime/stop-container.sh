#!/usr/bin/env bash
set -euo pipefail

if docker container inspect titus-email-poller >/dev/null 2>&1; then
  docker stop --time 20 titus-email-poller >/dev/null || true
fi
