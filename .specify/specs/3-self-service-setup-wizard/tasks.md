# Task Breakdown: Self-Service Setup Wizard

**Spec version:** 1.1.0 | **Plan version:** 1.0.0 | **Feature:** 3 (P1)
**Created:** 2026-04-23
**Total tasks:** 28
**Estimated total effort:** ~19h (includes tests written first per TDD)

---

## Summary

### Critical Path

```
0.1 (schema migration)
  → 0.2 (schema.ts)
    → 0.3 (stripe webhook) → [QG-0]
    → 0.4 (dashboard statusConfig)
    → 1.0T (provisioner tests written) → 1.1 (/write-secrets handler) → 1.2 (provisioner.go) → [QG-1]
      → 2.0T (API route tests written) → 2.1 (write-step route) → 2.2 (complete route) → 2.3 (status route) → 2.4 (update-credential route) → [QG-2 security]
        → 3.0T (wizard UI tests written) → 3.1 (SetupWizard component) → 3.2 (ProvisioningProgress component) → 3.3 (dashboard routing) → [QG-3 manual walkthrough]
          → 4.0T (settings tests written) → 4.1 (settings UI) → [QG-4 final suite]
```

### Parallelization Opportunities

- **0.3 + 0.4**: Both depend on 0.2; can run in parallel with each other.
- **1.0T + (0.3 + 0.4)**: Provisioner work (Phase 1) is Go/separate repo; can start in parallel with Phase 0 platform work after 0.2 is merged.
- **2.3 (status route)**: Mostly independent of 2.1 and 2.2; can be written in parallel once 2.0T is done.
- **3.1 + 3.2**: Both wizard components can be scaffolded in parallel once 3.0T is done; 3.3 waits for both.
- **4.0T + QG-3**: Settings test writing can begin once the API routes exist (end of Phase 2), in parallel with Phase 3 UI work.

### Quality Gates

| Gate | After | Criterion |
|---|---|---|
| QG-0 | Phase 0 | `tsc --noEmit` clean; migration applies cleanly on Neon dev |
| QG-1 | Phase 1 | All Go provisioner tests pass (`go test ./internal/hermes/...`) |
| QG-2 | Phase 2 | Security review passes on wizard + settings API routes |
| QG-3 | Phase 3+4 | Non-technical user manual walkthrough completes in ≤5 min |
| QG-4 | Final | Full platform test suite passes; coverage ≥80% on new code |

---

## Phase 0 — Schema + Stripe Webhook

### Task 0.1: Drizzle migration — enum + column
**Status:** 🟡 Ready
**Effort:** 1h
**Dependencies:** none
**Parallel with:** none (foundation for all other tasks)

Create a new Drizzle migration file that adds `awaiting_provisioning` to the `instance_status` Postgres enum (after `queued`) and adds the `wizard_state jsonb` nullable column to the `instance` table. Run `drizzle-kit generate` and verify the SQL is correct before pushing.

**Acceptance Criteria:**
- [ ] Migration file generated under `drizzle/` (or equivalent migrations directory)
- [ ] SQL includes `ALTER TYPE instance_status ADD VALUE 'awaiting_provisioning' AFTER 'queued'`
- [ ] SQL includes `ALTER TABLE instance ADD COLUMN wizard_state jsonb`
- [ ] Migration applies cleanly against Neon dev database (`drizzle-kit push` or `migrate`)
- [ ] No existing rows affected; migration is non-destructive

---

### Task 0.2: Update `src/db/schema.ts`
**Status:** 🔴 Blocked by Task 0.1
**Effort:** 30m
**Dependencies:** Task 0.1
**Parallel with:** none

Update the Drizzle TypeScript schema to reflect the migration: add `"awaiting_provisioning"` to `instanceStatusEnum` array and add `wizardState: jsonb("wizard_state")` to the `instance` table definition.

