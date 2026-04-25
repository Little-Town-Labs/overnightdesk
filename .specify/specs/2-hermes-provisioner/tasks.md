# Tasks: Hermes Provisioner

**Feature:** 2-hermes-provisioner
**Spec version:** 1.0.0 | **Plan version:** 1.0.0 | **Constitution:** v2.0.0
**Created:** 2026-04-24

---

## Summary

| Metric | Value |
|---|---|
| Total tasks | 26 (18 implementation + 8 test/quality gate) |
| Estimated effort | ~18h |
| Critical path | T0.1 → T0.2 → T0.3 → T1.1 → T1.2 → T1.3 → QG-1 → T2.1 → T2.2 → T2.3 → T2.4 → QG-2 → T3.1 → T3.2 → T3.3 → T3.4 → QG-3 → QG-4 |

## Critical Path

```
Schema migration (T0.1)
  └─▶ ProvisionParams update (T0.2)
        └─▶ Callback route update (T0.3)
              └─▶ [TEST] Webhook tests (T1.1t)
                    └─▶ Stripe checkout wiring (T1.1)
                          └─▶ [TEST] Deprovision webhook tests (T1.2t)
                                └─▶ Stripe cancellation wiring (T1.2)
                                      └─▶ [TEST] Idempotency tests (T1.3t)
                                            └─▶ Idempotency guard (T1.3)
                                                  └─▶ [QG-1] Security review
                                                        └─▶ [TEST] Orchestrator provision tests (T2.1t)
                                                              └─▶ Orchestrator /provision endpoint (T2.1)
                                                                    └─▶ [TEST] Orchestrator deprovision tests (T2.2t)
                                                                          └─▶ Orchestrator /deprovision (T2.2)
                                                                                └─▶ [TEST] Orchestrator restart tests (T2.3t)
                                                                                      └─▶ Orchestrator /restart (T2.3)
                                                                                            └─▶ [QG-2] Orchestrator integration tests pass
                                                                                                  └─▶ Integration tests (T3.1–T3.4)
                                                                                                        └─▶ [QG-3] Full integration suite
                                                                                                              └─▶ [QG-4] E2E Stripe event
```

## Parallelization Opportunities

- **T0.1** (schema migration) and **T2.1t** (orchestrator test scaffold) can start in parallel — they have no shared dependency.
- **T1.1**, **T1.2**, **T1.3** are sequential within Phase 1 (each depends on the previous), but Phase 1 platform work and **T2.4t** (nginx template tests) can run in parallel after T0.2.
- **T2.2** (deprovision) and **T2.3** (restart) are independent of each other and can be built in parallel after **T2.1** passes.
- **T3.2** (deprovision integration test) and **T3.3** (idempotency integration test) can run in parallel after **T3.1** passes.

---

## Phase 0 — Schema + ProvisionParams (Platform)

### Task T0.1t: Write failing tests for schema migration and phaseServiceToken column
**Status:** 🟡 Ready
**Effort:** 0.5h
**Dependencies:** none
**Parallel with:** nothing initially; unblocks T0.1

Write Jest tests that:
- Assert the Drizzle schema object for `instance` includes `phaseServiceToken` column of type `text`
- Assert a round-trip insert + select of a record with `phaseServiceToken` set returns the stored value
- Assert `phaseServiceToken` is not included in the default API select projection (never returned to clients)

Run tests — confirm RED before proceeding to T0.1.

**Acceptance Criteria:**
- [ ] Tests exist in `src/db/__tests__/schema.test.ts` (or equivalent)
- [ ] All three tests fail with "column does not exist" or type error — confirmed RED
- [ ] No implementation code written yet

---

### Task T0.1: Schema migration — add `phaseServiceToken` to instance table
**Status:** 🔴 Blocked by T0.1t
**Effort:** 0.5h
**Dependencies:** T0.1t

Generate and apply Drizzle migration adding `phase_service_token text` to the `instance` table. Update `src/db/schema.ts`. Run `tsc --noEmit` to confirm types resolve.

