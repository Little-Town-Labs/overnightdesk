# Audited Use-Case Identity Backfill

This runbook covers the deployed Mitchel/Trevor `Tenet 1` foundation and the
completed Walter `Tenet 0` operator and authorization workflow. Tenet 1 has no
production membership or consumer. Walter's foundation and Gary membership
are deployed; its guarded canonical canary and final legacy rollback are
verified below. Tenet 2, Open WebUI, Teams, resource renaming, and creation of
a person record remain out of scope.

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
- At this implementation checkpoint, production still had no Tenet 0
  allocation or Gary membership. The later T019c3 and T019c4 checkpoints below
  supersede that historical state.

## Walter T019b shadow checkpoint

On 2026-07-20, branch `021-walter-canonical-shadow` added the pre-consumer
legacy-owner/canonical-membership comparison contract:

- `WALTER_MEMBERSHIP_AUTH_MODE` defaults to `legacy`, accepts only `legacy` or
  `compare`, and deliberately rejects a canonical authority mode.
- `compare` requires the exact
  `WALTER_MEMBERSHIP_COMPARISON_CONFIRM=COMPARE_WALTER_MEMBERSHIP_SHADOW`
  confirmation. This is separate from the earlier Tenet 1 identity-resolution
  comparison confirmation.
- The returned `authorized` value always comes from the legacy exact-owner
  decision. Canonical membership is observation only, including when the two
  decisions disagree or canonical storage/audit is unavailable.
- Comparison events record only authority, match state, and
  allow/deny/unavailable decisions. They contain no Better Auth subject,
  membership identifier, email, alias, resource value, secret, or conversation
  content.
- Switching to `legacy` performs zero canonical authorization and zero
  comparison-audit calls. Additive canonical records remain intact.
- This checkpoint does not wire `hermes-oidc.ts` or any production consumer.
  T019c remains responsible for Walter's guarded OIDC integration and browser
  rollback evidence before canonical authority can be considered.

## Walter T019c guarded OIDC implementation checkpoint

On 2026-07-20, branch `021-walter-canonical-oidc` connected only Walter's
authorization-code and token paths to the shared membership boundary:

- `WALTER_MEMBERSHIP_AUTH_MODE=legacy` remains the default. It uses the exact
  legacy instance owner and performs zero canonical lookup or audit work.
- `compare` requires
  `WALTER_MEMBERSHIP_COMPARISON_CONFIRM=COMPARE_WALTER_MEMBERSHIP_SHADOW`,
  observes canonical membership, and keeps the legacy owner authoritative.
- `canonical` requires
  `WALTER_MEMBERSHIP_CANONICAL_CONFIRM=ENABLE_WALTER_CANONICAL_MEMBERSHIP` and
  makes active, unexpired canonical membership authoritative. A missing
  foundation, inactive runtime, unavailable storage, or audit failure denies
  authorization.
- The consumer recognizes Walter only from the server-loaded platform
  instance `tenant-0`, resolves the explicit `overnightdesk` / platform
  instance resource binding, verifies immutable Tenet number 0 and a runtime
  UUID, and passes only the authenticated Better Auth user ID to the shared
  authorizer. Browser-supplied tenant, persona, alias, or resource values are
  never authorization inputs.
- Non-Walter instances continue to use exact legacy-owner authorization in all
  three Walter modes.
- Unit tests cover both OIDC authorization-code and token paths. Disposable
  Neon then exercised the real resolver, membership store, and audit adapter
  for active member, non-member, suspended, expired, compare, and legacy
  rollback states. The retry preserved all ten Walter selectors and the
  separate verified membership fixture, then dropped the disposable database.

Merged commit `50da928e11b13060c3b5ab873b3f12bf1f2d3fac` completed the
T019c3 production gate on 2026-07-20:

- The guarded Tenet 0 foundation applied once and its retry returned
  `verified_noop` with all ten selectors matched.
- The separate Gary membership plan returned `ready` for exactly one verified
  member, applied once, and its retry returned `verified_noop`.
- Read-only closeout found one Tenet 0 allocation, one active Tenet 0
  membership, and two metadata-only operator audit rows.
- Vercel production contains only
  `WALTER_MEMBERSHIP_AUTH_MODE=legacy`; neither comparison nor canonical
  confirmation is present. Deployment `9AgtNVztYJuyL4c3woPZQka4XiBz` built
  successfully and was aliased to `www.overnightdesk.com`.
