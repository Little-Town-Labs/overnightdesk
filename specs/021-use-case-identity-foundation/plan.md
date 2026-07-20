# Implementation Plan: Use-Case Identity Foundation

**Branch**: `021-use-case-identity-foundation` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

**Implementation checkpoint (2026-07-19):** `021a-identity-schema-resolver`
implements the additive schema, nullable instance links, validated canonical
resolver, and metadata-only comparison audit adapter. Existing reads remain
authoritative. No database deployment, backfill, stable-number allocation, or
authorization cutover is included.

**Backfill checkpoint (2026-07-19):** `021-audited-identity-backfill` adds a
guarded schema runner and an atomic, idempotent Tenet 1 plan/apply/verify
command. Disposable-Neon qualification passes. Production remains unchanged:
the identity schema and Mitchel Better Auth subject are absent, and neither the
platform instance table nor orchestrator registry contains a Mitchel row.

**Invitation checkpoint (2026-07-19):** Mitchel is present exactly once in the
production invite allowlist and the refreshed Vercel production deployment
serves the sign-up route. The backfill now requires `emailVerified = true`;
registration and verification remain Mitchel's required next action.

**Decoupling checkpoint (2026-07-19):** Owner-controlled foundation allocation
must proceed independently from customer registration. The audited workflow is
split into a foundation transaction with zero memberships and a later verified
membership transaction. Existing authorization remains authoritative and the
canonical path fails closed while membership is absent.

**Production foundation checkpoint (2026-07-19):** From merged main commit
`c3a81b65e76fd2bf20d054bf5b09fbaf9e5b9992`, migration 0009 deployed all 46
reviewed statements and the Tenet 1 foundation applied atomically with zero
memberships. Post-write verification resolved all four canonical selectors,
and both schema and foundation retries returned `verified_noop`. Production
contains one Tenet 1 allocation, one schema audit event, and one foundation
audit event. No platform-instance link, orchestrator link, resource rename, or
authorization cutover was included.

**Compatibility and rollback checkpoint (2026-07-19):** Merged main commit
`f1869906a19349bdcc1a08e9d84e43ecaab7761b` supplies an explicit
`legacy`/`compare` observation flag; neither supported mode permits canonical
authorization. Disposable Neon and production each returned four shadow
matches with legacy authority. Production rollback to `legacy` performed zero
canonical checks, the foundation remained `verified_noop` with four of four
selectors, and a read-only closeout found exactly four recent metadata-only
match audits, no forbidden values, and zero memberships.

**Authorization fixture checkpoint (2026-07-19):**
`021-membership-authorization-fixtures` defines the isolated canonical
membership policy and controlled fixture users for active-member, non-member,
wrong-use-case, suspended-member, membership-expiry, cache-expiry, explicit
cache-invalidation, and storage-unavailable behavior. Successful grants are
not cached by default because cross-process invalidation is not available;
callers that explicitly opt into caching are bounded by both cache TTL and
membership expiry, and failures are never cached. This checkpoint does not
connect the policy to OIDC, dashboard, or API routes and does not change the
legacy-authoritative production read path. The shared database integration
remains T018; each production consumer cutover is a later separate gate.

**Shared membership checkpoint (2026-07-20):**
`021-shared-membership-store` adds the reusable Drizzle lookup and one
server-bound authorization interface for Walter, Titus, and Trevor. The
authorizer accepts only a stable authenticated user ID; canonical use-case and
optional runtime UUID assignment are supplied server-side. Active use-case,
runtime, membership, scope, and expiry checks run through parameterized
Drizzle queries. Grants and denials produce metadata-only audit records with a
subject fingerprint, while audit or storage failure denies access. Caching
remains disabled by default; explicit cache tests retain the T017 expiry and
invalidation bounds. Disposable-Neon qualification passed both identity
integration suites and preserved legacy-authoritative compare/rollback
behavior. No OIDC, dashboard, API route, Hermes runtime, or other production
consumer is enabled by this checkpoint.

