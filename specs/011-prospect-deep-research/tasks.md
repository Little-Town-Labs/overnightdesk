# Tasks: Prospect Deep Research

**Input**: Design documents from `/specs/011-prospect-deep-research/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. Use TDD for repository/tool behavior and migration-adjacent constraints.

## Phase 1: Setup

- [x] T001 Update `.specify/feature.json` and `AGENTS.md` to point at `specs/011-prospect-deep-research/plan.md`
- [x] T002 Update `.specify/roadmap-hermes-mitchel-prospecting.md` with Feature 12 Prospect Deep Research scope and restart point

## Phase 2: Foundational

- [x] T003 Create additive migration `tenet-0/db/migrations/055_trevor_prospect_deep_research.sql`
- [x] T004 [P] Add prospect research TypeScript types in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/types.ts`
- [x] T005 [P] Add tests for storing/listing prospect research evidence in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/prospect-research.test.ts`
- [x] T006 Implement repository methods in `tenants/hermes-mitchel/mcp-servers/trevor-db/src/db.ts` and fake repository support in `tests/test-repo.ts`

## Phase 3: User Story 1 - Store Reviewable Public Evidence (P1)

**Goal**: Store public evidence linked to one prospect without mutating prospect email.

**Independent Test**: Store an official contact-page finding for one prospect and list it back with `pending_review`, provenance, and `outbound_sent=false`.

- [x] T007 [US1] Add `prospect-research.ts` service functions for validation, RDAP restrictions, and MCP mapping
- [x] T008 [US1] Register `store_prospect_research_evidence` and `list_prospect_research_evidence` in `src/index.ts`
- [x] T009 [US1] Verify `npm test` passes in `tenants/hermes-mitchel/mcp-servers/trevor-db`

## Phase 4: User Story 2 - Prioritize Missing-Email Research (P2)

**Goal**: Claim research candidates with missing-email prospects first.

**Independent Test**: Seed mixed prospects and verify claim order.

- [x] T010 [US2] Add prioritized claim data contract and tests in `tests/prospect-research.test.ts`
- [x] T011 [US2] Implement bounded claim method and MCP mapping

## Phase 5: User Story 3 - Review and Promote High-Confidence Findings (P3)

**Goal**: Review evidence and make approved high-confidence findings promotable.

**Independent Test**: Approve official evidence, reject RDAP email-like evidence, and verify only approved official evidence is promotable.

- [x] T012 [US3] Add review state tests and service contract
- [x] T013 [US3] Implement evidence review tool and promotion eligibility output
- [x] T014 [US3] Document controlled promotion into email enrichment/prospect notes

## Phase 6: Polish & Rollout

- [x] T015 Add `tenants/hermes-mitchel/runbooks/prospect-deep-research.md`
- [x] T016 Run full Trevor MCP tests and `git diff --check`
- [x] T017 Perform Aegis read-only preflight before production migration/deploy
- [x] T018 Deploy with schema backup, MCP smoke, no-email-write smoke, and deploy log entry

## Phase 7: Weekly Scheduler

**Goal**: Define and validate weekly Saturday-night jobs for missing-email enrichment and deep research without enabling production automation by default.

**Independent Test**: Validate the scheduler template and runbook include disabled defaults, Saturday 23:00 America/Chicago timing, approval gate, validation, disable, and rollback instructions.

- [x] T019 [US4] Add scheduler requirements to spec, plan, research, data model, quickstart, and contracts
- [x] T020 [US4] Add disabled scheduler template at `tenants/hermes-mitchel/schedules/prospect-weekly-research-jobs.json`
- [x] T021 [US4] Add scheduler artifact tests in `tenants/hermes-mitchel/mcp-servers/trevor-db/tests/prospect-research-scheduler.test.ts`
- [x] T022 [US4] Update prospect deep research runbook with weekly scheduler validation, enable, disable, rollback, owner, log location, and side-effect checks
- [ ] T023 [US4] Verify live Hermes scheduler supports timezone-aware weekly jobs before production installation
- [ ] T024 [US4] Install and enable weekly jobs only after migration 055, MCP deploy, smoke tests, and explicit operator approval

## Dependencies & Execution Order

- T001-T002 set durable restart surfaces.
- T003-T006 are foundational and block all user stories.
- US1 is the MVP and can deploy independently after T009.
- US2 depends on evidence types and repository foundation.
- US3 depends on evidence storage and listing.
- US4 can define disabled scheduler artifacts now, but production activation depends on US2/deep research runner completion, migration 055, MCP deploy, live scheduler validation, and explicit operator approval.

## Implementation Strategy

Start with T001-T009 only. Do not build web search automation until evidence storage and review contracts are proven. Keep the scheduler template disabled until the required job tools and live scheduler semantics are verified.
