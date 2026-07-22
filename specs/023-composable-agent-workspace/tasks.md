# Tasks: Composable Agent Workspace

**Input**: Design documents from `/specs/023-composable-agent-workspace/`

**Tests**: Required by the constitution and feature specification. Execute RED
before GREEN for every behavior change.

## Phase 1: Setup and contract baseline

- [x] T001 Create and validate Feature 023 specification, requirement checklist, research, data model, contracts, quickstart, and implementation plan in `specs/023-composable-agent-workspace/`
- [x] T002 Update the active feature pointer and agent context in `.specify/feature.json` and `AGENTS.md`
- [x] T003 Record the existing capability, selected-agent, chat workspace, native-dashboard, test, and production-boundary inventory in `specs/023-composable-agent-workspace/plan.md`

---

## Phase 2: Foundational composition contract

**Goal**: One pure fail-closed model represents chat-only, dashboard-only,
both, and neither without inspecting agent names.

- [x] T004 Add RED tests for exact capability IDs, duplicate/unknown descriptors, chat assignment mismatch, safe dashboard URLs, unavailable actions, and Titus/Walter/one-agent fixtures in `src/lib/__tests__/agent-workspace.test.ts`
- [x] T005 Implement the discriminated shared composition builder in `src/lib/agent-workspace.ts`
- [x] T006 Run focused contract tests and mark T004-T005 complete in `specs/023-composable-agent-workspace/tasks.md`

**Checkpoint**: Presentation can consume one safe composition with no agent-specific policy.

---

## Phase 3: User Story 1 - Use chat and dashboard together (Priority: P1)

**Goal**: Keep the selected chat page active while the same workspace launches
the exact native dashboard independently.

**Independent Test**: Render agents with chat-only, dashboard-only, both, and
neither; confirm shared identity/capability structure and a safe independent
dashboard link while chat remains embedded when assigned.

- [x] T007 [US1] Add RED rendered-component tests for embedded chat plus dashboard launch, dashboard-only, chat-only, neither, shared identity, safe link attributes, and no agent-name branches in `src/app/(protected)/dashboard/chat/__tests__/agent-workspace.test.tsx`
- [x] T008 [US1] Implement the shared composition presentation in `src/app/(protected)/dashboard/chat/agent-workspace.tsx`
- [x] T009 [US1] Add RED page-resolution tests for explicit selection, authorized dashboard-only agents, default chat preference, invalid selector, directory failure, and duplicate instance linkage in `src/app/(protected)/dashboard/chat/__tests__/page-resolution.test.ts`
- [x] T010 [US1] Refactor `src/app/(protected)/dashboard/chat/page.tsx` to resolve the full selected-agent context and exact native-dashboard capability before rendering composition
- [x] T011 [US1] Preserve Overview capability actions and existing `/dashboard/chat?agent=` compatibility in `src/lib/agent-capabilities.ts` and `src/app/(protected)/dashboard/page.tsx`
- [x] T012 [US1] Run focused library, workspace, page-resolution, and Overview regression tests and mark T007-T011 complete in `specs/023-composable-agent-workspace/tasks.md`

**Checkpoint**: The frontend prototype satisfies simultaneous availability without production runtime changes.

---

## Phase 4: User Story 2 - Responsive and session-safe operation (Priority: P2)

**Goal**: Prove keyboard, responsive, absence, safe external launch, and
authorization lifecycle behavior before deployment.

**Independent Test**: Exercise the fixture at 320/768/1024/1440px and the
logout, expiry, revocation, restoration, invalid-selector, and one-agent states.

- [x] T013 [US2] Extend the authenticated fixture with chat-only, dashboard-only, both, neither, one-agent, invalid, and unavailable workspace states in `scripts/open-webui-auth-fixture-server.ts`
- [x] T014 [US2] Add RED Chromium assertions for safe dashboard launch attributes, retained chat iframe, keyboard order, visible focus, responsive overflow, and one-agent filtering in `tests/browser/open-webui-auth-spike.spec.ts`
- [x] T015 [US2] Add lifecycle regression coverage for logout, expiry, revocation, restoration, and independent-surface denial in `tests/browser/open-webui-auth-spike.spec.ts`
- [x] T016 [US2] Run the Chromium release suite, capture prototype screenshots, and record results in `specs/023-composable-agent-workspace/quickstart.md`

**Checkpoint**: The prototype is ready for review but does not authorize Walter deployment.

---

