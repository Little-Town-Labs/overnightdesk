# Tasks: Internal Buyer Intake

**Input**: Design documents from `/specs/009-internal-buyer-intake/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required for this feature because the Spec Kit artifacts and project
guidance require TDD for behavior, data rules, and integrations.

**Organization**: Tasks are grouped by user story so each story can be
implemented and tested as an independent increment.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing Trevor MCP server shape and create the new
feature module/doc surfaces.

- [x] T001 Inspect the current Trevor MCP package scripts in `tenants/hermes-mitchel/mcp-servers/trevor-db/package.json`
- [x] T002 [P] Create the internal intake module shell in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T003 [P] Create the internal intake skill directory in `tenants/hermes-mitchel/skills/internal-buyer-intake/SKILL.md`
- [x] T004 [P] Create the internal intake runbook in `tenants/hermes-mitchel/runbooks/internal-buyer-intake.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts, validation, repository methods, and safety
helpers required before any user story can write data.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Add BuyerIntake input/result, dedupe, Agiled sync, and next-action types in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T006 Add repository interface methods for buyer intake create/update, dedupe lookup, interaction write, and optional next-action writes in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T007 Add shared bounds/redaction helpers for intake notes and warnings in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/safety.ts`
- [x] T008 [P] Extend the fake repository with intake prospect, interaction, call task, draft, and Agiled-status fixtures in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/test-repo.ts`
- [x] T009 Inspect live migration history and only add `tenet-0/db/migrations/054_trevor_internal_intake.sql` if existing `trevor.prospects`, `trevor.interactions`, `trevor.call_tasks`, and `trevor.followup_drafts` cannot store the required fields

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Capture a Conversation Into Trevor (Priority: P1) MVP

**Goal**: Mitchel can give Trevor a new buyer conversation and get one durable
Trevor prospect plus one bounded interaction with preserved source attribution
and no outbound side effects.

**Independent Test**: Provide a new buyer name/company, phone or email, source,
conversation notes, and next action. Verify one reviewable prospect record, one
bounded conversation record, preserved source, and `outbound_sent=false`.

### Tests for User Story 1

- [x] T010 [P] [US1] Add new-buyer capture test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-create.test.ts`
- [x] T011 [P] [US1] Add missing-required-fields validation test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-create.test.ts`
- [x] T012 [P] [US1] Add note bounding and secret-redaction test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-safety.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement BuyerIntake input normalization, required-field validation, and bounded summary creation in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T014 [US1] Implement new prospect and bounded interaction persistence in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`
- [x] T015 [US1] Implement `captureBuyerIntake` success, needs-input, validation-only, and rejected results in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T016 [US1] Register the `capture_buyer_intake` MCP tool with zod input validation and snake_case output mapping in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`

**Checkpoint**: User Story 1 should be fully functional and independently
testable.

---

## Phase 4: User Story 2 - Update an Existing Buyer Without Duplicates (Priority: P1)

**Goal**: Clear phone/email matches update existing Trevor records while
ambiguous matches return review candidates without uncertain writes.

**Independent Test**: Provide an intake whose phone or email matches an existing
buyer. Verify Trevor updates that record, writes a conversation, and reports the
dedupe decision.

### Tests for User Story 2

- [x] T017 [P] [US2] Add exact phone/email dedupe update test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-dedupe.test.ts`
- [x] T018 [P] [US2] Add ambiguous name/company needs-review test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-dedupe.test.ts`
- [x] T019 [P] [US2] Add Agiled linked, skipped, and failed status tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-agiled.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Implement conservative Trevor dedupe by prospect ID, phone, email, and bounded name/company search in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T021 [US2] Implement database dedupe lookup and safe non-empty prospect updates in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`
- [x] T022 [US2] Implement ambiguous-match `needs_review` output with at most 5 bounded matches in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T023 [US2] Implement Agiled sync reporting as linked, skipped, not_attempted, or failed without rolling back local Trevor writes in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`

**Checkpoint**: User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - Capture Next Actions Without Sending Anything (Priority: P2)

**Goal**: Intake can create or reuse internal call tasks and draft follow-up
work while preserving the no-send boundary and do-not-contact suppression.

**Independent Test**: Provide an intake with `create_call_task=true` and another
with `create_follow_up_draft=true`. Verify internal work is created or reused,
do-not-contact buyers are suppressed, and `outbound_sent=false`.

### Tests for User Story 3