**Acceptance Criteria:**
- [ ] `instanceStatusEnum` includes `"awaiting_provisioning"` between `"queued"` and `"provisioning"`
- [ ] `instance` table has `wizardState: jsonb("wizard_state")` typed as `{ completedSteps: number[], currentStep: number } | null`
- [ ] `tsc --noEmit` passes with no errors after this change
- [ ] Drizzle inferred types (`InferSelectModel<typeof instance>`) include the new field

---

### Task 0.3: Remove provisioner call from `handleCheckoutCompleted`
**Status:** 🔴 Blocked by Task 0.2
**Effort:** 30m
**Dependencies:** Task 0.2
**Parallel with:** Task 0.4

Update `src/lib/stripe-webhook-handlers.ts`: remove the `provisionerClient.provision()` call from `handleCheckoutCompleted`. Instance is created at `status = queued` and the function returns. Update the idempotency guard to also skip instances in `awaiting_provisioning` status (so a duplicate webhook replay does not re-create or re-trigger).

**Acceptance Criteria:**
- [ ] `handleCheckoutCompleted` creates instance with `status: "queued"` and does NOT call `provisionerClient.provision()`
- [ ] Idempotency guard covers both `queued` AND `awaiting_provisioning` (returns early for both)
- [ ] Existing unit/integration tests for `handleCheckoutCompleted` updated to assert provisioner is NOT called
- [ ] Regression test added: duplicate webhook with existing `queued` instance is a no-op
- [ ] `tsc --noEmit` clean

---

### Task 0.4: Add `awaiting_provisioning` to dashboard `statusConfig`
**Status:** 🔴 Blocked by Task 0.2
**Effort:** 30m
**Dependencies:** Task 0.2
**Parallel with:** Task 0.3

Update `src/app/(protected)/dashboard/page.tsx`: add `awaiting_provisioning` to the `statusConfig` map with an appropriate label (e.g. "Setting up…") and detail text (e.g. "Your credentials have been saved. Provisioning will begin shortly.").

**Acceptance Criteria:**
- [ ] `statusConfig["awaiting_provisioning"]` exists with `label` and `detail` strings
- [ ] The label and detail are non-technical, suitable for customers
- [ ] No TypeScript exhaustiveness errors on the `statusConfig` switch/map
- [ ] `tsc --noEmit` clean

---

### Quality Gate 0: TypeScript clean after Phase 0
**Status:** 🔴 Blocked by Tasks 0.2, 0.3, 0.4
**Effort:** 15m
**Dependencies:** Tasks 0.2, 0.3, 0.4

Run `tsc --noEmit` on the platform codebase. Must pass with zero errors before Phase 2 API work begins.

**Acceptance Criteria:**
- [ ] `tsc --noEmit` exits 0
- [ ] Migration has been applied to Neon dev
- [ ] Git diff is clean (no uncommitted changes)

---

## Phase 1 — Provisioner `/write-secrets` Endpoint (Go)

> These tasks operate in the `overnightdesk-engine` repo under `internal/hermes/`. They can begin in parallel with Phase 0 once Task 0.1 is underway — the Go code has no dependency on the platform schema.

### Task 1.0T: Write failing tests for `/write-secrets` (TDD — RED)
**Status:** 🟡 Ready
**Effort:** 1.5h
**Dependencies:** none
**Parallel with:** Tasks 0.2, 0.3, 0.4

Write Go tests for the new `POST /write-secrets` endpoint BEFORE any implementation. Tests must be runnable (`go test ./internal/hermes/...`) and must FAIL (no implementation yet). Cover: happy path (multiple secrets written), auth failure (missing/wrong Bearer token), missing `tenantId`, empty secrets map, Phase CLI failure (mocked). Confirm all tests are RED before moving to Task 1.1.

**Acceptance Criteria:**
- [ ] Test file exists at `internal/hermes/write_secrets_test.go` (or equivalent)
- [ ] Tests compile and run (`go test ./internal/hermes/...` runs without compile error)
- [ ] All new tests FAIL (RED) — no implementation exists yet
- [ ] Happy path test covers: correct Bearer auth, correct `tenantId`, N secrets → N `phase secrets` calls
- [ ] Auth failure test: missing token → 401
- [ ] Invalid tenantId test: empty string → 400
- [ ] Phase CLI error test: mock returns error → 500 with `{ "error": "..." }`
- [ ] Test for idempotency: create falls back to update if key already exists