**Acceptance Criteria:**
- [ ] `drizzle-kit generate` produces a migration file with `ALTER TABLE instance ADD COLUMN phase_service_token text`
- [ ] `src/db/schema.ts` instance object includes `phaseServiceToken: text("phase_service_token")`
- [ ] `tsc --noEmit` passes with no new errors (quality gate)
- [ ] T0.1t tests pass — confirmed GREEN

---

### Task T0.2t: Write failing tests for updated ProvisionParams
**Status:** 🟡 Ready
**Effort:** 0.5h
**Dependencies:** none
**Parallel with:** T0.1t

Write Jest tests in `src/lib/__tests__/provisioner.test.ts` (or equivalent) that:
- Assert `ProvisionParams` type includes `subdomain: string`
- Assert `ProvisionParams` type does NOT include `gatewayPort` or `dashboardTokenHash`
- Assert `provisionerClient.provision()` serializes `subdomain` into the request body
- Assert a call missing `subdomain` fails Zod validation

Run tests — confirm RED.

**Acceptance Criteria:**
- [ ] Tests exist and are confirmed RED before any code change
- [ ] Tests cover both type shape and runtime serialization

---

### Task T0.2: Update `ProvisionParams` in `src/lib/provisioner.ts`
**Status:** 🔴 Blocked by T0.2t
**Effort:** 0.5h
**Dependencies:** T0.2t

Replace `gatewayPort: number` and `dashboardTokenHash: string` with `subdomain: string` in `ProvisionParams`. Update Zod validation schema if present. No other changes to provisioner client.

**Acceptance Criteria:**
- [ ] `ProvisionParams` interface/type has `subdomain: string`, no `gatewayPort`, no `dashboardTokenHash`
- [ ] `tsc --noEmit` passes
- [ ] T0.2t tests pass — confirmed GREEN

---

### Task T0.3t: Write failing tests for callback route phaseServiceToken handling
**Status:** 🟡 Ready
**Effort:** 0.5h
**Dependencies:** T0.1 (schema must exist for DB assertions)
**Parallel with:** T0.2

Write Jest tests for `src/app/api/provisioner/callback/route.ts` that:
- Assert a `running` callback payload containing `phaseServiceToken` stores the token on the instance record
- Assert `phaseServiceToken` is never echoed back in the HTTP response
- Assert a `running` callback without `phaseServiceToken` field still succeeds (backwards compat)
- Assert the stored value is retrievable via DB query (not via API response)

Run tests — confirm RED.

**Acceptance Criteria:**
- [ ] Tests confirmed RED before T0.3 implementation begins
- [ ] Test covers: token stored in DB, token not leaked in response, missing token handled gracefully

---

### Task T0.3: Update callback route to store `phaseServiceToken`
**Status:** 🔴 Blocked by T0.3t, T0.1
**Effort:** 0.5h
**Dependencies:** T0.3t, T0.1

In `src/app/api/provisioner/callback/route.ts`: extract `phaseServiceToken` from the callback body when `status === "running"`. Store it on the instance record via `updateInstanceStatus()` (or equivalent DB update). Never log the token value, never include it in the HTTP response.

**Acceptance Criteria:**
- [ ] `phaseServiceToken` extracted from callback body and stored on `instance` row
- [ ] Token value absent from all log output
- [ ] Token absent from HTTP response body
- [ ] T0.3t tests pass — confirmed GREEN
- [ ] `tsc --noEmit` passes

---

## Phase 1 — Stripe Webhook Wiring (Platform)

### Task T1.1t: Write failing tests for `checkout.session.completed` → provision
**Status:** 🔴 Blocked by T0.2 (ProvisionParams shape must be final)
**Effort:** 1h
**Dependencies:** T0.2

Write Jest tests for `src/app/api/stripe/webhook/route.ts` covering `checkout.session.completed`:
- Valid signature + valid payload → `provisionerClient.provision()` called with correct `ProvisionParams` (tenantId, subdomain, plan, callbackUrl)
- Valid signature + valid payload → instance status set to `provisioning` before provision call
- Invalid signature → 400, `provision()` never called
- Missing required fields on session → 400, `provision()` never called
- Use Stripe test fixture and mocked `constructEvent`

Run tests — confirm RED.

