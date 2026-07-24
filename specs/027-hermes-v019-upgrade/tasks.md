# Tasks: Hermes v0.19 Production Upgrade

**Input**: Design documents from `/specs/027-hermes-v019-upgrade/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/rollout-contract.md`, `quickstart.md`

**Tests**: Source contracts are implemented test-first. Production tasks use
read-only preflight, copied-volume staging, isolated cutover, rollback handles,
and evidence-based qualification.

## Phase 1: Setup and Release Intake

**Purpose**: Establish exact source, workspace, and live-state boundaries.

- [x] T001 Read suite and repository instructions plus current roadmap in `AGENTS.md`, `.specify/roadmap.md`, and `.specify/memory/constitution.md`
- [x] T002 Create dedicated application and standard worktrees from clean `main`
- [x] T003 Resolve the official latest non-prerelease release tag, source commit, date, and release notes
- [x] T004 Resolve the immutable OCI index and Linux ARM64 child manifest
- [x] T005 Capture value-free Aegis preflight for all three runtimes, images, versions, cron, dashboard auth, and rollback handles
- [x] T006 Index both feature worktrees and map current image/runbook references

---

## Phase 2: Foundational Design and Safety

**Purpose**: Freeze scope, authority, staging, rollback, and evidence contracts.

- [x] T007 Create and validate `specs/027-hermes-v019-upgrade/spec.md` and `checklists/requirements.md`
- [x] T008 Create `plan.md`, `research.md`, `data-model.md`, `contracts/rollout-contract.md`, and `quickstart.md`
- [x] T009 Record the v0.19 config-schema/default-policy comparison and exact live approval modes
- [x] T010 Run the cross-artifact Spec Kit analysis and resolve any blocking coverage conflict

**Checkpoint**: Scope and production stop conditions are frozen.

---

## Phase 3: User Story 1 - Review a Release Safely (Priority: P1)

**Goal**: Make release intake, derived-image input, and the three-runtime
protocol complete and reproducible before production mutation.

**Independent Test**: The source-contract checker fails against the old
v0.18/stale provisioner state, then passes only after every current source and
standard reference satisfies the v0.19 rollout contract.

### Tests

- [x] T011 [US1] Add `scripts/qualify-hermes-upgrade-source.sh` with exact release, digest, approval, runtime, and standard contract assertions and record the expected RED result

### Implementation

- [x] T012 [US1] Add the secret-free reproducible derived image source and build notes in `infra/hermes-coder/Dockerfile` and `infra/hermes-coder/README.md`
- [x] T013 [US1] Update Titus current runtime defaults and explicit manual/deny policy in `tenants/hermes-titus/`
- [x] T014 [US1] Update the future-tenant immutable image pin in `docker-compose.yml`
- [x] T015 [US1] Correct the three-runtime intake, staging, rollout, rollback, and acceptance workflow in `docs/runbooks/hermes-agent-update-protocol.md`
- [x] T016 [US1] Reconcile v0.19 candidate identities and procedures in `WHAT/hermes.yaml` and `WHAT/services.yaml`
- [x] T017 [US1] Run source contracts, YAML parsing, shell syntax, secret scan, image-reference scan, and diff checks

**Checkpoint**: The playbook and candidate source are ready to run.

---

## Phase 4: User Story 2 - Upgrade All Live Agents Without State Loss (Priority: P2)

**Goal**: Prove the v0.19 candidate on copied state, publish reviewed source,
then upgrade Mitchel, Walter, and Titus sequentially.

**Independent Test**: Each staged and live runtime independently reports
v0.19.0 with its required gateway, dashboard, cron, MCP, auth, approval,
provider/model, memory, and tenant-specific contracts while unrelated
containers and named volumes remain intact.

### Staging and Review

