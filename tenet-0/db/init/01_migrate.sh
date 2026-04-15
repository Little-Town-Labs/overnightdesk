#!/usr/bin/env bash
# First-boot + subsequent-boot: apply every db/migrations/*.sql in lexical
# order that has not already been applied, tracked in schema_migrations.
#
# Each file runs in a single transaction (`--single-transaction`) so a
# mid-file failure rolls back cleanly — no half-migrated state. The
# schema_migrations insert is part of the same transaction, so a file and
# its bookkeeping row are always in lockstep.
#
# Note: the postgres image's docker-entrypoint.sh only runs this on an
# EMPTY data volume. For a subsequent migration added after deploy, you
# must run this script manually inside the container (or via psql from the
# host); see tenet-0/README.md.

set -euo pipefail

MIGRATIONS_DIR="/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "tenet0 init: no migrations dir at $MIGRATIONS_DIR — skipping"
  exit 0
fi

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "tenet0 init: no migrations found — skipping"
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

applied=0
skipped=0
for m in "${migrations[@]}"; do
  base="$(basename "$m")"
  # Use psql variable binding so the filename never enters the SQL text —
  # defends against a hypothetical malicious filename like
  #   001_x';DROP TABLE audit_log;--.sql
  already=$(psql -v ON_ERROR_STOP=1 -v fname="$base" -tAc \
    "SELECT COUNT(*)::INT FROM schema_migrations WHERE filename = :'fname'" \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB")
  if [[ "$already" != "0" ]]; then
    skipped=$((skipped+1))
    continue
  fi
  echo "tenet0 init: applying $base"
  # Append the bookkeeping insert to the migration body; psql --single-transaction
  # wraps both in one BEGIN/COMMIT so either both persist or neither does.
  # The filename flows in via :'fname' so psql handles the quoting.
  {
    cat "$m"
    echo
    echo "INSERT INTO schema_migrations (filename) VALUES (:'fname');"
  } | psql -v ON_ERROR_STOP=1 -v fname="$base" --single-transaction \
           --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
  applied=$((applied+1))
done

echo "tenet0 init: ${applied} migrations applied, ${skipped} already present"
