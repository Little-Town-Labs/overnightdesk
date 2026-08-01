#!/usr/bin/env sh
set -eu

projects_root=${MEETING_PROJECTS_ROOT:-/projects}
projects_uid=${MEETING_PROJECTS_UID:-10000}
projects_gid=${MEETING_PROJECTS_GID:-10000}

case "$projects_root" in /*) ;; *) exit 1;; esac
case "$projects_uid:$projects_gid" in *[!0-9:]*|:*) exit 1;; esac
test -d "$projects_root" && test ! -L "$projects_root"

for relative in 00-inbox 00-inbox/meetings; do
  path=$projects_root/$relative
  if test -e "$path" || test -L "$path"; then
    test -d "$path" && test ! -L "$path"
  else
    mkdir "$path"
  fi
  chown "$projects_uid:$projects_gid" "$path"
  chmod 0750 "$path"
  test "$(stat -c %u:%g:%a "$path")" = "$projects_uid:$projects_gid:750"
done
