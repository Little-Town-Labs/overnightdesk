#!/usr/bin/env bash
set -euo pipefail

root=$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
exec python3 "$root/infra/hermes-upgrade/local_qualify.py" "$@"
