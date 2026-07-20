# Audited Use-Case Identity Backfill

This runbook covers the deployed Mitchel/Trevor `Tenet 1` foundation and the
reviewed Walter `Tenet 0` operator workflow. Tenet 1 production evidence is
recorded below. The Walter workflow is implemented and disposable-database
qualified but has not been applied to production. Neither workflow by itself
authorizes a dashboard consumer. Tenet 2, Open WebUI, Teams, resource renaming,
and creation of a person record remain out of scope.

## Walter T019a implementation checkpoint

On 2026-07-20, branch `021-walter-canonical-authorization` added the guarded
Tenet 0 foundation and a separate Gary membership workflow:

- The foundation creates zero memberships and requires the exact
  `TENET_0_WALTER_FOUNDATION` confirmation before apply.
- The membership operation accepts only `GARY_BETTER_AUTH_USER_ID`, verifies
  the referenced Better Auth account exists and has verified email, and
  requires the separate `ACTIVATE_TENET_0_GARY` confirmation.
- The manifest preserves active `hermes-walter`, `hermes-agent-data`,
  `aegis-prod.overnightdesk.com`, `tenant-0`, Walter intake, and Walter Phase
  identifiers. It also records the stopped `hermes-agent`, Agent intake, and
  Agent Phase identifiers as rollback bindings. It does not rename anything.
- `tenant-0` is recorded as a compatibility selector. T019a does not populate
  the nullable platform-instance canonical foreign keys and reports
  `platformInstanceLinked: false`.
- Disposable Neon applied both Tenet 1 and Tenet 0 foundations, resolved all
  ten Walter selectors, attached one verified Gary fixture membership in the
  separate transaction, ran both Walter verification commands, preserved the
  Tenet 1 legacy-authoritative rollback checks, and dropped the test database.
- Production still has no Tenet 0 canonical allocation or Gary canonical
  membership. Existing Walter/OIDC authorization remains authoritative until
  T019b shadow comparison and T019c browser/rollback gates pass.

## Production checkpoint

On 2026-07-19, merged main commit
`c3a81b65e76fd2bf20d054bf5b09fbaf9e5b9992` was used to complete the
membership-independent production operation:

- Migration 0009 deployed all 46 reviewed statements and its metadata-only
  audit event.
- Tenet 1 was allocated once with a Trevor runtime/persona foundation, four
  resource bindings, one Phase boundary binding, and zero memberships.
- Verification passed all four canonical selector checks. Schema and
  foundation retries both returned `verified_noop`.
- Production contains one Tenet 1 allocation, one schema audit event, and one
  foundation audit event.
- No platform-instance link, orchestrator link, resource rename, or
  authorization cutover was performed. Legacy reads remain authoritative.

Later on 2026-07-19, merged main commit
`f1869906a19349bdcc1a08e9d84e43ecaab7761b` completed the T016 compatibility
checkpoint. The guarded production comparison returned one passing legacy
check and four of four canonical matches with `authority: legacy`. Switching
back to `legacy` returned zero canonical checks, and the foundation remained
`verified_noop` with four of four selectors. A read-only closeout found exactly
four recent `canonical_resolution_match` audit rows, only the expected number
and resource-binding selector types, no forbidden resource/email/path values,
and zero memberships. No identity, membership, resource, or secret record was
changed; the only T016 production writes were those four metadata-only audits.

The preceding read-only preflight established:

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
UUIDs. The deployed Tenet 1 foundation intentionally has no platform-instance
or orchestrator-tenant link. Linking either registry later requires a separate,
reviewed operation against an independently verified record.

## Required prerequisites

1. Merge the reviewed implementation containing these commands.
2. Foundation allocation does not require a Better Auth user. Before the later
   membership operation, have Mitchel complete the normal registration or
   invitation flow and verify his email. Obtain the opaque Better Auth
   `user.id` with a metadata-only query. Do not infer the subject from name or
   email. An existing but unverified account blocks membership only.
3. Load `DATABASE_URL` from the approved Vercel/Neon secret source without
   printing it. Any temporary environment file must be mode `0600` and removed
   at closeout.
4. Set `IDENTITY_SCHEMA_ACTOR`, `IDENTITY_FOUNDATION_ACTOR`, and later
   `IDENTITY_MEMBERSHIP_ACTOR` to a stable operator identifier. None is a
   credential.
5. Keep canonical identity reads non-authoritative. This operation adds data;
   it does not change authorization.

## Qualify before production

Use a separate administrator URL in `DATABASE_TEST_URL`. The command creates a
uniquely named `overnightdesk_identity_*` database, applies the baseline
through migration 0008, invokes the production schema command for migration
0009, runs the real batch/resolver/audit and shared membership-store tests,
proves legacy-authoritative compare/rollback behavior, and drops the database
in `finally`.

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

## Plan and apply the Tenet 1 foundation

```bash
npm run identity:foundation:plan
```

Expected plan output contains the Tenet number, counts, and linkage booleans
only. Proposed UUIDs are intentionally omitted because the apply command
generates the committed allocation IDs. Output must not contain the Better
Auth user ID, resource values, emails, tokens, or secret values. Apply once
with the exact confirmation phrase:

