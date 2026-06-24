# Tasks: Daily Call Queue

**Input**: Design documents from `specs/002-daily-call-queue/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.yaml, quickstart.md

**Tests**: Required for this feature because ranking, suppression, task persistence, and no-outbound safety are behavior-critical.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish repo-controlled tenant workflow source without touching production.

- [x] T001 Create tenant workflow directories `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/`, `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/`, and `tenet-0/tenant-workflows/hermes-mitchel/skills/daily-call-queue/`
- [x] T002 Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/package.json` with TypeScript build/test scripts and dependencies matching the live MCP pattern
- [x] T003 Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tsconfig.json` for ESM output to `dist/`
- [x] T004 [P] Create `specs/002-daily-call-queue/contracts/queue-verification.sql` with placeholder sections for DNC suppression, ranking, idempotency, and no side-effect verification

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared queue types, database access, and safety guards that all stories depend on.

**CRITICAL**: No user story work can be complete until this phase is complete.

- [x] T005 Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts` with `ProspectCandidate`, `CallRecommendation`, `QueueRunResult`, and `CallTaskStatus` types from `data-model.md`
- [x] T006 Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/db.ts` with `pg.Pool` initialization from `TREVOR_DB_URL` and no credential logging
- [x] T007 Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/safety.ts` with helpers for redacting notes/contact details from errors and rejecting send-capable actions
- [x] T008 [P] Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts` with representative prospect/task fixtures covering due, stale, high-priority, DNC, missing-phone, and duplicate-task cases
- [x] T009 Create `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts` preserving existing `db_query` and `db_execute` tools while importing the new queue tools

**Checkpoint**: Tenant MCP source exists, builds, and preserves generic tools before queue behavior is added.

---

## Phase 3: User Story 1 - Ask Who To Call Today (Priority: P1) MVP

**Goal**: Mitchel can ask Trevor for a ranked call queue with reason, objective, buyer context, and opener.

**Independent Test**: Run queue generation against fixture data and verify ranking and explanation fields without writing tasks.

### Tests for User Story 1

- [x] T010 [P] [US1] Add ranking tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-ranking.test.ts`
- [x] T011 [P] [US1] Add output-shape tests for `generate_daily_call_queue` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-output.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement candidate query SQL in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T013 [US1] Implement deterministic scoring and tie-break logic in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T014 [US1] Implement recommendation text shaping in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T015 [US1] Register `generate_daily_call_queue` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts` with `persist=false` support
- [x] T016 [US1] Update `specs/002-daily-call-queue/contracts/queue-verification.sql` with ranking verification queries

**Checkpoint**: User Story 1 is complete when the tool can generate a non-persisted ranked queue from fixture or staging data.

---

## Phase 4: User Story 2 - Suppress Unsafe Or Inappropriate Calls (Priority: P2)

**Goal**: Do-not-contact and not-call-ready prospects are reliably excluded from callable recommendations.

**Independent Test**: Mark fixture prospects as DNC or missing contact readiness and verify they do not appear in callable output.

### Tests for User Story 2

- [x] T017 [P] [US2] Add DNC suppression tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-suppression.test.ts`
- [x] T018 [P] [US2] Add review-needed tests for missing phone/preferred channel in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-readiness.test.ts`

### Implementation for User Story 2

- [x] T019 [US2] Implement hard DNC filtering in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T020 [US2] Implement `review_needed` output for missing contact context in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T021 [US2] Add sanitized warning/count metadata for suppressed and review-needed prospects in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T022 [US2] Update `specs/002-daily-call-queue/contracts/queue-verification.sql` with DNC and readiness verification queries

**Checkpoint**: User Story 2 is complete when callable output has zero DNC prospects and missing-context rows are separated.

---

## Phase 5: User Story 3 - Persist Stable Call Tasks (Priority: P3)

**Goal**: Queue generation creates or reuses durable `trevor.call_tasks` without duplicate open work.

**Independent Test**: Generate a queue twice for the same sales day and verify task IDs are stable and row counts do not duplicate.

### Tests for User Story 3

- [x] T023 [P] [US3] Add idempotent task persistence tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-persistence.test.ts`
- [x] T024 [P] [US3] Add task status contract tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/call-task-status.test.ts`

### Implementation for User Story 3

- [x] T025 [US3] Implement find-or-create open call task logic in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T026 [US3] Register `list_call_tasks` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T027 [US3] Register `mark_call_task_status` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T028 [US3] Update `specs/002-daily-call-queue/contracts/queue-verification.sql` with duplicate-task and no-interaction/no-draft side-effect checks

**Checkpoint**: User Story 3 is complete when persisted queue rows are stable across repeated generation.

---

## Phase 6: User Story 4 - Explain Queue Inputs And Limits (Priority: P4)

**Goal**: Trevor can explain why each prospect was recommended and what context was missing.

**Independent Test**: Generate queues with missing Agiled and inventory context and verify explanations are honest.

### Tests for User Story 4

- [x] T029 [P] [US4] Add missing-context explanation tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-explanations.test.ts`

