#!/usr/bin/env bash
set -euo pipefail

die() {
  printf 'meeting processor release tree: %s\n' "$1" >&2
  exit 1
}

tree_digest() {
  local tree=$1
  (
    cd "$tree"
    find . -type f -print0 |
      LC_ALL=C sort -z |
      xargs -0 sha256sum --zero |
      sha256sum |
      cut -d' ' -f1
  )
}

validate_owner() {
  [[ $1 =~ ^[0-9]+$ ]] || die 'owner uid is invalid'
  [[ $2 =~ ^[0-9]+$ ]] || die 'owner gid is invalid'
}

validate_release() {
  local release=$1
  local expected_digest=$2
  local owner_uid=$3
  local owner_gid=$4

  [[ $expected_digest =~ ^[0-9a-f]{64}$ ]] || die 'expected digest is invalid'
  test -d "$release" && test ! -L "$release" || die 'release path is invalid'
  test "${release##*/}" = "$expected_digest" || die 'release path does not match digest'
  test "$(tree_digest "$release")" = "$expected_digest" || die 'release digest mismatch'
  test -z "$(find "$release" \( \( ! -type d -a ! -type f \) -o ! -uid "$owner_uid" -o ! -gid "$owner_gid" -o -perm /222 \) -print -quit)" ||
    die 'release type, ownership, or mode is invalid'
}

promote_release() {
  local upload=$1
  local releases=$2
  local owner_uid=$3
  local owner_gid=$4
  local release_digest release staging

  test -d "$upload" && test ! -L "$upload" || die 'upload path is invalid'
  test -d "$releases" && test ! -L "$releases" || die 'release root is invalid'
  test -n "$(find "$upload" -type f -print -quit)" || die 'upload contains no regular files'

  release_digest=$(tree_digest "$upload")
  [[ $release_digest =~ ^[0-9a-f]{64}$ ]] || die 'upload digest is invalid'
  release=$releases/$release_digest

  if test -e "$release" || test -L "$release"; then
    validate_release "$release" "$release_digest" "$owner_uid" "$owner_gid"
    printf '%s\n' "$release"
    return
  fi

  staging=$releases/.staging-$release_digest
  test ! -e "$staging" && test ! -L "$staging" || die 'release staging path already exists'
  cleanup_staging() {
    if test -d "$staging" && test ! -L "$staging"; then
      chmod -R u+w "$staging" 2>/dev/null || true
      find "$staging" -mindepth 1 -delete 2>/dev/null || true
      rmdir "$staging" 2>/dev/null || true
    fi
  }
  trap cleanup_staging EXIT

  install -d -m 0755 "$staging"
  cp -a "$upload/." "$staging/"
  test -z "$(find "$staging" \( ! -type d -a ! -type f \) -print -quit)" ||
    die 'staged release contains an unsupported entry'
  chown -R "$owner_uid:$owner_gid" "$staging"
  chmod -R a-w "$staging"
  test "$(tree_digest "$staging")" = "$release_digest" || die 'staged release digest mismatch'
  mv -T "$staging" "$release"
  trap - EXIT

  validate_release "$release" "$release_digest" "$owner_uid" "$owner_gid"
  printf '%s\n' "$release"
}

action=${1:-}
test "$#" -eq 5 || die 'usage is invalid'
validate_owner "$4" "$5"
case "$action" in
  promote) promote_release "$2" "$3" "$4" "$5" ;;
  validate) validate_release "$2" "$3" "$4" "$5" ;;
  *) die 'action is invalid' ;;
esac
