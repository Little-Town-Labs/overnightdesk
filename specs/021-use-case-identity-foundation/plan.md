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
- **Quality and rollback**: PASS. The first implementation is additive, with a
  Mitchel-user/Trevor-agent canary and no destructive rollback.

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
   separate reviewed operation. Shadow canonical resolution before selecting a
   production consumer. Preserve the current Matrix E2EE identity and email
   sender allowlists until a channel-specific adapter is separately approved;
   neither Austin nor Teams is a dependency.
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
8. `021-trevor-canonical-authorization` only after Mitchel membership exists
9. `020a-open-webui-auth-spike` may run in parallel against fixtures
10. `020b-open-webui-mitchel-canary` may implement against fixtures, while
    end-user activation waits for completed Mitchel membership and accepted
    020a work
11. `020c-open-webui-dashboard-cutover` follows the Trevor canary

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