**Acceptance Criteria:**
- [ ] Tests use Stripe test webhook fixture + `stripe.webhooks.constructEvent` mock
- [ ] At least 4 test cases: happy path, bad signature, missing tenantId, missing plan
- [ ] All tests confirmed RED

---

### Task T1.1: Wire `checkout.session.completed` to `provisionerClient.provision()`
**Status:** 🔴 Blocked by T1.1t
**Effort:** 1h
**Dependencies:** T1.1t

In `src/app/api/stripe/webhook/route.ts`, in the `checkout.session.completed` handler:
1. Extract `tenantId` from session metadata
2. Set instance status to `provisioning` + log fleet event `instance.provisioning.started`
3. Call `provisionerClient.provision({ tenantId, subdomain: \`${tenantId}.overnightdesk.com\`, plan, callbackUrl })`
4. Handle provisioner call failure: log fleet event, set status to `error`

**Acceptance Criteria:**
- [ ] `provision()` called with all four required `ProvisionParams` fields
- [ ] Instance status set to `provisioning` before provision call (not after)
- [ ] Fleet event `instance.provisioning.started` logged
- [ ] Provisioner call failure sets status to `error` and logs fleet event
- [ ] T1.1t tests pass — confirmed GREEN
- [ ] `tsc --noEmit` passes

---

### Task T1.2t: Write failing tests for `customer.subscription.deleted` → deprovision
**Status:** 🟡 Ready (can start in parallel with T1.1t if T0.2 is done)
**Effort:** 0.5h
**Dependencies:** T0.2
**Parallel with:** T1.1t

Write Jest tests for `customer.subscription.deleted` handler:
- Valid event → `provisionerClient.deprovision({ tenantId })` called
- Valid event → instance status set to `deprovisioned` after deprovision call
- Invalid signature → 400, `deprovision()` never called
- tenantId not found → 404, `deprovision()` never called

Run tests — confirm RED.

**Acceptance Criteria:**
- [ ] At least 3 test cases: happy path, bad signature, unknown tenant
- [ ] All tests confirmed RED before T1.2 begins

---

### Task T1.2: Wire `customer.subscription.deleted` to `provisionerClient.deprovision()`
**Status:** 🔴 Blocked by T1.2t
**Effort:** 0.5h
**Dependencies:** T1.2t

In `src/app/api/stripe/webhook/route.ts`, in the `customer.subscription.deleted` handler:
1. Extract `tenantId` from subscription metadata
2. Call `provisionerClient.deprovision({ tenantId })`
3. On success: set instance status to `deprovisioned`, log fleet event `instance.deprovisioned`
4. On failure: log fleet event with error detail, set status to `error`

**Acceptance Criteria:**
- [ ] `deprovision()` called with `{ tenantId }`
- [ ] Fleet event `instance.deprovisioning.started` logged before deprovision call
- [ ] Fleet event `instance.deprovisioned` logged on success
- [ ] T1.2t tests pass — confirmed GREEN
- [ ] `tsc --noEmit` passes

---

### Task T1.3t: Write failing tests for idempotency guard
**Status:** 🔴 Blocked by T1.1t, T1.2t (test patterns established)
**Effort:** 0.5h
**Dependencies:** T1.1t

Write Jest tests for idempotency behavior:
- `checkout.session.completed` for an instance already in `running` status → `provision()` NOT called, 200 returned
- `checkout.session.completed` for an instance already in `provisioning` status → `provision()` NOT called
- `checkout.session.completed` for an instance in `error` status → `provision()` IS called (retry allowed)
- `customer.subscription.deleted` for an already-`deprovisioned` instance → `deprovision()` NOT called

Run tests — confirm RED.

**Acceptance Criteria:**
- [ ] All 4 idempotency cases covered
- [ ] Tests confirm `provision()` and `deprovision()` are mock-verified as called/not-called
- [ ] Tests confirmed RED

---

### Task T1.3: Implement idempotency guard in Stripe webhook handler
**Status:** 🔴 Blocked by T1.3t
**Effort:** 0.5h
**Dependencies:** T1.3t

Before calling `provision()` or `deprovision()`, check the current instance status:
- Skip `provision()` if status is already `running` or `provisioning`
- Skip `deprovision()` if status is already `deprovisioned`
- Allow `provision()` retry if status is `error`
- Log a fleet event when a duplicate event is detected and skipped

