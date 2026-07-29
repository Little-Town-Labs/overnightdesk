# Tasks: Titus Linear Read-Only Delivery

**Input**: [spec.md](spec.md), [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md),
[runtime contract](contracts/runtime-and-authority.md), and
[quickstart.md](quickstart.md)

**Tests**: Required. The constitution and feature specification require
test-first qualification and negative-security coverage.

## Phase 1: Setup

- [x] T001 Confirm Feature 032 worktree, branch, clean base, current Titus source, and installed Ringer lane mapping in `specs/032-titus-linear-readonly/quickstart.md`
- [x] T002 [P] Verify official Linear read-only MCP, API-key permission/team scoping, GitHub integration, and Hermes remote-header behavior in `specs/032-titus-linear-readonly/research.md`
- [x] T003 [P] Synchronize the approved Austin, Gary, Titus, contractor, GitHub, Linear, Done, and no-database boundaries in `WHAT/work-management.yaml`, `WHAT/who.yaml`, `HOW/architecture.md`, and `docs/decisions/011-select-linear-for-technical-delivery.md` in the platform-standard worktree

---

## Phase 2: Foundational Tests

- [x] T004 Add failing source-contract assertions for the Linear endpoint, disabled default, exact Phase path/profile, no mutation infrastructure, skill, and runbook in `tenants/hermes-titus/scripts/qualify.sh`
- [x] T005 [P] Add failing disabled/ready/invalid runtime projection tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py`
- [x] T006 [P] Add failing optional Linear registry and prohibited-mutation tool tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_mcp_registry_verifier.py`
- [x] T007 Run the scoped failing tests and record the expected RED evidence in `specs/032-titus-linear-readonly/quickstart.md`

**Checkpoint**: Tests fail only because the Linear runtime and operating
contract are not implemented.

---

## Phase 3: User Story 1 - Ask Titus About Current Delivery (Priority: P1)

**Goal**: Titus can read current approved TTS delivery state while all Linear
mutations remain unavailable.

**Independent Test**: A complete enabled profile registers only read tools,
known TTS work can be queried, and representative mutation requests produce
zero provider changes.

- [x] T008 [US1] Add strict optional `/agents/hermes-titus/linear` loading, exact key validation, disabled/ready state emission, and value-safe status output in `tenants/hermes-titus/runtime/load-phase-env.sh`
- [x] T009 [US1] Add the disabled-by-default hosted read-only Linear MCP entry with environment-backed authorization and disabled resources/prompts in `tenants/hermes-titus/config/config.yaml`
- [x] T010 [US1] Enable the predeclared Linear entry only for a ready runtime profile and remove its authorization header while disabled in `tenants/hermes-titus/runtime/start-with-secrets.sh`
- [x] T011 [US1] Extend optional Linear tool registration verification and mutation-name rejection in `tenants/hermes-titus/runtime/verify-mcp-registry.py`
- [x] T012 [US1] Run the US1 projection, registry, syntax, secret-scan, and complete tenant qualification suite and record GREEN evidence in `specs/032-titus-linear-readonly/quickstart.md`

---

## Phase 4: User Story 2 - Coordinate Purely Technical Delivery (Priority: P2)

**Goal**: Titus applies the approved role, authority, workflow, evidence, and
Definition of Done model when interpreting Linear.

**Independent Test**: Representative priority, assignment, acceptance,
architecture, contractor, blocker, merged-only, and status-summary prompts
produce the approved coordination behavior without a Linear mutation.

- [x] T013 [P] [US2] Add the role, trust, authority, evidence, reporting, workflow-hygiene, escalation, and Done rules in `tenants/hermes-titus/skills/linear-technical-delivery/SKILL.md`
- [x] T014 [P] [US2] Add skill discovery metadata in `tenants/hermes-titus/skills/linear-technical-delivery/agents/openai.yaml`
- [x] T015 [US2] Add the TTS workspace/team/status/cycle/project/issue/GitHub/contractor/Titus operating model in `tenants/hermes-titus/runbooks/linear-technical-delivery.md`
- [x] T016 [US2] Add the Linear capability and system-of-record boundary to `tenants/hermes-titus/README.md` and `tenants/hermes-titus/config/SOUL.md`
- [x] T017 [US2] Update Feature 032 delivery state and the live active-feature summary in `.specify/roadmap.md`