**Walter foundation implementation checkpoint (2026-07-20):**
`021-walter-canonical-authorization` implements T019a without changing
production authority. The guarded Tenet 0 foundation retains the active
`hermes-walter`, `hermes-agent-data`, `aegis-prod.overnightdesk.com`, Walter
intake, and Phase identifiers plus the stopped `hermes-agent`/Agent rollback
identifiers as explicit resource bindings. Gary membership is a separate
plan/apply/verify operation that accepts only his existing email-verified
Better Auth `user.id`. Disposable-Neon qualification passed all ten Walter
canonical selectors and both operator verification commands. No production
foundation, membership, instance link, OIDC change, or authorization cutover
is included; T019b and T019c remain separate gates.

**Walter authorization shadow checkpoint (2026-07-20):**
`021-walter-canonical-shadow` implements T019b as a pre-consumer compatibility
boundary. Its Walter-specific mode accepts only `legacy` or `compare`, requires
the exact `COMPARE_WALTER_MEMBERSHIP_SHADOW` confirmation for comparison, and
always returns the legacy single-owner decision as authority. Controlled tests
cover matches, both mismatch directions, canonical/audit unavailability, value
suppression, rejection of a canonical authority mode, and rollback to `legacy`
with zero canonical authorization or comparison-audit calls. The comparison
event contains only allow/deny/unavailable decision metadata; it excludes the
Better Auth subject and membership identifiers. No OIDC, dashboard, API route,
database, or production consumer is connected; T019c remains the separate
authority and browser/rollback gate.

**Walter guarded OIDC implementation checkpoint (2026-07-20):**
`021-walter-canonical-oidc` implements T019c's code and disposable-database
portion for Walter only. `legacy` remains the default and performs no
canonical membership work; `compare` still returns the legacy owner decision
and requires `COMPARE_WALTER_MEMBERSHIP_SHADOW`; `canonical` requires the
separate `ENABLE_WALTER_CANONICAL_MEMBERSHIP` confirmation and makes active,
unexpired Tenet 0 membership authoritative. The OIDC authorization-code and
token paths derive `tenant-0` from the server-loaded instance, resolve its
explicit platform resource binding to the canonical Walter runtime, and pass
only the authenticated Better Auth user ID to the shared membership
authorizer. Non-Walter instances retain exact legacy-owner authorization.
Controlled and disposable-Neon tests cover active member, non-member,
suspended, expired, storage-unavailable, comparison, metadata-only audit, and
zero-canonical-work rollback behavior. Merged commit `50da928` then completed
T019c3: production contains one verified Tenet 0 allocation and one active Gary
membership, all ten Walter selectors match, and Vercel deployment
`9AgtNVztYJuyL4c3woPZQka4XiBz` runs with only the explicit `legacy` mode. No
comparison or canonical confirmation is present, so authorization authority
has not changed.

**Walter canonical canary and rollback checkpoint (2026-07-20):** T019c4 is
complete. Legacy-authoritative comparison produced three matches, zero
mismatches, and zero errors before returning to zero-canonical-work legacy
mode. Vercel deployment `dpl_22YPJTnKTwdb6MioASMEpZ6LKtEa` then enabled the
separately confirmed canonical mode. Gary completed platform sign-in,
dashboard-button, direct-Aegis, Hermes logout, and valid-session SSO flows.
The shared authorizer denied Gary against Tenet 1 with one metadata-only audit
and no identity or membership mutation; this was a server-side cross-use-case
boundary check, not a browser/OIDC test. Temporarily suspended and expired
states each produced the expected browser `access_denied`, one bounded
membership denial, and one bounded dashboard denial, with no forbidden audit
values; the same membership was restored immediately after each check. At the
rollback boundary, cumulative canonical membership totals were 15 grants and
3 denials, while comparison remained 3 matches, 0 mismatches, and 0 errors.
Final deployment `dpl_93wZmmRs2ju7bqN2b3vofkpQKjR9` restored `legacy` and
removed both confirmations. A fresh owner login increased dashboard success
from 14 to 15 while canonical and comparison totals remained frozen. The
membership is active, unsuspended, and unexpired. T019 is complete; T020 Titus
/ Tenet 2 is next.

