# Tasks: Agent Control Surfaces

**Input**: Design documents from `/specs/022-agent-control-surfaces/`
**Tests**: Required by the constitution and feature specification. Execute RED before GREEN for every behavior change.

**Status — 2026-07-22**: T001-T043 and T045-T048 are complete. PR 85 merged and
deployed the unified frontend at main commit `1e44360`; the complete Jest suite,
production build, Chromium release suite, and public/Aegis post-deployment
checks passed. The production audit reports two high, one moderate, and zero
critical findings. Engine PR 4 merged at `fc8211e`; T043 deployed and qualified
only the Titus runtime/OpenRouter boundary with rollback, idempotency, exact
restart, service-account isolation, and value-free evidence. T044 is implemented
on its separate frontend branch and retains its publication/deployment gate.
Walter remains read-only. Authenticated owner acceptance remains T050.

## Phase 1: Setup and contract baseline

- [x] T001 Create and validate Feature 022 spec, research, data model, contracts, quickstart, and requirements checklist in `specs/022-agent-control-surfaces/`
- [x] T002 Update the active Spec Kit pointer in `AGENTS.md` and `.specify/feature.json`
- [x] T003 Record the current Overview, Settings, Admin, directory, and credential-route caller inventory in `specs/022-agent-control-surfaces/plan.md`

---

## Phase 2: Foundational selected-agent context

- [x] T004 Add failing directory tests for runtime slug/state and exact membership role in `src/lib/__tests__/open-webui-workspace.test.ts`
- [x] T005 Add failing selection tests for default-without-selector, explicit invalid selector, empty directory, unavailable directory, and no-instance-fallback in `src/lib/__tests__/selected-agent-context.test.ts`
- [x] T006 Extend canonical directory records with runtime slug/state and membership role in `src/db/open-webui-workspace-directory.ts` and `src/lib/open-webui-workspace.ts`
- [x] T007 Implement the discriminated selected-agent resolver and exact optional instance association in `src/lib/selected-agent-context.ts`
- [x] T008 Verify focused selected-agent tests and mark T004-T007 complete in `specs/022-agent-control-surfaces/tasks.md`

**Checkpoint**: One fail-closed server model can serve every agent-scoped page.

---

## Phase 3: User Story 1 — Consistent selected-agent panels (P1)

**Goal**: Titus, Walter, and one-agent users receive the same selected-agent structure with explicit Runtime/capability state.

**Independent Test**: Render Titus and Walter fixtures and confirm selector, identity, Runtime, capabilities, and actions appear in the same order; an explicit unknown selector fails closed.

- [x] T009 [US1] Add a failing regression proving Runtime is present for both canonical-only Titus and instance-linked Walter in `src/app/(protected)/dashboard/__tests__/agent-overview.test.tsx`
- [x] T010 [P] [US1] Add failing capability-state tests for Open Chat and Advanced Dashboard available/not-deployed states in `src/app/(protected)/dashboard/__tests__/agent-overview.test.tsx`
- [x] T011 [US1] Implement shared identity, Runtime, capability, and fail-closed presentation components in `src/app/(protected)/dashboard/agent-overview.tsx`, `src/app/(protected)/dashboard/agent-runtime-panel.tsx`, and `src/app/(protected)/dashboard/agent-access-state.tsx`
- [x] T012 [US1] Refactor Overview to consume `SelectedAgentContext` and remove `instances[0]` from selected-agent paths and selected-agent conditional section omission in `src/app/(protected)/dashboard/page.tsx`
- [x] T013 [US1] Update browser fixtures and desktop/mobile assertions for stable section order and no permanent Open Chat tab in `scripts/open-webui-auth-fixture-server.ts` and `tests/browser/open-webui-auth-spike.spec.ts`
- [x] T014 [US1] Run focused Jest and Chromium browser tests for User Story 1 and mark T009-T013 complete in `specs/022-agent-control-surfaces/tasks.md`

**Checkpoint**: The owner-reported Walter/Titus Runtime inconsistency is fixed without deploying a Walter Open WebUI placeholder.

---

## Phase 4: User Story 2 — Settings separated by scope (P2)

**Goal**: Account controls stay global; agent configuration follows the exact shared selected-agent context.

**Independent Test**: Switch Titus/Walter in Settings and confirm only agent-scoped content changes; account controls remain; invalid selectors fail closed; one-agent users see only one identity.

