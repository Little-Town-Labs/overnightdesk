# Tasks: Post-Call Capture

**Input**: Design documents from `/specs/004-post-call-capture/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature writes prospecting records and must use test-first implementation for each story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the existing Trevor DB MCP package for capture workflow work.

- [x] T001 Review current queue and brief behavior in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts` and `tenants/hermes-mitchel/mcp-servers/trevor-db/src/brief.ts`
- [x] T002 [P] Add capture fixtures for outcomes and task states in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts`
- [x] T003 [P] Extend the in-memory test repository shape for interactions, prospect updates, and task completion in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/test-repo.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared capture contracts and repository boundaries before user-story implementation.

- [x] T004 Add post-call capture input/result types and outcome enums in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T005 Define repository methods for capture lookup, transactional local capture, duplicate task detection, and prospect state updates in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T006 Implement parameterized Postgres repository methods for capture in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Capture A Completed Call (Priority: P1) MVP

**Goal**: A valid task-anchored call outcome writes one interaction, updates prospect state, completes the task, and sends nothing outbound.

**Independent Test**: Seed an open task, capture the call, and verify one interaction, prospect cadence updates, completed task, and `outbound_sent=false`.

### Tests for User Story 1

- [x] T007 [P] [US1] Add failing task-anchored successful capture test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/capture-task.test.ts`
- [x] T008 [P] [US1] Add failing no-outbound and no-follow-up-draft assertion test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/capture-safety.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Implement core capture orchestration in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`
- [x] T010 [US1] Map capture result to snake_case MCP output in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`
- [x] T011 [US1] Register the capture MCP tool in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T012 [US1] Add post-call capture tenant skill in `tenants/hermes-mitchel/skills/post-call-capture/SKILL.md`

**Checkpoint**: User Story 1 is independently deployable after tests pass.

---

## Phase 4: User Story 2 - Ask Only For Missing Required Fields (Priority: P2)

**Goal**: Partial capture requests return a bounded missing-field response and write zero records.

**Independent Test**: Submit a capture request missing outcome or target and verify `needs_input`, exact missing fields, and no repository writes.

### Tests for User Story 2

- [x] T013 [P] [US2] Add failing missing outcome test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/capture-missing-fields.test.ts`
- [x] T014 [P] [US2] Add failing missing target and no-partial-write tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/capture-missing-fields.test.ts`

### Implementation for User Story 2

- [x] T015 [US2] Implement required-field evaluation in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`
- [x] T016 [US2] Ensure missing-field results bypass repository write methods in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`

**Checkpoint**: User Story 1 and User Story 2 both work independently.

---

## Phase 5: User Story 3 - Mirror The Call Into Agiled When Linked (Priority: P3)

**Goal**: Capture responses clearly report Agiled note status without blocking local capture.

**Independent Test**: Capture linked and unlinked prospects and verify Agiled status is `created`, `skipped`, or `failed` while local write behavior remains correct.

### Tests for User Story 3

- [x] T017 [P] [US3] Add failing unlinked prospect Agiled skipped test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/capture-agiled.test.ts`
- [x] T018 [P] [US3] Add failing linked prospect Agiled created/failed status tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/capture-agiled.test.ts`

### Implementation for User Story 3

- [x] T019 [US3] Add Agiled note status abstraction in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`
- [x] T020 [US3] Keep Agiled failure non-fatal after local capture in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`
- [x] T021 [US3] Document Agiled linked/unlinked behavior in `tenants/hermes-mitchel/skills/post-call-capture/SKILL.md`

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify production readiness and keep docs synchronized.

- [x] T022 Bump Trevor DB MCP server version in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T023 Run `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T024 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
- [x] T025 Run `$code-review-and-quality`
- [x] T026 Compare deployment expectations with `aegis-prod` using `$aegis-ssh`
- [x] T027 Update `.specify/roadmap-hermes-mitchel-prospecting.md` with Feature 4 local implementation status
- [ ] T028 Commit Feature 4 implementation and open PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundation and is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundation; can be implemented after or alongside US1 validation.
- **User Story 3 (Phase 5)**: Depends on Foundation and capture result shape.
- **Polish (Phase 6)**: Depends on selected user stories being complete.

### User Story Dependencies

- **US1**: Core MVP and should land first.
- **US2**: Uses the same capture input validation but must preserve no-write behavior.
- **US3**: Uses the capture result shape and can start after US1 establishes local capture.

### Parallel Opportunities

- T002 and T003 can run in parallel.
- T007 and T008 can run in parallel.
- T013 and T014 can run in parallel.
- T017 and T018 can run in parallel.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Implement US1 with failing tests first.
3. Run `npm test` and validate a successful task-anchored capture with no outbound behavior.
4. Add US2 missing-field safeguards.
5. Add US3 Agiled status reporting.
6. Run full quality gates before PR.
