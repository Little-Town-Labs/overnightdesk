# Tasks: Cadence Scheduler and Digest

**Input**: Design documents from `/specs/006-cadence-scheduler-digest/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature composes production cadence recommendations and documents scheduler behavior; use test-first implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the existing Trevor DB MCP package and tenant docs for digest work.

- [x] T001 Review current call queue and follow-up output boundaries in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/queue.ts` and `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/followup.ts`
- [x] T002 [P] Add digest fixtures in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts`
- [x] T003 [P] Extend the in-memory test repository with stale-work and pending-draft lookup support in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/test-repo.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared digest contracts and read-only repository boundaries before user-story implementation.

- [x] T004 Add cadence digest request/result, stale item, and approval item types in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T005 Define read-only repository methods for pending follow-up drafts and stale work candidates in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T006 Implement parameterized Postgres read methods for pending drafts and stale work in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`

---

## Phase 3: User Story 1 - Generate Morning Digest On Demand (Priority: P1) MVP

**Goal**: Mitchel can request one daily digest that combines the call queue, review-needed items, stale work, follow-up approvals, counts, warnings, and side-effect flags.

**Independent Test**: Seed prospects and request a digest with `persist_call_tasks=false`; verify all required sections exist and no outbound/send/draft/interaction side effects occur.

### Tests for User Story 1

- [x] T007 [P] [US1] Add failing on-demand digest composition test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-generate.test.ts`
- [x] T008 [P] [US1] Add failing no-default-write side-effect test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-generate.test.ts`
- [x] T009 [P] [US1] Add failing snake_case MCP contract test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-contract.test.ts`

### Implementation for User Story 1

- [x] T010 [US1] Implement digest orchestration in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/digest.ts`
- [x] T011 [US1] Map digest result to snake_case MCP output in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/digest.ts`
- [x] T012 [US1] Register `generate_cadence_digest` with bounded Zod input in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T013 [US1] Add cadence digest tenant skill in `tenet-0/tenant-workflows/hermes-mitchel/skills/cadence-digest/SKILL.md`

---

## Phase 4: User Story 2 - Review Follow-Up and Stale Work Reminders (Priority: P2)

**Goal**: Digest includes actionable draft approvals and stale buyer work while suppressing do-not-contact outreach and avoiding raw notes or full draft bodies.

**Independent Test**: Seed draft, approved, discarded, overdue, dormant, and do-not-contact records; verify digest includes only bounded actionable summaries with correct counts and review-only labels.

### Tests for User Story 2

- [x] T014 [P] [US2] Add failing pending follow-up approval digest test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-reminders.test.ts`
- [x] T015 [P] [US2] Add failing stale and dormant work digest test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-reminders.test.ts`
- [x] T016 [P] [US2] Add failing do-not-contact suppression and bounded-detail test in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-safety.test.ts`

### Implementation for User Story 2

- [x] T017 [US2] Implement pending draft summary selection in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/digest.ts`
- [x] T018 [US2] Implement stale work reason and next-step summaries in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/digest.ts`
- [x] T019 [US2] Enforce digest detail bounding and do-not-contact review-only behavior in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/digest.ts`
- [x] T020 [US2] Update cadence digest skill guidance for stale work and follow-up approval review in `tenet-0/tenant-workflows/hermes-mitchel/skills/cadence-digest/SKILL.md`

---

## Phase 5: User Story 3 - Document and Validate Scheduler Enablement (Priority: P3)

**Goal**: Operator has a clear validate-enable-disable-rollback path for weekday digest scheduling, with scheduling disabled by default.

**Independent Test**: Review and execute the documented validation command without enabling a schedule; verify runbook contains enable, disable, rollback, log, owner, and side-effect checks.

### Tests for User Story 3

- [x] T021 [P] [US3] Add failing scheduler-disabled-by-default assertion in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-scheduler.test.ts`
- [x] T022 [P] [US3] Add failing runbook content check in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/tests/digest-scheduler.test.ts`

### Implementation for User Story 3

- [x] T023 [US3] Add scheduler runbook in `tenet-0/tenant-workflows/hermes-mitchel/runbooks/cadence-scheduler.md`
- [x] T024 [US3] Add scheduler validation and disabled-by-default notes to `tenet-0/tenant-workflows/hermes-mitchel/skills/cadence-digest/SKILL.md`
- [x] T025 [US3] Add a repo-controlled scheduler command or script stub only if needed by the runbook in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify production readiness and keep docs synchronized.

- [x] T026 Bump Trevor DB MCP server version in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T027 Run `npm test` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`
- [x] T028 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
- [x] T029 Run `$code-review-and-quality`
- [x] T030 Compare deployment expectations with `aegis-prod` using `$aegis-ssh`
- [x] T031 Update `.specify/roadmap-hermes-mitchel-prospecting.md` with Feature 6 local implementation status
- [ ] T032 Commit Feature 6 implementation and open PR

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks user stories.
- **US1**: MVP, starts after Foundation.
- **US2**: Adds reminder and stale-work depth after US1 result shape exists.
- **US3**: Adds scheduler runbook after on-demand digest behavior is defined.
- **Polish**: Depends on selected user stories being complete.

## Parallel Opportunities

- T002 and T003 can run in parallel.
- T007, T008, and T009 can run in parallel.
- T014, T015, and T016 can run in parallel.
- T021 and T022 can run in parallel.
- US2 and US3 implementation can proceed in parallel after US1 stabilizes, because scheduler docs should not mutate digest behavior.

## Implementation Strategy

1. Complete setup and foundational repository contracts.
2. Implement US1 on-demand digest with failing tests first.
3. Add US2 stale work and follow-up approval reminders.
4. Add US3 scheduler runbook with disabled-by-default posture.
5. Run quality gates and Aegis comparison before PR.
