# Tasks: Legacy Customer Lifecycle Retirement

**Input**: Design documents from `specs/040-legacy-lifecycle-retirement/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/retirement-boundary.md`, and `quickstart.md`

**Tests**: Behavioral changes use RED→GREEN ordering. Each test task must be
run and shown to fail for the intended missing/legacy behavior before its
paired implementation task begins.

**Organization**: Tasks are grouped by the four approved user stories. Source,
database, Vercel, Aegis, provider, and secret mutations remain separate gates.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because owned files are disjoint and no
  incomplete dependency is required.
- **[Story]**: Maps the task to US1-US4 in `spec.md`.
- Every task names its owned file paths and approved requirement trace.

## Phase 1: Setup and Inventory

**Purpose**: Freeze the exact retirement and preservation inventory before any
source deletion.

- [X] T001 Re-verify the frontend, engine, and platform-standard caller inventory with the canonical code graph and targeted source reads, then record exact retained and retired paths in `specs/040-legacy-lifecycle-retirement/research.md` — FR-008, FR-011, SC-005
- [X] T002 [P] Add a source/config qualification script that distinguishes customer-lifecycle matches from legitimate business words and unrelated bridge wizards in `scripts/qualify-legacy-customer-lifecycle-retirement.sh`, then run it once and confirm it fails against the current legacy source — FR-002, FR-018, SC-009

**Checkpoint**: Exact consumers, non-goals, and cross-repository ownership are
documented; the qualification scan fails for known legacy artifacts.

---

## Phase 2: Foundational Authorization Boundary

**Purpose**: Establish the current internal authorization helper before
deleting the legacy billing module that currently owns `isAdmin`.

- [X] T003 Write and run failing admin/internal-role tests that prove authorization never reads subscription, plan, Stripe customer, or payment status in `src/lib/__tests__/internal-authorization.test.ts` — FR-004, SC-003
- [X] T004 Implement the environment-normalized admin helper and migrate `src/lib/require-admin.ts` to use it in `src/lib/internal-authorization.ts` and `src/lib/require-admin.ts` until T003 passes — FR-004, FR-015, SC-003

**Checkpoint**: A subscription-free authorization primitive exists and all
later stories can remove `billing.ts` without widening access.

---

## Phase 3: User Story 1 - Use the Limited Internal Frontend (Priority: P1) 🎯 MVP

**Goal**: Preserve existing-account sign-in, password recovery, chat, and the
membership-scoped dashboard while removing registration and all customer
acquisition/lifecycle surfaces.

**Independent Test**: An existing owner fixture signs in and reaches chat and
the selected-agent dashboard; direct signup creates zero identity rows; every
retired UI/API route returns 404 with zero external or database mutation.

### Tests for User Story 1

- [X] T005 [P] [US1] Write and run failing server-boundary tests proving direct `POST /api/auth/sign-up/email` returns exact 404 with zero identity creation while sign-in and password recovery remain available in `src/lib/__tests__/auth-registration-retirement.test.ts` — FR-001, FR-003, SC-001, SC-002
- [X] T006 [P] [US1] Write and run failing root-entry and retired-page 404 tests in `src/app/__tests__/limited-frontend-routes.test.tsx` — FR-002, FR-003, FR-017, SC-001
- [X] T007 [P] [US1] Write and run failing dashboard regression tests proving selected-agent/chat capabilities remain while plan, billing, wizard, provisioning, restart, and self-delete controls are absent in `src/app/(protected)/dashboard/__tests__/limited-frontend.test.tsx` — FR-001, FR-004, FR-005, SC-002

### Implementation for User Story 1

