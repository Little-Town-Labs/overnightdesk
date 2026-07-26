# Tasks: Titus Codex OAuth Migration

**Input**: Design documents from `/specs/029-titus-codex-oauth/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/runtime-provider.md`, `quickstart.md`

**Tests**: Projection and variable-catalog contracts are changed first and
observed failing. Production uses read-only preflight, copied-volume staging,
value-safe backups, isolated activation, no-mutation canaries, and evidence-
based rollback gates.

## Phase 1: Setup and Live Discovery

**Purpose**: Establish exact source, workspace, provider, credential, and
runtime boundaries.

- [x] T001 Read suite/repository instructions, constitution, roadmap, and active feature artifacts
- [x] T002 Create dedicated worktree `agent/codex/titus-codex-oauth` from current `origin/main`
- [x] T003 Inspect live Titus, Walter, and Mitchel versions, model/delegation projections, auth metadata, ownership, service health, and restart counts
- [x] T004 Verify Hermes v0.19.0 supports fresh no-browser `openai-codex` OAuth enrollment
- [x] T005 Trace Titus's source-to-Phase-to-process projection and identify the primary/memory model coupling
- [x] T006 Index the isolated worktree and map runtime, test, UI-variable, deploy, qualification, and documentation consumers

---

## Phase 2: Foundational Design and Safety

**Purpose**: Freeze scope, security, activation ordering, rollback, and evidence
before implementation.

- [x] T007 Create and validate `specs/029-titus-codex-oauth/spec.md` and `checklists/requirements.md`
- [x] T008 Create `plan.md`, `research.md`, `data-model.md`, `contracts/runtime-provider.md`, and `quickstart.md`
- [x] T009 Record the exact Sol/medium, Luna/high, OAuth, and independent MiMo/Perplexity memory contracts
- [x] T010 Run cross-artifact Spec Kit analysis and resolve every blocking or high-severity conflict

**Checkpoint**: Scope and production stop conditions are frozen.

---

## Phase 3: User Story 1 - Use Codex for Titus Reasoning (Priority: P1)

**Goal**: Make Titus's primary interactive runtime use the owner's Codex
subscription through a fresh Titus-owned OAuth credential.

**Independent Test**: Exact projection tests fail against the OpenRouter
implementation, then pass with Sol/medium and value-free OAuth metadata checks.

### Tests

- [x] T011 [US1] Change primary provider/model/auth projection assertions in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py` and record the expected RED result
- [x] T012 [US1] Change OpenRouter credential-help assertions in `src/lib/__tests__/managed-agent-variable.test.ts` and record the expected RED result

### Implementation

- [ ] T013 [US1] Project the exact Codex primary provider/base/model/effort in `tenants/hermes-titus/config/config.yaml` and `runtime/start-with-secrets.sh`
- [ ] T014 [US1] Update exact core Phase validation for `gpt-5.6-sol` in `tenants/hermes-titus/runtime/load-phase-env.sh`
- [ ] T015 [US1] Add value-free OAuth active-provider, auth-mode, owner, and permission checks to `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [ ] T016 [US1] Clarify the retained OpenRouter variable as a memory-only credential in `src/lib/managed-agent-variable.ts`
- [ ] T017 [US1] Update current operator guidance in `tenants/hermes-titus/README.md`

**Checkpoint**: Source projects Sol/medium and distinguishes Codex OAuth from
the retained memory credential.

---

## Phase 4: User Story 2 - Delegate to Luna at High Effort (Priority: P2)

**Goal**: Provide a bounded Luna/high delegation lane without changing primary
effort or approval authority.

**Independent Test**: Static and staged runtime inspection prove every exact
delegation value and a bounded no-mutation canary completes.

### Tests

- [x] T018 [US2] Add exact Luna/high and execution-bound assertions to `test_runtime_projection.py` and record the expected RED result

### Implementation

- [ ] T019 [US2] Configure `openai-codex` / `gpt-5.6-luna` / `high` plus exact bounds in `tenants/hermes-titus/config/config.yaml`
- [ ] T020 [US2] Enforce the same delegation projection in `tenants/hermes-titus/runtime/start-with-secrets.sh`
- [ ] T021 [US2] Add value-free delegation verification to `tenants/hermes-titus/scripts/deploy-aegis.sh` and `scripts/qualify.sh`

**Checkpoint**: Delegation is independently high effort, bounded, and
auto-approval remains disabled.

---

## Phase 5: User Story 3 - Preserve Memory and Recovery (Priority: P3)

**Goal**: Keep TencentDB memory healthy and provide a reversible one-restart
production migration.

**Independent Test**: Static/staged process projections use MiMo and the
existing Perplexity embedding contract independently of Sol; memory
capture/recall and rollback rehearsal pass.