---

### Task 1.1: Implement `/write-secrets` handler in `handlers.go`
**Status:** 🔴 Blocked by Task 1.0T
**Effort:** 1.5h
**Dependencies:** Task 1.0T
**Parallel with:** none

Implement `POST /write-secrets` in `internal/hermes/handlers.go`. Request body: `{ tenantId: string, secrets: { KEY: value } }`. Bearer auth using existing `PROVISIONER_SECRET` mechanism (timing-safe compare). For each key/value pair call the Phase CLI executor. Return `200 { "success": true }` on full success; `400` for validation errors; `500` for Phase CLI failures.

**Acceptance Criteria:**
- [ ] Route registered at `POST /write-secrets` in the Echo router
- [ ] Bearer token validated with timing-safe comparison against `PROVISIONER_SECRET`
- [ ] Request body parsed and validated (tenantId required, secrets map required + non-empty)
- [ ] Each key/value pair calls Phase CLI: `phase secrets create KEY --app $PHASE_APP --env $PHASE_ENV --path /{tenantId}` (or `update` if create fails with "already exists")
- [ ] All Task 1.0T tests pass (GREEN)
- [ ] Secret values are never logged (only key names at debug level)

---

### Task 1.2: Wire `/write-secrets` route into `provisioner.go`
**Status:** 🔴 Blocked by Task 1.1
**Effort:** 30m
**Dependencies:** Task 1.1
**Parallel with:** none

Register the new handler in `provisioner.go` (or wherever routes are wired). Ensure the route is protected by the same auth middleware as existing provisioner routes.

**Acceptance Criteria:**
- [ ] `POST /write-secrets` route registered in main router/provisioner entry point
- [ ] Auth middleware applied (same as `/provision`)
- [ ] `go build ./...` passes
- [ ] All Phase 1 tests pass (`go test ./internal/hermes/...`)
- [ ] Manual smoke test: `curl -X POST .../write-secrets -H "Authorization: Bearer ..."` with valid body returns `200`

---

### Quality Gate 1: Provisioner tests pass
**Status:** 🔴 Blocked by Task 1.2
**Effort:** 10m
**Dependencies:** Task 1.2

Run `go test ./internal/hermes/... -v` and confirm all tests pass. Check coverage on new handler code.

**Acceptance Criteria:**
- [ ] `go test ./internal/hermes/... -v` exits 0
- [ ] All 1.0T test cases are GREEN
- [ ] No race conditions (`go test -race ./internal/hermes/...` passes)
- [ ] Coverage on `write_secrets_handler` ≥80%

---

## Phase 2 — Platform API Routes (Next.js)

> Requires QG-0 (schema in place). Provisioner endpoint (Phase 1) should be deployed or mockable before integration tests run, but unit tests can be written with mocked provisioner client.

### Task 2.0T: Write failing tests for wizard + settings API routes (TDD — RED)
**Status:** 🔴 Blocked by QG-0
**Effort:** 2h
**Dependencies:** QG-0 (Task 0.2 must be in place for types)
**Parallel with:** QG-1 (provisioner work continues independently)

Write Jest tests for all four new API routes BEFORE implementation. Tests must compile and FAIL. Cover: `POST /api/wizard/write-step` (steps 1, 2, 3 — happy + validation error paths), `POST /api/wizard/complete` (success + provisioner failure), `GET /api/instance/status` (returns status + wizardState), `POST /api/settings/update-credential` (OpenRouter re-validation, Telegram, 409 conflict). Mock: `provisionerClient`, Better Auth session, DB queries.

