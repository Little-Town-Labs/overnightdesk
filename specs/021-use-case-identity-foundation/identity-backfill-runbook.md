# Tenet 1 Audited Identity Backfill

This runbook applies only to the owner-approved Mitchel/Trevor `Tenet 1`
allocation. It does not authorize Tenet 0, Tenet 2, authorization cutover,
Open WebUI, Teams, resource renaming, or creation of a person record.

## Current production preflight

Read-only checks on 2026-07-19 established:

- Neon does not yet contain migration 0009 identity tables or instance links.
- Better Auth contains one user and no Mitchel subject.
- Mitchel's address is present exactly once in the production invite allowlist,
  and the resulting Vercel production deployment serves the public sign-up
  route. His Better Auth account still does not exist until he completes
  registration.
- The platform `instance` table contains only Walter's `tenant-0` row.
- The Aegis orchestrator `tenants` registry is empty, so no Mitchel
  orchestrator UUID exists to bind.
- Live Mitchel resources are `hermes-mitchel`, `hermes-mitchel-data`, and
  `aero-fett.overnightdesk.com`.
- The approved Phase boundary is App `overnightdesk`, environment
  `production`, path `/agents/hermes-email-intake/mitchel`.

The missing registry rows are evidence, not invitations to generate substitute
UUIDs. The initial Tenet 1 command intentionally has no platform-instance or
orchestrator-tenant input. Linking either registry later requires a separate,
reviewed operation against an independently verified record.

## Required prerequisites

1. Merge the reviewed implementation containing these commands.
2. Have Mitchel complete the normal Better Auth registration or invitation
   flow and verify his email. Obtain the opaque Better Auth `user.id` with a
   metadata-only query. Do not infer the subject from name or email inside the
   backfill. An existing but unverified account is a hard stop.
3. Load `DATABASE_URL` from the approved Vercel/Neon secret source without
   printing it. Any temporary environment file must be mode `0600` and removed
   at closeout.
4. Set `IDENTITY_SCHEMA_ACTOR` and `IDENTITY_BACKFILL_ACTOR` to a stable
   operator identifier. Neither field is a credential.
5. Keep canonical identity reads non-authoritative. This operation adds data;
   it does not change authorization.

## Qualify before production

Use a separate administrator URL in `DATABASE_TEST_URL`. The command creates a
uniquely named `overnightdesk_identity_*` database, applies the baseline
through migration 0008, invokes the production schema command for migration
0009, runs the real batch/resolver/audit test, and drops the database in
`finally`.

```bash
npm run test:identity-backfill-db
```

The qualification refuses to run when `DATABASE_TEST_URL` equals
`DATABASE_URL`.

## Plan and apply migration 0009

The plan is read-only and reports `ready`, `deployed`, or fails on mixed state.

```bash
npm run identity:schema:plan
```

Apply only from the reviewed merged commit:

```bash
IDENTITY_SCHEMA_CONFIRM=ADD_IDENTITY_SCHEMA_0009 \
  npm run identity:schema:apply
```

The apply command rejects destructive migration text, submits all migration
statements plus one metadata-only audit event in one Neon transaction, and
then verifies all expected tables and nullable instance columns.

## Plan and apply Tenet 1

Set the stable Better Auth subject obtained from the authenticated identity
record.

```bash
export MITCHEL_BETTER_AUTH_USER_ID='<opaque Better Auth user.id>'
npm run identity:backfill:plan
```

Expected plan output contains the Tenet number, counts, and linkage booleans
only. Proposed UUIDs are intentionally omitted because the apply command
generates the committed allocation IDs. Output must not contain the Better
Auth user ID, resource values, emails, tokens, or secret values. Apply once
with the exact confirmation phrase:

```bash
IDENTITY_BACKFILL_CONFIRM=TENET_1_MITCHEL_TREVOR \
  npm run identity:backfill:apply
npm run identity:backfill:verify
```

The apply batch creates the use case, immutable number allocation, runtime,
default Trevor persona, active Mitchel owner membership, resource bindings,
secret-boundary binding, and audit row atomically. A retry must return
`verified_noop`. Verification resolves Tenet 1 plus container, volume, and
hostname selectors to the same canonical boundary without printing their
values.

## Failure and rollback

- A failed Neon batch is atomic; investigate before retrying.
- `identity_schema_missing`, `membership_user_missing`,
  `membership_user_unverified`, identity conflicts, and canonical drift are
  hard stops.
- Do not create a fake Better Auth user, substitute Gary, or invent an
  orchestrator/platform instance UUID.
- Do not delete identity rows or the immutable number allocation as rollback.
- Existing legacy reads remain authoritative, so operational rollback is to
  leave canonical reads disabled while retaining additive records for review.
- Do not rename or recreate the live container, volume, hostname, or Phase
  path.

After a production apply, append the result to the suite `deploys.log`, update
`overnightdesk-platform-standard` from verified state, and run the required
security/data/API/migration/operations review before any authorization canary.
