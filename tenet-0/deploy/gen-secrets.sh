#!/usr/bin/env bash
# Generate secrets/tenet0.env with three random passwords. Safe to re-run —
# refuses to overwrite an existing file. Must be run on the deploy host so
# passwords never leave it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../secrets/tenet0.env"

if [[ -s "$ENV_FILE" ]]; then
  echo "gen-secrets: $ENV_FILE already exists — keeping it" >&2
  exit 0
fi

mkdir -p "$(dirname "$ENV_FILE")"
umask 077

cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=' | head -c 32)
TENET0_APP_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=' | head -c 32)
TENET0_SECOPS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=' | head -c 32)
EOF
chmod 600 "$ENV_FILE"

echo "gen-secrets: wrote $ENV_FILE"