**Acceptance Criteria:**
- [ ] Test files exist for each route (e.g. `__tests__/api/wizard/write-step.test.ts`)
- [ ] All tests compile (`tsc --noEmit` passes on test files)
- [ ] All new tests FAIL (RED) — route files do not exist yet
- [ ] `write-step` step 1: invalid OpenRouter key → 422 with error message
- [ ] `write-step` step 1: valid key + provisioner success → 200 + wizardState updated
- [ ] `write-step` step 2: token without user IDs → 422
- [ ] `write-step` step 2: skipped → 200 + step marked skipped in wizardState
- [ ] `write-step` step 3: skipped → 200 + defaults written to Phase.dev
- [ ] `wizard/complete`: provisioner failure → 500, status remains `queued`
- [ ] `wizard/complete`: success → status = `awaiting_provisioning`, fleet event logged
- [ ] `instance/status`: returns `{ status, wizardState }` for authenticated user's instance
- [ ] `update-credential`: invalid OpenRouter key → 422, existing key retained
- [ ] `update-credential`: success → write-secrets called + restart called
- [ ] `update-credential`: restart in progress → 409

---

### Task 2.1: Implement `POST /api/wizard/write-step`
**Status:** 🔴 Blocked by Task 2.0T
**Effort:** 1.5h
**Dependencies:** Task 2.0T
**Parallel with:** Task 2.3

Create `src/app/api/wizard/write-step/route.ts`. Requires authenticated Better Auth session. Validates step input server-side per step type. For step 1: calls OpenRouter `GET /api/v1/models` to validate key before writing. Calls `provisionerClient.writeSecrets()` (or equivalent). Updates `instance.wizardState` in DB. Logs `wizard.step.completed` fleet event.

**Acceptance Criteria:**
- [ ] Route exists at `POST /api/wizard/write-step`
- [ ] Returns 401 if no authenticated session
- [ ] Step 1: calls `https://openrouter.ai/api/v1/models` with key as Bearer; non-200 → 422 with user-friendly error
- [ ] Step 1: key never logged (only "openrouter key validated" event)
- [ ] Step 2: validates both token AND user IDs present (or both absent for skip)
- [ ] Step 3: writes defaults if skipped (`HERMES_AGENT_NAME=Assistant`, `TIMEZONE=UTC`)
- [ ] `instance.wizardState` updated with completed step number
- [ ] `wizard.step.completed` fleet event logged
- [ ] All 2.0T write-step tests pass (GREEN)

---

### Task 2.2: Implement `POST /api/wizard/complete`
**Status:** 🔴 Blocked by Task 2.0T
**Effort:** 1h
**Dependencies:** Task 2.0T
**Parallel with:** Task 2.3

Create `src/app/api/wizard/complete/route.ts`. Requires authenticated session. Verifies all required steps completed (step 1 in `wizardState.completedSteps`). Calls `provisionerClient.provision()`. On success: sets `instance.status = "awaiting_provisioning"`. Logs `wizard.completed` fleet event. On provisioner failure: leaves status `queued`, returns 500 with retry guidance.

**Acceptance Criteria:**
- [ ] Route exists at `POST /api/wizard/complete`
- [ ] Returns 401 if no authenticated session
- [ ] Returns 400 if step 1 not in `wizardState.completedSteps` (required step incomplete)
- [ ] Calls `provisionerClient.provision()` exactly once
- [ ] On provisioner success: `instance.status` updated to `awaiting_provisioning`
- [ ] On provisioner failure: `instance.status` remains `queued`, response is 500 with `{ error: "...", retryable: true }`
- [ ] `wizard.completed` fleet event logged with `stepsCompleted` array
- [ ] All 2.0T complete tests pass (GREEN)

---

### Task 2.3: Implement/extend `GET /api/instance/status`
**Status:** 🔴 Blocked by Task 2.0T
**Effort:** 30m
**Dependencies:** Task 2.0T
**Parallel with:** Task 2.1

Extend or create `src/app/api/instance/status/route.ts` to return `{ status, wizardState }` for the authenticated user's instance. If the route already exists, add `wizardState` to the response shape.