**Acceptance Criteria:**
- [ ] Duplicate `checkout.session.completed` does not create a second provisioning run
- [ ] Duplicate `customer.subscription.deleted` does not error on already-deprovisioned instance
- [ ] Fleet event logged on skip (for observability)
- [ ] T1.3t tests pass — confirmed GREEN

---

### Quality Gate QG-1: Security review — webhook handler + callback route
**Status:** 🔴 Blocked by T1.3 (all Phase 1 complete)
**Effort:** 1h
**Dependencies:** T0.3, T1.1, T1.2, T1.3

Run `security-review` agent against:
- `src/app/api/stripe/webhook/route.ts`
- `src/app/api/provisioner/callback/route.ts`

Checklist:
- [ ] Stripe signature verified before any event processing (FR-3)
- [ ] `phaseServiceToken` never logged, never returned in API response (NFR-6)
- [ ] All user/webhook input validated with Zod before use
- [ ] No plaintext secrets in DB or logs
- [ ] Provisioner bearer token validated with timing-safe comparison
- [ ] HTTP status codes correct (400 for bad requests, 500 for server errors)
- [ ] Error responses do not leak stack traces or internal paths

**Gate:** All CRITICAL and HIGH findings from security-review must be resolved before Phase 2 begins.

---

## Phase 2 — Orchestrator: Hermes Provisioning Endpoints (Go)

> All orchestrator tasks are in the `platform-orchestrator` Go service (`~/overnightdesk-engine` or relevant Go module path). Tests use Go's standard `testing` package.

### Task T2.1t: Write failing Go tests for `/provision` endpoint
**Status:** 🟡 Ready (can start in parallel with Phase 0 platform work)
**Effort:** 1.5h
**Dependencies:** none (Go service is independent of platform schema)
**Parallel with:** T0.1t, T0.2t

Write Go test file covering `/provision` endpoint:
- Valid request with all fields → HTTP 200, provisioning goroutine launched
- Missing required fields (tenantId, subdomain) → HTTP 400
- Invalid bearer token → HTTP 401
- `tenantId` containing path traversal characters (e.g. `../foo`) → HTTP 400 (input sanitization)
- Duplicate provision request for already-running tenant → idempotent 200 (no duplicate container)
- Phase.dev unavailable → callback fired with `status: "error"`, step identified
- Container fails health check within timeout → callback fired with `status: "error"`

Use `httptest` package. Mock Phase CLI calls and Docker socket interactions.

Run `go test ./...` — confirm RED.

**Acceptance Criteria:**
- [ ] At minimum 7 test cases listed above
- [ ] Tests use `httptest.NewRecorder` and `httptest.NewServer`
- [ ] Phase CLI and Docker calls are mockable (interface or injectable function)
- [ ] All tests confirmed RED

---

### Task T2.4t: Write failing Go tests for nginx template rendering
**Status:** 🟡 Ready
**Effort:** 0.5h
**Dependencies:** none
**Parallel with:** T2.1t

Write Go tests for the nginx config template rendering function:
- Renders correct `server_name` for a given subdomain
- Renders correct `proxy_pass` target using container name convention `hermes-{tenantId}`
- Renders to a file path matching `/opt/overnightdesk/nginx/conf.d/{tenantId}.conf`
- tenantId with uppercase or path separator characters is rejected before render

Run `go test ./...` — confirm RED.

**Acceptance Criteria:**
- [ ] Template rendering function is extracted as a testable unit
- [ ] All 4 test cases confirmed RED

---

### Task T2.1: Implement `/provision` endpoint in `platform-orchestrator`
**Status:** 🔴 Blocked by T2.1t, QG-1 (security review must pass before orchestrator ships)
**Effort:** 4h
**Dependencies:** T2.1t, QG-1

Implement the 12-step provision flow (per plan.md Phase 2.1) in the orchestrator's `/provision` handler. Each step must be idempotent on `tenantId`. Steps:

