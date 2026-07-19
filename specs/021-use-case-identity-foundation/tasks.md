# Tasks: Use-Case Identity Foundation

**Input**: Design documents from `/specs/021-use-case-identity-foundation/`

**Status**: Additive schema/resolver foundation implemented and locally
verified. No Phase, Vercel, resource renames, identity backfill, number
allocation, authorization cutover, database deployment, or production changes
have been performed.

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
- [ ] T015 Backfill the Mitchel business use case, Mitchel's owner membership, Trevor's default persona assignment, instance/orchestrator references, and current `hermes-mitchel` resource bindings
- [ ] T016 Compare old and canonical resolution for Mitchel and prove a feature-flag rollback without deleting additive records
- [ ] T017 Add failing member/non-member/suspended-member authorization tests
- [ ] T018 Replace exact single-owner checks for the Mitchel canary with active canonical membership resolution
- [ ] T019 Remove the hardcoded `hermes-mitchel` resource-alias special case only after compatibility and browser denial tests pass
- [ ] T020 Run security, data, API-contract, migration, and operations review before enabling any production canary

## Phase 4: Open WebUI Dependency and Expansion

- [ ] T021 Permit `020a-open-webui-auth-spike` to proceed after the identity contract is accepted; keep it independent from schema deployment
- [ ] T022 Gate `020b-open-webui-mitchel-canary` on accepted 020a auth evidence and completed Mitchel identity/membership mapping
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
- T013-T020 are the Mitchel identity gate for the stateful Open WebUI canary.
- T021 may overlap schema/backfill work after the contract; T022-T023 may not.
- T024-T027 follow acceptance of the Mitchel vertical slice.
- Feature 12 scheduler activation remains an independent owner-gated operation.