- [X] T008 [US1] Disable Better Auth email signup and retain a fail-closed user-create hook in `src/lib/auth.ts`; intercept direct email-registration requests with exact 404 in `src/app/api/auth/[...all]/route.ts`; retain sign-in/reset/session/OIDC dispatch; and keep retired-page classification and tests ahead of authentication in `middleware.ts`, `src/lib/middleware-utils.ts`, and `src/lib/__tests__/middleware-utils.test.ts` until the T005-T006 boundary assertions pass — FR-001, FR-003, FR-017, SC-001, SC-002
- [X] T009 [US1] Remove the signup and verification pages and their sign-in link/test imports in `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/verify-email/page.tsx`, `src/app/(auth)/sign-in/page.tsx`, and `src/lib/__tests__/auth-form-autocomplete.test.tsx` — FR-001, FR-002, SC-002
- [X] T010 [P] [US1] Replace customer marketing at the root with the minimal sign-in/dashboard entry and delete pricing/checkout pages in `src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/app/pricing/pricing-card.tsx`, and `src/app/checkout/success/page.tsx` until T006 passes — FR-002, FR-003, SC-001
- [X] T011 [US1] Remove subscription gating from `src/app/(protected)/layout.tsx` and `src/lib/require-pro-or-admin.ts`, then replace Pro-or-admin checks with the existing admin rule in `src/app/api/engine/security/queue/route.ts`, `src/app/api/engine/security/queue/[id]/route.ts`, `src/app/api/engine/security/queue/[id]/resolve/route.ts`, and `src/app/api/engine/security/status/route.ts` — FR-004, FR-015, SC-003
- [X] T012 [US1] Remove subscription queries, plan labels, payment banners, billing controls, and paid security messaging while preserving selected-agent resolution in `src/app/(protected)/dashboard/page.tsx`, `src/app/(protected)/dashboard/layout.tsx`, and `src/app/(protected)/dashboard/security/page.tsx` until T007 passes — FR-001, FR-004, SC-002
- [X] T013 [P] [US1] Delete Stripe checkout, portal, and webhook route handlers plus the Stripe client as an undeployed source-only change in `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/portal/route.ts`, `src/app/api/stripe/webhook/route.ts`, and `src/lib/stripe.ts`; production activation remains blocked by T036 — FR-002, FR-003, FR-006, SC-001
- [X] T014 [P] [US1] Delete Stripe webhook behavior/tests and payment-failure presentation as an undeployed source-only change while preserving unrelated email delivery in `src/lib/stripe-webhook-handlers.ts`, `src/lib/__tests__/stripe-webhook.test.ts`, `src/lib/emails/payment-failure-email.tsx`, and `src/lib/email.ts`; production activation remains blocked by T036 — FR-002, FR-003, FR-016, SC-001
- [X] T015 [US1] Remove the subscription API, billing module/tests, subscription-derived admin metrics, and remaining imports in `src/app/api/subscription/route.ts`, `src/lib/billing.ts`, `src/lib/__tests__/billing.test.ts`, and `src/lib/admin-metrics.ts` — FR-004, FR-013, SC-003
- [X] T016 [P] [US1] Remove self-service account deletion UI, endpoint, and coupled tests in `src/app/(protected)/dashboard/settings/delete-account.tsx`, `src/app/api/account/delete/route.ts`, and `src/app/api/account/__tests__/delete.test.ts`; document the explicit owner-operated process and sole-active-owner refusal in `specs/040-legacy-lifecycle-retirement/quickstart.md` — FR-005, FR-015, SC-003
- [X] T017 [P] [US1] Remove customer setup/provisioning presentation without touching Telegram or Discord bridge configuration in `src/app/(protected)/dashboard/setup-wizard.tsx`, `src/app/(protected)/dashboard/provisioning-progress.tsx`, and `src/app/(protected)/dashboard/onboarding-wizard.tsx` — FR-002, FR-012, SC-001
- [X] T018 [US1] After T001 confirms no active source caller, remove wizard mutation routes and their legacy tests as an undeployed source-only change in `src/app/api/wizard/write-step/route.ts`, `src/app/api/wizard/complete/route.ts`, and `src/app/api/wizard/__tests__/wizard-routes.test.ts`; production activation remains blocked by T036 — FR-003, FR-009, FR-012, SC-001
- [X] T019 [US1] After T001 confirms no active source caller, remove the provisioner callback and customer instance-control routes/tests as an undeployed source-only change in `src/app/api/provisioner/callback/route.ts`, `src/app/api/provisioner/__tests__/callback.test.ts`, `src/app/api/instance/status/route.ts`, `src/app/api/instance/auth-status/route.ts`, and `src/app/api/instance/terminal-ticket/route.ts`; production activation remains blocked by T036 — FR-003, FR-012, FR-017, SC-001
- [X] T020 [US1] Remove the Stripe package, Jest allowlist entry, billing/invite/Stripe environment contract, and lockfile entry in `package.json`, `package-lock.json`, `jest.config.ts`, and `.env.example` — FR-002, FR-016, SC-009
- [ ] T021 [US1] Run T005-T007, existing sign-in/chat/dashboard/OIDC suites, `npm test`, `npm run build`, and `scripts/qualify-legacy-customer-lifecycle-retirement.sh`; fix only US1 regressions in the paths owned by T008-T020 and record sanitized results in `specs/040-legacy-lifecycle-retirement/quickstart.md` — FR-001, FR-002, FR-003, FR-004, FR-005, SC-001, SC-002, SC-003

