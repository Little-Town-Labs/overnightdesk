#!/usr/bin/env bash
set -u

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
suite_dir="$(CDPATH= cd -- "${script_dir}/../.." && pwd)"

failures=0

check() {
  local ok="$1"
  local message="$2"

  if [[ "${ok}" == "0" ]]; then
    printf 'ok  - %s\n' "${message}"
  else
    printf 'ERR - %s\n' "${message}"
    failures=$((failures + 1))
  fi
}

repos=(
  overnightdesk
  overnightdesk-ops
  overnightdesk-platform-standard
  overnightdesk-operations-audit
  overnightdesk-engine
  overnightdesk-flightrecorder
  overnightdesk-communicationmodule
  overnightdesk-SecurityCouncil
  overnightdesk-securityteam
  overnightdesk-newsletter-curator
)

printf 'Suite: %s\n\n' "${suite_dir}"

for repo in "${repos[@]}"; do
  repo_dir="${suite_dir}/${repo}"
  check "$([[ -d "${repo_dir}/.git" ]]; echo $?)" "${repo} is a Git checkout"

  if [[ -d "${repo_dir}/.git" ]]; then
    branch="$(git -C "${repo_dir}" branch --show-current 2>/dev/null || true)"
    remote="$(git -C "${repo_dir}" remote get-url origin 2>/dev/null || true)"
    dirty="$(git -C "${repo_dir}" status --short 2>/dev/null || true)"

    check "$([[ -n "${remote}" ]]; echo $?)" "${repo} has origin remote"
    printf '     branch: %s\n' "${branch:-detached}"
    printf '     origin: %s\n' "${remote:-missing}"

    if [[ -n "${dirty}" ]]; then
      printf '     dirty:\n%s\n' "${dirty}"
    else
      printf '     dirty: no\n'
    fi
  fi

  printf '\n'
done

if [[ -d "${suite_dir}/overnightdesk-job-observatory/.git" ]]; then
  printf 'info - overnightdesk-job-observatory is present as parked local PRD stub\n\n'
fi

check "$([[ -f "${suite_dir}/deploys.log" ]]; echo $?)" "suite deploy log exists"
check "$([[ -d /mnt/f/_archive ]]; echo $?)" "/mnt/f/_archive exists"

if (( failures > 0 )); then
  printf '\n%d suite verification check(s) failed.\n' "${failures}"
  exit 1
fi

printf '\nSuite verification passed.\n'