- [x] T015 [US2] Add failing Settings presentation tests for global account content, multi-agent selection, one-agent selection, unavailable directory, and invalid explicit selector in `src/app/(protected)/dashboard/settings/__tests__/settings-page.test.tsx`
- [x] T016 [P] [US2] Add failing presentational tests for shared selected-agent structure and Runtime consistency in `src/app/(protected)/dashboard/__tests__/selected-agent-configuration.test.tsx`
- [x] T017 [US2] Redesign Settings around global account and selected-agent sections in `src/app/(protected)/dashboard/settings/page.tsx`
- [x] T018 [US2] Replace the legacy credential cards with explicit read-only agent configuration presentation in `src/app/(protected)/dashboard/managed-agent-variables.tsx`
- [x] T019 [US2] Remove `getInstanceForUser` and first-instance selection from Settings and preserve account controls when the directory is unavailable in `src/app/(protected)/dashboard/settings/page.tsx`
- [x] T020 [US2] Run focused Settings tests and responsive browser assertions and mark T015-T019 complete in `specs/022-agent-control-surfaces/tasks.md`

**Checkpoint**: Settings has visible global/agent scope and never selects an agent by legacy array position.

---

## Phase 5: User Story 3 — Admin organized by operational scope (P3)

**Goal**: Fleet, Metrics, and Configuration share one owner-only Admin surface; Configuration uses selected-agent context.

**Independent Test**: Admin sees global Fleet/Metrics and selected-agent Configuration; non-admin requests reveal no content; selected identity matches Overview/Settings.

- [x] T021 [US3] Add failing server authorization and internal-navigation tests for all Admin routes in `src/app/(protected)/dashboard/admin/__tests__/admin-surface.test.tsx`
- [x] T022 [P] [US3] Add failing Configuration tests for Titus/Walter/one-agent selected context and Runtime consistency in `src/app/(protected)/dashboard/admin/__tests__/admin-configuration.test.tsx`
- [x] T023 [US3] Create one owner-only Admin layout and scoped internal navigation in `src/app/(protected)/dashboard/admin/layout.tsx` and `src/app/(protected)/dashboard/admin/admin-nav.tsx`
- [x] T024 [US3] Restyle Fleet as explicitly global while preserving its data and events in `src/app/(protected)/dashboard/admin/fleet/page.tsx`
- [x] T025 [US3] Move Metrics into the shared Admin layout and label it global in `src/app/(protected)/dashboard/admin/metrics/page.tsx`
- [x] T026 [US3] Add selected-agent Configuration using the shared context and read-only managed-variable status in `src/app/(protected)/dashboard/admin/configuration/page.tsx`
- [x] T027 [US3] Run focused Admin tests and desktop/mobile keyboard assertions and mark T021-T026 complete in `specs/022-agent-control-surfaces/tasks.md`

**Checkpoint**: Admin scope is coherent and no mutation capability has been broadened.

---

## Phase 6: User Story 4 — Safe managed-variable replacement (P4)

**Goal**: Close arbitrary secret-map input and permit only cataloged, exact-boundary, write-only replacement where the deployed provisioner can prove support.

**Independent Test**: Approved exact-boundary fixture succeeds value-free; arbitrary key/path/agent/role/value and unsupported canonical boundaries make zero external writes; audit failure denies mutation.

- [x] T028 [US4] Add failing catalog tests for stable IDs, role policy, validation bounds, confirmation strings, runtime effects, and no secret values in `src/lib/__tests__/managed-agent-variable.test.ts`
- [x] T029 [US4] Implement the source-controlled variable catalog and safe public descriptors in `src/lib/managed-agent-variable.ts`
- [x] T030 [US4] Add failing boundary tests for exactly one canonical secret binding, supported legacy path equivalence, missing/conflicting bindings, and no client coordinates in `src/db/__tests__/managed-agent-variable-boundary.test.ts`
- [x] T031 [US4] Implement exact secret-boundary resolution and deployed-provisioner compatibility gating in `src/db/managed-agent-variable-boundary.ts`
- [x] T032 [US4] Add failing metadata-only audit tests, including forbidden-value sentinels and audit failure, in `src/lib/__tests__/managed-agent-variable-audit.test.ts`
- [x] T033 [US4] Implement the metadata-only audit adapter using `platform_audit_log` in `src/lib/managed-agent-variable-audit.ts`
- [x] T034 [US4] Add failing route tests for auth, exact schema, role checks, invalid agent, arbitrary maps, unknown fields, invalid values, confirmation, duplicate request, boundary unavailable, external failure, restart failure, and value-free responses in `src/app/api/settings/agent-variables/__tests__/route.test.ts`
- [x] T035 [US4] Implement the bounded replacement Route Handler in `src/app/api/settings/agent-variables/route.ts` with its injectable implementation in `src/app/api/settings/agent-variables/handler.ts`
- [x] T036 [US4] Add a failing compatibility test proving `/api/settings/update-credential` rejects the legacy arbitrary `{secrets}` body in `src/app/api/settings/update-credential/__tests__/route.test.ts`
- [x] T037 [US4] Replace the legacy route with an explicit deprecation response that cannot accept arbitrary keys in `src/app/api/settings/update-credential/route.ts`
- [x] T038 [US4] Wire enabled catalog controls to the new value-free response contract and leave unsupported Titus/Walter boundaries explicitly read-only in `src/app/(protected)/dashboard/managed-agent-variables.tsx`
- [x] T039 [US4] Run route/catalog/boundary/audit tests and a repository-wide secret-sentinel scan, then mark T028-T038 complete in `specs/022-agent-control-surfaces/tasks.md`