**Checkpoint**: The limited frontend is independently usable and customer
signup, Stripe, billing, wizard, callback, and self-delete routes are absent.

---

## Phase 4: User Story 2 - Preserve Approved Named-Runtime Operations (Priority: P1)

**Goal**: Keep the qualified managed-variable replacement and proven read-only
dashboard support while removing every other privileged provisioner mutation.

**Independent Test**: Managed-variable positive, denial, idempotency,
secret-leak, and bounded-effect tests pass; removed methods/routes are absent;
chat/dashboard reads still work.

### Tests for User Story 2

- [X] T022 [P] [US2] Extend managed-variable handler/client regression coverage for exact authorization, value-free responses, idempotency, and no legacy fallback in `src/app/api/settings/agent-variables/__tests__/route.test.ts` and `src/lib/__tests__/provisioner.test.ts`, then confirm the new narrow-surface assertion fails — FR-008, FR-009, FR-010, SC-005, SC-006
- [X] T023 [P] [US2] Add a regression test proving the unsupported sessions adapter is absent and a Mitchel-summary preservation test that rejects mutation-capable inputs in `src/lib/__tests__/provisioner.test.ts` and `src/lib/mitchel-prospecting/__tests__/trevor-summary-client.test.ts` — FR-008, FR-011, SC-005

### Implementation for User Story 2

- [X] T024 [US2] Remove the unsupported `src/app/api/engine/sessions/route.ts` adapter and narrow `src/lib/provisioner.ts` to `replaceManagedVariable` plus the proven `getMitchelProspectingSummary` read; remove provision, write-secrets, configure-dashboard-auth, restart, deprovision, and get-sessions types/methods until T022-T023 pass — FR-008, FR-009, FR-010, FR-011, SC-005, SC-006
- [X] T025 [US2] Remove broad restart and legacy dashboard-auth mutation routes/tests in `src/app/api/engine/restart/route.ts`, `src/app/api/admin/hermes/dashboard-auth/route.ts`, and `src/app/api/admin/hermes/dashboard-auth/__tests__/route.test.ts` — FR-008, FR-009, SC-005
- [X] T026 [US2] In the `overnightdesk-engine` repository, first update `internal/hermes/handlers_test.go` and `internal/hermes/provisioner_test.go` to require only health, managed-variable, and approved read-only route registration and confirm the tests fail — FR-008, FR-009, SC-005
- [X] T027 [US2] In the `overnightdesk-engine` repository, remove provision, deprovision, restart, dashboard-auth, and write-secrets handlers/services while preserving managed-variable and approved read-only implementations in `internal/hermes/handlers.go` and `internal/hermes/provisioner.go` until T026 passes — FR-008, FR-009, FR-010, SC-005
- [X] T028 [US2] In the `overnightdesk-engine` repository, restrict startup wiring to health, managed-variable, and approved read-only routes in `cmd/hermes-provisioner/main.go` and `cmd/hermes-provisioner/main_test.go` — FR-008, FR-009, SC-005
- [X] T029 [P] [US2] In the `overnightdesk-engine` repository, remove retired lifecycle environment/documentation claims while retaining only required registry, state, audit, read-only, and health configuration in `deploy/hermes-provisioner.env.example` and `README.md` — FR-016, FR-020, SC-009
- [X] T030 [US2] Run frontend managed-variable/read-only suites and engine `go test ./...`, `go vet ./...`, and build checks; record value-free results in `specs/040-legacy-lifecycle-retirement/quickstart.md` without real secret values — FR-010, FR-018, SC-005, SC-006

