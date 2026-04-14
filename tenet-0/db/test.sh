#!/usr/bin/env bash
# Run Tenet-0 schema + stored procedure tests against a disposable test DB.
#
# Requires PG_URL env var pointing at a Postgres instance with superuser creds.
# Creates/drops 'tenet0_test' database on each run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
TESTS_DIR="$SCRIPT_DIR/tests"

PG_URL="${PG_URL:?PG_URL env var required, e.g. postgres://user:pass@host:port/postgres}"
PG_ADMIN_DB="${PG_ADMIN_DB:-postgres}"
TEST_DB="${TEST_DB:-tenet0_test}"

# Build admin URL (connects to admin DB)
ADMIN_URL="${PG_URL%/*}/$PG_ADMIN_DB"
TEST_URL="${PG_URL%/*}/$TEST_DB"

echo "==> Preparing $TEST_DB"
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null
psql "$ADMIN_URL" -c "CREATE DATABASE $TEST_DB;" >/dev/null

# Create roles if they don't exist
psql "$ADMIN_URL" <<SQL >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_admin') THEN
    CREATE ROLE tenet0_admin NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_app') THEN
    CREATE ROLE tenet0_app NOINHERIT LOGIN PASSWORD 'tenet0_app_password_placeholder';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_secops') THEN
    CREATE ROLE tenet0_secops NOINHERIT LOGIN PASSWORD 'tenet0_secops_password_placeholder';
  END IF;
END
\$\$;
SQL

echo "==> Running migrations against $TEST_DB"
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  -> $(basename "$f")"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "==> Running tests"
failed=0
passed=0
for f in "$TESTS_DIR"/*.sql; do
  name=$(basename "$f")
  if psql "$TEST_URL" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -q "^PASS:"; then
    echo "  ✅ $name"
    passed=$((passed + 1))
  else
    echo "  ❌ $name"
    psql "$TEST_URL" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | tail -20
    failed=$((failed + 1))
  fi
done

echo "==> Cleaning up $TEST_DB"
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null

echo ""
echo "Results: $passed passed, $failed failed"
exit $failed
