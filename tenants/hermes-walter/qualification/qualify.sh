#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
exec "$ROOT/infra/hermes-upgrade/local-qualify.sh" "$@"