**Checkpoint**: No customer lifecycle or broad runtime mutation remains in
either application client or engine service source.

---

## Phase 5: User Story 3 - Prove Legacy Payment State Is Empty (Priority: P1)

**Goal**: Provide one bounded zero-state preflight and a reversible migration
for pure legacy subscription/wizard compatibility data without changing active
identity or platform-instance truth.

**Independent Test**: Plan mode reports zero provider obligations, local
subscriptions, meaningful wizard state, and active consumers; non-zero or
ambiguous fixtures stop without mutation; apply/verify succeeds only against an
approved disposable database.

### Tests for User Story 3

- [X] T031 [US3] Write and run failing plan/apply/verify/rollback plus non-zero stop-condition tests in `scripts/__tests__/legacy-customer-lifecycle-cleanup.test.ts`, including proof that rollback restores all before-counts without changing active data — FR-006, FR-007, FR-013, FR-014, SC-004, SC-007

### Implementation for User Story 3

- [X] T032 [US3] Implement parameterized, secret-safe plan/apply/verify/rollback modes with zero-state checks and explicit apply/rollback approval tokens in `scripts/legacy-customer-lifecycle-cleanup.ts` until T031 passes — FR-006, FR-007, FR-013, FR-014, SC-004, SC-007
- [X] T033 [P] [US3] Add deterministic cleanup plan/apply/verify commands in `package.json` and document test-database requirements in `specs/040-legacy-lifecycle-retirement/quickstart.md` — FR-014, FR-018, SC-007
- [X] T034 [US3] Remove the pure subscription model and only preflight-proven unused wizard compatibility fields in `src/db/schema.ts` and add reversible SQL in `drizzle/0011_legacy_customer_lifecycle_retirement.sql` — FR-013, FR-014, FR-015, SC-004, SC-007
- [X] T035 [US3] Run plan/apply/verify/rollback against a disposable populated test database using `scripts/legacy-customer-lifecycle-cleanup.ts`, prove rollback restores all before-counts, prove non-zero fixtures stop unchanged, and attach sanitized evidence to the implementation PR — FR-007, FR-014, FR-018, SC-007
- [X] T036 [US3] After source merge and explicit owner approval, run provider, callback, wizard/in-flight-work, and production-database plan mode only with `scripts/legacy-customer-lifecycle-cleanup.ts`; stop on any non-zero/ambiguous result and record secret-safe evidence in the PR and Issue #215 — FR-006, FR-007, FR-012, FR-019, SC-004
- [X] T037 [US3] Only after T035 rollback rehearsal passes, T036 reports zero state, a separate destructive-data approval is recorded, and a backup is verified, run production apply/verify with `scripts/legacy-customer-lifecycle-cleanup.ts` and record rollback/count evidence in `/opt/overnightdesk/deploys.log` — FR-014, FR-018, FR-019, FR-020, SC-007

**Checkpoint**: Pure legacy data is either safely removed with zero-state
evidence or explicitly stopped; active identity, membership, platform-instance,
runtime, and business records are unchanged.

---

## Phase 6: User Story 4 - Close Out Durable Retirement Truth (Priority: P2)

**Goal**: Make repository, deployed routes, Aegis service state, configuration,
inventories, runbooks, and the canonical ledger agree.

