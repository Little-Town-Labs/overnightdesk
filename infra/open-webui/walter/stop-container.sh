#!/usr/bin/env bash
set -euo pipefail

if docker container inspect open-webui-hermes-walter >/dev/null 2>&1; then
  docker stop --time 30 open-webui-hermes-walter >/dev/null
fi
