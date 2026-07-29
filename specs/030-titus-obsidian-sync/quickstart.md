# Quickstart: Titus Obsidian Headless Sync

This quickstart qualifies source and prepares a disabled runtime. It does not
log in to Obsidian, create a remote vault, change production mounts, start the
sidecar, or deploy to Aegis.

## Local qualification

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk-worktrees/codex-feature-030-titus-obsidian-sync
tenants/hermes-titus/scripts/qualify.sh
docker build \
  --tag overnightdesk/obsidian-sync-titus:0.0.13 \
  tenants/hermes-titus/obsidian-sync
docker run --rm \
  --entrypoint /usr/local/bin/healthcheck \
  overnightdesk/obsidian-sync-titus:0.0.13
```

The final healthcheck is expected to report `uninitialized` and exit nonzero
when no state or vault is mounted. That is a safe image smoke test, not a
production health pass.

## Backup qualification

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk-ops-worktrees/codex-titus-obsidian-backup
python3 scripts/aegis-backup/test_producer.py
python3 -m py_compile scripts/aegis-backup/producer.py
```

## Standard qualification

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk-platform-standard-worktrees/codex-titus-obsidian-standard
python3 - <<'PY'
from pathlib import Path
import yaml

for path in Path("WHAT").glob("*.yaml"):
    yaml.safe_load(path.read_text())
print("platform-standard YAML: parsed")
PY
git diff --check
```

## Production activation boundary

Do not execute production lifecycle commands until all of these exist:

- owner-approved Obsidian Sync subscription;
- a dedicated, empty or reviewed remote vault;
- account token stored only at the strict Phase path;
- recovery-held E2EE password;
- reviewed and merged source in all owning repositories;
- disabled sidecar installation and matching migration manifests;
- qualified encrypted backup and isolated restore;
- explicit owner authorization for activation.

The production runbook in the platform standard provides the approved command
sequence after those gates are satisfied. Never put the account token or E2EE
password on a command line.