**Acceptance Criteria:**
- [ ] `GET /api/instance/status` returns `{ status: InstanceStatus, wizardState: WizardState | null }`
- [ ] Returns 401 if no authenticated session
- [ ] Returns 404 if no instance found for user
- [ ] Correct TypeScript return type (matches schema types from 0.2)
- [ ] All 2.0T status route tests pass (GREEN)

---

### Task 2.4: Implement `POST /api/settings/update-credential`
**Status:** 🔴 Blocked by Tasks 2.1, 2.2
**Effort:** 1h
**Dependencies:** Tasks 2.1, 2.2 (provisioner client patterns established)
**Parallel with:** none

Create `src/app/api/settings/update-credential/route.ts`. Accepts `{ field: "openrouter_key" | "telegram", secrets: Record<string, string> }`. For `openrouter_key`: re-validates key with OpenRouter before writing. Calls `provisionerClient.writeSecrets()`. Calls `provisionerClient.restart()`. Returns 409 if restart already in progress.

**Acceptance Criteria:**
- [ ] Route exists at `POST /api/settings/update-credential`
- [ ] Returns 401 if no authenticated session
- [ ] `openrouter_key`: invalid key → 422, existing key NOT overwritten
- [ ] `openrouter_key`: valid key → write-secrets called, restart called, 200
- [ ] `telegram`: both token + userIds present or both absent validation
- [ ] Returns 409 with `{ error: "Restart in progress. Please wait and retry." }` if concurrent restart detected
- [ ] `settings.credential_updated` fleet event logged (field name only, not value)
- [ ] All 2.0T update-credential tests pass (GREEN)

---

### Quality Gate 2: Security review on API routes
**Status:** 🔴 Blocked by Tasks 2.1, 2.2, 2.3, 2.4
**Effort:** 1h
**Dependencies:** Tasks 2.1, 2.2, 2.3, 2.4

Run the `security-review` skill against all four new API routes. All CRITICAL and HIGH findings must be resolved before Phase 3 begins.

**Acceptance Criteria:**
- [ ] `security-review` run against `src/app/api/wizard/` and `src/app/api/settings/update-credential/`
- [ ] Zero CRITICAL findings
- [ ] Zero HIGH findings
- [ ] All MEDIUM findings reviewed and either fixed or accepted with documented rationale
- [ ] Verified: no secret values in any log statement across all four routes
- [ ] Verified: all routes require authenticated session (401 without session)
- [ ] Verified: users can only access their own instance (no IDOR)

---

## Phase 3 — Wizard UI (Next.js)

### Task 3.0T: Write failing tests for wizard UI components (TDD — RED)
**Status:** 🔴 Blocked by QG-2
**Effort:** 1.5h
**Dependencies:** QG-2
**Parallel with:** Task 4.0T

Write Jest/React Testing Library tests for `SetupWizard` and `ProvisioningProgress` components BEFORE implementation. Tests must FAIL. Cover: step navigation (next/back/skip), inline validation error display for bad OpenRouter key, masked placeholder display for completed steps, provisioning progress polling behaviour (mock `fetch`), transition to hub on `running` status.

**Acceptance Criteria:**
- [ ] Test files exist at `__tests__/dashboard/setup-wizard.test.tsx` and `__tests__/dashboard/provisioning-progress.test.tsx`
- [ ] All tests FAIL (RED) — component files do not exist yet
- [ ] Wizard: step 1 shown first; cannot advance without valid key
- [ ] Wizard: inline error shown when `write-step` returns 422
- [ ] Wizard: completed step shows masked placeholder (`sk-or-••••1234`)
- [ ] Wizard: step 2 "Skip" button advances without calling `write-step` with secrets
- [ ] Wizard: final confirmation before `complete` call
- [ ] ProvisioningProgress: renders current status label
- [ ] ProvisioningProgress: polls `/api/instance/status` every 5s (mock timer)
- [ ] ProvisioningProgress: calls `onRunning` callback when status = `running`
- [ ] ProvisioningProgress: renders error state when status = `error`

