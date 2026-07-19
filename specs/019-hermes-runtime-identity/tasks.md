# Tasks: Hermes Runtime Identity

**Input**: Design documents from `specs/019-hermes-runtime-identity/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/runtime-identity-contract.md`, `quickstart.md`

**Tests**: Required for every behavior or interface change. Each new Walter
assertion must be observed failing before its implementation is added.

## Phase 1: Setup

**Purpose**: Establish clean owning-repository worktrees and value-suppressed
baselines.

- [x] T001 Create clean `019-hermes-runtime-identity` worktrees/branches for `overnightdesk-securityteam`, `overnightdesk-engine`, `overnightdesk-ops`, `overnightdesk-operations-audit`, and `overnightdesk-platform-standard` under `/home/frosted639/src/overnightdesk-suite/.worktrees/`
- [x] T002 Record baseline source tests and live Aegis container, volume, Nginx, OIDC, intake, memory, cron, and audit status in `specs/019-hermes-runtime-identity/research.md` without values or content bodies
- [x] T003 Rebase the parent `019-hermes-runtime-identity` branch onto current `overnightdesk/main` before publication

---

## Phase 2: Foundational Gates

**Purpose**: Resolve blockers and establish contracts shared by every user
story.

- [x] T004 Obtain owner approval for credential rotation/runtime-artifact remediation and record only the value-suppressed disposition in `specs/019-hermes-runtime-identity/quickstart.md`
- [x] T005 [P] Add a failing Walter route/target/rollback contract assertion in `tenants/hermes-titus/email-poller/scripts/qualify.sh`
- [x] T006 [P] Add an exact `walter` tuple authorization test while retaining the `agent` rollback tuple in `overnightdesk-securityteam/test/pipeline/ingestion-pipeline.test.ts`
- [x] T007 [P] Update the Walter canary-container expectations in `overnightdesk-engine/internal/hermes/dashboard_oidc_test.go` (the implementation is already generic and accepts the explicit mapping)
- [x] T008 [P] Add failing Walter upstream/default/exception expectations in `overnightdesk-operations-audit/internal/config/config_test.go` and standards loader tests

**Checkpoint**: Contract tests fail for missing Walter support; no production
selector has changed.

---

## Phase 3: User Story 1 - Runtime, Persona, and Memory Boundaries (Priority: P1)

**Goal**: Make runtime, persona, authorized person, primary memory, and shared
knowledge separate durable concepts.

**Independent Test**: The inventory unambiguously maps Walter, Titus, Mitchel,
and Rex without treating a persona or shared knowledge grant as a runtime.

- [x] T009 [US1] Add the repo-owned Walter default persona in `tenants/hermes-walter/SOUL.md`
- [x] T010 [P] [US1] Update the runtime model and tenant-source layout in `README.md`
- [x] T011 [P] [US1] Add the accepted runtime/persona/memory boundary ADR in `overnightdesk-platform-standard/docs/decisions/002-hermes-runtime-persona-memory-boundaries.md`
- [x] T012 [US1] Add the canonical runtime/persona/human/memory inventory to `overnightdesk-platform-standard/WHAT/hermes.yaml`

**Checkpoint**: Documentation distinguishes the four concepts and identifies
Walter as platform operations, Rex as personal/off-host, Titus as TTS shared,
and Trevor/Mitchel as the business runtime.

---

## Phase 4: User Story 2 - Identify the Aegis Platform Runtime as Walter (Priority: P2)

**Goal**: Prepare every active consumer and route for `hermes-walter` without
activating production early.

**Independent Test**: Source qualification resolves every target selector to
Walter while old Agent support exists only as an explicit rollback contract.

### Parent runtime and intake

- [x] T013 [US2] Add `walter` route validation, `overnightdesk` Phase selection, and exact `/agents/hermes-email-intake/walter` loading in `tenants/hermes-titus/email-poller/runtime/load-phase-config.sh`
- [x] T014 [US2] Add Walter service/state operations and mutually exclusive Agent/Walter activation in `tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh`
- [x] T015 [US2] Make the Walter qualification fixtures pass while preserving Agent rollback fixtures in `tenants/hermes-titus/email-poller/scripts/qualify.sh`
- [x] T016 [P] [US2] Replace the active Nginx source with a Walter-named upstream contract in `infra/nginx/walter-hermes.conf`
- [x] T017 [US2] Add an idempotent preflight/activate/verify/rollback operator script in `infra/hermes/migrate-walter.sh`

### Protected route and OIDC mapping

- [x] T018 [P] [US2] Add the exact `walter` route/inbox/`hermes-walter` tuple while retaining Agent rollback in `overnightdesk-securityteam/src/pipeline/agentmail-route-policy.ts`
- [x] T019 [US2] Make the protected-route tests pass in `overnightdesk-securityteam/test/pipeline/ingestion-pipeline.test.ts`
- [x] T020 [P] [US2] Update the exact canary fixture and example mapping to `hermes-walter` in `overnightdesk-engine/internal/hermes/dashboard_oidc_test.go` and `deploy/hermes-provisioner.env.example`

### Ops and audit consumers

