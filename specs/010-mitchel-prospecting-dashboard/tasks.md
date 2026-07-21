# Tasks: Mitchel Prospecting Dashboard in OvernightDesk

**Input**: Design documents from `/specs/010-mitchel-prospecting-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Status**: The authenticated, read-only Mitchel prospecting workspace MVP
merged in PR #19 on 2026-06-25. The remaining open tasks are targeted render
and regression coverage, P3 process-status grouping, and conditional
documentation/validation follow-up; they are not an unshipped MVP or an active
worktree.

**Tests**: Include focused tests because this feature touches authenticated
tenant data, external/agent integration boundaries, and user-facing dashboard
behavior.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the feature workspace and preserve the stock Hermes
compatibility constraint before coding.

- [x] T001 Confirm current dashboard, chat, and instance resolver files in `src/app/(protected)/dashboard/page.tsx`, `src/app/(protected)/dashboard/chat/chat-interface.tsx`, `src/lib/instance.ts`, and `src/lib/resolve-instance.ts`
- [x] T002 [P] Confirm available platform test scripts in `package.json`
- [x] T003 [P] Confirm existing Trevor MCP contracts in `specs/008-prospect-sourcing-pipeline/contracts/mcp-tools.yaml` and `specs/009-internal-buyer-intake/contracts/mcp-tools.yaml`
- [x] T004 Record live Hermes/Aegis API assumptions in `specs/010-mitchel-prospecting-dashboard/research.md` if they drift before implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core contracts and boundaries that MUST be complete before any user
story implementation.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Add `isHermesMitchelTenant` beside existing `isHermesTenant` in `src/lib/instance.ts`
- [x] T006 [P] Define dashboard summary Zod schemas matching `specs/010-mitchel-prospecting-dashboard/contracts/dashboard-api.yaml` in `src/lib/mitchel-prospecting/schemas.ts`
- [x] T007 [P] Define dashboard summary TypeScript types in `src/lib/mitchel-prospecting/types.ts`
- [x] T008 Implement safe empty/unavailable summary builders in `src/lib/mitchel-prospecting/summary.ts`
- [x] T009 Implement a server-side Trevor summary client boundary in `src/lib/mitchel-prospecting/trevor-summary-client.ts` that uses the existing provisioner/container pattern from `src/lib/provisioner.ts` and does not use `TREVOR_DB_URL`
- [x] T010 Add focused unit tests for tenant gating and summary builders in `src/lib/mitchel-prospecting/__tests__/summary.test.ts`
- [x] T011 Add contract test for `/api/mitchel/prospecting/summary` response shape in `src/app/api/mitchel/prospecting/summary/__tests__/route.test.ts`

**Checkpoint**: Foundation ready. The project has an explicit tenant gate,
validated bounded response shape, and no direct platform Trevor DB credential
path.

---

## Phase 2A: Backend Boundary Refactor - Live Trevor Summary

**Goal**: Add the matching read-only summary boundary in `overnightdesk-engine`
so the platform can display live Trevor data without direct database credentials.

**Independent Test**: From `overnightdesk-engine`, call the new hermes
provisioner handler with a fake executor and confirm it authenticates, requires
`containerId`, returns bounded summary JSON, and does not execute write SQL.

- [x] T011A [P] Add `GET /mitchel/prospecting/summary` route registration in `/home/frosted639/src/overnightdesk-suite/overnightdesk-engine/internal/hermes/handlers.go`
- [x] T011B Add read-only Docker exec script or helper in `/home/frosted639/src/overnightdesk-suite/overnightdesk-engine/internal/hermes/handlers.go` or a new `/home/frosted639/src/overnightdesk-suite/overnightdesk-engine/internal/hermes/trevor_summary.go`
- [x] T011C [P] Add handler tests for auth, missing `containerId`, success JSON shape, and executor failure in `/home/frosted639/src/overnightdesk-suite/overnightdesk-engine/internal/hermes/handlers_test.go`
- [x] T011D Run focused `overnightdesk-engine` hermes tests from `/home/frosted639/src/overnightdesk-suite/overnightdesk-engine`
- [x] T011E Update deployment notes or runbook if the provisioner binary must be rebuilt for this feature

**Checkpoint**: Live data boundary exists outside the frontend, and the
frontend client can keep using the provisioner/container pattern.

---

## Phase 3: User Story 1 - Review Prospecting Work (Priority: P1) MVP

**Goal**: Mitchel can see Trevor prospecting queues from the authenticated
OvernightDesk dashboard, while other tenants cannot.

**Independent Test**: Sign in or simulate `hermes-mitchel` and confirm the
workspace shows prospects, staged candidates, call tasks, review-needed items,
and follow-up drafts; simulate another tenant and confirm the workspace is not
shown.

### Tests for User Story 1

- [x] T012 [P] [US1] Add route authorization tests for authenticated `hermes-mitchel`, authenticated non-Mitchel, and unauthenticated cases in `src/app/api/mitchel/prospecting/summary/__tests__/route.test.ts`
- [ ] T013 [P] [US1] Add dashboard rendering tests for Mitchel and non-Mitchel tenant states in `src/app/(protected)/dashboard/__tests__/mitchel-prospecting.test.tsx`

### Implementation for User Story 1

- [x] T014 [US1] Implement authenticated GET route in `src/app/api/mitchel/prospecting/summary/route.ts`
- [x] T015 [US1] Map Trevor candidate, prospect, call task, review item, and draft summaries through the read-only provisioner summary boundary and validate them in `src/lib/mitchel-prospecting/schemas.ts`
- [x] T016 [P] [US1] Create reusable queue section component in `src/components/dashboard/mitchel-prospecting/queue-section.tsx`
- [x] T017 [P] [US1] Create workspace shell component in `src/components/dashboard/mitchel-prospecting/workspace.tsx`
- [x] T018 [US1] Integrate Mitchel workspace into `src/app/(protected)/dashboard/page.tsx` behind `isHermesMitchelTenant`
- [x] T019 [US1] Add loading, empty, partial unavailable, and warning states in `src/components/dashboard/mitchel-prospecting/workspace.tsx`
- [x] T020 [US1] Verify no production platform code references `TREVOR_DB_URL` with `rg "TREVOR_DB_URL" src --glob '!**/__tests__/**'`

**Checkpoint**: User Story 1 is fully functional and independently testable as
the MVP.

---

## Phase 4: User Story 2 - Keep Trevor Conversation Available (Priority: P1)

**Goal**: Mitchel keeps existing Hermes/Trevor chat and full Hermes dashboard
access while using the new prospecting workspace.

**Independent Test**: Open the Mitchel workspace and confirm the chat entry point
and Hermes dashboard launch link remain available and behave as before.

### Tests for User Story 2

- [ ] T021 [P] [US2] Add regression test that the existing Overview page still embeds Hermes chat for `hermes-mitchel` in `src/app/(protected)/dashboard/__tests__/mitchel-prospecting.test.tsx`
- [ ] T022 [P] [US2] Add regression test that the existing Hermes dashboard launch link remains available on Overview in `src/app/(protected)/dashboard/__tests__/mitchel-prospecting.test.tsx`

### Implementation for User Story 2

- [x] T023 [US2] Preserve existing embedded chat rendering path while adding Mitchel workspace in `src/app/(protected)/dashboard/page.tsx`; do not create a separate Mitchel chat page
- [x] T024 [US2] Preserve existing Hermes dashboard launch link in `src/components/dashboard/mitchel-prospecting/workspace.tsx` or the existing dashboard page component
- [x] T025 [US2] Verify the workspace does not require direct browser CORS access to Hermes API server in `src/lib/mitchel-prospecting/trevor-summary-client.ts`

**Checkpoint**: User Stories 1 and 2 both work without regressing the existing
Hermes interaction path.

---

## Phase 5: User Story 3 - Review Before Action (Priority: P2)

**Goal**: Mitchel can identify records needing a human decision, and viewing the
workspace cannot send outreach or mutate prospect state.

**Independent Test**: Use staged candidates, do-not-contact records, and drafts
in fixtures; confirm review state is visible and no mutation or outbound action
occurs from page load.

### Tests for User Story 3

- [ ] T026 [P] [US3] Add tests for do-not-contact and duplicate/rejected candidate display in `src/lib/mitchel-prospecting/__tests__/summary.test.ts`
- [x] T027 [P] [US3] Add test that summary route returns `outboundSent=false` and performs no write action in `src/app/api/mitchel/prospecting/summary/__tests__/route.test.ts`

### Implementation for User Story 3

- [x] T028 [US3] Add review flag mapping for do-not-contact, missing contact data, duplicate, rejected, and needs-review records in the provisioner summary boundary
- [x] T029 [US3] Add review-needed presentation to `src/components/dashboard/mitchel-prospecting/workspace.tsx`
- [x] T030 [US3] Ensure draft summaries are displayed as pending review only in `src/components/dashboard/mitchel-prospecting/workspace.tsx`
- [x] T031 [US3] Add explicit no-outbound warning/result text where needed in `src/components/dashboard/mitchel-prospecting/workspace.tsx`

**Checkpoint**: Review states are visible and read-only behavior is verified.

---

## Phase 6: User Story 4 - Understand Process Progress (Priority: P3)

**Goal**: Mitchel can understand prospecting process progress using stock Hermes
surfaces when safe, or a simple Trevor-derived process grouping when Kanban is
not needed for the first release.

**Independent Test**: Confirm process groupings match Trevor records and that no
unauthenticated Hermes Kanban plugin route is exposed.

### Tests for User Story 4

- [ ] T032 [P] [US4] Add process grouping tests in `src/lib/mitchel-prospecting/__tests__/summary.test.ts`
- [ ] T033 [P] [US4] Add test that no `/api/plugins/kanban/*` route is exposed directly in `src/app/api/mitchel/prospecting/summary/__tests__/route.test.ts`

### Implementation for User Story 4

- [ ] T034 [US4] Add Trevor-derived process status grouping in `src/lib/mitchel-prospecting/summary.ts`
- [ ] T035 [US4] Add process status view to `src/components/dashboard/mitchel-prospecting/workspace.tsx`
- [ ] T036 [US4] Document whether Kanban is deferred or proxied through stock Hermes behavior in `specs/010-mitchel-prospecting-dashboard/research.md`

**Checkpoint**: Process visibility exists without making Kanban a second source
of truth.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, documentation, and production readiness.

- [x] T037 [P] Update `specs/010-mitchel-prospecting-dashboard/quickstart.md` with final local validation commands and observed behavior
- [x] T038 [P] Review `README.md`; no update was required because it does not document tenant-specific dashboard behavior
- [x] T039 Run `git diff --check`
- [x] T040 Run relevant platform tests and build from the repo root
- [x] T041 Confirm no `tenants/hermes-mitchel/mcp-servers/trevor-db` files changed in the Feature 10 platform PR, so Trevor MCP tests/build were not required
- [x] T042 Run `$code-review-and-quality` as the quality gate
- [x] T043 Validate assumptions against `aegis-prod` with `$aegis-ssh`, including Hermes API/Kanban availability and no direct route exposure
- [x] T044 Validate initial workspace render target and stock-Hermes compatibility notes in `specs/010-mitchel-prospecting-dashboard/quickstart.md`
- [x] T045 Stop before commit for user review unless explicitly told to commit

**T040 note**: Focused Feature 10 platform tests pass. `npm run build` with a
dummy `DATABASE_URL` compiles and type-checks, then fails during page-data
collection for the pre-existing `/api/engine/conversations/[id]/messages`
route.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational and is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and can be developed alongside US1 where file conflicts allow.
- **User Story 3 (Phase 5)**: Depends on Foundational and benefits from US1 summary structure.
- **User Story 4 (Phase 6)**: Depends on US1 summary structure and live Kanban decision.
- **Polish (Phase 7)**: Depends on all desired user stories for this release.

### User Story Dependencies

- **User Story 1 (P1)**: MVP, no dependency on other stories after foundation.
- **User Story 2 (P1)**: No functional dependency on US1, but both touch dashboard integration.
- **User Story 3 (P2)**: Builds on US1 summary mapping.
- **User Story 4 (P3)**: Builds on US1 summary mapping and research decision.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001.
- T006 and T007 can run in parallel after T005.
- T012 and T013 can run in parallel once foundational schemas exist.
- T016 and T017 can run in parallel after the component path is created.
- US2 regression tests T021 and T022 can run in parallel.
- US3 tests T026 and T027 can run in parallel.
- US4 tests T032 and T033 can run in parallel.
- Documentation tasks T037 and T038 can run in parallel after implementation.

---

## Parallel Example: User Story 1

```text
Task: "Add route authorization tests for authenticated hermes-mitchel, authenticated non-Mitchel, and unauthenticated cases in src/app/api/mitchel/prospecting/summary/__tests__/route.test.ts"
Task: "Add dashboard rendering tests for Mitchel and non-Mitchel tenant states in src/app/(protected)/dashboard/__tests__/mitchel-prospecting.test.tsx"
Task: "Create reusable queue section component in src/components/dashboard/mitchel-prospecting/queue-section.tsx"
Task: "Create workspace shell component in src/components/dashboard/mitchel-prospecting/workspace.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Implement US1 route, mapping, and dashboard workspace.
3. Validate tenant gating, bounded summary rendering, empty/unavailable states,
   and absence of `TREVOR_DB_URL`.
4. Stop and review before adding write actions or Kanban.

### Incremental Delivery

1. Add US1 for the core Mitchel workspace.
2. Add US2 to preserve and regression-test Hermes chat/dashboard access.
3. Add US3 review safety surfaces.
4. Add US4 process grouping only after deciding whether stock Hermes Kanban is
   needed and safely proxied.

### Stock Hermes Rule

Use documented Hermes Agent features first. Put Mitchel-specific behavior in
OvernightDesk or tenant-local Trevor contracts rather than patching Hermes
internals. Any custom Hermes change requires a separate decision record and
upgrade-impact review.
