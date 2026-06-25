# Tasks: Pre-Call Brief

**Input**: Design documents from `specs/003-pre-call-brief/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.yaml, quickstart.md

**Tests**: Required because lookup, DNC warnings, ambiguity handling, contract shape, and no-side-effect behavior are business-critical.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this serves
- Include exact file paths in descriptions

## Phase 1: Setup

- [x] T001 Create `specs/003-pre-call-brief/` Spec Kit artifacts
- [x] T002 Update `.specify/feature.json` and `AGENTS.md` for Feature 003
- [x] T003 Create `tenants/hermes-mitchel/skills/pre-call-brief/SKILL.md`

## Phase 2: Foundational

- [x] T004 Extend `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts` with brief request/result types
- [x] T005 Extend `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts` with read-only brief lookup methods
- [x] T006 Create `tenants/hermes-mitchel/mcp-servers/trevor-db/src/brief.ts` for brief shaping and MCP mapping
- [x] T007 Extend `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/fixtures.ts` and `tests/test-repo.ts` with brief data

## Phase 3: User Story 1 - Brief A Queue Task (Priority: P1)

**Goal**: Mitchel can request a brief from a call task.

**Independent Test**: Generate a brief by task ID and verify prospect/task context, ask, opener, fallback, and no side effects.

- [x] T008 [P] [US1] Add task-based brief tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/brief-task.test.ts`
- [x] T009 [US1] Implement task ID lookup and DNC warnings in `src/brief.ts` and `src/db.ts`
- [x] T010 [US1] Register `generate_pre_call_brief` in `src/index.ts`

## Phase 4: User Story 2 - Brief A Prospect Directly (Priority: P2)

**Goal**: Mitchel can request a brief by prospect ID or bounded query.

**Independent Test**: Generate a brief by prospect ID, then verify ambiguous query returns candidates instead of guessing.

- [x] T011 [P] [US2] Add prospect/query tests in `tests/brief-lookup.test.ts`
- [x] T012 [US2] Implement prospect ID and query lookup in `src/brief.ts` and `src/db.ts`

## Phase 5: User Story 3 - Explain Missing Context (Priority: P3)

**Goal**: Briefs distinguish known facts from missing Agiled, interaction, phone, preferred channel, and inventory context.

**Independent Test**: Generate briefs with missing context and verify warnings/missing-context fields.

- [x] T013 [P] [US3] Add missing-context and contract tests in `tests/brief-context.test.ts`
- [x] T014 [US3] Implement missing-context, inventory caveat, and snake_case MCP mapping in `src/brief.ts`

## Final Phase: Polish & Cross-Cutting

- [x] T015 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
- [x] T016 Run `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T017 Run `npm audit --json` in `tenants/hermes-mitchel/mcp-servers/trevor-db`
- [x] T018 Run `$code-review-and-quality`
- [x] T019 Run read-only `$aegis-ssh` comparison against `aegis-prod`
- [x] T020 Commit local work without deploying production changes

## Dependencies & Execution Order

- Setup and foundational tasks block all stories.
- US1 is MVP and should land before direct query lookup.
- US2 depends on shared brief shaping from US1.
- US3 can be validated after any selected-brief path exists.

## Implementation Strategy

1. Implement a read-only task-based brief first.
2. Add direct prospect and query lookup.
3. Add missing-context and contract verification.
4. Verify locally and compare with Aegis production without deploying.
