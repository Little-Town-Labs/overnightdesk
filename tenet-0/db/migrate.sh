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
    # Tracks applied migrations in the existing database ledger shape. Live
    # Aegis uses public.schema_migrations(filename, applied_at); newer test
    # databases may use tenet0.schema_migrations(version, applied_at).
    # Idempotent — safe to re-invoke.
    #
    # Required env: TENET0_ADMIN_URL (psql connection string with DDL grants)
    # Optional flags:
    #   --dry-run        Report what would apply; make no changes
    #   --only FILE.sql  Only consider the named migration file
    #
    # Replaces the goose-based design from earlier plan drafts (see
    # research.md §RES-6). Matches Feature 49's existing tooling pattern:
    # bash + psql, no Go-side migration runner.

    dry_run=0
    only_file=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --dry-run) dry_run=1; shift ;;
        --only)
          if [[ -z "${2:-}" ]]; then
            echo "migrate.sh apply-pending: --only requires a migration filename" >&2
            exit 1
          fi
          only_file="$(basename "$2")"
          shift 2
          ;;
        -h|--help)
          cat <<EOF
Usage: migrate.sh apply-pending [--dry-run] [--only FILE.sql]

Applies SQL files in numerical filename order from \$TENET0_MIGRATIONS_DIR
(default: db/migrations/) that are not yet recorded in the existing migration
ledger. Live Aegis uses public.schema_migrations(filename, applied_at).

Required env:
  TENET0_ADMIN_URL    Postgres URL with DDL grants (CREATE/ALTER permissions)

Files must be named NNN_*.sql. The numeric prefix determines order.
Each migration runs in a single transaction with the migration-ledger INSERT.
Use --only for a reviewed single-migration production deploy.
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

    ledger_kind=$(psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc --tuples-only --no-align -v ON_ERROR_STOP=1 -c "
      WITH cols AS (
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_name = 'schema_migrations'
          AND table_schema IN ('tenet0', 'public')
      )
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM cols
          WHERE table_schema = 'tenet0' AND column_name = 'version'
        ) THEN 'tenet0_version'
        WHEN EXISTS (
          SELECT 1 FROM cols
          WHERE table_schema = 'public' AND column_name = 'filename'
        ) THEN 'public_filename'
        WHEN EXISTS (
          SELECT 1 FROM cols
          WHERE table_schema = 'public' AND column_name = 'version'
        ) THEN 'public_version'
        ELSE 'missing'
      END;
    ")

    if [[ "$ledger_kind" == "missing" ]]; then
      psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 -c "
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
          filename   TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      " >/dev/null
      ledger_kind="public_filename"
    fi

    case "$ledger_kind" in
      tenet0_version)
        applied=$(psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc --tuples-only --no-align -v ON_ERROR_STOP=1 -c \
          "SELECT version FROM tenet0.schema_migrations ORDER BY version;")
        ;;
      public_filename)
        applied=$(psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc --tuples-only --no-align -v ON_ERROR_STOP=1 -c \
          "SELECT filename FROM public.schema_migrations ORDER BY filename;")
        ;;
      public_version)
        applied=$(psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc --tuples-only --no-align -v ON_ERROR_STOP=1 -c \
          "SELECT version FROM public.schema_migrations ORDER BY version;")
        ;;
      *)
        echo "migrate.sh apply-pending: unsupported migration ledger: $ledger_kind" >&2
        exit 1
        ;;
    esac

    echo "migrate.sh apply-pending: using migration ledger $ledger_kind"

    pending=()
    while IFS= read -r -d '' f; do
      base=$(basename "$f")
      version="${base%.sql}"
      if [[ -n "$only_file" && "$base" != "$only_file" ]]; then
        continue
      fi
      if [[ "$ledger_kind" == "public_filename" ]]; then
        applied_key="$base"
      else
        applied_key="$version"
      fi
      if ! grep -Fxq "$applied_key" <<<"$applied"; then
        pending+=("$f")
      fi
    done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '[0-9]*_*.sql' -print0 | sort -z)

    if [[ -n "$only_file" && ! -f "$MIGRATIONS_DIR/$only_file" ]]; then
      echo "migrate.sh apply-pending: --only file not found in migrations dir: $only_file" >&2
      exit 1
    fi

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

    # Apply each in its own transaction. The migration-ledger INSERT lives
    # in the same TX as the migration body so partial application is
    # impossible.
    for f in "${pending[@]}"; do
      version=$(basename "$f" .sql)
      base=$(basename "$f")
      if [[ ! "$base" =~ ^[0-9][0-9A-Za-z_.-]*\.sql$ ]]; then
        echo "migrate.sh apply-pending: unsafe migration filename: $base" >&2
        exit 1
      fi
      echo "migrate.sh apply-pending: applying $version"
      case "$ledger_kind" in
        tenet0_version)
          ledger_insert="INSERT INTO tenet0.schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;"
          ;;
        public_filename)
          ledger_insert="INSERT INTO public.schema_migrations (filename) VALUES ('$base') ON CONFLICT DO NOTHING;"
          ;;
        public_version)
          ledger_insert="INSERT INTO public.schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;"
          ;;
      esac
      psql "$TENET0_ADMIN_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 \
        --single-transaction \
        --file "$f" \
        --command "$ledger_insert"
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
                       Tracks state in the existing migration ledger.
EOF
    [[ -z "$sub" ]] && exit 1 || exit 0
    ;;
  *)
    echo "migrate.sh: unknown subcommand: $sub" >&2
    exit 1
    ;;
esac