---

## Phase 5: User Story 3 - Activate and Revoke Safely (Priority: P3)

**Goal**: Operators can verify, enable, revoke, and disable only Linear access
with value-safe evidence and no unrelated Titus regression.

**Independent Test**: Disabled deployment, valid activation, revoked-key
failure, controlled restart, and rollback each produce the expected Linear
state while existing Titus capabilities remain healthy.

- [x] T018 [US3] Add value-safe disabled/ready MCP registry and workspace/team checks without credential output in `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [x] T019 [US3] Complete production preflight, disabled deployment, human Linear setup gate, activation canaries, restart, revocation, rollback, and evidence instructions in `tenants/hermes-titus/runbooks/linear-technical-delivery.md`
- [x] T020 [US3] Run disabled-mode deployment-script qualification locally and document the exact production activation gate in `specs/032-titus-linear-readonly/quickstart.md`

---

## Phase 6: Ringer and Cross-Cutting Quality

- [x] T021 Run bounded Luna Ringer implementation-support reviews for runtime/test and operating-document slices, then reconcile only in-scope findings in `specs/032-titus-linear-readonly/quickstart.md`
- [x] T022 Run full `tenants/hermes-titus/scripts/qualify.sh`, focused Python tests, Bash syntax checks, YAML parsing, `git diff --check`, and prohibited-secret/infrastructure scans and record evidence in `specs/032-titus-linear-readonly/quickstart.md`
- [x] T023 Run a read-only Sol Ringer security, architecture, and `code-review-and-quality` gate over the complete diff and evidence, perform at most one bounded remediation round, and record the verdict in `specs/032-titus-linear-readonly/quickstart.md`
- [x] T024 Re-run Spec Kit cross-artifact coverage and ensure every completed task is checked in `specs/032-titus-linear-readonly/tasks.md`

---

## Phase 7: Publish and Production Readiness

- [x] T025 Commit, push, open the OvernightDesk pull request, and pass required GitHub checks for branch `032-titus-linear-readonly`
- [x] T026 Commit, push, open the platform-standard pull request, and pass required GitHub checks for branch `agent/codex/linear-work-management-standard`
- [x] T027 Merge reviewed source in dependency order and deploy the exact merged OvernightDesk commit with Linear disabled using `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [x] T028 Verify disabled production health and unrelated Titus capabilities, then append value-safe deployment evidence to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [ ] T029 At the human Linear account gate, activate the team-scoped Read key, verify five representative reads and zero mutation tools/changes, rehearse restart and rollback, and record evidence in `specs/032-titus-linear-readonly/quickstart.md`

## Dependencies

- Setup (T001-T003) precedes foundational tests.
- Foundational RED tests (T004-T007) precede runtime implementation.
- User Story 1 (T008-T012) is the deployable MVP.
- User Story 2 (T013-T017) depends on the final US1 interface but can otherwise
  proceed independently by file.
- User Story 3 (T018-T020) depends on US1 runtime states and registry behavior.
- Ringer and complete quality gates (T021-T024) precede publication.
- Platform-standard publication must precede final production activation.
- T029 requires human-created Linear workspace/team/key and GitHub integration;
  source may ship safely in disabled mode before this gate.

## Parallel Opportunities

- T002 and T003 are independent research/standards checks.
- T005 and T006 modify separate focused test concerns.
- T013 and T014 modify separate skill files after the directory exists.
- The Luna runtime/test and operating-document reviews in T021 are disjoint and
  may run with `max_parallel=2`.

## Implementation Strategy

1. Deliver US1 as the minimal source-controlled capability with disabled
   production default.
2. Add the human/Titus operating model without expanding runtime authority.
3. Add activation/rollback evidence on existing deployment surfaces.
4. Stop at the human Linear setup gate if the workspace, team, GitHub
   integration, or team-scoped Read key is not yet available.
5. A mutation wrapper, app user, webhook bridge, event ledger, database copy,
   and GitHub Issues synchronization require a separate approved feature.
