# Tasks: Phase App Consolidation

**Input**: Design documents from `specs/018-phase-app-consolidation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/phase-selector-contract.md`, `quickstart.md`

**Tests**: Required by the repository constitution. Contract assertions must
fail before their associated loader or script changes are implemented.

## Phase 1: Setup

**Purpose**: Establish isolated work and evidence surfaces.

- [x] T001 Create the Phase evidence and Aegis consumer worktrees described in `specs/018-phase-app-consolidation/plan.md`
- [x] T002 Record current App IDs, Environment IDs, live selectors, and healthy-service baseline in `specs/018-phase-app-consolidation/research.md`

---

## Phase 2: Foundational Phase Preparation

**Purpose**: Prepare reversible destinations before changing consumers.

- [x] T003 Copy and fingerprint-verify 55 `Infrastructure:/` entries at `overnightdesk:/email-fetch` using protected Aegis temporary storage
- [x] T004 Copy and fingerprint-verify the 14-entry Agent and Mitchel intake paths at their OvernightDesk destinations
- [ ] T005 Verify target App and Production Environment grants for the email-fetch and intake service-account identities and record value-suppressed evidence in `specs/018-phase-app-consolidation/quickstart.md`

**Checkpoint**: All target values exist. Target-app grants remain an activation
gate; source and test preparation may continue while the admin grant is pending.

---

## Phase 3: User Story 1 - Consolidate OvernightDesk Infrastructure (Priority: P1)

**Goal**: Source-own and activate email-fetch at `overnightdesk:/email-fetch`.

**Independent Test**: The source-owned script selects the exact target and a
one-shot live run completes while `Infrastructure:/` remains readable.

### Tests for User Story 1

- [x] T006 [US1] Add a failing contract assertion for the email-fetch app, environment, and path in `scripts/qualify-phase-app-consolidation.sh`

### Implementation for User Story 1

- [x] T007 [US1] Add the source-owned `overnightdesk:/email-fetch` runner in `scripts/run-email-fetch.sh`
- [x] T008 [US1] Qualify the email-fetch selector with `scripts/qualify-phase-app-consolidation.sh` and `git diff --check`
- [ ] T009 [US1] Back up and activate `/opt/overnightdesk/run-email-fetch.sh`, run one live fetch, and verify the completion event without emitting injected values

**Checkpoint**: Email-fetch runs only from the target path and has an explicit
script rollback.

---

## Phase 4: User Story 2 - Separate Intake Routes by Use Case (Priority: P2)

**Goal**: Route Titus to TTS and Agent/Mitchel to OvernightDesk.

**Independent Test**: Qualification proves the three-route matrix and all
three live services load their exact 14-key payload and remain healthy.

### Tests for User Story 2

- [x] T010 [US2] Add failing Titus default and intake route-matrix assertions in `tenants/hermes-titus/scripts/qualify.sh` and `tenants/hermes-titus/email-poller/scripts/qualify.sh`

### Implementation for User Story 2

- [x] T011 [US2] Default Titus to `timeless-tech-solutions` in `tenants/hermes-titus/runtime/load-phase-env.sh`
- [x] T012 [US2] Implement route-aware defaults and override behavior in `tenants/hermes-titus/email-poller/runtime/load-phase-config.sh`
- [x] T013 [US2] Make polling-state updates use the same route-to-app matrix in `tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh`
- [x] T014 [US2] Run both Titus qualification suites and confirm the new assertions pass

**Checkpoint**: Source and tests agree on every route before deployment.

---

## Phase 5: User Story 3 - Complete a Reversible Cutover (Priority: P3)

**Goal**: Coordinate grants, rename, deployment, verification, and standards.

**Independent Test**: All five consumers perform a real secret load and report
healthy, with zero active obsolete selectors and both source apps retained.

### Implementation for User Story 3

- [ ] T015 [US3] Rename app ID `f8e85a82-d424-49f7-9522-1586510f185c` to `timeless-tech-solutions` through an authorized Phase admin surface
- [ ] T016 [US3] Deploy the reviewed Titus and intake loaders from `018-phase-app-consolidation` and restart/verify one service at a time
- [ ] T017 [US3] Update app, path, consumer, rollback, and migration evidence in the sibling `overnightdesk-platform-standard` Phase worktree
- [ ] T018 [US3] Sync the merged platform standard to Aegis, restart `overnightdesk-ops`, and run the full Aegis health check
- [ ] T019 [US3] Append the production activation result to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [ ] T020 [US3] Apply the five-axis review gate, push both branches, and open reviewable pull requests in their owning repositories

**Checkpoint**: The two-app target is active and documented; `Infrastructure`
remains intact and deletion is still out of scope.

---

## Dependencies & Execution Order

- Setup and completed copy preparation precede every consumer change.
- T005 blocks every production restart, but not source-only preparation.
- T006 must fail before T007; T010 must fail before T011-T013.
- T007-T009 and T011-T014 are independently reviewable, but T015-T016 form one
  coordinated rename/deploy window.
- T017-T019 follow verified runtime activation.
- T020 follows all requested implementation and closeout checks.

## Parallel Opportunities

- Documentation in the Phase worktree can be prepared while consumer tests and
  source change in the Aegis worktree.
- Email-fetch source work and intake/Titus source work touch different files,
  but production activation remains sequential.

## Implementation Strategy

1. Finish access proof before changing selectors.
2. Land the email-fetch and route-selection source slices test-first.
3. Review both worktrees.
4. Perform one coordinated Phase rename/Aegis activation window.
5. Close standards and deployment evidence without deleting sources.