**Checkpoint**: The frontend no longer accepts arbitrary Phase keys or paths. Canonical multi-App writes remain disabled until the provisioner follow-up is deployed.

---

## Phase 7: Separate boundary-aware provisioner follow-up

- [x] T040 Document and review the server-to-server boundary-aware provisioner request/response, frontend adoption, and rollback contract in `specs/022-agent-control-surfaces/contracts/managed-variable-replacement.md`
- [x] T041 Create a dedicated `overnightdesk-engine` worktree and feature branch only after frontend contract review, following suite `AGENTS.md`
- [x] T042 Add RED/GREEN Go tests for one-key allowlist, App/environment/path resolution, stdin-only values, service-account separation, idempotency, audit-safe errors, and runtime effect in `overnightdesk-engine/internal/hermes/`
- [x] T043 Deploy the provisioner increment with read-only preflight, rollback proof, value-suppressed logs, and a `deploys.log` record
- [ ] T044 Replace the managed-variable route's legacy secret-map/restart calls with the reviewed typed provisioner adapter and enable only qualified catalog/boundary mappings after production provisioner qualification (implementation complete; publication/deployment pending)

**Checkpoint**: Canonical Titus/Walter Phase replacement may be enabled only after T040-T044 and owner acceptance.

---

## Phase 8: Polish, analysis, review, and release

- [x] T045 Run Spec Kit cross-artifact analysis and remediate all critical/high findings before implementation completion
- [x] T046 Run the complete Jest suite, production build, Chromium browser suite, `npm audit --audit-level=high`, and `git diff --check`
- [x] T047 Perform five-axis code/security review and verify no `instances[0]`, agent-name branches, arbitrary secret maps, secret values, or hidden enabled agent-tab inconsistencies remain in touched surfaces
- [x] T048 Update Feature 020/022 status, `.specify/roadmap.md`, `README.md`, and `overnightdesk-platform-standard` with verified behavior and remaining gates
- [ ] T049 Publish reviewed pull request(s), wait for checks, merge only passing increments, verify Vercel/Aegis health, and append every production result to `/home/frosted639/src/overnightdesk-suite/deploys.log` (initial frontend increment complete through PR 85 at `1e44360`; repeat for T041-T044 and final closeout)
- [ ] T050 Complete authenticated owner browser acceptance for Titus/Walter Overview, Settings, Admin, Open Chat, and Runtime consistency before marking Feature 022 complete

---

## Dependencies and execution order

- Phase 2 blocks every user story.
- US1 blocks US2 and US3 because they consume its context/presentation contract.
- US2 and US3 are independently testable after US1.
- US4 depends on US2 presentation and the foundational exact context; it does not depend on Admin styling.
- The provisioner follow-up is a separate repository gate after frontend contract review and before any canonical multi-App variable is enabled.
- Release tasks require all included increment tests and review gates; Feature 022 remains open if T040-T044 or owner acceptance are deferred.

## Parallel opportunities

- T010 can be written alongside T009 because it exercises a separate capability concern.
- T016 can be written alongside T015 after the shared context contract exists.
- T022 can be written alongside T021 after the shared context contract exists.
- US2 and US3 implementation can proceed independently after US1, but file ownership must remain separate.
- Catalog, boundary, and audit RED tests T028, T030, and T032 affect separate files and can be prepared independently; implementation remains ordered.

## Implementation strategy

The MVP is US1: fix the production Titus/Walter Runtime inconsistency and prove
one shared selected-agent structure. Land each later story as a separate,
rollback-friendly commit only after focused tests pass. Keep the Phase mutation
capability disabled by default and enable no canonical boundary until the
separate provisioner contract has production evidence.
