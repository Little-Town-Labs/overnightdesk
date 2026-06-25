# Tasks: Prospect Sourcing Pipeline

**Input**: Design documents from `/specs/008-prospect-sourcing-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature ingests untrusted web data, mutates prospect
records, and touches external-service credentials, so implementation must be
test-first.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture live workflow context and establish safe source-controlled
docs without copying secrets.

- [x] T001 Add sanitized BrowserAct discovery skill docs in `tenants/hermes-mitchel/skills/web/browseract/SKILL.md`
- [x] T002 Add sanitized CamoFox enrichment skill docs in `tenants/hermes-mitchel/skills/web/camofox-browser/SKILL.md`
- [x] T003 Add prospect sourcing workflow skill in `tenants/hermes-mitchel/skills/prospect-sourcing/SKILL.md`
- [x] T004 Add operator runbook in `tenants/hermes-mitchel/runbooks/prospect-sourcing.md`
- [x] T005 Update `.specify/roadmap-hermes-mitchel-prospecting.md` to add Feature 8 and move inventory matching below prospect sourcing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add durable candidate staging and contracts before story behavior.

- [x] T006 Create migration `tenet-0/db/migrations/053_trevor_prospect_sourcing.sql` for sourcing runs and prospect candidates
- [x] T007 [P] Add sourcing types in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T008 [P] Add candidate fixtures in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts`
- [x] T009 Extend fake repository candidate storage in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/test-repo.ts`
- [x] T010 Add repository interfaces for sourcing runs and candidates in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Source Prospect Candidates (Priority: P1) MVP

**Goal**: Stage candidate businesses from a bounded sourcing run without
creating active prospects or call tasks.

**Independent Test**: Stage sample scraped candidates and verify source
attribution, chain filtering, bounded notes, and no prospect/task writes.

### Tests for User Story 1

- [x] T011 [P] [US1] Add failing candidate staging tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/sourcing-candidates.test.ts`
- [x] T012 [P] [US1] Add failing untrusted-input and secret-redaction tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/sourcing-safety.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement candidate normalization and scoring in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/sourcing.ts`
- [x] T014 [US1] Implement `stageProspectCandidates` repository method in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`
- [x] T015 [US1] Register `stage_prospect_candidates` MCP tool in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T016 [US1] Document BrowserAct-first, CamoFox-enrichment staging workflow in `tenants/hermes-mitchel/skills/prospect-sourcing/SKILL.md`

**Checkpoint**: Candidate staging is independently functional and no-write to active prospect tables.

---

## Phase 4: User Story 2 - Review and Approve Candidates (Priority: P2)

**Goal**: Return a bounded review queue with duplicate, rejected, and
recommended candidates clearly separated.

**Independent Test**: Review seeded candidates with duplicates and chain stores
and verify status/counts without promotion.

### Tests for User Story 2

- [x] T017 [P] [US2] Add failing candidate review tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/sourcing-review.test.ts`
- [x] T018 [P] [US2] Add failing Trevor duplicate detection tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/sourcing-safety.test.ts`

### Implementation for User Story 2

- [x] T019 [US2] Implement duplicate and chain-store classification in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/sourcing.ts`
- [x] T020 [US2] Implement `reviewProspectCandidates` repository method in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`
- [x] T021 [US2] Register `review_prospect_candidates` MCP tool in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T022 [US2] Update quickstart review scenario in `specs/008-prospect-sourcing-pipeline/quickstart.md`

**Checkpoint**: Review queue works independently and creates no prospects/tasks.

---

## Phase 5: User Story 3 - Promote Approved Prospects Into Cadence (Priority: P3)

**Goal**: Promote explicitly approved candidates to Trevor prospects and queue
initial outreach idempotently.

**Independent Test**: Approve a candidate and verify one prospect, non-empty
lead source, optional single call task, and no outbound send.

### Tests for User Story 3

- [x] T023 [P] [US3] Add failing promotion tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/sourcing-promote.test.ts`
- [x] T024 [P] [US3] Add failing duplicate promotion and DNC safety tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/sourcing-safety.test.ts`

### Implementation for User Story 3

- [x] T025 [US3] Implement `promoteProspectCandidate` logic in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/sourcing.ts`
- [x] T026 [US3] Implement promotion and call-task repository writes in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts`
- [x] T027 [US3] Register `promote_prospect_candidate` MCP tool in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/index.ts`
- [x] T028 [US3] Update prospect sourcing skill promotion instructions in `tenants/hermes-mitchel/skills/prospect-sourcing/SKILL.md`

**Checkpoint**: Approved candidates can enter the existing call queue safely.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify safety, docs, production assumptions, and deploy readiness.

- [x] T029 [P] Update `specs/008-prospect-sourcing-pipeline/contracts/mcp-tools.yaml` with final tool schemas
- [x] T030 [P] Update `specs/008-prospect-sourcing-pipeline/data-model.md` with final schema details
- [x] T031 Run `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T032 Run `npm run build` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T033 Run `npm audit --json` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T034 Run repository secret scan checks for BrowserAct/CamoFox/API-key patterns
- [x] T035 Validate assumptions against aegis-prod with `aegis-ssh` before commit
- [x] T036 Update `.specify/roadmap-hermes-mitchel-prospecting.md` with Feature 8 implementation status

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks stories.
- **US1 (Phase 3)**: Depends on Foundational.
- **US2 (Phase 4)**: Depends on US1 staged candidates.
- **US3 (Phase 5)**: Depends on US2 review status.
- **Polish (Phase 6)**: Depends on implemented stories.

### User Story Dependencies

- **User Story 1 (P1)**: MVP, can ship source-controlled docs plus staging.
- **User Story 2 (P2)**: Requires staged candidates to review.
- **User Story 3 (P3)**: Requires review and approval states.

### Parallel Opportunities

- T001-T004 can proceed in parallel once directories exist.
- T007 and T008 can run in parallel.
- Tests within each story can be written in parallel.
- Documentation polish tasks T029-T030 can run in parallel after behavior lands.

## Implementation Strategy

### MVP First

1. Complete setup and foundational migration/types.
2. Implement US1 staging only.
3. Validate no active prospect or call-task writes occur.
4. Deploy/demo staging before enabling promotion if risk is high.

### Incremental Delivery

1. US1: stage sourced candidates.
2. US2: review and dedupe candidates.
3. US3: promote approved candidates into Trevor and daily call queue.
4. Keep BrowserAct/CamoFox execution itself human/operator initiated until the
   staging and review tools are stable.
