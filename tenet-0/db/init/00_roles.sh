#!/usr/bin/env bash
# First-boot: create tenet0_app and tenet0_secops roles. tenet0_admin is
# created by POSTGRES_USER already. Passwords come from env vars loaded via
# secrets/tenet0.env.
#
# Uses psql's \gexec with :'var' substitution so the CREATE ROLE statements
# are parameterized by the client (not interpolated as shell strings).
# Idempotent: guarded by NOT EXISTS on pg_roles.

set -euo pipefail

: "${TENET0_APP_PASSWORD:?TENET0_APP_PASSWORD env var required}"
: "${TENET0_SECOPS_PASSWORD:?TENET0_SECOPS_PASSWORD env var required}"

psql -v ON_ERROR_STOP=1 \
     -v app_pw="$TENET0_APP_PASSWORD" \
     -v sec_pw="$TENET0_SECOPS_PASSWORD" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE tenet0_app NOINHERIT LOGIN PASSWORD %L', :'app_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenet0_app') \gexec

SELECT format('CREATE ROLE tenet0_secops NOINHERIT LOGIN PASSWORD %L', :'sec_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenet0_secops') \gexec
SQL

echo "tenet0 init: roles ready"
