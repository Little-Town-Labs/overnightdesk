#!/usr/bin/env bash
# tenet-0 migrate dispatch. Subcommands:
#   bump-constitution   Activate a new constitution version from prose.md + rules.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUS_TS_DIR="$REPO_ROOT/shared/bus-ts"

sub="${1:-}"
shift || true

case "$sub" in
  bump-constitution)
    if [[ ! -d "$BUS_TS_DIR/node_modules" ]]; then
      echo "migrate.sh: bus-ts deps not installed. Run: (cd $BUS_TS_DIR && npm install)" >&2
      exit 1
    fi
    if [[ ! -f "$BUS_TS_DIR/dist/cli/bump-constitution.js" ]]; then
      echo "migrate.sh: bus-ts not built. Running: (cd $BUS_TS_DIR && npm run build)"
      (cd "$BUS_TS_DIR" && npm run build >/dev/null)
    fi
    exec node "$BUS_TS_DIR/dist/cli/bump-constitution.js" "$@"
    ;;
  ""|-h|--help)
    cat <<EOF
Usage: migrate.sh <subcommand> [args...]

Subcommands:
  bump-constitution --prose PATH --rules PATH [--published-by NAME]
                       Activate a new constitution version.
                       Requires TENET0_ADMIN_URL env var.
EOF
    [[ -z "$sub" ]] && exit 1 || exit 0
    ;;
  *)
    echo "migrate.sh: unknown subcommand: $sub" >&2
    exit 1
    ;;
esac