**Titus foundation implementation checkpoint (2026-07-20):**
`021-titus-identity-foundation` implements T020a without changing production.
The guarded Tenet 2 template preserves the active `hermes-titus` container and
`hermes-titus-data` volume, current runtime, Control Tower, memory, Matrix, and
routed-intake Phase paths, the rollback-only legacy email path, the staged
Teams path as compatibility metadata, and the active Titus intake route. All
seven secret-boundary records point only to App `timeless-tech-solutions` and
environment `production`; no secret value is stored. Foundation apply requires
`TENET_2_TITUS_FOUNDATION`, creates zero memberships, and is separate from the
Gary membership apply requiring `ACTIVATE_TENET_2_GARY` plus his existing
email-verified Better Auth user ID. Disposable Neon passed 11 of 11 selectors,
verified-noop retries, separate membership attachment, metadata-only audits,
and the existing Tenet 1/Walter regression gates before dropping the database.
No production allocation, membership, consumer, Matrix policy, email sender
allowlist, Teams activation, or Austin grant is included. T020b shadow
resolution is recorded in the checkpoint below; T020c consumer/adapter
selection remains a separate gate.

**Titus authorization shadow checkpoint (2026-07-20):**
`021-titus-canonical-shadow` implements T020b as a pre-consumer compatibility
boundary. Titus accepts only `legacy` or `compare`, requires the exact
`COMPARE_TITUS_MEMBERSHIP_SHADOW` confirmation for comparison, and always
returns the legacy owner decision as authority. Walter and Titus now share one
fail-safe membership-shadow primitive while retaining separate mode parsers,
confirmation phrases, and metadata-only event types. Controlled tests cover
allow/deny matches, both mismatch directions, missing confirmation, canonical
and audit unavailability, thrown dependencies, value suppression, rejection
of canonical authority, and rollback to `legacy` with zero canonical or audit
work. No production database, consumer, Matrix E2EE policy, email sender
allowlist, Teams integration, or Austin membership changes. T020c remains the
separate production-consumer and external-identity-adapter contract gate.

**Titus consumer selection checkpoint (2026-07-20):** T020c selects a
dedicated Titus Open WebUI deployment as the first Tenet 2 production
membership consumer. It does not connect canonical membership to the already
working Matrix or AgentMail channels. Open WebUI is a new, disabled-by-default
surface whose account key is the exact OvernightDesk OIDC `(issuer, subject)`
pair; the subject is Gary's opaque Better Auth `user.id`, never his email.
The OIDC client, callback, audience, Open WebUI hostname, canonical Tenet 2
runtime, and private `hermes-titus` connection are assigned server-side and
must agree before access. Nginx rechecks the Better Auth session and active
Tenet 2 membership on every HTTP, streaming, and WebSocket request, so an Open
WebUI cookie cannot outlive platform authorization. Account linking by email,
client-selected workspace claims, trusted identity headers, and local password
login after canary are prohibited. Matrix E2EE sender/room policy, AgentMail
sender allowlists, Teams/Entra identities, and Austin membership remain
unchanged and independently authoritative for their channels. No Open WebUI,
Phase, Nginx, Vercel, database, or production change is included in T020c.

**Authorization priority checkpoint (2026-07-19):** Tenet 1 remains the first
completed database backfill and resolver comparison, but Mitchel/Trevor is the
least-used runtime and Mitchel's membership is unavailable. Forward work is
therefore reordered by reusable dependency and current operational value:
build the use-case-neutral database membership integration, cut over Walter
first, establish Titus with Gary next, and leave Trevor production activation
pending Mitchel. Existing authorization remains authoritative until each
separate shadow comparison and rollback gate passes.

## Summary

Introduce an additive identity registry that separates canonical use-case and
runtime identity from people, personas, and infrastructure names. Keep UUIDs
as internal/security identifiers. Allocate an optional immutable number for
human-facing `Tenet N` references. Preserve every current resource name through
explicit compatibility bindings. Tenet 1 supplied the first completed
backfill/resolver evidence. The forward authorization schedule now builds one
shared membership boundary, then prioritizes Walter and Titus before the
Mitchel-gated Trevor and Feature 020 production canaries.

