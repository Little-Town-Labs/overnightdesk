# Quickstart: Qualifying Hermes v0.19

## Source qualification

```bash
scripts/qualify-hermes-upgrade-source.sh \
  ../overnightdesk-platform-standard-worktrees/codex-feature-027-hermes-v019-standard
bash -n tenants/hermes-titus/runtime/*.sh
git diff --check
```

## Release and image qualification

1. Re-resolve the official GitHub release and immutable registry index.
2. Verify the index still contains the recorded Linux ARM64 manifest.
3. Pull the immutable digest on Aegis.
4. Copy the exact merged `infra/hermes-coder/` source to
   `/opt/overnightdesk/hermes-coder/`.
5. Build `overnightdesk/hermes-agent:0.19.0-coder`.
6. Verify base pin, runtime version, GitHub CLI, user, launcher paths, and image
   ID before staging.

## Staging qualification

1. Snapshot metadata and create staging-only copies of each tenant volume.
2. Ensure staging cannot start production message/channel delivery.
3. Run command-level version, doctor, cron, config, MCP, and tenant checks.
4. Run a short full-process start with gateway/dashboard process and internal
   status checks.
5. Remove only disposable staging containers/volumes after evidence is
   retained; never touch live volumes.

### Current candidate checkpoint — 2026-07-24

- Aegis evidence: `/var/tmp/hermes-v019-upgrade-20260724T232422Z`
  (root-owned, mode 0700)
- Immutable OCI index and Linux ARM64 child: verified
- Derived image ID:
  `sha256:258a879177424dd1a530d26c4962c215a0716095e73e36af8a5cfebb1a58503c`
- Copied-volume version, doctor, config, cron, database integrity, gateway,
  dashboard, MCP discovery, native auth, and existing-provider inference:
  passed for Mitchel, Walter, and Titus
- Production delivery during staging: disabled
- Live v0.18 runtimes: unchanged
- Ringer initial review:
  `overnightdesk-feature-027-hermes-v019-quality-gate-20260724T234735Z-p399739`
- Ringer bounded delta review:
  `overnightdesk-feature-027-hermes-v019-delta-review-20260724T235435Z-p403072`
  (`APPROVE`)

## Production qualification

1. Cut over Mitchel and qualify.
2. Cut over Walter and qualify.
3. Synchronize exact Titus source, restart only Titus, and run its repository
   qualification.
4. Verify all three together, protected public boundaries, unrelated container
   preservation, Nginx/Ops health, and bounded logs.
5. Refresh the future-tenant provisioner pin and verify its effective
   environment.
6. Observe one healthy scheduler interval and retain v0.18 rollback handles.
7. Reconcile standard source and append the deployment ledger.

## Stop conditions

- Release/digest drift
- Missing ARM64 manifest
- Derived image built from any other base
- Effective smart/off approval mode
- Config, doctor, cron, MCP, gateway, dashboard, auth, model/provider, memory,
  email, Matrix, or Control Tower qualification failure
- Unexpected unrelated container change
- Missing rollback handle
- Any secret or message-content exposure in evidence