**Independent Test**: Source/config scans report zero active customer lifecycle
claim, surviving workspace/service checks pass, retired production routes fail
closed, and every approved production action has rollback and ledger evidence.

### Documentation and Source Closeout

- [X] T038 [P] [US4] Reconcile the limited TTS frontend and removed customer lifecycle in `README.md`, `PRD.md`, and `specs/040-legacy-lifecycle-retirement/quickstart.md` — FR-020, SC-009
- [X] T039 [P] [US4] In the `overnightdesk-platform-standard` repository, update ADR 007 consequences and current-state inventories in `docs/decisions/007-retire-platform-orchestrator.md`, `WHAT/services.yaml`, `WHAT/tenant-provisioning.yaml`, `WHAT/databases.yaml`, and `WHAT/secrets.yaml` — FR-020, SC-009
- [X] T040 [P] [US4] In the `overnightdesk-platform-standard` repository, reconcile deployment, architecture, tenant-provisioning, and secrets procedures in `HOW/deployment.md`, `HOW/architecture.md`, `HOW/tenant-provisioning.md`, and `HOW/secrets.md` — FR-018, FR-020, SC-009
- [X] T041 [US4] Run the full frontend and engine test/build suites plus `scripts/qualify-legacy-customer-lifecycle-retirement.sh`; record exact commands and sanitized results in `specs/040-legacy-lifecycle-retirement/quickstart.md` — FR-018, FR-020, SC-001, SC-002, SC-005, SC-009
- [X] T042 [US4] Complete security and code-quality review against Issue #215 and `specs/040-legacy-lifecycle-retirement/spec.md`, disposition every finding, and record merge/rollback risk in the implementation PR — FR-003, FR-009, FR-010, FR-014, SC-009

### Separately Approved Production Activation

- [ ] T043 [US4] Only after T036 reports zero provider/local/in-flight state and explicit Vercel approval is recorded, deploy the reviewed frontend head using `specs/040-legacy-lifecycle-retirement/quickstart.md`, verify owner sign-in/password recovery/chat/dashboard plus exact 404 for direct registration and all retired routes, and record the deployment identifier in the implementation PR — FR-001, FR-003, FR-006, FR-012, FR-018, FR-019, SC-001, SC-002, SC-004
- [X] T044 [US4] After explicit Aegis approval, deploy the isolated managed-variable service, verify health/readiness, qualified replacement, denial, idempotent replay, approved reads, and absence of legacy routes, then append the result to `/opt/overnightdesk/deploys.log` — FR-008, FR-009, FR-010, FR-018, FR-019, SC-005, SC-006
- [X] T045 [US4] After consumer-absence proof and separate owner approval, remove obsolete Stripe and retired provisioner variables/webhook registrations from their owning Vercel, provider, Phase, and Aegis systems without displaying values, then append metadata-only evidence to `/opt/overnightdesk/deploys.log` — FR-016, FR-019, FR-020, SC-009
- [X] T046 [US4] Run the approved observation window using `specs/040-legacy-lifecycle-retirement/quickstart.md`, roll back only the affected surviving capability if a threshold is met, and record each observation result in `/opt/overnightdesk/deploys.log` — FR-018, FR-019, FR-020, SC-008
- [ ] T047 [US4] Re-run inventory and documentation consistency checks and verify every required production/data gate and its evidence; if any required gate is deferred, keep Feature 040 and Issue #215 open, otherwise mark Feature 040 complete in `specs/040-legacy-lifecycle-retirement/spec.md` and `specs/040-legacy-lifecycle-retirement/tasks.md` and close Issue #215 only after every acceptance criterion is satisfied — FR-019, FR-020, SC-009

**Checkpoint**: Merge completion, production activation, destructive data
cleanup, secret cleanup, and observation closeout are each independently
proven; Issue #215 may close.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependency.
- **Phase 2**: Depends on T001; T002 may run in parallel.
- **US1 / Phase 3**: Depends on T003-T004. Test tasks T005-T007 precede
  implementation. T021 gates the undeployed US1 source slice; T013-T014 and
  T018-T019 cannot activate in production before T036 passes.
