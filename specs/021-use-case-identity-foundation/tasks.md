# Tasks: Use-Case Identity Foundation

**Input**: Design documents from `/specs/021-use-case-identity-foundation/`

**Status**: Migration 0009 and the guarded Tenet 1 foundation are deployed and
verified in production with zero memberships. The shared T018 database-backed
membership integration is implemented and disposable-Neon qualified with no
production consumer. Mitchel's verified membership remains a later fail-closed
operation. Existing authorization is still authoritative; no Phase change,
resource rename, platform/orchestrator link, or authorization cutover has been
performed.

## Phase 1: Durable Contract

- [x] T001 Define use case, Tenet number, tenant compatibility, runtime, persona, membership, resource binding, and secret boundary terminology
- [x] T002 Specify UUID and number semantics, allocation rules, authorization requirements, and additive compatibility policy
- [x] T003 Record the target standard, ADR, migration runbook, roadmap sequence, and stacked worktree strategy
- [x] T004 Make the Feature 020 auth spike parallelizable after contract acceptance and gate its Mitchel canary on identity backfill

## Phase 2: Additive Schema and Resolver

- [x] T005 Create `021a-identity-schema-resolver` from updated main after the planning branches merge
- [x] T006 Add failing migration tests for UUID identity, unique immutable non-reused numbers, one default persona, membership uniqueness, and active binding uniqueness
- [x] T007 Add use-case, runtime, persona-assignment, membership, resource-binding, secret-boundary-binding, and append-only number-allocation tables
- [x] T008 Add nullable canonical identity references to the current instance model without changing existing required fields or callbacks
- [x] T009 Add failing resolver tests covering UUID, number, legacy `tenantId`, instance UUID, orchestrator UUID, container, and hostname inputs
- [x] T010 Implement a server-side canonical resolver and metadata-only audit events; never resolve authorization from client-supplied resource strings
- [x] T011 Add dual-read comparison telemetry with no secret, prompt, response, token, or conversation content
- [x] T012 Verify old application tests and provisioning callbacks pass with canonical identity reads disabled

## Phase 3: Completed Tenet 1 Foundation and Shared Authorization Fixtures

- [x] T013 Create `021b-mitchel-identity-canary` only after 021a has a stable reviewed base
- [x] T014 Record explicit owner approval for Mitchel/Trevor as Tenet 1; keep the canonical database allocation as a separately reviewed operation
- [ ] T015 Provision the Mitchel/Trevor canonical foundation independently, then attach Mitchel's owner membership after verification; link exact platform/orchestrator references only through a later reviewed operation when those registry rows exist
  - [x] T015a Add guarded schema plan/apply tooling with an explicit confirmation, one transaction, metadata-only audit event, and mixed-state refusal
  - [x] T015b Add an atomic idempotent Tenet 1 plan/apply/verify command and disposable-Neon integration qualification
  - [x] T015c Inventory production without writes: schema absent, Mitchel Better Auth subject absent, Mitchel platform instance absent, and orchestrator registry empty; confirm current container, volume, hostname, and Phase intake path bindings
  - [ ] T015d Have Mitchel complete Better Auth registration/invitation and record the resulting opaque `user.id`; never infer membership from name or email
    - [x] T015d1 Add Mitchel's email to the production invite allowlist, deploy the new Vercel environment, and verify the public sign-up route without recording the address in Git
    - [x] T015d2 Require the Better Auth account to be email-verified before the backfill can produce a write plan
    - [ ] T015d3 Have Mitchel sign up and verify his email, then obtain the opaque `user.id` through a metadata-only query
  - [x] T015e Split the audited operation into a membership-independent foundation transaction and a later verified-membership transaction
    - [x] T015e1 Add failing tests proving the foundation plans with no Better Auth user, contains zero memberships, and denies partial/drifted state
    - [x] T015e2 Implement idempotent foundation plan/apply/verify and separate verified membership plan/apply/verify commands with distinct confirmations and audit events
    - [x] T015e3 Qualify foundation apply, verified no-op retry, later membership attachment, and unchanged canonical IDs on disposable Neon
  - [x] T015f Merge and deploy migration 0009, apply the foundation once, rerun as `verified_noop`, and record deployment/standard evidence without waiting for Mitchel
  - [ ] T015g After T015d3, apply only Mitchel's membership and record its separate evidence
- [x] T016 Compare old and canonical resolution for Mitchel's foundation and prove a feature-flag rollback without deleting additive records; do not wait for membership
  - [x] T016a Implement a legacy-authoritative `legacy`/`compare` shadow gate, metadata-only match evidence, guarded operator command, and disposable-Neon rollback qualification
  - [x] T016b Merge the reviewed command, record production compare evidence, switch back to `legacy`, and verify the additive foundation remains unchanged