## Phase 5: User Story 3 - Walter disabled install and isolation qualification (Priority: P3)

**Goal**: Create a recoverable Walter-scoped Open WebUI candidate without
changing public routing, Titus, the Walter dashboard, or Walter's primary Codex OAuth path.

**Independent Test**: Install disabled, prove exact distinct resources and
private health, restart with persisted state, and execute rollback to the prior
dashboard-only production state.

- [x] T017 [US3] Reconcile live Walter/Titus container, volume, hostname, Nginx, OIDC, Phase service-account, runtime binding, and provider state through read-only Aegis preflight and record value-free findings in `specs/023-composable-agent-workspace/quickstart.md`
- [x] T018 [US3] Add RED deployment-contract checks for distinct Walter names, paths, volume, OIDC metadata, bindings, service account, provider policy, disabled route, and rollback target under `infra/open-webui/walter/`
- [x] T019 [US3] Implement Walter-scoped Open WebUI configuration and disabled-by-default deployment scripts under `infra/open-webui/walter/`
- [x] T020 [US3] Qualify private health, value-free logs, exact bindings, separate service-account scope, primary Codex OAuth preservation, restart persistence, and disabled public route
- [x] T021 [US3] Rehearse rollback without deleting the Walter volume or changing Titus/native-dashboard state and append the production result to `/home/frosted639/src/overnightdesk-suite/deploys.log`

**Checkpoint**: Walter candidate exists safely but remains publicly disabled.

---

## Phase 6: User Story 3 - Walter controlled activation and acceptance (Priority: P3)

**Goal**: Enable only the qualified Walter route and canonical assignment, then
prove the complete user and session lifecycle.

- [x] T022 [US3] Enable only the Walter Nginx route, Better Auth OIDC client, and canonical use-case/runtime resource mappings
- [x] T023 [US3] Complete controlled non-member, suspended-member, expired-member denial/restoration checks with zero cross-agent disclosure
- [x] T024 [US3] Complete chat response, sidebar history, restart persistence, explicit logout, OAuth expiry/renewal, revocation/reauthentication, and final restoration checks
- [x] T025 [US3] Verify Titus chat, Walter/Titus native dashboards, effective Walter Codex OAuth primary provider, public health, and rollback readiness after activation
- [ ] T026 [US3] Complete authenticated owner acceptance of Walter chat/dashboard composition before production acceptance

---

## Phase 7: Analysis, review, publication, and closeout

- [x] T027 Run Spec Kit cross-artifact analysis and remediate every critical/high finding before implementation completion
- [x] T028 Run the complete Jest suite, production build, Chromium browser suite, `npm audit --audit-level=high`, secret/value sentinel scan, and `git diff --check`
- [x] T029 Perform five-axis correctness/readability/architecture/security/performance review and verify no agent-name branches, first-instance fallbacks, unsafe external launches, arbitrary hosts, cross-runtime resources, provider drift, or hidden absent states remain
- [ ] T030 Update `.specify/roadmap.md`, `README.md`, Feature 023 status, `overnightdesk-platform-standard`, and ADR 006 with only verified prototype and deployment behavior
- [ ] T031 Publish reviewed repository increments, wait for passing checks, merge only accepted changes, verify Vercel/Aegis health, and append every production result to `/home/frosted639/src/overnightdesk-suite/deploys.log`

## Dependencies and execution order

- Phase 2 blocks every presentation task.
- US1 is the MVP and blocks browser/lifecycle qualification.
- US2 must pass before any frontend prototype is activated for production.
- Walter disabled install begins only after the shared prototype and live
  read-only preflight are reviewed.
- Walter controlled activation requires successful private qualification and
  rollback rehearsal.
- Publication and acceptance require all included increment tests and review
  gates; documenting Walter does not authorize deployment.

## Parallel opportunities

- T013 fixture work may begin after the US1 markup contract is stable while
  focused library tests are running.
- T018 deployment-contract tests affect separate files from frontend browser
  coverage but remain gated on the read-only preflight.
- Documentation reconciliation can be prepared independently after evidence is
  final, but each repository must publish through its own branch and review.

## Implementation strategy

Deliver the pure composition contract first, then the smallest server-rendered
prototype, then browser/lifecycle proof. Keep Walter absent and honest until a
separate disabled install proves every isolation and rollback boundary. Activate
Walter only after the owner-driven denial/restoration and session-lifecycle
matrix passes. Every increment remains rollback-friendly and capability-driven.
