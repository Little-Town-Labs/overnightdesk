# Quickstart: Phase App Consolidation Verification

## Preparation gates

1. Confirm both worktrees are clean except reviewed migration changes.
2. Confirm source and destination App IDs and Production Environment IDs.
3. Confirm `Infrastructure:/` and the two moved intake sources still exist.
4. Compare copied path counts and protected fingerprints without printing
   values.
5. Confirm each consumer service account can export every target path.

## Source qualification

```bash
tenants/hermes-titus/scripts/qualify.sh
tenants/hermes-titus/email-poller/scripts/qualify.sh
git diff --check
```

The first qualification proves the Titus default app. The second proves the
route-to-app matrix and existing Go intake behavior.

## Coordinated cutover

1. Rename the existing Azure app by stable ID.
2. Deploy the reviewed Titus and intake loaders.
3. Restart Hermes Titus and verify its secret load and health.
4. Restart Titus intake, then Agent intake, then Mitchel intake; verify each
   before advancing.
5. Update email-fetch to `overnightdesk:/email-fetch`, run it once, and verify
   its exit status and expected completion event.
6. Search live active configuration for obsolete selectors.

## Rollback

- Before rename failure: leave all consumers on source selectors.
- Titus failure after rename: rename the same App ID back to `azure-ops` or set
  the reviewed override while the source app identity remains intact.
- Agent/Mitchel failure: set the route override to the retained Azure app only
  if the old name is active; otherwise restore the prior app name first.
- Email-fetch failure: restore its backed-up script and select
  `Infrastructure:/`.
- Preserve every data volume and every Phase source path.

## Closeout

Run the full Aegis health check, update `overnightdesk-platform-standard`,
restart `overnightdesk-ops` after standards sync, and append the suite-root
`deploys.log`. Do not delete `Infrastructure`.
