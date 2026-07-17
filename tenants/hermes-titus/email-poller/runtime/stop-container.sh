#!/usr/bin/env bash
set -euo pipefail

instance=${1:?route instance required}
case "$instance" in titus|agent|mitchel) ;; *) exit 2 ;; esac
name=hermes-email-intake-$instance
if docker container inspect "$name" >/dev/null 2>&1; then
  docker stop --time 20 "$name" >/dev/null || true
fi
