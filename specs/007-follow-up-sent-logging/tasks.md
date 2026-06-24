# Tasks: Follow-Up Sent Logging

**Input**: Design documents from `/specs/007-follow-up-sent-logging/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature mutates prospect history and draft state, so implementation must be test-first.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the existing Trevor DB MCP package for sent logging work.

- [ ] T001 Review current follow-up draft status behavior in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [ ] T002 [P] Add sent logging fixtures in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts`
- [ ] T003 [P] Extend the in-memory test repository shape for sent confirmation in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/test-repo.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared sent logging contracts and repository boundaries before user-story implementation.

- [ ] T004 Add send confirmation input/result and queue item types in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [ ] T005 Define repository methods for approved-draft listing and atomic sent confirmation in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [ ] T006 Implement parameterized Postgres repository methods for send confirmation in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`

---

## Phase 3: User Story 1 - Log A Manually Sent Follow-Up (Priority: P1) MVP

**Goal**: An approved draft can be confirmed as manually sent, creating one interaction and marking the draft `manual_sent`.

**Independent Test**: Seed an approved draft, confirm manual send, and verify one new interaction, final draft status, sent metadata, and `outbound_sent=false`.

### Tests for User Story 1

- [ ] T007 [P] [US1] Add failing manual sent confirmation test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-sent-log.test.ts`
- [ ] T008 [P] [US1] Add failing idempotent retry test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-sent-log.test.ts`

### Implementation for User Story 1

- [ ] T009 [US1] Implement manual sent confirmation orchestration in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [ ] T010 [US1] Map manual sent confirmation result to snake_case MCP output in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [ ] T011 [US1] Register `log_manual_follow_up_sent` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`

---

## Phase 4: User Story 2 - Review Drafts Awaiting Send Confirmation (Priority: P2)

**Goal**: Approved unsent drafts can be listed as a bounded send-confirmation queue.

**Independent Test**: Seed multiple draft statuses, request the queue, and verify only approved unsent drafts appear with bounded summaries.

### Tests for User Story 2

- [ ] T012 [P] [US2] Add failing send-confirmation queue filter test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-send-queue.test.ts`
- [ ] T013 [P] [US2] Add failing do-not-contact review-only queue test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-send-queue.test.ts`

### Implementation for User Story 2

- [ ] T014 [US2] Implement approved unsent draft listing in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [ ] T015 [US2] Register `list_follow_ups_awaiting_send` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`

---

## Phase 5: User Story 3 - Guard Confirmation Boundaries (Priority: P3)

**Goal**: Invalid state transitions and unsafe do-not-contact confirmations are blocked before writes.

**Independent Test**: Attempt confirmations for unapproved, discarded, already completed, and do-not-contact drafts and verify no unintended writes.

### Tests for User Story 3

- [ ] T016 [P] [US3] Add failing invalid draft status no-write tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-sent-safety.test.ts`
- [ ] T017 [P] [US3] Add failing do-not-contact audit-only override tests in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/followup-sent-safety.test.ts`

### Implementation for User Story 3

- [ ] T018 [US3] Enforce invalid status and do-not-contact guards in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [ ] T019 [US3] Bound and sanitize external reference and audit reason fields in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify readiness and keep docs synchronized.

- [ ] T020 Update follow-up drafting tenant skill with sent logging workflow in `tenet-0/tenant-workflows/hermes-mitchel/skills/follow-up-drafting/SKILL.md`
- [ ] T021 Bump Trevor DB MCP server version in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [ ] T022 Run `npm test` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`
- [ ] T023 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
- [ ] T024 Run `$code-review-and-quality`
- [ ] T025 Compare deployment expectations with `aegis-prod` using `$aegis-ssh`
- [ ] T026 Update `.specify/roadmap-hermes-mitchel-prospecting.md` with Feature 7 implementation status
- [ ] T027 Commit Feature 7 implementation and open PR

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks user stories.
- **US1**: MVP, starts after Foundation.
- **US2**: Adds queue discovery after sent confirmation result shape exists.
- **US3**: Adds safety hardening after basic confirmation path exists.
- **Polish**: Depends on selected user stories being complete.

## Parallel Opportunities

- T002 and T003 can run in parallel.
- T007 and T008 can run in parallel.
- T012 and T013 can run in parallel.
- T016 and T017 can run in parallel.

## Implementation Strategy

1. Complete setup and foundational repository contracts.
2. Implement US1 manual sent confirmation with failing tests first.
3. Add the approved-draft send-confirmation queue.
4. Add invalid-state and do-not-contact safety hardening.
5. Run quality gates and Aegis comparison before PR.