- [x] T018 [US2] Pull the immutable upstream digest on Aegis and verify release, ARM64, runtime, config schema, and upstream launcher behavior
- [x] T019 [US2] Build `overnightdesk/hermes-agent:0.19.0-coder` from exact repository source and record its image ID/digest
- [x] T020 [US2] Capture permission-restricted pre-cutover config, launcher, image, env, volume, cron, and scoped-container snapshots without secret output
- [x] T021 [US2] Create copied staging volumes with production delivery disabled and prove live volumes remain unchanged
- [x] T022 [US2] Qualify Mitchel on copied state
- [x] T023 [US2] Qualify Walter on copied state
- [x] T024 [US2] Qualify Titus on copied state including guarded email, Matrix, memory, Control Tower, MCP registry, and native auth
- [x] T025 [US2] Run Ringer Sol read-only security and production-readiness review and resolve any Critical or Required finding

### Candidate Publication

- [ ] T026 [US2] Commit, push, review, and merge the application candidate PR
- [ ] T027 [US2] Commit, push, review, and merge the platform-standard playbook candidate PR
- [ ] T028 [US2] Synchronize only exact merged application and standard source required by Aegis and verify source hashes

### Sequential Production Cutover

- [ ] T029 [US2] Upgrade and independently qualify `hermes-mitchel`, retaining its v0.18 container rollback handle
- [ ] T030 [US2] Upgrade and independently qualify `hermes-walter`, retaining its v0.18 container rollback handle
- [ ] T031 [US2] Upgrade only `hermes-titus.service` through its repository launcher and run the full Titus qualification suite
- [ ] T032 [US2] Refresh the future-tenant provisioner to the exact immutable v0.19 digest and verify its effective environment
- [ ] T033 [US2] Run aggregate all-runtime, protected-route, Nginx, Ops, cron, MCP, provider/model, approval, volume, and unrelated-container qualification
- [ ] T034 [US2] Observe at least one healthy scheduler/health interval and retain all v0.18 rollback handles

**Checkpoint**: All three live agents and future provisioning use the accepted
release, or the failed runtime has been isolated and rolled back.

---

## Phase 5: User Story 3 - Leave a Reproducible Upgrade Record (Priority: P3)

**Goal**: Publish exact production evidence and leave clean repos/worktrees.

**Independent Test**: Current repository source, platform standard, Aegis image
and runtime state, future-tenant pin, PR history, and deployment ledger agree
on the exact successful or rolled-back result.

- [ ] T035 [US3] Append every production mutation and result to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [ ] T036 [US3] Reconcile production image IDs, runtime evidence, rollback handles, and final status in Feature 027 and the platform standard
- [ ] T037 [US3] Run final source, YAML, shell, Spec Kit, Ringer Sol, and diff qualification
- [ ] T038 [US3] Publish, review, merge, and verify the application closeout PR
- [ ] T039 [US3] Publish, review, merge, synchronize, and verify the platform-standard closeout PR
- [ ] T040 [US3] Confirm final GitHub, local-main, Aegis, deploy-ledger, and worktree state; remove only clean merged worktrees

---

## Dependencies & Execution Order

- Phase 1 precedes Phase 2.
- Phase 2 blocks implementation and production work.
- User Story 1 blocks all staging because the updated protocol must exist first.
- T018-T024 are sequential where they touch shared Aegis image/build resources.
- T025 blocks publication.
- T026-T028 block production cutover so only merged source reaches Aegis.
- Runtime cutovers are strictly T029 → T030 → T031.
- T032 starts only after all existing runtimes qualify.
- T033-T034 block closeout publication.
- Any unresolved failure stops later tasks and invokes the affected runtime's
  rollback contract; named volumes are never deleted.

## Implementation Strategy

1. Finish release intake and the source contract.
2. Update and validate the playbook plus exact candidate references.
3. Build and qualify on copied state.
4. Use Sol as the read-only production readiness gate.
5. Merge candidate source before Aegis cutover.
6. Upgrade least-complex to most-complex, one runtime at a time.
7. Observe, reconcile exact evidence, publish closeout, and clean only merged
   worktrees.