- [x] T017 Add controlled fixture-backed active-member, non-member,
  wrong-use-case, suspended-member, membership-expiry, cache-expiry,
  cache-invalidation, and storage-unavailable authorization tests; retain the
  isolated policy as pre-cutover code with no production consumer
- [x] T018 Build the reusable canonical membership integration without enabling a production consumer
  - [x] T018a Add a Drizzle membership store in `src/lib/use-case-membership-store.ts` with integration coverage in `src/db/__tests__/use-case-membership-store.integration.test.ts`; resolve by stable user ID, canonical use-case UUID, optional runtime scope, active state, and expiry
  - [x] T018b Add metadata-only denial/audit and server-derived runtime assignment in `src/lib/use-case-membership-authorization.ts`; never accept a client alias, persona, or Tenet number as authority
  - [x] T018c Keep authorization caching disabled by default and qualify any explicit cache mode in `src/lib/__tests__/use-case-membership-authorization.test.ts` against T017 expiry/invalidation behavior
  - [x] T018d Extend `src/lib/__tests__/fixtures/use-case-membership.ts` to prove the same integration with Walter, Titus, and Trevor fixtures while legacy production readers remain authoritative
- [ ] T019 Make Walter / Tenet 0 the first real membership-authorization cutover
  - [ ] T019a Extend `src/lib/use-case-identity-backfill.ts`, `src/db/use-case-identity-backfill-store.ts`, and `scripts/use-case-identity-backfill.ts` with a guarded Tenet 0 foundation plus separate Gary membership plan/apply/verify path; preserve all Walter resource names
  - [ ] T019b Add Walter legacy-owner/canonical-membership comparison and rollback coverage in `src/lib/__tests__/canonical-identity-compatibility.test.ts` before authority changes
  - [ ] T019c Integrate Walter only in `src/lib/hermes-oidc.ts` and `src/lib/__tests__/hermes-oidc-authorization.test.ts`, then record member, non-member, suspended/expired, logout, direct-login, and rollback browser evidence in the identity runbook
- [ ] T020 Establish Titus / Tenet 2 next without coupling it to Teams or Austin
  - [ ] T020a Extend the guarded backfill/store/operator files from T019a with a separately confirmed Tenet 2 foundation plus Gary membership plan/apply/verify path; preserve all Titus resource names
  - [ ] T020b Add Titus/Gary shadow-resolution coverage to `src/lib/__tests__/canonical-identity-compatibility.test.ts` without changing Matrix E2EE membership or email sender allowlists
  - [ ] T020c Record the selected Titus production consumer and external-identity adapter contract in `specs/021-use-case-identity-foundation/plan.md` before cutover; Better Auth membership alone is not authority for Matrix, email, or Teams identities

## Phase 4: Open WebUI Dependency and Expansion

- [ ] T021 Permit `020a-open-webui-auth-spike` to proceed after the identity contract is accepted; keep it independent from schema deployment
- [ ] T022 Permit fixture-backed `020b-open-webui-mitchel-canary` implementation after accepted 020a auth evidence and completed canonical foundation; gate Mitchel activation and browser acceptance on active membership
- [ ] T023 Bind the Open WebUI assignment to canonical runtime UUID and active membership, with resource hostname derived server-side
- [ ] T024 Complete Trevor production authorization only after Mitchel has an active verified membership; rerun shadow, browser denial, and rollback gates before removing the exact-owner/resource-alias compatibility path
- [ ] T025 Add Austin to Titus only with the later Titus collaboration/Teams authorization design; do not make Teams a dependency for Gary's standalone Titus runtime
- [ ] T026 Migrate remaining consumers one at a time and retire aliases only after observed zero use
- [ ] T027 Treat numeric infrastructure renaming as optional future work; do not block identity completion on it

## Phase 5: Closeout

- [ ] T028 Update the standard from verified implementation and deployment state
- [ ] T029 Add audit conformance checks for canonical relationships, orphaned bindings, duplicate active aliases, and membership state
- [ ] T030 Complete browser authorization, migration rollback, resolver compatibility, and value-suppression evidence
- [ ] T031 Run the required five-axis code review before merge and production authorization

## Dependencies and Execution Order

- T001-T004 precede identity implementation and are the mergeable planning slice.
- T005-T012 are additive and precede all membership authorization cutovers.
- T015e-T017 permit the shared T018 implementation and fixture-backed platform
  work without Mitchel. T015g gates only T024 and Mitchel acceptance.
- T018 precedes all canonical membership consumers. T019 is the first real
  cutover. T020 follows Walter's observation checkpoint and may establish
  Titus/Gary without Austin or Teams.
- T021 may overlap schema/backfill work after the contract. Fixture-backed T022
  may overlap after the canonical foundation; T023 and Mitchel activation may
  not proceed before active membership.
- T024 is intentionally last among the three current Aegis runtimes because it
  depends on Mitchel; it does not gate T018-T020. T025-T027 remain later work.
- Feature 12 scheduler activation remains an independent owner-gated operation.
