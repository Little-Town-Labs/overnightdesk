#!/usr/bin/env bash
set -euo pipefail

manager_env_file=${TITUS_GITHUB_REPOSITORY_MANAGER_ENV_FILE:-/run/hermes-titus/github-repository-manager.env}
manager_key_file=${TITUS_GITHUB_REPOSITORY_MANAGER_PRIVATE_KEY_FILE:-/run/hermes-titus/github-repository-manager-app-private-key}

die() {
  printf 'hermes-titus GitHub repository manager verification: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" -eq 0 || die 'must run as root'
test -f "$manager_env_file" && test ! -L "$manager_env_file" || {
  die 'manager metadata file unavailable'
}
test "$(stat -c %a "$manager_env_file")" = 400 || die 'manager metadata file mode is invalid'
test "$(stat -c %u "$manager_env_file")" = 0 || die 'manager metadata file owner is invalid'
! grep -q '^GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY=' "$manager_env_file" || {
  die 'manager private key entered the metadata file'
}

set -a
# shellcheck disable=SC1090
. "$manager_env_file"
set +a

case "${TITUS_GITHUB_REPOSITORY_MANAGER_STATE:-disabled}" in
  disabled)
    printf 'github_repository_manager_state=disabled\n'
    exit 0
    ;;
  invalid)
    die 'manager profile is invalid'
    ;;
  ready)
    ;;
  *)
    die 'manager state is invalid'
    ;;
esac

for key in \
  GITHUB_REPOSITORY_MANAGER_APP_ID \
  GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID \
  GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID \
  GITHUB_REPOSITORY_MANAGER_ORGANIZATION \
  GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES \
  GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY_PATH; do
  value=${!key:-}
  test -n "$value" && test "$value" != NOT_CONFIGURED || die "manager value unavailable: $key"
done

test "$GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY_PATH" = "$manager_key_file" || {
  die 'manager key path is not the protected host file'
}
test -f "$manager_key_file" && test ! -L "$manager_key_file" || die 'manager key file unavailable'
test "$(stat -c %a "$manager_key_file")" = 400 || die 'manager key file mode is invalid'
test "$(stat -c %u "$manager_key_file")" = 0 || die 'manager key file owner is invalid'
openssl pkey -in "$manager_key_file" -noout >/dev/null 2>&1 || die 'manager key is not parseable'

case "$GITHUB_REPOSITORY_MANAGER_APP_ID" in
  ''|*[!0-9]*) die 'manager App ID is invalid' ;;
esac
case "$GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID" in
  ''|*[!0-9]*) die 'manager installation ID is invalid' ;;
esac
test "$GITHUB_REPOSITORY_MANAGER_ORGANIZATION" = timeless-technology-solutions || {
  die 'manager organization is not approved'
}
printf '%s' "$GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES" |
  grep -Eq '^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$' ||
  die 'manager repository allowlist is invalid'

base64url() {
  base64 -w0 | tr '+/' '-_' | tr -d '='
}

github_request() {
  local method=$1
  local url=$2
  local bearer=$3
  local output=$4
  if test "$method" = POST; then
    curl --fail --silent --show-error --config - >"$output" <<EOF
request = POST
url = "$url"
header = "Accept: application/vnd.github+json"
header = "X-GitHub-Api-Version: 2022-11-28"
header = "Authorization: Bearer $bearer"
data = ""
EOF
  else
    curl --fail --silent --show-error --config - >"$output" <<EOF
request = GET
url = "$url"
header = "Accept: application/vnd.github+json"
header = "X-GitHub-Api-Version: 2022-11-28"
header = "Authorization: Bearer $bearer"
EOF
  fi
}

verify_dir=$(mktemp -d /run/hermes-titus/.github-manager-verify.XXXXXX)
chmod 0700 "$verify_dir"
trap 'rm -rf "$verify_dir"' EXIT

now=$(date +%s)
issued_at=$((now - 60))
expires_at=$((now + 540))
jwt_header=$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | base64url)
jwt_payload=$(printf '{"iat":%s,"exp":%s,"iss":"%s"}' \
  "$issued_at" "$expires_at" "$GITHUB_REPOSITORY_MANAGER_APP_ID" | base64url)
jwt_input="$jwt_header.$jwt_payload"
jwt_signature=$(printf '%s' "$jwt_input" |
  openssl dgst -sha256 -sign "$manager_key_file" | base64url)
app_jwt="$jwt_input.$jwt_signature"

github_request GET https://api.github.com/app "$app_jwt" "$verify_dir/app.json" ||
  die 'manager App identity request failed'
jq -e --arg app_id "$GITHUB_REPOSITORY_MANAGER_APP_ID" \
  '(.id | tostring) == $app_id' "$verify_dir/app.json" >/dev/null ||
  die 'manager App identity does not match configured App ID'

github_request POST \
  "https://api.github.com/app/installations/$GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID/access_tokens" \
  "$app_jwt" "$verify_dir/token.json" || die 'manager installation token request failed'
manager_token=$(jq -er '.token | strings | select(length > 0)' "$verify_dir/token.json") ||
  die 'manager installation token was not returned'

github_request GET 'https://api.github.com/installation/repositories?per_page=100' \
  "$manager_token" "$verify_dir/repositories.json" ||
  die 'manager installation repository request failed'
jq -e '.repositories | type == "array"' "$verify_dir/repositories.json" >/dev/null ||
  die 'manager installation repository response is invalid'

allowed_json=$(printf '%s' "$GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES" |
  jq -R --arg organization "$GITHUB_REPOSITORY_MANAGER_ORGANIZATION" \
  'split(",") | map(($organization + "/" + .) | ascii_downcase)')
jq -e --argjson allowed "$allowed_json" '
  ([.repositories[]?.full_name | ascii_downcase]) as $installed |
  ($allowed | all(.[]; . as $name | ($installed | index($name)) != null))
' "$verify_dir/repositories.json" >/dev/null ||
  die 'manager installation does not cover its configured allowlist'

printf 'github_repository_manager_state=ready\n'
printf 'github_repository_manager_provider=github-app\n'
printf 'github_repository_manager_organization=%s\n' "$GITHUB_REPOSITORY_MANAGER_ORGANIZATION"
printf 'github_repository_manager_allowlist_verified=true\n'
