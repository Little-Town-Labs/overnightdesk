# Quickstart: Phase App Consolidation Verification

## Preparation gates

1. Confirm both worktrees are clean except reviewed migration changes.
2. Confirm source and destination App IDs and Production Environment IDs.
3. Confirm `Infrastructure:/` and the two moved intake sources still exist.
4. Compare copied path counts and protected fingerprints without printing
   values.
5. Confirm each consumer service account can export every target path.

## Current access gate

The live service-account inventory is:

- `azure-ops` (`c2e504a1-37c9-43c4-a397-6a46684d9383`) has Azure Ops
  Production only and owns the `control-tower` token used by Titus and intake.
- `platform-cli-cloud` (`9fc6e9c1-fe51-4bf6-b5c4-bcf5d8b7a366`) has
  Infrastructure Production only and owns the email-fetch token.
- `AgentZero` (`fd6c52d5-249d-4035-bc2d-ba1e85ccedda`) has OvernightDesk
  Production and owns the existing platform tokens.

The existing service token can read service-account metadata but received HTTP
403 when it attempted a declarative access update. An Owner/Admin Phase Console
session or PAT must add OvernightDesk Production to the first two accounts
while retaining their current grants. No production restart is allowed until
both installed tokens complete value-suppressed exports from their target
paths.

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