### Tests

- [x] T022 [US3] Add explicit memory-selector, exact allowlist, process-projection, and retained-embedding assertions to `test_runtime_projection.py` and record the expected RED result

### Implementation

- [ ] T023 [US3] Add `MEMORY_TENCENTDB_LLM_MODEL` to the exact memory Phase contract in `tenants/hermes-titus/runtime/load-phase-env.sh`
- [ ] T024 [US3] Map the new selector to `TDAI_LLM_MODEL` while retaining the OpenRouter key/base in `tenants/hermes-titus/runtime/start-with-secrets.sh`
- [ ] T025 [US3] Extend memory and rollback gates in `tenants/hermes-titus/scripts/deploy-aegis.sh` and `scripts/qualify.sh`
- [ ] T026 [US3] Document the split provider and compatible activation order in `tenants/hermes-titus/README.md`
- [ ] T027 [US3] Run focused Python/Jest tests, shell/YAML checks, full Titus qualification, and a credential-leak scan

**Checkpoint**: All three user stories pass locally and the old coupled state is
rejected by tests.

---

## Phase 6: Staging, Review, and Publication

**Purpose**: Prove production compatibility before mutating live state.

- [ ] T028 Stage exact source against a copied `hermes-titus-data` volume with delivery/business mutations disabled
- [ ] T029 Prove startup, OAuth-store preservation, Sol/Luna config rendering, independent memory initialization, health, and rollback on copied state
- [ ] T030 Run code-quality, security, observability, and production-readiness review; resolve every Critical or Required finding
- [ ] T031 Publish, review, merge, and synchronize the exact application candidate before production cutover
- [ ] T032 Create a dedicated platform-standard worktree and prepare the exact current-state/runbook candidate without claiming activation

---

## Phase 7: Controlled Production Activation

**Purpose**: Enroll Titus OAuth and execute the reversible one-restart cutover.

- [ ] T033 Capture value-free pre-cutover evidence and restricted rollback handles for source, Phase selectors, config, auth, image, services, volumes, routes, health, and unrelated restart counts
- [ ] T034 Enroll fresh Titus-owned `openai-codex` OAuth and prove active `chatgpt` metadata, owner, and mode without exposing credential material
- [ ] T035 Synchronize exact merged source and update compatible Sol primary plus MiMo memory Phase selectors as one controlled transaction
- [ ] T036 Restart only `hermes-titus.service` and stop or roll back on the first failed startup/projection/health gate
- [ ] T037 Prove exact primary, delegation, auth, memory, approval, identity, tool, channel, route, volume, email-intake, and unrelated-runtime projections
- [ ] T038 Run one no-tool primary canary, one bounded no-mutation delegation canary, and one synthetic non-sensitive memory capture/recall canary
- [ ] T039 Observe one normal interval with zero relevant OAuth, refresh, rate-limit, provider, delegation, or memory errors

---

## Phase 8: Closeout and Operational Truth

**Purpose**: Make the accepted state reproducible without removing rollback.

- [ ] T040 Append every production mutation and result to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [ ] T041 Reconcile exact accepted state and rollback handles in Feature 029 and the platform-standard candidate
- [ ] T042 Publish, review, merge, synchronize, and verify the platform-standard reconciliation
- [ ] T043 Run final source, shell, YAML, test, Spec Kit, secret, diff, production, and code-review qualification
- [ ] T044 Confirm GitHub, local worktree, Aegis, deploy-ledger, and observation state; retain rollback handles until separately approved cleanup

## Dependencies and Execution Order

- Phase 2 depends on live discovery and blocks implementation.
- T011, T012, T018, and T022 must be observed failing before T013-T026.
- The memory-selector split is a hard prerequisite for changing the production
  primary selector.
- Copied-volume staging and review block publication; merged synchronized
  source blocks production activation.
- OAuth enrollment may occur before the provider cutover because the active
  OpenRouter runtime does not consume it.
- New source must be staged before adding the new Phase memory key; the primary
  and memory selectors then change in the same restart transaction.
- Any unresolved failure stops later tasks and invokes Titus-only rollback.
- No task deletes a named volume, credential, memory, message, rollback handle,
  container, branch, or worktree.

## Implementation Strategy

1. Freeze the exact provider and independent memory contracts.
2. Make projection tests fail against the current coupled runtime.
3. Implement primary, delegation, memory, verification, and operator changes.
4. Qualify locally and against copied production state.
5. Complete bounded review and merge exact candidate source.
6. Enroll Titus's own OAuth credential.
7. Activate once, verify every boundary, and observe.
8. Reconcile the standard and deployment evidence; retain recovery handles.