---

### Task 3.1: Implement `SetupWizard` component
**Status:** 🔴 Blocked by Task 3.0T
**Effort:** 2.5h
**Dependencies:** Task 3.0T
**Parallel with:** Task 3.2

Create `src/app/(protected)/dashboard/setup-wizard.tsx` as a `'use client'` component. Three-step form with progress indicator. Step 1: OpenRouter key input + validate-then-proceed button (calls `POST /api/wizard/write-step` with step 1). Step 2: Telegram token + user IDs (with skip button). Step 3: agent name + timezone selector (with skip button, populated with defaults). Final confirmation before calling `POST /api/wizard/complete`. Resumes from `wizardState` prop.

**Acceptance Criteria:**
- [ ] Component created at `src/app/(protected)/dashboard/setup-wizard.tsx`
- [ ] `'use client'` directive at top
- [ ] Accepts `instanceId: string` and `wizardState: WizardState | null` props
- [ ] Progress indicator shows current step (1/2/3)
- [ ] Step 1: "Validate key" triggers server call; inline error on 422; proceeds only on 200
- [ ] Step 1: completed step shows masked placeholder; re-entry clears to allow update
- [ ] Step 2: "Skip" button calls write-step with skip flag or empty secrets; advances to step 3
- [ ] Step 3: defaults pre-filled; "Skip" writes defaults
- [ ] Final confirmation screen before calling `wizard/complete`
- [ ] `onComplete` callback called after successful completion (to trigger parent re-render)
- [ ] Mobile-responsive (no horizontal scroll on 375px viewport)
- [ ] Plain-language instructions + external resource links on each step (NFR-6, NFR-7)
- [ ] All Task 3.0T `SetupWizard` tests pass (GREEN)

---

### Task 3.2: Implement `ProvisioningProgress` component
**Status:** 🔴 Blocked by Task 3.0T
**Effort:** 1h
**Dependencies:** Task 3.0T
**Parallel with:** Task 3.1

Create `src/app/(protected)/dashboard/provisioning-progress.tsx` as a `'use client'` component. Displays current instance status with label and animated indicator. Polls `GET /api/instance/status` every 5 seconds using `setInterval` + `clearInterval` on unmount. On `running`: calls `onRunning()` prop and stops polling. On `error`: renders error state with support message. Shows elapsed time since wizard completion.

**Acceptance Criteria:**
- [ ] Component created at `src/app/(protected)/dashboard/provisioning-progress.tsx`
- [ ] `'use client'` directive at top
- [ ] Accepts `initialStatus: InstanceStatus` and `onRunning: () => void` props
- [ ] Polls `/api/instance/status` every 5s
- [ ] `clearInterval` called on component unmount (no memory leak)
- [ ] Displays human-readable status label (from statusConfig or local map)
- [ ] Animated loading indicator visible during `awaiting_provisioning` and `provisioning`
- [ ] On `error` status: shows "Something went wrong. Please contact support." (no raw error)
- [ ] On `running`: calls `onRunning()`, stops polling
- [ ] All Task 3.0T `ProvisioningProgress` tests pass (GREEN)

---

### Task 3.3: Update `dashboard/page.tsx` — routing logic for hermes tenants
**Status:** 🔴 Blocked by Tasks 3.1, 3.2
**Effort:** 1h
**Dependencies:** Tasks 3.1, 3.2
**Parallel with:** Task 4.0T

Update `src/app/(protected)/dashboard/page.tsx` to route hermes tenants correctly based on instance status: `queued` → `<SetupWizard />`, `awaiting_provisioning` or `provisioning` → `<ProvisioningProgress />`, `running` → existing hub view. Non-hermes tenants unchanged. Pass `wizardState` from server-fetched instance data to `<SetupWizard />`.