1. Validate request — tenantId (`^[a-z0-9-]+$`), subdomain, plan, callbackUrl required
2. Create Phase.dev path: `phase secrets create --path /{tenantId}` (no-op if exists)
3. Create Phase service token: `phase tokens create --path /{tenantId}` — capture token
4. Create data dir: `mkdir -p /opt/{tenantId}/bin`
5. Copy startup script: write `start-all.sh` to `/opt/{tenantId}/bin/start-all.sh`, `chmod +x`
6. Export secrets: `phase secrets export --path /{tenantId} > /opt/{tenantId}/.env`, `chmod 600`
7. Start container via Docker socket proxy (with full security baseline: `--user 10000:10000`, network, resource limits, seccomp/AppArmor profiles)
8. Health check poll: GET `http://hermes-{tenantId}:9119/api/status` — 30s timeout, 5s interval
9. Write nginx config from template (covered by T2.4)
10. Reload nginx: `docker exec overnightdesk-nginx nginx -t && nginx -s reload`
11. Issue TLS cert via certbot
12. Fire success callback: POST to callbackUrl with `{ tenantId, status: "running", containerId, phaseServiceToken }`

On any step failure: remove nginx config if written, fire error callback with step name + detail.

Log a fleet-event-compatible struct at each step for observability.

**Acceptance Criteria:**
- [ ] All 12 steps implemented
- [ ] tenantId validated against `^[a-z0-9-]+$` before use in any file path or command
- [ ] Error at any step triggers cleanup (nginx config removed) and error callback
- [ ] `phase secrets export → .env` not skipped — secrets injected via Phase, not hardcoded
- [ ] Container started with security baseline (no `--privileged`, cap-drop specified)
- [ ] T2.1t tests pass — confirmed GREEN
- [ ] `go build ./...` passes

---

### Task T2.4: Implement nginx config template rendering in orchestrator
**Status:** 🔴 Blocked by T2.4t
**Effort:** 0.5h
**Dependencies:** T2.4t
**Parallel with:** T2.1 (can be implemented alongside Step 9 of T2.1)

Extract nginx template rendering as a standalone function. Template is based on `infra/nginx/aero-fett.conf` with two substitution variables: `{{.Subdomain}}` and `{{.ContainerName}}`. Write rendered config to `/opt/overnightdesk/nginx/conf.d/{tenantId}.conf`.

**Acceptance Criteria:**
- [ ] Template rendering is a pure function (testable in isolation)
- [ ] Output path follows `{tenantId}.conf` convention
- [ ] tenantId sanitized before use in path
- [ ] T2.4t tests pass — confirmed GREEN

---

### Task T2.2t: Write failing Go tests for `/deprovision` endpoint
**Status:** 🔴 Blocked by T2.1t (patterns established)
**Effort:** 0.5h
**Dependencies:** T2.1t

Write Go tests for `/deprovision`:
- Valid request → container stopped, nginx config removed, callback with `status: "deprovisioned"` fired
- Container already stopped → no error, nginx config still removed
- nginx config already removed → no error, still proceeds to callback
- Data directory `/opt/{tenantId}/` is NOT removed after deprovision

Run `go test ./...` — confirm RED.

**Acceptance Criteria:**
- [ ] All 4 cases covered
- [ ] Data directory preservation explicitly tested (directory exists after deprovision)
- [ ] Tests confirmed RED

---

### Task T2.2: Implement `/deprovision` endpoint in `platform-orchestrator`
**Status:** 🔴 Blocked by T2.2t, T2.1 (must be complete to reuse shared infrastructure)
**Effort:** 1.5h
**Dependencies:** T2.2t, T2.1

Implement deprovision handler:
1. Validate request — tenantId required
2. Stop and remove container: `docker stop hermes-{tenantId} && docker rm hermes-{tenantId}` (idempotent — ignore "not found")
3. Remove nginx config: `rm /opt/overnightdesk/nginx/conf.d/{tenantId}.conf` (idempotent — ignore "not found")
4. Reload nginx
5. Preserve data: `/opt/{tenantId}/` left on disk — no deletion
6. Fire callback: POST to callbackUrl with `{ tenantId, status: "deprovisioned" }`

**Acceptance Criteria:**
- [ ] Data directory preservation: `/opt/{tenantId}/` not deleted
- [ ] Idempotent: re-running against already-deprovisioned tenant does not error
- [ ] Fleet event logged at each step
- [ ] T2.2t tests pass — confirmed GREEN
- [ ] `go build ./...` passes

