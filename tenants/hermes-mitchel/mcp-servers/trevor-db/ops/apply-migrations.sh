#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="${TREVOR_MIGRATIONS_DIR:-$script_dir/migrations}"

ssh_target="${AEGIS_SSH_TARGET:-ubuntu@147.224.183.55}"
ssh_key="${AEGIS_SSH_KEY:-$HOME/.ssh/ssh-key-2026-03-15}"
db_container="${TREVOR_DB_CONTAINER:-tenet0-postgres}"
db_name="${TREVOR_DB_NAME:-tenet0}"
migration_user="${TREVOR_MIGRATION_USER:-tenet0_admin}"
app_user="${TREVOR_APP_USER:-trevor_app}"

validate_name() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[A-Za-z0-9_:-]+$ ]]; then
    echo "Invalid $label: $value" >&2
    exit 2
  fi
}

validate_name "db container" "$db_container"
validate_name "db name" "$db_name"
validate_name "migration user" "$migration_user"
validate_name "app user" "$app_user"

if [[ ! -d "$migrations_dir" ]]; then
  echo "Missing migrations directory: $migrations_dir" >&2
  exit 2
fi

shopt -s nullglob
migrations=("$migrations_dir"/*.sql)
shopt -u nullglob

if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "No Trevor migrations found in $migrations_dir" >&2
  exit 2
fi

for migration in "${migrations[@]}"; do
  echo "Applying $(basename "$migration") as $migration_user"
  ssh -i "$ssh_key" "$ssh_target" \
    "docker exec -i $db_container psql -U $migration_user -d $db_name -v ON_ERROR_STOP=1" \
    < "$migration"
done

echo "Verifying Trevor app role access"
ssh -i "$ssh_key" "$ssh_target" \
  "docker exec $db_container psql -U $app_user -d $db_name -v ON_ERROR_STOP=1 -c 'select count(*) as prospect_import_runs from trevor.prospect_import_runs;'"

echo "Trevor migrations applied"