**Acceptance Criteria:**
- [ ] `isHermesTenant(inst)` guard used (or equivalent check)
- [ ] `status === "queued"` → `<SetupWizard instanceId={...} wizardState={inst.wizardState} />`
- [ ] `status === "awaiting_provisioning" || status === "provisioning"` → `<ProvisioningProgress initialStatus={inst.status} onRunning={...} />`
- [ ] `status === "running"` → existing hermes hub view
- [ ] `onRunning` callback triggers re-fetch or router refresh (no full page reload)
- [ ] `onComplete` from `<SetupWizard />` triggers re-fetch to show `<ProvisioningProgress />`
- [ ] Non-hermes tenant paths unaffected
- [ ] `tsc --noEmit` clean

---

### Quality Gate 3: Manual walkthrough
**Status:** 🔴 Blocked by Task 3.3
**Effort:** 30m
**Dependencies:** Task 3.3

Manual end-to-end walkthrough of the wizard in a development environment simulating a non-technical user. Must complete in ≤5 minutes. Use staging provisioner or mock.

**Acceptance Criteria:**
- [ ] Fresh `queued` instance → wizard shown immediately (not hub, not spinner)
- [ ] Enter invalid OpenRouter key → inline error, cannot proceed
- [ ] Enter valid OpenRouter key → proceeds to step 2
- [ ] Skip step 2 → proceeds to step 3
- [ ] Skip step 3 → confirmation screen shown
- [ ] Confirm → status advances to `awaiting_provisioning`, provisioning progress shown
- [ ] Progress polling visible (status updates without page reload)
- [ ] On `running`: hub view appears without full page reload
- [ ] Abandon after step 1, return → wizard resumes at step 2 with masked placeholder on step 1
- [ ] Total walkthrough time ≤5 minutes

---

## Phase 4 — Settings Credentials UI (Next.js)

### Task 4.0T: Write failing tests for Settings AgentCredentials UI (TDD — RED)
**Status:** 🔴 Blocked by QG-2
**Effort:** 1h
**Dependencies:** QG-2
**Parallel with:** Tasks 3.0T, 3.1, 3.2, 3.3

Write Jest/React Testing Library tests for the new `AgentCredentials` section on the Settings page BEFORE implementation. Tests must FAIL. Cover: masked field display, edit-to-update flow, inline error on invalid key, success confirmation message, 409 conflict message.

**Acceptance Criteria:**
- [ ] Test file exists at `__tests__/dashboard/settings/agent-credentials.test.tsx`
- [ ] All tests FAIL (RED) — section not yet implemented
- [ ] OpenRouter key field: masked by default, edit button reveals input
- [ ] Submit with invalid key → inline error, no restart
- [ ] Submit with valid key → success message "Credential saved. Agent is restarting…"
- [ ] Submit while restart in progress → "Restart in progress. Please wait and retry."
- [ ] Telegram section: token + user IDs fields shown; save button per section
- [ ] Section only rendered for hermes tenants

---

### Task 4.1: Implement `AgentCredentials` section in Settings
**Status:** 🔴 Blocked by Task 4.0T
**Effort:** 1.5h
**Dependencies:** Task 4.0T
**Parallel with:** none (depends on QG-2 routes being available)

Update `src/app/(protected)/dashboard/settings/page.tsx` to add a new `AgentCredentials` section (visible only for hermes tenants). OpenRouter API key field (masked, editable). Telegram bot token + user IDs fields (masked, editable, optional). Each group has its own "Save and restart agent" button. Calls `POST /api/settings/update-credential` on save. Shows inline success/error.

**Acceptance Criteria:**
- [ ] `AgentCredentials` section added to settings page, guarded by `isHermesTenant` check
- [ ] OpenRouter key field: masked display (`sk-or-••••1234`), edit button shows input
- [ ] Telegram token field: masked display, edit button shows input
- [ ] Telegram user IDs field: plain text (not secret), editable directly
- [ ] "Save and restart agent" calls `POST /api/settings/update-credential` with correct payload
- [ ] Success state: inline green confirmation "Credential saved. Agent is restarting…"
- [ ] Error state: inline red error with plain-language message
- [ ] 409 response: "A restart is already in progress. Please wait and try again."
- [ ] Mobile-responsive layout
- [ ] All Task 4.0T tests pass (GREEN)

