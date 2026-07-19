# Tasks: Use-Case Identity Foundation

**Input**: Design documents from `/specs/021-use-case-identity-foundation/`

**Status**: Migration 0009 and the guarded Tenet 1 foundation are deployed and
verified in production with zero memberships. Mitchel's verified membership
remains a later fail-closed operation. Existing authorization is still
authoritative; no Phase change, resource rename, platform/orchestrator link, or
authorization cutover has been performed.

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

## Phase 3: Mitchel User / Trevor Agent Vertical Slice

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
- [ ] T016 Compare old and canonical resolution for Mitchel's foundation and prove a feature-flag rollback without deleting additive records; do not wait for membership
  - [x] T016a Implement a legacy-authoritative `legacy`/`compare` shadow gate, metadata-only match evidence, guarded operator command, and disposable-Neon rollback qualification
  - [ ] T016b Merge the reviewed command, record production compare evidence, switch back to `legacy`, and verify the additive foundation remains unchanged
- [ ] T017 Add failing member/non-member/suspended-member authorization tests using controlled fixture users
- [ ] T018 Replace exact single-owner checks for the Mitchel canary with active canonical membership resolution
- [ ] T019 Remove the hardcoded `hermes-mitchel` resource-alias special case only after compatibility and browser denial tests pass
- [ ] T020 Run security, data, API-contract, migration, and operations review before enabling any production canary

## Phase 4: Open WebUI Dependency and Expansion

- [ ] T021 Permit `020a-open-webui-auth-spike` to proceed after the identity contract is accepted; keep it independent from schema deployment
- [ ] T022 Permit fixture-backed `020b-open-webui-mitchel-canary` implementation after accepted 020a auth evidence and completed canonical foundation; gate Mitchel activation and browser acceptance on active membership
- [ ] T023 Bind the Open WebUI assignment to canonical runtime UUID and active membership, with resource hostname derived server-side
- [ ] T024 Allocate approved Tenet 0 and Tenet 2 and backfill Walter plus Titus with Gary as the current authorized person only through separately reviewed operations; keep Rex unassigned
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
- T015e-T016 and T021 permit fixture-backed platform work without Mitchel;
  T015g and T018-T020 gate his production authorization and acceptance.
- T021 may overlap schema/backfill work after the contract. Fixture-backed T022
  may overlap after the canonical foundation; T023 and Mitchel activation may
  not proceed before active membership.
- T024-T027 follow acceptance of the Mitchel vertical slice.
- Feature 12 scheduler activation remains an independent owner-gated operation.
