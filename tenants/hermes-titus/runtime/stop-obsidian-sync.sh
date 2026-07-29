#!/usr/bin/env bash
set -euo pipefail

if docker container inspect obsidian-sync-titus >/dev/null 2>&1; then
  docker stop --time 30 obsidian-sync-titus >/dev/null
fi
rm -f /run/obsidian-sync-titus/runtime.env
