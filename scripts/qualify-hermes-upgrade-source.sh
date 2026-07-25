#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
standard_root=${1:-}

upstream_ref='nousresearch/hermes-agent@sha256:c1731f7ffd49c37f2b4b6cd01873d4256ba6f06217dfca2cc41cede55815ea82'
arm64_digest='sha256:4586e3f2375e42e70a13282a19dfe16d4145b22da92a3c46b7aa1643c74a0ec1'
derived_tag='overnightdesk/hermes-agent:0.19.0-coder'
derived_image_id='sha256:258a879177424dd1a530d26c4962c215a0716095e73e36af8a5cfebb1a58503c'
release_status='accepted_live'

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

require_fixed() {
  local needle=$1
  local path=$2
  grep -Fq -- "$needle" "$path" || fail "$path is missing: $needle"
}

test -n "$standard_root" || fail "usage: $0 <platform-standard-root>"
test -d "$standard_root/WHAT" || fail "platform standard WHAT directory is unavailable"
test -f "$repo_root/infra/hermes-coder/Dockerfile" ||
  fail "repository-owned Hermes coder Dockerfile is unavailable"

require_fixed "FROM $upstream_ref" "$repo_root/infra/hermes-coder/Dockerfile"
require_fixed "$derived_tag" "$repo_root/infra/hermes-coder/Dockerfile"
require_fixed "$upstream_ref" "$repo_root/docker-compose.yml"

for path in \
  "$repo_root/tenants/hermes-titus/runtime/run-container.sh" \
  "$repo_root/tenants/hermes-titus/runtime/prepare-volume.sh" \
  "$repo_root/tenants/hermes-titus/README.md"; do
  require_fixed "$derived_tag" "$path"
done

python - "$repo_root/tenants/hermes-titus/config/config.yaml" <<'PY'
import sys
from pathlib import Path

import yaml

config = yaml.safe_load(Path(sys.argv[1]).read_text()) or {}
if config.get("_config_version") != 33:
    raise SystemExit("FAIL: Titus config schema is not explicitly version 33")
approvals = config.get("approvals") or {}
if approvals.get("mode") != "manual":
    raise SystemExit("FAIL: Titus approvals.mode is not explicitly manual")
if approvals.get("cron_mode") != "deny":
    raise SystemExit("FAIL: Titus approvals.cron_mode is not explicitly deny")
PY

runbook="$standard_root/docs/runbooks/hermes-agent-update-protocol.md"
require_fixed "v0.19.0" "$runbook"
require_fixed "$upstream_ref" "$runbook"
require_fixed "$arm64_digest" "$runbook"
require_fixed "approvals.mode" "$runbook"
require_fixed "Mitchel" "$runbook"
require_fixed "Walter" "$runbook"
require_fixed "Titus" "$runbook"

require_fixed "$derived_tag" "$standard_root/WHAT/hermes.yaml"
require_fixed "$upstream_ref" "$standard_root/WHAT/hermes.yaml"
require_fixed "$arm64_digest" "$standard_root/WHAT/hermes.yaml"
require_fixed "$derived_tag" "$standard_root/WHAT/services.yaml"

python - "$standard_root/WHAT" "$derived_tag" "$derived_image_id" "$release_status" <<'PY'
import sys
from pathlib import Path

import yaml

what_root = Path(sys.argv[1])
derived_tag = sys.argv[2]
derived_image_id = sys.argv[3]
release_status = sys.argv[4]

for path in sorted(what_root.glob("*.yaml")):
    with path.open() as handle:
        yaml.safe_load(handle)

hermes = yaml.safe_load((what_root / "hermes.yaml").read_text()) or {}
candidate = hermes.get("upgrade_candidate_2026_07_24") or {}
if candidate.get("status") != release_status:
    raise SystemExit("FAIL: aggregate Hermes release status is inconsistent")
if candidate.get("derived_image_id") != derived_image_id:
    raise SystemExit("FAIL: derived image ID is missing or incorrectly typed")
if "derived_image_digest" in candidate:
    raise SystemExit("FAIL: local derived image ID is mislabeled as a digest")
production = candidate.get("production_evidence") or {}
if production.get("image_id") != derived_image_id:
    raise SystemExit("FAIL: production image ID is missing or inconsistent")
if production.get("aggregate_qualification") != "passed":
    raise SystemExit("FAIL: aggregate production qualification is not recorded")
if production.get("rollback_handles") != "retained":
    raise SystemExit("FAIL: production rollback handles are not recorded")

services = yaml.safe_load((what_root / "services.yaml").read_text()) or {}
by_name = {
    service.get("name"): service
    for service in services.get("services", [])
    if isinstance(service, dict)
}
for name in ("hermes-mitchel", "hermes-walter", "hermes-titus"):
    service = by_name.get(name) or {}
    if service.get("candidate_image") != derived_tag:
        raise SystemExit(f"FAIL: {name} candidate image is inconsistent")
    if service.get("candidate_status") != release_status:
        raise SystemExit(f"FAIL: {name} release status is inconsistent")
    if service.get("image") != derived_tag:
        raise SystemExit(f"FAIL: {name} current image is inconsistent")

print("platform-standard YAML: parsed")
PY

if rg -n -i '(github_pat_|ghp_|api[_-]?key\s*=|token\s*=|secret\s*=)' \
  "$repo_root/infra/hermes-coder" "$repo_root/specs/027-hermes-v019-upgrade" \
  --glob '!research.md' --glob '!spec.md' --glob '!plan.md' --glob '!tasks.md'; then
  fail "candidate source contains a credential-like assignment"
fi

printf 'Hermes v0.19 source contracts: PASS\n'