```bash
IDENTITY_FOUNDATION_CONFIRM=TENET_1_FOUNDATION \
  npm run identity:foundation:apply
npm run identity:foundation:verify
```

The foundation apply batch creates the use case, immutable number allocation,
runtime, default Trevor persona, resource bindings, secret-boundary binding,
and audit row atomically with zero memberships. A retry must return
`verified_noop`. Verification resolves Tenet 1 plus container, volume, and
hostname selectors to the same canonical boundary without printing their
values. A separate membership command later requires the email-verified opaque
Better Auth user ID and inserts only the owner membership plus its audit row;
it must not regenerate or rewrite the foundation IDs.

## Compare resolution and prove read-path rollback

`CANONICAL_IDENTITY_READ_MODE` supports only `legacy` and `compare` and
defaults to `legacy`. Both modes return the existing legacy result as the sole
authority. `compare` adds shadow canonical reads and metadata-only audit events;
the command rejects a `canonical` mode so T016 cannot become an authorization
cutover by configuration mistake.

Run the comparison from reviewed merged code with its separate confirmation:

```bash
CANONICAL_IDENTITY_READ_MODE=compare \
IDENTITY_COMPARISON_CONFIRM=COMPARE_TENET_1_SHADOW \
  npm run identity:compatibility:verify
```

Expected metadata reports one passing legacy check, four canonical checks,
four matches, no mismatch/error labels, and `authority: legacy`. Selector
values, email addresses, user IDs, and secret values must not appear in output
or audit details.

Then prove the operational rollback and retained additive state:

```bash
CANONICAL_IDENTITY_READ_MODE=legacy \
  npm run identity:compatibility:verify
IDENTITY_FOUNDATION_ACTOR=operator:identity-rollback-verification \
  npm run identity:foundation:verify
```

The legacy result must report zero canonical checks. Foundation verification
must remain `verified_noop` with all selector checks passing. Do not delete or
rewrite identity rows as part of this rollback.

## Attach verified membership later

After the intended person completes Better Auth email verification, obtain the
opaque `user.id` through a value-suppressed metadata query and set it only in
the operator environment:

```bash
export MITCHEL_BETTER_AUTH_USER_ID='<opaque Better Auth user.id>'
npm run identity:membership:plan
IDENTITY_MEMBERSHIP_CONFIRM=ACTIVATE_TENET_1_MITCHEL \
  npm run identity:membership:apply
npm run identity:membership:verify
```

The membership plan blocks when the account is absent or unverified. Its output
contains only status and count metadata, never the Better Auth user ID or email.

## Plan and apply the Walter Tenet 0 foundation

T019a uses target-specific commands so an operator cannot accidentally apply
the historical Tenet 1 manifest while working on Walter:

```bash
IDENTITY_FOUNDATION_ACTOR=operator:<stable-id> \
  npm run identity:walter:foundation:plan
IDENTITY_FOUNDATION_ACTOR=operator:<stable-id> \
IDENTITY_FOUNDATION_CONFIRM=TENET_0_WALTER_FOUNDATION \
  npm run identity:walter:foundation:apply
IDENTITY_FOUNDATION_ACTOR=operator:<stable-id> \
  npm run identity:walter:foundation:verify
```

The plan output contains Tenet number, binding counts, zero memberships, and
linkage booleans. Apply inserts the use case, immutable allocation, Walter
runtime/default persona, active and rollback bindings, Phase boundaries, and
one metadata-only audit row in a single batch. Verification must return ten of
ten canonical selectors. It does not grant Gary access and does not change the
current instance, OIDC client, container, volume, Nginx, Phase, or intake
configuration.

## Attach Gary's Walter membership separately

Before planning membership, obtain Gary's existing opaque Better Auth
`user.id` with a value-suppressed metadata query. Do not derive it from an
email address and do not print it:

```bash
export GARY_BETTER_AUTH_USER_ID='<opaque Better Auth user.id>'
IDENTITY_MEMBERSHIP_ACTOR=operator:<stable-id> \
  npm run identity:walter:membership:plan
IDENTITY_MEMBERSHIP_ACTOR=operator:<stable-id> \
IDENTITY_MEMBERSHIP_CONFIRM=ACTIVATE_TENET_0_GARY \
  npm run identity:walter:membership:apply
IDENTITY_MEMBERSHIP_ACTOR=operator:<stable-id> \
  npm run identity:walter:membership:verify
```

The membership command blocks on a missing/unverified subject, a missing or
drifted Tenet 0 foundation, an identity collision, or an existing mismatched
membership. Its write batch contains only the active owner membership and its
metadata-only audit event. This database grant is not selected as OIDC
authority until T019b and T019c complete.

## Failure and rollback

- A failed Neon batch is atomic; investigate before retrying.
- `identity_schema_missing`, identity conflicts, and canonical drift are hard
  stops for foundation allocation. `membership_user_missing` and
  `membership_user_unverified` are hard stops only for the separate membership
  operation and do not block foundation work.
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
