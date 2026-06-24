# Tasks: Follow-Up Drafting

**Input**: Design documents from `/specs/005-follow-up-drafting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature writes approval-controlled draft records and must use test-first implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the existing Trevor DB MCP package for draft workflow work.

- [x] T001 Review current capture behavior in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/capture.ts`
- [x] T002 [P] Add draft fixtures in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts`
- [x] T003 [P] Extend the in-memory test repository shape for follow-up drafts in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/test-repo.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared draft contracts and repository boundaries before user-story implementation.

- [x] T004 Add follow-up draft input/result types and channel/status enums in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T005 Define repository methods for interaction lookup, draft creation/reuse, and draft status transitions in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T006 Implement parameterized Postgres repository methods for follow-up drafts in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`

---

## Phase 3: User Story 1 - Draft From A Captured Call (Priority: P1) MVP

**Goal**: A captured interaction can produce one stored email draft with no outbound send.

**Independent Test**: Seed a prospect and interaction, generate an email draft, and verify one draft row, status `draft`, subject/body, and `outbound_sent=false`.

### Tests for User Story 1

- [x] T007 [P] [US1] Add failing email draft generation test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-draft.test.ts`
- [x] T008 [P] [US1] Add failing duplicate active draft reuse test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-draft.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Implement core draft orchestration in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [x] T010 [US1] Map draft result to snake_case MCP output in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [x] T011 [US1] Register `generate_follow_up_draft` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T012 [US1] Add follow-up drafting tenant skill in `tenet-0/tenant-workflows/hermes-mitchel/skills/follow-up-drafting/SKILL.md`

---

## Phase 4: User Story 2 - Support Copy-Ready Channels (Priority: P2)

**Goal**: Telegram, SMS, LinkedIn, and Instagram draft bodies are generated and stored without send metadata.

**Independent Test**: Generate drafts for all supported copy-ready channels and reject an unsupported channel with zero writes.

### Tests for User Story 2

- [x] T013 [P] [US2] Add failing copy-ready channel tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-channels.test.ts`
- [x] T014 [P] [US2] Add failing unsupported channel no-write test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-channels.test.ts`

### Implementation for User Story 2

- [x] T015 [US2] Implement channel-specific subject/body templates in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [x] T016 [US2] Enforce unsupported channel rejection before writes in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`

---

## Phase 5: User Story 3 - Manage Draft Approval State (Priority: P3)

**Goal**: Drafts can be approved or discarded without sending external messages.

**Independent Test**: Mark a draft approved or discarded and verify state transitions, approval metadata, and `outbound_sent=false`.

### Tests for User Story 3

- [x] T017 [P] [US3] Add failing approve/discard tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-status.test.ts`
- [x] T018 [P] [US3] Add failing discarded draft cannot be approved test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-status.test.ts`

### Implementation for User Story 3

- [x] T019 [US3] Implement draft status transition logic in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [x] T020 [US3] Register `mark_follow_up_draft` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T021 [US3] Document approval/discard workflow in `tenet-0/tenant-workflows/hermes-mitchel/skills/follow-up-drafting/SKILL.md`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify production readiness and keep docs synchronized.

- [x] T022 Bump Trevor DB MCP server version in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T023 Run `npm test` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`
- [x] T024 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
- [x] T025 Run `$code-review-and-quality`
- [x] T026 Compare deployment expectations with `aegis-prod` using `$aegis-ssh`
- [x] T027 Update `.specify/roadmap-hermes-mitchel-prospecting.md` with Feature 5 local implementation status
- [ ] T028 Commit Feature 5 implementation and open PR

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks user stories.
- **US1**: MVP, starts after Foundation.
- **US2**: Adds channel breadth after US1 result shape exists.
- **US3**: Adds status transitions after draft storage exists.
- **Polish**: Depends on selected user stories being complete.

## Parallel Opportunities

- T002 and T003 can run in parallel.
- T007 and T008 can run in parallel.
- T013 and T014 can run in parallel.
- T017 and T018 can run in parallel.

## Implementation Strategy

1. Complete setup and foundational repository contracts.
2. Implement US1 email draft generation with failing tests first.
3. Add copy-ready channels.
4. Add approve/discard transitions.
5. Run quality gates and Aegis comparison before PR.
