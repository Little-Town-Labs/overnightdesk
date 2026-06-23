# Tasks: Trevor Prospecting Data Model

**Input**: Design documents from `specs/001-trevor-prospecting-data-model/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema-verification.sql, quickstart.md

**Tests**: This feature uses SQL verification and migration dry-run checks rather than application unit tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature artifacts and migration location.

- [x] T001 Confirm current branch and feature pointer in `.specify/feature.json`
- [x] T002 [P] Confirm existing Tenet-0 migration pattern in `tenet-0/db/migrate.sh`
- [x] T003 [P] Confirm existing latest migration number under `tenet-0/db/migrations/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core migration and verification assets that all user stories depend on.

**CRITICAL**: No user story work can be complete until this phase is complete.

- [x] T004 Create schema migration `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T005 Create operator runbook `docs/runbooks/trevor-prospecting-data-model.md`
- [x] T006 Update verification contract `specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql` if migration adds or renames any checks

**Checkpoint**: Migration and runbook artifacts exist.

---

## Phase 3: User Story 1 - Deployable Prospecting Schema (Priority: P1)

**Goal**: The Trevor data model change is deployable, repeatable, and recoverable.

**Independent Test**: Review the migration and runbook, then run migration discovery against a database with the current Trevor baseline.

- [x] T007 [US1] Add baseline assertions for `trevor.prospects`, `trevor.interactions`, and `trevor.memory` in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T008 [US1] Add idempotent schema changes for cadence fields, call tasks, and follow-up drafts in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T009 [US1] Add backup, dry-run, apply, verify, rollback, and deploy-log steps in `docs/runbooks/trevor-prospecting-data-model.md`
- [x] T010 [US1] Run migration discovery with `TENET0_MIGRATIONS_DIR=tenet-0/db/migrations tenet-0/db/migrate.sh apply-pending --dry-run` when a safe non-production database URL is available, or document why it was not run in `specs/001-trevor-prospecting-data-model/quickstart.md`

**Checkpoint**: User Story 1 is ready when the migration is reviewable and the runbook gives a safe production path.

---

## Phase 4: User Story 2 - Safe Prospect Cadence Tracking (Priority: P2)

**Goal**: Prospect records can store cadence and contact-permission state.

**Independent Test**: Verify the migration defines and indexes next-action and suppression fields without invalidating existing incomplete prospect records.

- [x] T011 [US2] Add prospect cadence columns and constraints in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T012 [US2] Add prospect lookup indexes for do-not-contact, next action, priority, and status in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T013 [US2] Include prospect cadence verification queries in `specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql`

**Checkpoint**: User Story 2 is ready when prospect cadence fields are represented and queryable.

---

## Phase 5: User Story 3 - Approval-Ready Follow-Up Storage (Priority: P3)

**Goal**: Follow-up drafts can be stored separately from completed interaction history.

**Independent Test**: Verify follow-up draft records can reference prospects and optional interactions while tracking draft, approved, sent, manual-sent, and discarded states.

- [x] T014 [US3] Add `trevor.followup_drafts` table with lifecycle constraints in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T015 [US3] Add follow-up draft indexes and update trigger in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T016 [US3] Include follow-up draft verification queries in `specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql`

**Checkpoint**: User Story 3 is ready when drafts are separated from interaction history and approval state is explicit.

---

## Phase 6: User Story 4 - Production Verification and Documentation (Priority: P4)

**Goal**: Operators can verify and document the deployed schema.

**Independent Test**: Follow the runbook through the verification section without applying live changes.

- [x] T017 [US4] Add grants for `trevor_app` and sequence usage in `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T018 [US4] Add grants verification to `specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql`
- [x] T019 [US4] Add platform-standard follow-up instructions to `docs/runbooks/trevor-prospecting-data-model.md`
- [x] T020 [US4] Update `.specify/roadmap-hermes-mitchel-prospecting.md` to mark plan/tasks complete for Feature 1

**Checkpoint**: User Story 4 is ready when verification and documentation handoff steps are explicit.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate artifacts and prepare for commit without committing.

- [x] T021 [P] Run placeholder search across `specs/001-trevor-prospecting-data-model/`, `docs/runbooks/trevor-prospecting-data-model.md`, and `tenet-0/db/migrations/051_trevor_prospecting.sql`
- [x] T022 [P] Run `git status --short` and confirm all changed files are expected
- [x] T023 Update this `specs/001-trevor-prospecting-data-model/tasks.md` file to mark completed tasks
- [x] T024 Stop before git commit and report commit-ready state to the user

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational.
- **User Story 2 (Phase 4)**: Depends on Foundational and can be reviewed independently after migration exists.
- **User Story 3 (Phase 5)**: Depends on Foundational and can be reviewed independently after migration exists.
- **User Story 4 (Phase 6)**: Depends on user story schema details.
- **Polish**: Depends on all desired user stories.

### User Story Dependencies

- **US1**: MVP and deployment safety baseline.
- **US2**: Uses same migration as US1; independent verification is prospect-focused.
- **US3**: Uses same migration as US1; independent verification is draft-focused.
- **US4**: Requires final migration shape for verification and docs.

## Parallel Opportunities

- T002 and T003 can run in parallel.
- T005 and T006 can be drafted in parallel after T004 is created.
- Verification-contract updates for US2, US3, and US4 can be reviewed independently.
- Final placeholder search and git status can run in parallel.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete setup and foundational tasks.
2. Create the migration and runbook.
3. Validate that the migration is reviewable and has a safe production path.
4. Stop before production deployment.

### Incremental Delivery

1. Add prospect cadence state and verification.
2. Add follow-up draft storage and verification.
3. Add grants and operator documentation.
4. Stop before commit.