- [x] T024 [P] [US3] Add call task create/reuse test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-next-actions.test.ts`
- [x] T025 [P] [US3] Add follow-up draft creation test with no outbound send in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-next-actions.test.ts`
- [x] T026 [P] [US3] Add do-not-contact suppression test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-next-actions.test.ts`

### Implementation for User Story 3

- [x] T027 [US3] Implement valid next-action date handling and call task create/reuse behavior in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T028 [US3] Implement follow-up draft creation from intake interaction when enough channel/context exists in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T029 [US3] Enforce do-not-contact suppression for call tasks and persuasive drafts in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/intake.ts`
- [x] T030 [US3] Implement repository helpers for intake-created next actions in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`

**Checkpoint**: Intake can create only reviewable local work and never sends.

---

## Phase 6: User Story 4 - Reuse the Intake Contract Later for Website Leads (Priority: P3)

**Goal**: The same contract can accept a future `mitchelbrown.com` inquiry
without a separate lead pipeline or weakened dedupe/no-send guarantees.

**Independent Test**: Validate the contract accepts `mitchelbrown.com` source,
website-friendly identity/contact fields, rejected/needs-review outcomes, and
no automatic promotion or outbound sending.

### Tests for User Story 4

- [x] T031 [P] [US4] Add website-source contract test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-contract.test.ts`
- [x] T032 [P] [US4] Add website incomplete-contact rejected or needs-review test in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/intake-contract.test.ts`

### Implementation for User Story 4

- [x] T033 [US4] Ensure `mitchelbrown.com` source and website/referral fields flow through zod input, intake types, and result output in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T034 [US4] Update `specs/009-internal-buyer-intake/contracts/mcp-tools.yaml` if implementation narrows or clarifies the public-form-compatible contract

**Checkpoint**: Feature 10 can reuse the contract without creating a new lead
model.

---

## Phase 7: Documentation, Quality Gate, and Production Reality Check

**Purpose**: Keep operator docs, tenant skills, Spec Kit artifacts, and
production assumptions aligned before commit.

- [x] T035 [P] Document the Trevor operator flow and no-outbound boundary in `tenants/hermes-mitchel/skills/internal-buyer-intake/SKILL.md`
- [x] T036 [P] Document local validation, Aegis preflight, smoke checks, and rollback in `tenants/hermes-mitchel/runbooks/internal-buyer-intake.md`
- [x] T037 [P] Update Mitchel roadmap status and next-step notes in `.specify/roadmap-hermes-mitchel-prospecting.md`
- [x] T038 Run `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T039 Run `npm run build` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T040 Run `npm audit --json` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T041 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from the repo root
- [x] T042 Run `git diff --check` from the repo root
- [x] T043 Run the `code-review-and-quality` skill against the full local diff
- [x] T044 Use the `aegis-ssh` skill for read-only production validation of `hermes-mitchel`, `tenet0-postgres`, Trevor schema/table availability, and current counts before any deployment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on setup completion and blocks all user stories.
- **User Stories (Phase 3+)**: Depend on foundational tasks.
- **Documentation/Quality (Phase 7)**: Depends on implemented stories selected for the PR.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; no dependency on other stories.
- **User Story 2 (P1)**: Starts after Phase 2; shares persistence created for US1 but remains independently testable through dedupe cases.
- **User Story 3 (P2)**: Starts after US1 writes interactions because next actions attach to resolved prospects/interactions.
- **User Story 4 (P3)**: Starts after US1/US2 contract and dedupe behavior exist.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001.
- T008 can run in parallel with T005-T007.
- Tests within each user story are parallelizable before implementation.
- Documentation tasks T035-T037 can run in parallel after the implementation behavior is stable.

---

## Parallel Example: User Story 1

```bash
# Write the failing US1 tests together:
Task: "T010 Add new-buyer capture test in tests/intake-create.test.ts"
Task: "T011 Add missing-required-fields validation test in tests/intake-create.test.ts"
Task: "T012 Add note bounding and secret-redaction test in tests/intake-safety.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational contracts, safety helpers, and fake repo support.
3. Complete Phase 3 User Story 1.
4. Validate with the US1 tests plus `npm test` before adding dedupe or next-action behavior.

### Incremental Delivery

1. Add US2 dedupe and Agiled reporting after US1 can create/update records.
2. Add US3 next-action creation only after conversation interaction IDs are reliable.
3. Add US4 website-compatible contract tests after internal behavior is stable.
4. Run the full quality gate and Aegis production reality check before commit.
