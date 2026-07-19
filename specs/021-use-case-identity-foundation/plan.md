# Implementation Plan: Use-Case Identity Foundation

**Branch**: `021-use-case-identity-foundation` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

## Summary

Introduce an additive identity registry that separates canonical use-case and
runtime identity from people, personas, and infrastructure names. Keep UUIDs
as internal/security identifiers. Allocate an optional immutable number for
human-facing `Tenet N` references. Preserve every current resource name through
explicit compatibility bindings. Use the Mitchel business use case, Mitchel
membership, Trevor persona, and current `hermes-mitchel` runtime alias as the
first vertical slice before the Feature 020 Open WebUI canary.

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
3. **Backfill Mitchel/Trevor vertical slice**: Allocate a number for the Mitchel
   business use case only with owner approval; bind Mitchel as the person/member,
   Trevor as the default persona, and `hermes-mitchel` as a current resource
   alias; compare old and new resolution and prove rollback.
4. **Move authorization to membership**: Replace exact single-owner checks for
   the canary with canonical membership resolution. Keep compatibility behavior
   for unmigrated instances.
5. **Run Feature 020 Mitchel/Trevor canary**: Bind Open WebUI to the canonical
   runtime and Mitchel's membership; Trevor remains the agent persona.
   Auth/release research may overlap steps 2-3 after step 1.
6. **Expand incrementally**: Backfill Walter, Titus, Rex metadata, then customer
   records and individual consumers. Resource renaming is separate optional
   work, not a completion criterion.

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
3. `020a-open-webui-auth-spike` may run in parallel after the contract
4. `020b-open-webui-mitchel-canary` stacks on both 021b and accepted 020a work
5. `020c-open-webui-dashboard-cutover` follows the canary

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