- The public site returned HTTP 200, the dashboard and Aegis root redirected
  anonymous requests to sign-in, OIDC discovery remained canonical, and the
  existing Walter and Nginx containers remained up. No Aegis service was
  restarted or reconfigured.

Legacy exact-owner authorization therefore remained authoritative and
performed zero canonical work per request until the T019c4 canary below.

## Walter T019c4 canonical canary and rollback checkpoint

On 2026-07-20, Walter completed the guarded production comparison, canonical
canary, denial-state checks, browser acceptance, and final rollback:

- Legacy-authoritative comparison ran in Vercel deployment
  `7eZSet2VK5nJqTmi5b7pthpHCXUW`, produced three matches, zero mismatches, and
  zero errors, then returned to deployment `CRVZhwvLT9sYDDrv7CC4ahMdS29s`
  with `legacy` authority and zero further canonical work.
- Canonical canary deployment `dpl_22YPJTnKTwdb6MioASMEpZ6LKtEa` used the
  exact canonical confirmation. Gary completed clean platform sign-in,
  dashboard-button launch, direct Aegis launch, Hermes logout, and SSO return
  from a valid Better Auth session. Walter, Nginx, OIDC discovery, JWKS, and
  the public routes remained healthy.
- A server-side Tenet 1 non-member check proved the shared cross-use-case
  boundary: Gary's Tenet 0 subject and the Tenet 1 runtime were resolved by
  the server, canonical authorization denied `not_authorized`, exactly one
  metadata-only denial audit was written, and no identity or membership row
  changed. This was shared-authorizer evidence, not a browser/OIDC Tenet 1
  test.
- The existing Tenet 0 membership was temporarily suspended and then restored.
  The owner browser received `access_denied`; the bounded interval contained
  one membership denial and one dashboard denial with no forbidden audit
  values. The membership ID and expiry were preserved.
- The same active membership was temporarily assigned a past expiry and then
  restored. The owner browser again received `access_denied`; the bounded
  interval contained one membership denial and one dashboard denial with no
  forbidden audit values. The membership ID and active status were preserved.
- At the rollback boundary, cumulative canonical authorization contained 15
  grants and 3 denials. The three denials comprise the Tenet 1 shared-boundary
  check plus Walter's suspended and expired checks; the totals are therefore
  not all Walter browser events. Comparison remained three matches, zero
  mismatches, and zero errors.
- Final Vercel deployment `dpl_93wZmmRs2ju7bqN2b3vofkpQKjR9` restored
  `WALTER_MEMBERSHIP_AUTH_MODE=legacy` and removed both comparison and
  canonical confirmations. After a fresh owner login, dashboard successes
  advanced from 14 to 15 while canonical grant/denial totals and comparison
  totals remained frozen. Walter's membership is active, unsuspended, and
  unexpired.

T019 and T019c are complete. Production deliberately retains exact legacy
owner authority after the proven canary; T020 Titus / Tenet 2 is the next
engineering task.

## Titus T020a implementation checkpoint

On 2026-07-20, branch `021-titus-identity-foundation` added the guarded Tenet 2
foundation and separate Gary membership workflow without applying production
changes:

- The foundation requires the exact `TENET_2_TITUS_FOUNDATION` confirmation
  and creates zero memberships.
- The membership operation accepts only `GARY_BETTER_AUTH_USER_ID`, verifies
  that the referenced Better Auth account exists with verified email, and
  requires the separate `ACTIVATE_TENET_2_GARY` confirmation.
- The manifest preserves `hermes-titus`, `hermes-titus-data`, the active
  runtime, Control Tower, memory, Matrix, and routed-intake Phase paths, the
  rollback-only legacy email path, the staged Teams path as compatibility
  metadata, and the active `titus` intake route. Seven Phase boundary records
  point to App `timeless-tech-solutions`, environment `production`, without
  storing secret values.
- Disposable Neon applied Tenets 1, 0, and 2; attached Gary only after the
  Titus foundation; matched all 11 Titus selectors; verified both Titus
  operator commands and their idempotent apply retries; preserved the existing
  Tenet 1 legacy/compare rollback and Walter gates; and dropped the database.
- No production allocation, membership, consumer, Matrix E2EE policy, email
  sender allowlist, Teams activation, Austin grant, or live resource changed.
  T020b is the separate shadow checkpoint below; T020c remains a separate
  consumer-selection gate.