---

### Task T2.3t: Write failing Go tests for `/restart` endpoint (hermes)
**Status:** 🔴 Blocked by T2.1t (patterns established)
**Effort:** 0.5h
**Dependencies:** T2.1t
**Parallel with:** T2.2t

Write Go tests for `/restart` updated for hermes containers:
- Valid request → `docker restart hermes-{tenantId}` called
- Health check passes after restart → `{ success: true }` returned
- Health check fails after restart → `{ success: false, error: "health check timeout" }` returned
- Container not found → `{ success: false, error: "container not found" }` returned

Run `go test ./...` — confirm RED.

**Acceptance Criteria:**
- [ ] All 4 cases covered
- [ ] Health check poll logic is the same as used in `/provision` (shared function)
- [ ] Tests confirmed RED

---

### Task T2.3: Update `/restart` endpoint for hermes container naming
**Status:** 🔴 Blocked by T2.3t
**Effort:** 0.5h
**Dependencies:** T2.3t
**Parallel with:** T2.2

Update `/restart` handler to:
1. Restart container named `hermes-{tenantId}` (not old Go daemon naming convention)
2. Poll health endpoint `http://hermes-{tenantId}:9119/api/status` (same as provision step 8)
3. Return `{ success: true }` if healthy, `{ success: false, error: "..." }` if timeout

Extract health check poll into shared function reused by both `/provision` and `/restart`.

**Acceptance Criteria:**
- [ ] Container name uses `hermes-{tenantId}` convention
- [ ] Health check function is shared with `/provision` step 8 (no duplication)
- [ ] T2.3t tests pass — confirmed GREEN
- [ ] `go build ./...` passes

---

### Quality Gate QG-2: Orchestrator integration test suite passes
**Status:** 🔴 Blocked by T2.1, T2.2, T2.3, T2.4
**Effort:** 0.5h
**Dependencies:** T2.1, T2.2, T2.3, T2.4

Run full Go test suite for `platform-orchestrator`:

```bash
go test ./... -v -count=1
```

Checklist:
- [ ] All unit tests pass (T2.1t, T2.2t, T2.3t, T2.4t)
- [ ] `go vet ./...` clean
- [ ] No race conditions detected (`go test -race ./...`)
- [ ] Test coverage on new handlers ≥ 80% (`go test -cover ./...`)

**Gate:** Must pass before Phase 3 integration tests begin.

---

## Phase 3 — End-to-End Verification

> Integration tests for the full platform + orchestrator flow. These tests run against a test environment (not production). Stripe CLI used for webhook simulation.

### Task T3.1: Integration test — full provision flow
**Status:** 🔴 Blocked by QG-2, T0.3 (callback update must be in place)
**Effort:** 1h
**Dependencies:** QG-2, T0.3

Write integration test (Jest + test DB instance):
1. Create instance record in DB with `status: queued`
2. POST to `/api/stripe/webhook` with `checkout.session.completed` test fixture (valid signature)
3. Verify: `provisionerClient.provision()` called with correct params
4. Simulate orchestrator callback POST to `/api/provisioner/callback` with `{ status: "running", phaseServiceToken: "test-token" }`
5. Assert: instance `status === "running"` in DB
6. Assert: `phaseServiceToken` stored on instance record
7. Assert: fleet events `instance.provisioning.started` and `instance.running` exist

**Acceptance Criteria:**
- [ ] Full provision cycle exercised end-to-end (Stripe event → callback → DB state)
- [ ] `phaseServiceToken` stored and not exposed in API response
- [ ] Fleet events written at correct transitions
- [ ] Test passes

---

### Task T3.2: Integration test — deprovision flow
**Status:** 🔴 Blocked by T3.1 (setup patterns established)
**Effort:** 0.5h
**Dependencies:** T3.1
**Parallel with:** T3.3

Write integration test:
1. Start from instance with `status: running`
2. POST to `/api/stripe/webhook` with `customer.subscription.deleted` test fixture
3. Simulate orchestrator callback with `{ status: "deprovisioned" }`
4. Assert: instance `status === "deprovisioned"` in DB
5. Assert: fleet event `instance.deprovisioned` exists with `dataPreservedAt` timestamp