- **US2 / Phase 4**: Depends on T018-T019 and T021 so legacy application
  callers are removed before the client/service is narrowed. T022-T023 precede
  T024-T029. T030 gates US2 completion.
- **US3 / Phase 5**: T031-T035 can begin after T015 and T018 remove source
  consumers. T036 requires merged source; T037 requires T036 zero-state
  evidence plus separate approval and backup.
- **US4 / Phase 6**: T038-T040 may begin after source paths stabilize. T041-T042
  require US1-US3 source work. T043 requires T036 zero-state evidence; T043-T046
  are sequential production gates. T047 requires every required production/data
  task to be complete; a deferred required gate keeps Feature 040 and Issue #215
  open.

### User Story Dependencies

```text
Setup / Inventory
       |
Authorization Foundation
       |
       +--> US1 Limited Frontend
                |
                +--> US2 Operations Isolation
                |
                +--> US3 Zero-State Data Cleanup
                         |
                         +--> US4 Durable Closeout
```

- **US1** is the source MVP and must land first because it removes frontend
  callers and protects the owner workflow.
- **US2** depends on caller removal but remains independently verifiable at the
  operations boundary.
- **US3** depends on source decoupling but does not block a source-only release
  when production data approval is pending.
- **US4** integrates selected completed stories and is the only phase that can
  close Issue #215.

### Parallel Opportunities

- T002 can run beside T003-T004.
- T005-T007 can be authored in parallel before US1 implementation.
- T010, T013, T014, T016, and T017 own disjoint source paths after their RED
  tests exist.
- T022 and T023 can be authored in parallel.
- T029 can run beside T027-T028 after the retained route set is frozen.
- T033 can run beside T032 after T031 defines the command contract.
- T038-T040 are disjoint documentation repositories/paths.
- Sensitive and production tasks T036-T037 and T043-T046 are never delegated
  for mutation; only read-only evidence gathering may run in parallel.

## Parallel Example: User Story 1

```text
Task T005: Auth signup-denial and sign-in/recovery tests
Task T006: Root and retired-page contract tests
Task T007: Dashboard preservation/removal tests

After RED evidence:
Task T010: Root/pricing/checkout source
Task T013: Stripe API/client source
Task T014: Stripe webhook/email source
Task T016: Self-delete source
Task T017: Lifecycle dashboard components
```

## Parallel Example: User Story 2

```text
Task T022: Managed-variable narrow-surface tests
Task T023: Approved read-only consumer tests

After retained routes are frozen:
Task T027-T028: Engine handlers/startup wiring
Task T029: Engine environment/documentation
```

## Implementation Strategy

### MVP First

1. Complete T001-T004.
2. Write and run T005-T007 to capture RED evidence.
3. Complete T008-T020 in small RED→GREEN slices.
4. Complete T021 and stop for owner review; do not deploy this source slice
   before T036 passes.

The MVP is US1: the owner can use the limited frontend and no customer
signup/payment/lifecycle surface remains in the Next.js application.

### Incremental Delivery

1. **US1**: Limited frontend source retirement.
2. **US2**: Privileged operations isolation across frontend and engine repos.
3. **US3**: Zero-state data tooling and separately approved migration.
4. **US4**: Documentation, production activation, secret cleanup, observation,
   and final closeout.

Each story gets its own verification checkpoint and may be reviewed in a
separate PR. Child PRs and Issues reference #215; only the final completing PR
uses `Closes #215`.

## Notes

- Ringer workers never commit, push, edit `.git`, update this checklist, or
  widen scope.
- Production, identity, payment, secret, database, Aegis, and runtime-lifecycle
  tasks permit read-only delegated analysis only.
- Every production task requires exact reviewed head, explicit approval,
  rollback evidence, and metadata-only logging.
- Do not mark a task complete from intent alone; preserve command output,
  test/build evidence, or the durable operational record that proves it.