### Implementation for User Story 4

- [x] T030 [US4] Implement optional `inventory_context` handling without storing inventory text in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts`
- [x] T031 [US4] Create tenant skill `tenet-0/tenant-workflows/hermes-mitchel/skills/daily-call-queue/SKILL.md` describing when and how Trevor should call the queue tools
- [x] T032 [US4] Add operator notes to `specs/002-daily-call-queue/quickstart.md` for validating honest missing-context output

**Checkpoint**: User Story 4 is complete when queue output clearly distinguishes known facts from missing context.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate, document, and prepare for production sync.

- [x] T033 [P] Run placeholder search across `specs/002-daily-call-queue/`, `tenet-0/tenant-workflows/hermes-mitchel/`, and `AGENTS.md`
- [x] T034 Run `npm test` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`
- [x] T035 Run `npm run build` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`
- [x] T036 Run read-only Aegis preflight from `specs/002-daily-call-queue/quickstart.md`
- [x] T037 Update `.specify/roadmap-hermes-mitchel-prospecting.md` to mark Feature 2 plan/tasks/implementation status accurately
- [x] T038 Run `git status --short` and confirm all changed files are expected
- [x] T039 Stop before production sync unless explicitly approved, or append `/home/frosted639/src/overnightdesk-suite/deploys.log` after any approved Aegis deployment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational; MVP.
- **US2 (Phase 4)**: Depends on US1 candidate/output structure.
- **US3 (Phase 5)**: Depends on US1/US2 so only safe recommendations are persisted.
- **US4 (Phase 6)**: Depends on US1 output shape; can be developed after US1 but should verify against final fields.
- **Polish**: Depends on all selected stories.

### User Story Dependencies

- **US1**: Required first because it creates ranking and output shape.
- **US2**: Uses US1 candidate list and strengthens safety.
- **US3**: Uses US1/US2 safe recommendation set for persistence.
- **US4**: Uses final recommendation shape and can land after US1, but full validation should include US2/US3.

## Parallel Opportunities

- T004 can run after directory setup without waiting for package setup.
- T008 can run in parallel with T005-T007.
- US1 tests T010 and T011 can run in parallel.
- US2 tests T017 and T018 can run in parallel.
- US3 tests T023 and T024 can run in parallel.
- US4 test T029 can run while T030/T031 are drafted, as long as expected output shape is stable.

## Parallel Example: US2

```text
Task: "Add DNC suppression tests in tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-suppression.test.ts"
Task: "Add review-needed tests for missing phone/preferred channel in tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/queue-readiness.test.ts"
```

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Setup and Foundational phases.
2. Implement US1 with `persist=false`.
3. Validate ranking and explanation shape locally.
4. Stop if the queue cannot be trusted without more data cleanup.

### Incremental Delivery

1. Add US2 suppression and readiness.
2. Add US3 persistence only after suppression is proven.
3. Add US4 explanation/skill guidance.
4. Validate through quickstart before any Aegis sync.

### Production Sync Strategy

Production sync is intentionally outside automatic task completion unless explicitly approved. When approved, sync the built MCP server and skill only, restart the minimal affected tenant process, validate counts, and append `deploys.log`.