**Acceptance Criteria:**
- [ ] Full deprovision cycle exercised
- [ ] Fleet event contains `dataPreservedAt` timestamp
- [ ] Test passes

---

### Task T3.3: Integration test — idempotency (duplicate Stripe events)
**Status:** 🔴 Blocked by T3.1
**Effort:** 0.5h
**Dependencies:** T3.1
**Parallel with:** T3.2

Write integration test:
1. POST `checkout.session.completed` twice with the same session ID
2. Assert: `provisionerClient.provision()` called exactly once (mock spy)
3. Assert: only one instance record created
4. Assert: fleet event for duplicate event logged (not an error — expected behavior)

**Acceptance Criteria:**
- [ ] `provision()` called exactly once despite two events
- [ ] No duplicate instance record
- [ ] Idempotency skip event logged
- [ ] Test passes

---

### Task T3.4: Integration test — Stripe webhook E2E via Stripe CLI
**Status:** 🔴 Blocked by T3.1, T3.2, T3.3
**Effort:** 1h
**Dependencies:** T3.1, T3.2, T3.3

Using Stripe CLI in test mode:
```bash
stripe trigger checkout.session.completed --add checkout_session:metadata.tenantId=test-tenant
```

Assert full flow is triggered. This test requires a running local Next.js dev server and a test instance in the DB.

**Acceptance Criteria:**
- [ ] Stripe CLI event triggers provisioner call (logged or asserted via mock)
- [ ] Webhook signature verification passes with test secret
- [ ] Instance record status progresses from `queued` → `provisioning` in DB
- [ ] Test is documented in a test script or README section for repeatability

---

### Quality Gate QG-3: Full integration suite passes
**Status:** 🔴 Blocked by T3.1, T3.2, T3.3, T3.4
**Effort:** 0.5h
**Dependencies:** T3.1, T3.2, T3.3, T3.4

Run full Jest test suite:
```bash
npx jest --coverage
```

Checklist:
- [ ] All T3.x tests pass
- [ ] All T0.x and T1.x tests still pass (regression)
- [ ] Overall coverage on new platform files ≥ 80% (constitution requirement)
- [ ] No `console.log` statements in production code (hooks audit)
- [ ] `tsc --noEmit` clean

**Gate:** Must pass before QG-4.

---

### Quality Gate QG-4: End-to-end flow verified (Stripe test event → running instance)
**Status:** 🔴 Blocked by QG-3
**Effort:** 0.5h
**Dependencies:** QG-3

Manual verification checklist (run once against staging/test environment):

- [ ] Send `checkout.session.completed` Stripe test event
- [ ] Instance status progresses: `queued → provisioning → running` visible in DB
- [ ] Callback route stores `phaseServiceToken` on instance record
- [ ] Fleet events exist for every state transition
- [ ] No duplicate instance created if event is resent
- [ ] Send `customer.subscription.deleted` Stripe test event
- [ ] Instance status transitions to `deprovisioned`
- [ ] Data directory preserved (not deleted)
- [ ] All findings from QG-1 security review confirmed resolved

**Gate:** All items checked before feature marked complete.

---

## Effort Summary

| Phase | Tasks | Estimated Effort |
|---|---|---|
| Phase 0 — Schema + ProvisionParams | T0.1t, T0.1, T0.2t, T0.2, T0.3t, T0.3 | 3h |
| Phase 1 — Stripe Webhook Wiring | T1.1t, T1.1, T1.2t, T1.2, T1.3t, T1.3, QG-1 | 5.5h |
| Phase 2 — Orchestrator Endpoints | T2.1t, T2.1, T2.2t, T2.2, T2.3t, T2.3, T2.4t, T2.4, QG-2 | 10h |
| Phase 3 — Integration Tests | T3.1, T3.2, T3.3, T3.4, QG-3, QG-4 | 4h |
| **Total** | **26 tasks** | **~18h** |

> Note: Estimated effort is higher than the plan's 13h estimate due to the TDD requirement (test tasks precede each implementation task) and quality gates. The plan estimated implementation only.
