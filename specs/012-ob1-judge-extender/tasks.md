# Tasks: OB1 Judge Extender

**Input**: Design documents from `specs/012-ob1-judge-extender/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/mcp-tools.md`, `quickstart.md`

**Tests**: Required. This feature changes safety-critical contracts and must be test-first for each story slice.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare contracts and test scaffolding without changing runtime behavior.

- [x] T001 Create shared judge contract model module in `ob1-mcp/src/judge_contracts.py`
- [x] T002 [P] Create contract unit test file in `ob1-mcp/tests/test_judge_contracts.py`
- [x] T003 [P] Add representative valid/invalid fixture builders in `ob1-mcp/tests/test_judge_contracts.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define validation and unsafe-payload rules required by all user stories.

- [x] T004 Implement enum constants and validation helpers for risk class, tool kind, source kind, authorization kind, persistence, decision, confidence, judge kind, check status, provenance status, memory use policy, review action, and visibility in `ob1-mcp/src/judge_contracts.py`
- [x] T005 Add tests for invalid enum rejection and missing required identity fields in `ob1-mcp/tests/test_judge_contracts.py`
- [x] T006 Implement unsafe payload detection for raw transcript, model reasoning trace, full arguments without controlled ref, and secret-like fields in `ob1-mcp/src/judge_contracts.py`
- [x] T007 Add unsafe payload rejection tests in `ob1-mcp/tests/test_judge_contracts.py`

**Checkpoint**: Contract validation helpers are covered and no MCP behavior has changed yet.

---

## Phase 3: User Story 1 - Recall Before Risky Actions (Priority: P1) MVP

**Goal**: A runtime can ask OB1 for governed recall before a judge decision.

**Independent Test**: Seed fake store rows, call `judge_recall`, and verify only allowed memories are returned with provenance, use policy, freshness, scope, and warnings.

### Tests for User Story 1

- [x] T008 [P] [US1] Add `judge_recall` MCP tool tests in `ob1-mcp/tests/test_server_tools.py`
- [x] T009 [P] [US1] Add recall contract validation tests in `ob1-mcp/tests/test_judge_contracts.py`

### Implementation for User Story 1

- [x] T010 [US1] Implement recall request/response validation models in `ob1-mcp/src/judge_contracts.py`
- [x] T011 [US1] Add store recall helper or reuse `Store.search` with governed defaults in `ob1-mcp/src/db.py`
- [x] T012 [US1] Add `judge_recall` MCP tool to `ob1-mcp/src/server.py`
- [x] T013 [US1] Ensure `judge_recall` defaults to `can_use_as_instruction`, excludes inactive/superseded records, and returns warnings in `ob1-mcp/src/server.py`

**Checkpoint**: `judge_recall` works independently and existing memory tools still pass.

---

## Phase 4: User Story 2 - Validate Proposals and Decisions (Priority: P1)

**Goal**: Existing proposal and decision tools enforce the V1 contract before storage.

**Independent Test**: Valid proposal/decision payloads store idempotently; malformed or unsafe payloads are rejected before fake store insertion.

### Tests for User Story 2

- [x] T014 [P] [US2] Add valid action proposal validation tests in `ob1-mcp/tests/test_judge_contracts.py`
- [x] T015 [P] [US2] Add invalid action proposal rejection tests in `ob1-mcp/tests/test_judge_contracts.py`
- [x] T016 [P] [US2] Add valid judge decision validation tests in `ob1-mcp/tests/test_judge_contracts.py`
- [x] T017 [P] [US2] Add invalid judge decision rejection tests in `ob1-mcp/tests/test_judge_contracts.py`
- [x] T018 [US2] Add MCP boundary rejection tests for `save_action_proposal` and `record_judge_decision` in `ob1-mcp/tests/test_server_tools.py`

### Implementation for User Story 2

- [x] T019 [US2] Implement action proposal validation model in `ob1-mcp/src/judge_contracts.py`
- [x] T020 [US2] Implement judge decision validation model in `ob1-mcp/src/judge_contracts.py`
- [x] T021 [US2] Call proposal validation before `store.insert_action_proposal` in `ob1-mcp/src/server.py`
- [x] T022 [US2] Call decision validation before `store.insert_judge_decision` in `ob1-mcp/src/server.py`
- [x] T023 [US2] Tighten `_proposal_fields` and `_decision_fields` enum assumptions only where needed in `ob1-mcp/src/db.py`

**Checkpoint**: P1 MVP complete: recall plus validated proposal/decision write-back.

---

## Phase 5: User Story 3 - Review Future-Facing Lessons (Priority: P2)

**Goal**: Generated or inferred future-facing memory candidates require review before instruction use.

**Independent Test**: A decision containing `memory_to_write` creates pending candidates; review actions update state and only confirm creates instruction-grade memory.

### Tests for User Story 3

- [x] T024 [P] [US3] Create review queue tests in `ob1-mcp/tests/test_judge_review_queue.py`
- [x] T025 [P] [US3] Add migration shape assertions or SQL smoke checks for review tables in `ob1-mcp/tests/test_judge_review_queue.py`

### Implementation for User Story 3

- [x] T026 [US3] Add migration `ob1-mcp/migrations/003_judge_extender_review.sql` with `review_candidates` and `review_actions`
- [x] T027 [US3] Add review candidate/action store methods in `ob1-mcp/src/db.py`
- [x] T028 [US3] Materialize review candidates from `record_judge_decision` when `memory_to_write` contains future-facing entries in `ob1-mcp/src/server.py`
- [x] T029 [US3] Add `list_review_queue` MCP tool in `ob1-mcp/src/server.py`
- [x] T030 [US3] Add `review_memory_candidate` MCP tool in `ob1-mcp/src/server.py`
- [x] T031 [US3] Ensure confirm review action uses guarded memory write semantics and non-confirm actions never create instruction-grade memory in `ob1-mcp/src/server.py`

**Checkpoint**: Review gating prevents generated lessons from becoming hidden instructions.

---

## Phase 6: User Story 4 - Inspect Memory and Decisions (Priority: P2)

**Goal**: Operators can explain memory origin, trust, usage, and future influence.

**Independent Test**: `inspect_memory` returns source, provenance, use policy, review state, decision usage, supersession, warnings, and automatic-injection eligibility.

### Tests for User Story 4

- [ ] T032 [P] [US4] Create inspector tests in `ob1-mcp/tests/test_memory_inspector.py`

### Implementation for User Story 4

- [ ] T033 [US4] Add store methods for memory usage by decisions and review links in `ob1-mcp/src/db.py`
- [ ] T034 [US4] Add inspector payload builder in `ob1-mcp/src/server.py`
- [ ] T035 [US4] Add `inspect_memory` MCP tool in `ob1-mcp/src/server.py`
- [ ] T036 [US4] Mark inactive, superseded, disputed, stale, restricted, and non-instruction-grade memories as ineligible for automatic injection in `ob1-mcp/src/server.py`

**Checkpoint**: Operators can inspect memory trust without reading raw tables.

---

## Phase 7: User Story 5 - Prove Runtime Portability (Priority: P3)

**Goal**: Local fixtures prove the contract for Code Review Memory and TaskFlow Work Log without production adapters.

**Independent Test**: Harness tests run recall, proposal, decision, write-back, and review candidate creation for both scenarios.

### Tests for User Story 5

- [ ] T037 [P] [US5] Create Code Review Memory harness fixture in `ob1-mcp/tests/test_judge_harnesses.py`
- [ ] T038 [P] [US5] Create TaskFlow Work Log harness fixture in `ob1-mcp/tests/test_judge_harnesses.py`

### Implementation for User Story 5

- [ ] T039 [US5] Add reusable harness helpers for recall/proposal/decision flow in `ob1-mcp/tests/test_judge_harnesses.py`
- [ ] T040 [US5] Assert harnesses cover allow, block, revise, and escalate outcomes in `ob1-mcp/tests/test_judge_harnesses.py`

**Checkpoint**: Contract is proven portable without hard-coding one runtime.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and full verification.

- [ ] T041 Update `ob1-mcp/README.md` with final new MCP tools, review queue behavior, inspector behavior, and quickstart commands
- [ ] T042 Update `docs/ob1-judge-extender-process.md` if implementation decisions differ from the seed process
- [x] T043 Run `ob1-mcp/.venv/bin/pytest -q ob1-mcp/tests`
- [x] T044 Run `python3 -m py_compile ob1-mcp/src/*.py`
- [ ] T045 Review `specs/012-ob1-judge-extender/quickstart.md` against final commands

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on setup; blocks all stories.
- **US1 Recall (Phase 3)**: Depends on foundational validation.
- **US2 Proposal/Decision Validation (Phase 4)**: Depends on foundational validation and can run after or alongside US1 after shared models are stable.
- **US3 Review Queue (Phase 5)**: Depends on US2 decision validation.
- **US4 Inspector (Phase 6)**: Depends on US3 for review links and on existing memory/decision records.
- **US5 Harnesses (Phase 7)**: Depends on US1, US2, and enough of US3 to create review candidates.
- **Polish (Phase 8)**: Depends on selected implementation phases.

### User Story Dependencies

- **US1**: No dependency beyond foundational validation.
- **US2**: No dependency beyond foundational validation.
- **US3**: Requires decision validation from US2.
- **US4**: Requires review queue and decision usage data.
- **US5**: Requires US1 and US2; full harness value requires US3.

### Parallel Opportunities

- T002 and T003 can run in parallel after T001.
- T008 and T009 can run in parallel.
- T014 through T017 can run in parallel.
- T024 and T025 can run in parallel.
- T037 and T038 can run in parallel.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 and US2 only.
3. Verify with targeted tests plus existing `test_server_tools.py`.
4. Stop and review before review queue/inspector storage.

### Incremental Delivery

- Keep each phase independently testable.
- Do not deploy review queue behavior until contract validation and recall are stable.
- Do not add production runtime adapters until local harnesses prove the contract.