- [x] T021 [P] [US2] Change active reviewer attribution, runtime provenance, cron deployment paths, and operator commands to Walter in `overnightdesk-ops/src/mcp/server.ts` and `services/`
- [x] T022 [P] [US2] Change active audit upstreams, defaults, collection targets, and exceptions to Walter in `overnightdesk-operations-audit/internal/config/`, `deploy/`, and `standards/`
- [x] T023 [US2] Run parent shell qualification, SecurityTeam tests/build, engine tests, Ops tests/build, and audit tests; record results in `specs/019-hermes-runtime-identity/quickstart.md`

**Checkpoint**: All source repositories pass with additive Walter support and
no production write has occurred.

---

## Phase 5: User Story 3 - Preserve Other Use-Case Runtimes (Priority: P3)

**Goal**: Prove the Walter source change does not move Titus or Mitchel state,
users, tools, channels, or secrets.

**Independent Test**: Existing Titus and Mitchel qualification and live health
remain unchanged before and after the prepared source changes.

- [x] T024 [US3] Add unchanged-boundary assertions for Titus and Mitchel to `tenants/hermes-titus/email-poller/scripts/qualify.sh`
- [x] T025 [P] [US3] Record unchanged Titus/Mitchel app, memory, channel, and tool boundaries in `overnightdesk-platform-standard/WHAT/hermes.yaml` and `WHAT/phase-app-migration.yaml`
- [x] T026 [US3] Run Titus runtime/intake qualification and value-suppressed live preflight, then record unchanged evidence in `specs/019-hermes-runtime-identity/quickstart.md`

---

## Phase 6: User Story 4 - Reversible Production Cutover (Priority: P4)

**Goal**: Activate Walter one surface at a time with a sub-15-minute rollback.

**Independent Test**: Walter passes all active surfaces and the retained Agent
identity can be restored without deleting or restoring the runtime volume.

- [x] T027 [US4] Copy/fingerprint-verify `overnightdesk:/agents/hermes-email-intake/agent` to `/agents/hermes-email-intake/walter` without printing values and retain the source path
- [x] T028 [US4] Deploy and verify dual-tuple SecurityTeam policy before changing any runtime or intake selector
- [x] T029 [US4] Deploy Walter-capable intake source with Walter polling disabled and Agent still healthy
- [x] T030 [US4] Run the credential-remediation gate from T004 and stop if it is not satisfied
- [x] T031 [US4] Stop Agent intake, copy its stopped state to `hermes-email-intake-walter-data`, and compare value-suppressed file metadata/hashes
- [ ] T032 [US4] Rename `hermes-agent` to `hermes-walter`, activate the repo-owned persona, update/reload Nginx, and verify container identity, mount continuity, DNS, public status, API, and dashboard
- [ ] T033 [US4] Update the provisioner canary container mapping to Walter, restart only `hermes-provisioner`, and verify owner OIDC login/logout
- [x] T034 [US4] Start Walter intake, verify a healthy poll cycle and idempotency continuity, and leave Agent intake disabled/preserved
- [x] T035 [US4] Verify Open Brain, Ops MCP, cron, GitHub auth availability, monitoring, recent errors, Titus, and Mitchel without outputting protected content
- [x] T036 [US4] Exercise or time a non-destructive rollback rehearsal and record the result in `specs/019-hermes-runtime-identity/quickstart.md`

T032 runtime, mount, DNS, public status, and API checks have passed. T032 and
T033 remain open only for the owner-authenticated dashboard login and logout
cookie check.

---

## Phase 7: Closeout and Review

- [ ] T037 Update all active Walter selectors, compatibility notes, and retained rollback artifacts in `overnightdesk-platform-standard/WHAT/` and `HOW/`
- [ ] T038 Sync the merged platform standard to Aegis, restart `overnightdesk-ops`, and run the full operations audit
- [ ] T039 Apply the five-axis code/security/operations review to every owning repository and resolve all required findings
- [ ] T040 Commit, push, open, verify, and merge one reviewable PR per owning repository
- [ ] T041 Append the value-suppressed production result to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [ ] T042 Confirm all primary repos are clean on merged `main` and leave old container name, Phase path, intake service/state, and runtime volume retained for observation

## Dependencies and Execution Order

- T001-T003 precede implementation.
- T004 is required before production T030-T036 but does not block source work.
- T005-T008 must fail before their paired implementations.
- US1 documentation can proceed alongside the independent repository tests.
- SecurityTeam dual-tuple support must be deployed before Walter intake.
- The Agent intake service must be stopped before its state is copied and must
  remain stopped while Walter intake is active.
- Nginx and OIDC updates follow the in-place container rename and each has an
  immediate rollback gate.
- Standards and deployment evidence follow verified production activation.

## Parallel Opportunities

- T005-T008 touch separate owning repositories.
- T009-T012 are independent documentation/source surfaces after the contract.
- T016, T018, T020-T022 can be implemented independently after failing tests.
- Production T027-T036 is intentionally sequential and must not be delegated or
  parallelized.

## Implementation Strategy

1. Land the conceptual identity model first.
2. Add Walter as a compatible source target test-first in every consumer.
3. Qualify and review all repositories before Phase or Aegis writes.
4. Satisfy the credential-remediation gate.
5. Perform one reversible production cutover with a health gate after each
   state change.
6. Close standards, audit, PRs, and deployment evidence while retaining every
   rollback source.