## Technical Context

**Platform**: Next.js 15.5 / React 19 / Better Auth / Drizzle on Vercel

**Existing platform identity**: `instance.id` is a UUID; `instance.userId` is
a single owner; `instance.tenantId` is a generated text slug used by routing
and provisioning

**Existing orchestrator identity**: `tenant_id` is an independently generated
UUID with a separate slug and container name

**Runtime consumers**: Hermes provisioner, Nginx, Phase, OIDC, Open WebUI,
email intake, platform orchestrator, operations audit

**Migration style**: Expand -> backfill -> dual-read/compare -> narrow canary
-> consumer cutovers -> contract only after observation

**Testing**: Migration constraints, resolver unit/integration tests,
membership authorization tests, callback compatibility, browser denial checks,
audit redaction, rollback verification

## Constitution Check

- **Customer data is sacred**: PASS. Identity metadata is separated from chat,
  runtime memory, and secret values; aliases do not broaden access.
- **Security**: CONDITIONAL PASS. Membership-based authorization replaces
  string and single-owner shortcuts only after denial and audit tests pass.
- **Owner decides**: PASS. Numbers and broad backfills require explicit
  allocation and rollout approval.
- **Simple over clever**: PASS. Existing UUIDs remain valid and current names
  remain compatibility bindings; no flag-day rename.
- **Quality and rollback**: PASS. The first implementation is additive. Titus
  Open WebUI is the selected next canary, Walter follows separately, and every
  rollback preserves state and existing channels.

## Contract Decisions

1. `use_case_id` UUID is the canonical security and relationship key.
2. `use_case_number` is optional, immutable, non-secret, never reused, and
   intended only for human reference or stable public labels such as `Tenet 7`.
   Allocation is zero-based, and OvernightDesk/Walter retains `Tenet 0`.
   Historical `tenant-0`, `tenet-0`, and `tenet0-postgres` names remain resource
   bindings even when they host data used by another use case.
3. `use_case` is the canonical technical term. `tenant` remains a compatibility
   term for customer tenancy and existing fields. `tenet` is a UI label only;
   it must not be used as a misspelled replacement for `tenant_id`.
4. Runtime is the process and primary-memory boundary. Persona is an assignment
   to that runtime. Person access is membership. These relationships are
   independent.
5. A Phase App is a secret access boundary, not a use-case identifier. The
   approved two-app structure remains unchanged.
6. Containers, volumes, domains, paths, and client IDs are resource bindings.
   They may remain grandfathered indefinitely and can be retired only after all
   consumers are verified.
7. A channel adapter must authenticate the identity presented by that channel
   and map it to the canonical membership subject without using email or a
   display name. Titus Open WebUI can use the native Better Auth OIDC
   `(issuer, subject)` pair directly. Matrix MXIDs, AgentMail senders, and
   Teams/Entra object IDs require their own later approved bindings and do not
   inherit Open WebUI authorization.

## Target Relationship Model

```text
UseCase (UUID, optional stable number)
  ├── Membership ── Person / Better Auth user
  ├── RuntimeIdentity (UUID, primary-memory boundary)
  │     ├── PersonaAssignment (one default, zero or more additional)
  │     └── ResourceBinding (container, volume, hostname, OIDC, Phase path...)
  └── SecretBoundaryBinding ── Phase App + environment
```

The platform `instance` record remains the current commercial/provisioning
record and receives a nullable canonical identity reference. The orchestrator's
UUID remains its own external registry identity until an explicit binding is
created. This avoids pretending two independently generated UUIDs are one ID.

## Delivery Sequence

1. **Accept terminology and contract**: Land the ADR, machine-readable
   standard, allocation rules, entity constraints, compatibility policy, and
   audit requirements.
2. **Add schema and resolver foundation**: Write failing tests, add identity,
   membership, persona, and resource-binding tables, then add nullable links
   and read-only resolvers. Existing readers remain authoritative.