The production operation, when separately approved after merge, runs from an
environment where `DATABASE_URL` is already supplied through the protected
deployment boundary and uses:

```bash
IDENTITY_FOUNDATION_ACTOR=operator:<stable-id> \
  npm run identity:titus:foundation:plan

IDENTITY_FOUNDATION_ACTOR=operator:<stable-id> \
IDENTITY_FOUNDATION_CONFIRM=TENET_2_TITUS_FOUNDATION \
  npm run identity:titus:foundation:apply

IDENTITY_FOUNDATION_ACTOR=operator:<stable-id> \
  npm run identity:titus:foundation:verify
```

Only after the foundation verifies and Gary's opaque Better Auth user ID is
obtained through a metadata-only lookup may the separate membership operation
run:

```bash
IDENTITY_MEMBERSHIP_ACTOR=operator:<stable-id> \
GARY_BETTER_AUTH_USER_ID=<opaque-user-id> \
  npm run identity:titus:membership:plan

IDENTITY_MEMBERSHIP_ACTOR=operator:<stable-id> \
IDENTITY_MEMBERSHIP_CONFIRM=ACTIVATE_TENET_2_GARY \
GARY_BETTER_AUTH_USER_ID=<opaque-user-id> \
  npm run identity:titus:membership:apply

IDENTITY_MEMBERSHIP_ACTOR=operator:<stable-id> \
GARY_BETTER_AUTH_USER_ID=<opaque-user-id> \
  npm run identity:titus:membership:verify
```

Command output contains status, counts, linkage booleans, and selector
match/mismatch labels only. It must not contain the Better Auth user ID,
membership ID, resource values, Phase paths, email, or secret values.

## Titus T020b shadow checkpoint

On 2026-07-20, branch `021-titus-canonical-shadow` added a pre-consumer
Titus/Gary membership comparison boundary without changing production:

- `legacy` is the default and performs zero canonical authorization or
  comparison-audit work.
- `compare` requires the exact `COMPARE_TITUS_MEMBERSHIP_SHADOW`
  confirmation and still returns the legacy owner decision as authority.
- `canonical` is rejected. T020b contains no authority-enabling mode.
- Walter and Titus share the same fail-safe comparison primitive, while Titus
  retains its own mode parser, confirmation phrase, and
  `titus_authorization_shadow_compared` metadata-only event type.
- Controlled tests cover allow/deny matches, both mismatch directions,
  unavailable and thrown canonical dependencies, audit failure, exact
  confirmation, output suppression, and rollback with zero canonical work.
- No production database record, environment variable, audit event, consumer,
  Matrix E2EE membership, email sender allowlist, Teams integration, Austin
  grant, Phase path, or live resource changed.

T020c's selection below precedes any production comparison or authority
change. Better Auth membership alone does not authorize Matrix, email, or
Teams identities.

## Titus T020c consumer-selection checkpoint

On 2026-07-20, T020c selected a dedicated Titus Open WebUI deployment as the
first Tenet 2 membership consumer. This is a contract decision only; no Open
WebUI container, volume, hostname, OIDC client, Phase path, Vercel assignment,
Nginx route, database row, or production authorization changed.

The selected adapter uses the exact OvernightDesk OIDC `(issuer, subject)`
pair. The subject is Gary's opaque Better Auth `user.id`; email is not an
account key. The OIDC client/audience, callback, requested hostname, canonical
Tenet 2 runtime, Open WebUI deployment, and private `hermes-titus` endpoint
must resolve to the same server-side assignment. Nginx must recheck the Better
Auth session and active membership on HTTP, streaming, and WebSocket requests,
so a retained Open WebUI cookie cannot bypass logout, suspension, expiry, or
revocation.

A read-only Aegis preflight at selection time confirmed `hermes-titus.service`
and `hermes-email-intake@titus.service` active, both corresponding containers
healthy with no published ports, the legacy standalone Titus poller inactive,
`TITUS_MATRIX_STATE=ready`, and the durable Matrix store present. No secret,
identity value, message, or conversation content was inspected.

This adds a third Titus interaction identity without replacing the two active
ones. Matrix retains its exact operator/bot/encrypted-room/device policy, and
email retains its dedicated AgentMail inbox and exact sender allowlist. Teams
and Austin remain later work. Titus Open WebUI secrets belong to the
`timeless-tech-solutions` Phase App; Walter's later isolated Open WebUI
deployment belongs to `overnightdesk`. Mitchel/Trevor remains gated on
Mitchel's verified membership.

