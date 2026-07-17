#!/usr/bin/env bash
set -euo pipefail

if docker container inspect hermes-titus >/dev/null 2>&1; then
  docker stop --time 30 hermes-titus >/dev/null
fi

rm -f /run/hermes-titus/runtime.env
rmdir /run/hermes-titus 2>/dev/null || true