3. **Provision the Mitchel/Trevor foundation**: Allocate the owner-approved
   `Tenet 1` through an audited transaction; register Trevor as the default
   persona and `hermes-mitchel` plus its verified resources without requiring
   or creating a human membership. Compare old and new resolution and prove
   rollback while existing reads remain authoritative.
4. **Build shared membership integration**: Add the database-backed store,
   metadata-only denial/audit adapter, server-derived runtime assignment, and
   cross-use-case fixture qualification once. Keep caching disabled by default
   until a cross-process invalidation mechanism exists. Do not enable a
   production consumer in this step.
5. **Cut over Walter first**: Allocate owner-approved `Tenet 0`, backfill the
   Walter runtime/personas/resource bindings, attach Gary's verified membership,
   compare legacy and canonical authorization, prove rollback, and then enable
   only Walter behind its use-case flag and browser acceptance gate.
6. **Establish Titus next**: Allocate owner-approved `Tenet 2`, backfill the
   Titus runtime/resource bindings, and attach Gary's verified membership in a
   separate reviewed operation. The selected first consumer is a dedicated
   Titus Open WebUI deployment using a separate Better Auth OIDC client and an
   exact canonical runtime/workspace assignment. Preserve the current Matrix
   E2EE identity and email sender allowlists; neither Austin nor Teams is a
   dependency and neither channel inherits the Open WebUI identity mapping.
7. **Keep Trevor ready but gated**: Retain fixture and Tenet 1 comparison
   evidence. After Mitchel registers and verifies his email, attach only his
   membership, run the Trevor-specific shadow/browser gates, and then enable
   its production authorization. This gate does not block Walter or Titus.
8. **Run Feature 020 and later expansion independently**: Open WebUI
   release/OIDC/frame research may proceed against fixtures, but Mitchel's
   stateful workspace waits for step 7. Add Austin, Rex, customer identities,
   or optional resource renames only through later reviewed work.

## Worktree and Merge Sequence

```text
020-open-webui-platform                    planning baseline
  └── 021-use-case-identity-foundation     this contract and implementation

docs/open-webui-platform-plan              standard planning baseline
  └── docs/use-case-identity-foundation    target identity standard
```

Merge the two Open WebUI planning branches first because these worktrees are
stacked on them. Then merge the two identity branches. After the identity
contract is accepted, create implementation worktrees from updated `main`:

1. `021a-identity-schema-resolver`
2. `021b-mitchel-identity-canary` stacked on 021a
3. `021-audited-identity-backfill` from merged `main`
4. `021-decoupled-identity-provisioning` stacks on the verified-user safeguard
5. `021-shared-membership-store` from merged T017; no production consumer
6. `021-walter-canonical-authorization` after the shared store merges
7. `021-titus-canonical-foundation` after Walter's observation checkpoint
8. `020a-open-webui-auth-spike` may run in parallel against Titus fixtures
9. `020b-open-webui-titus-canary` follows accepted spike evidence plus the
   verified Tenet 2 foundation and Gary membership
10. `020c-open-webui-dashboard-cutover` follows the accepted Titus canary
11. `020d-open-webui-walter` follows Titus observation and uses a fully
    separate workload and identity boundary
12. `021-trevor-canonical-authorization` only after Mitchel membership exists
13. `020e-open-webui-mitchel-canary` only after Trevor authorization passes

Teams remains a separate later channel feature.

## Titus Open WebUI External-Identity Adapter

### Selected consumer and ownership

- **Consumer**: one stateful `open-webui-hermes-titus` deployment on Aegis,
  connected privately only to `hermes-titus:8642/v1`.
- **Identity provider**: the existing OvernightDesk Better Auth OIDC issuer,
  using a new secretless-public or confidential client selected by the pinned
  Open WebUI release review. The native Hermes dashboard client is not reused.
- **External account key**: exact OIDC `(iss, sub)`. `sub` is the opaque Better
  Auth `user.id`; email and profile claims are display data and cannot link or
  merge accounts.
