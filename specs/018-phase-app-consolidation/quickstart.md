# Quickstart: Phase App Consolidation Verification

## Preparation gates

1. Confirm both worktrees are clean except reviewed migration changes.
2. Confirm source and destination App IDs and Production Environment IDs.
3. Confirm `Infrastructure:/` and the two moved intake sources still exist.
4. Compare copied path counts and protected fingerprints without printing
   values.
5. Confirm each consumer service account can export every target path.

## Current access gate

The verified target service-account inventory is:

- `timeless-tech-solutions` (`c2e504a1-37c9-43c4-a397-6a46684d9383`) is the TTS
  identity. Its `control-tower` token successfully exported the 14-key Titus
  intake path from the app with the same name.
- `platform-cli-cloud` (`9fc6e9c1-fe51-4bf6-b5c4-bcf5d8b7a366`) has
  Infrastructure Production only. Its email-fetch token is retained for
  rollback but is not part of the active target.
- `overnightdesk` (`fd6c52d5-249d-4035-bc2d-ba1e85ccedda`) has OvernightDesk
  Production. Its installed platform token successfully exported all 55
  `overnightdesk:/email-fetch` entries and backs the Agent, Mitchel, and
  email-fetch token files.

Both active service accounts were renamed in place after cutover. Their stable
IDs and installed tokens were retained; only their display names changed.

The two target identities have completed value-suppressed exports from their
target apps. No cross-app grant is required. `platform-cli-cloud` remains
unchanged and must not be deleted until rollback observation is complete.

## Source qualification

```bash
tenants/hermes-titus/scripts/qualify.sh
tenants/hermes-titus/email-poller/scripts/qualify.sh
git diff --check
```

The first qualification proves the Titus default app. The second proves the
route-to-app matrix and existing Go intake behavior.

## Coordinated cutover

1. Confirm app ID `f8e85a82-d424-49f7-9522-1586510f185c` is named
   `timeless-tech-solutions`.
2. Install `overnightdesk`-backed, consumer-owned token files without printing
   their values.
3. Deploy the reviewed Titus and intake loaders.
4. Restart Hermes Titus and verify its secret load and health.
5. Restart Titus intake, then Agent intake, then Mitchel intake; verify each
   before advancing.
6. Update email-fetch to `overnightdesk:/email-fetch`, run it once, and verify
   its exit status and expected completion event.
7. Search live active configuration for obsolete selectors and confirm no
   active consumer uses the `platform-cli-cloud` token.

## Rollback

- Before rename failure: leave all consumers on source selectors.
- Titus failure after rename: rename the same App ID back to `azure-ops` or set
  the reviewed override while the source app identity remains intact.
- Agent/Mitchel failure: set the route override to the retained Azure app only
  if the old name is active; otherwise restore the prior app name first.
- Email-fetch failure: restore its backed-up script and select
  `Infrastructure:/`.
- Preserve every data volume and every Phase source path.

## Activation evidence

- App ID `f8e85a82-d424-49f7-9522-1586510f185c` retained its identity under
  `timeless-tech-solutions`.
- Hermes Titus restarted and passed its full runtime verification.
- Titus, Agent, and Mitchel intake restarted individually and reported healthy
  with no published ports.
- Email-fetch completed one live run from `overnightdesk:/email-fetch`.
- Live token comparisons confirmed exactly two active identities and zero
  active `azure-ops` or `Infrastructure` selectors.
- `Infrastructure`, its source secrets, the legacy email-fetch dotenv, and the
  previous runner remain available for rollback.

## Closeout

Run the full Aegis health check, update `overnightdesk-platform-standard`,
restart `overnightdesk-ops` after standards sync, and append the suite-root
`deploys.log`. Do not delete `Infrastructure`.