The next gate is T020d: pin and review the Open WebUI release and prove the
OIDC, frame, cookie, streaming/WebSocket, logout, local-auth shutdown, denial,
and route-disabled rollback contract with fixtures. Production Tenet 2 apply
and the Titus/Gary canary remain the separate T020e gate.

## Titus T020d disabled Open WebUI authentication spike

On 2026-07-20, branch `020-open-webui-auth-spike` completed the fixture-backed
T020d gate without changing production. Open WebUI `v0.10.2` is pinned to its
signed source commit and Linux arm64/amd64 image manifests in
`infra/open-webui/release.json`. The release, license, default headers,
SQLite/OAuth-session state, OIDC behavior, and published advisories are
recorded in `specs/020-open-webui-platform/release-review.md`.

The spike defines a distinct `open-webui` public OIDC client with S256 PKCE,
the exact `/oauth/oidc/callback`, fixed issuer/audience/host/runtime bindings,
and email merging disabled. The outer Better Auth and canonical membership
gate remains authoritative for HTTP, SSE, and WebSocket traffic even when the
browser retains an Open WebUI session. Local signup/password login, trusted
identity headers, uploads, audio, web search, image generation, code execution,
and workspace tools are disabled in the fixture contract.

Controlled tests cover active member, non-member, wrong-use-case, suspended,
unauthenticated, wrong host/audience/client, unapproved frame, forged trusted
header, oversized request, unavailable Hermes backend, attempted tool-authority
expansion, canonical-store failure, top-level bootstrap, embedded reuse,
Open WebUI logout/re-login, platform logout with a stale upstream session, and
route-disabled rollback. Rollback preserves the prospective Open WebUI volume,
Hermes runtime, Matrix, and email state.

The result is production-disabled. T020e must repeat the release/advisory
review, apply Tenet 2 and Gary membership separately, deploy the workload and
route disabled, and pass value-suppressed callback/container-log checks before
one Gary/Titus assignment may be enabled. The upstream release can emit raw
token or claim objects at warning level on malformed OIDC callbacks; any
sentinel leakage during T020e is a hard stop requiring a patch or filter.

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

## Roll out Walter OIDC membership authority

Apply this sequence only from a reviewed, merged commit after the Walter
foundation and Gary membership verification both return `verified_noop`:

1. Deploy with `WALTER_MEMBERSHIP_AUTH_MODE=legacy`. Verify the existing
   Walter dashboard button, direct login, and logout behavior before any
   canonical read is enabled.
2. Set `compare` plus the exact comparison confirmation and redeploy. Verify
   the legacy owner still succeeds, then inspect only metadata fields for a
   `walter_membership_authorization_shadow.match` audit.
3. Roll back to `legacy`, redeploy, and verify the dashboard again. Confirm the
   request adds no membership-authorization or shadow-comparison audit row.
4. Set `canonical` plus the exact canonical confirmation and redeploy. Record
   active-member success and controlled non-member, suspended, and expired
   denial evidence. Restore the active membership immediately after each
   controlled state test.
5. Record that Hermes logout clears the dashboard session. If the central
   Better Auth session remains active, clicking the dashboard sign-in button
   may complete SSO without another credential prompt; signing out of the
   OvernightDesk platform must clear that central session. Also record direct
   navigation to `aegis-prod.overnightdesk.com` and the platform
   dashboard-button flow.
6. Exercise the production rollback once more by returning the mode to
   `legacy`, redeploying, and verifying the legacy owner can sign in. Do not
   delete the additive Tenet 0 foundation or membership as rollback.

Do not place a confirmation value in a public `NEXT_PUBLIC_*` variable. Treat
Vercel deployment completion, HTTP reachability, and an OIDC redirect as
necessary but insufficient: browser acceptance and the metadata-only audit
check are required before marking T019c complete.

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
  set `WALTER_MEMBERSHIP_AUTH_MODE=legacy`, redeploy, and retain additive
  records for review.
- Do not rename or recreate the live container, volume, hostname, or Phase
  path.

After a production apply, append the result to the suite `deploys.log`, update
`overnightdesk-platform-standard` from verified state, and run the required
security/data/API/migration/operations review before any authorization canary.