- **Workspace assignment**: the OIDC client/audience and requested hostname
  resolve server-side to the canonical Tenet 2 use case, Titus runtime, Open
  WebUI deployment, and private Hermes connection. Browser-provided tenant,
  Tenet number, runtime, hostname, or model endpoint values are ignored.
- **Secret boundary**: Titus Open WebUI workload secrets belong in Phase App
  `timeless-tech-solutions`, environment `production`, under a dedicated
  `/agents/open-webui/hermes-titus` path. No secret value or service-account
  token enters the identity database.

### Authorization decision

Every request must satisfy all of these independent checks:

1. Nginx is the only public ingress and obtains a current Better Auth session
   through the platform authorization subrequest.
2. The server maps that session's opaque subject to an active, unexpired Tenet
   2 membership and active Titus runtime; storage or audit unavailability
   denies access.
3. The requested host and OIDC audience resolve to the same active Titus Open
   WebUI and Hermes resource bindings.
4. Open WebUI validates issuer, audience, redirect URI, state, nonce, and PKCE
   behavior supported by the pinned release, then keys the local account only
   by `(iss, sub)`.
5. The Nginx membership subrequest protects normal HTTP, streaming, and
   WebSocket paths on every request. A retained Open WebUI session alone grants
   no access after membership suspension, expiry, revocation, or Better Auth
   logout.

The canary adds no tool authority. Text submitted through Open WebUI remains
untrusted input and executes under the existing Titus/Hermes tool and approval
policy. Local signup/password login and email account linking must be disabled
after the OIDC rollback test; trusted-header authentication is not a fallback.

### Isolation from other Titus channels

The adapter is valid only for Titus Open WebUI. It does not translate or grant:

- the exact Matrix operator MXID, encrypted room membership, device state, or
  requester-bound approvals;
- an AgentMail sender address or the routed email sender allowlist; or
- a future Teams/Entra object ID, tenant ID, chat, or team allowlist.

Those providers require separately approved external-subject bindings and
their existing channel-native checks remain authoritative. Adding Austin later
requires his own verified Better Auth subject, Tenet 2 membership, and a
channel-specific identity binding; Gary's binding is never copied.

### Rollout, evidence, and rollback

1. Pin and review the Open WebUI release, then prove OIDC, frame, cookie,
   streaming/WebSocket, logout, and local-auth shutdown behavior with fixtures.
2. Add failing assignment and adapter tests for active member, non-member,
   wrong-use-case, suspended/expired member, stale Open WebUI session, wrong
   audience/host, and canonical-store failure.
3. Apply and verify the already guarded Tenet 2 foundation and Gary membership
   as separate production operations; this alone exposes no new route.
4. Provision the Titus Open WebUI resources disabled, verify secret and state
   isolation, then enable one explicit Gary/Titus canary assignment.
5. Record only bounded outcome/reason counters and subject fingerprints. Never
   record OIDC tokens, cookies, raw subjects, email, Matrix IDs, message or chat
   content, Phase output, or Hermes/Open WebUI credentials.
6. Prove unauthenticated, non-member, wrong-use-case, suspended/expired, logout,
   persistence, and native-dashboard fallback behavior before observation.

Rollback disables the Titus Open WebUI assignment and Nginx route, then stops
but does not delete its container or volume. It does not change the Tenet 2
foundation/membership, `hermes-titus`, Matrix, AgentMail, Teams staging, or the
native Hermes dashboard state. Post-rollback evidence must show the Open WebUI
route closed, canonical adapter counters frozen, and the existing Titus Matrix
and email channels healthy.

Do not create all execution worktrees early; create each when its dependency is
merged or its stable base commit is recorded. This prevents long-lived drift.

## Rollback

- Keep existing identity readers and resource strings intact during expand and
  backfill stages.
- Disable the canonical resolver/membership feature flag for the affected use
  case; do not drop additive tables during incident rollback.
- Retain all resource bindings and allocation audit records.
- Restore prior read authority, verify old callbacks/routes, and record the
  result before investigating data correction.
- Schema/table removal, number reuse, or resource rename is never an emergency
  rollback action.