---

### Quality Gate 4: Full test suite + coverage
**Status:** 🔴 Blocked by Tasks 3.3, 4.1
**Effort:** 30m
**Dependencies:** Tasks 3.3, 4.1

Run the full platform Jest test suite. Verify coverage on all new files meets the 80% constitution minimum. Fix any failures before declaring the feature complete.

**Acceptance Criteria:**
- [ ] `npm test` (or `jest --coverage`) exits 0 — all tests pass
- [ ] Coverage on new files ≥80%:
  - `src/app/api/wizard/write-step/route.ts`
  - `src/app/api/wizard/complete/route.ts`
  - `src/app/api/instance/status/route.ts`
  - `src/app/api/settings/update-credential/route.ts`
  - `src/app/(protected)/dashboard/setup-wizard.tsx`
  - `src/app/(protected)/dashboard/provisioning-progress.tsx`
- [ ] No skipped tests on wizard/settings paths
- [ ] `tsc --noEmit` clean
- [ ] QG-3 manual walkthrough previously passed

---

## Task Index

| ID | Name | Phase | Effort | Status |
|---|---|---|---|---|
| 0.1 | Drizzle migration | 0 | 1h | 🟡 Ready |
| 0.2 | Update schema.ts | 0 | 30m | 🔴 Blocked 0.1 |
| 0.3 | Remove provisioner call from Stripe webhook | 0 | 30m | 🔴 Blocked 0.2 |
| 0.4 | Add awaiting_provisioning to statusConfig | 0 | 30m | 🔴 Blocked 0.2 |
| QG-0 | TypeScript clean | 0 | 15m | 🔴 Blocked 0.2–0.4 |
| 1.0T | Write failing tests for /write-secrets | 1 | 1.5h | 🟡 Ready |
| 1.1 | Implement /write-secrets handler | 1 | 1.5h | 🔴 Blocked 1.0T |
| 1.2 | Wire route into provisioner.go | 1 | 30m | 🔴 Blocked 1.1 |
| QG-1 | Provisioner tests pass | 1 | 10m | 🔴 Blocked 1.2 |
| 2.0T | Write failing tests for API routes | 2 | 2h | 🔴 Blocked QG-0 |
| 2.1 | Implement POST /api/wizard/write-step | 2 | 1.5h | 🔴 Blocked 2.0T |
| 2.2 | Implement POST /api/wizard/complete | 2 | 1h | 🔴 Blocked 2.0T |
| 2.3 | Implement/extend GET /api/instance/status | 2 | 30m | 🔴 Blocked 2.0T |
| 2.4 | Implement POST /api/settings/update-credential | 2 | 1h | 🔴 Blocked 2.1, 2.2 |
| QG-2 | Security review on API routes | 2 | 1h | 🔴 Blocked 2.1–2.4 |
| 3.0T | Write failing tests for wizard UI | 3 | 1.5h | 🔴 Blocked QG-2 |
| 3.1 | Implement SetupWizard component | 3 | 2.5h | 🔴 Blocked 3.0T |
| 3.2 | Implement ProvisioningProgress component | 3 | 1h | 🔴 Blocked 3.0T |
| 3.3 | Update dashboard routing | 3 | 1h | 🔴 Blocked 3.1, 3.2 |
| QG-3 | Manual walkthrough | 3 | 30m | 🔴 Blocked 3.3 |
| 4.0T | Write failing tests for Settings UI | 4 | 1h | 🔴 Blocked QG-2 |
| 4.1 | Implement AgentCredentials settings section | 4 | 1.5h | 🔴 Blocked 4.0T |
| QG-4 | Full test suite + coverage | Final | 30m | 🔴 Blocked 3.3, 4.1 |

**Total estimated effort: ~23.5h** (including quality gates and test-writing tasks)
