#!/usr/bin/env bash
# tenet-0 migrate dispatch. Subcommands:
#   bump-constitution   Activate a new constitution version from prose.md + rules.yaml
#   apply-pending       Apply any unapplied SQL migrations from db/migrations/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUS_TS_DIR="$REPO_ROOT/shared/bus-ts"
MIGRATIONS_DIR="${TENET0_MIGRATIONS_DIR:-$SCRIPT_DIR/migrations}"

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

  apply-pending)
    # Apply unapplied SQL migrations from MIGRATIONS_DIR in numerical order.
    # Tracks applied migrations in tenet0.schema_migrations (created on first
    # run). Idempotent — safe to re-invoke.
    #
    # Required env: TENET0_ADMIN_URL (psql connection string with DDL grants)
    # Optional flags:
    #   --dry-run     Report what would apply; make no changes
    #
    # Replaces the goose-based design from earlier plan drafts (see
    # research.md §RES-6). Matches Feature 49's existing tooling pattern:
    # bash + psql, no Go-side migration runner.

    dry_run=0
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --dry-run) dry_run=1; shift ;;
        -h|--help)
          cat <<EOF
Usage: migrate.sh apply-pending [--dry-run]

Applies SQL files in numerical filename order from \$TENET0_MIGRATIONS_DIR
(default: db/migrations/) that are not yet recorded in tenet0.schema_migrations.

Required env:
  TENET0_ADMIN_URL    Postgres URL with DDL grants (CREATE/ALTER permissions)

Files must be named NNN_*.sql. The numeric prefix determines order.
Each migration runs in a single transaction with the schema_migrations
INSERT — partial application is impossible.
EOF
          exit 0
          ;;
        *) echo "migrate.sh apply-pending: unknown flag: $1" >&2; exit 1 ;;
      esac
    done

    if [[ -z "${TENET0_ADMIN_URL:-}" ]]; then
      echo "migrate.sh apply-pending: TENET0_ADMIN_URL not set" >&2
      exit 1
    fi
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
      echo "migrate.sh apply-pending: migrations dir not found: $MIGRATIONS_DIR" >&2
      exit 1
    fi

    # Bootstrap: ensure schema_migrations table exists. Idempotent.
    psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 -c "
      CREATE TABLE IF NOT EXISTS tenet0.schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    " >/dev/null 2>&1 || {
      # The 'tenet0' schema may not exist yet on a fresh DB. The first
      # migration is responsible for creating it; for the bootstrap table
      # we fall back to the public schema until that migration runs.
      psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 -c "
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          version    TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      " >/dev/null
    }

    # Discover applied set. Try tenet0.schema_migrations first; fall back to public.
    applied=$(psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc --tuples-only --no-align -c \
      "SELECT version FROM tenet0.schema_migrations ORDER BY version;" 2>/dev/null \
      || psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc --tuples-only --no-align -c \
      "SELECT version FROM public.schema_migrations ORDER BY version;")

    pending=()
    while IFS= read -r -d '' f; do
      base=$(basename "$f")
      version="${base%.sql}"
      if ! grep -Fxq "$version" <<<"$applied"; then
        pending+=("$f")
      fi
    done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '[0-9]*_*.sql' -print0 | sort -z)

    if [[ ${#pending[@]} -eq 0 ]]; then
      echo "migrate.sh apply-pending: nothing to apply (database is up to date)"
      exit 0
    fi

    echo "migrate.sh apply-pending: ${#pending[@]} migration(s) to apply:"
    for f in "${pending[@]}"; do
      echo "  - $(basename "$f")"
    done

    if [[ $dry_run -eq 1 ]]; then
      echo "migrate.sh apply-pending: dry-run mode; no changes made"
      exit 0
    fi

    # Apply each in its own transaction. The schema_migrations INSERT lives
    # in the same TX as the migration body so partial application is
    # impossible. We pick the table dynamically because the first migration
    # may move it from public to tenet0.
    for f in "${pending[@]}"; do
      version=$(basename "$f" .sql)
      echo "migrate.sh apply-pending: applying $version"
      psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 \
        --single-transaction \
        --file "$f" \
        --command "INSERT INTO tenet0.schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;" \
        2>/dev/null \
      || psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 \
        --single-transaction \
        --file "$f" \
        --command "INSERT INTO public.schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;"
      echo "migrate.sh apply-pending: applied $version"
    done

    echo "migrate.sh apply-pending: done. Applied ${#pending[@]} migration(s)."
    ;;

  ""|-h|--help)
    cat <<EOF
Usage: migrate.sh <subcommand> [args...]

Subcommands:
  bump-constitution --prose PATH --rules PATH [--published-by NAME]
                       Activate a new constitution version.
                       Requires TENET0_ADMIN_URL env var.

  apply-pending [--dry-run]
                       Apply unapplied SQL migrations from db/migrations/.
                       Requires TENET0_ADMIN_URL env var.
                       Tracks state in tenet0.schema_migrations table.
EOF
    [[ -z "$sub" ]] && exit 1 || exit 0
    ;;
  *)
    echo "migrate.sh: unknown subcommand: $sub" >&2
    exit 1
    ;;
esac
