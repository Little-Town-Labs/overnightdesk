# Task Breakdown — Feature 5: Provisioning Pipeline

**Branch:** 5-provisioning-pipeline
**Plan:** .specify/specs/5-provisioning-pipeline/plan.md
**Created:** 2026-03-22

---

## Phase 1: Instance Management Utilities (Vercel)

### Task 1.1: Instance Management — Tests
**Status:** 🟡 Ready
**Effort:** 2 hours
**Dependencies:** None
**User Stories:** US-1, US-2, US-5

**Description:**
Write tests for instance management utilities. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for `generateTenantId(userId)`:
  - Returns first 12 chars of userId
  - Result is URL-safe (lowercase alphanumeric)
  - Deterministic (same userId → same tenantId)
- [ ] Tests for `allocatePort()`:
  - Returns first available port in 4000-4999
  - Skips already-allocated ports
  - Throws when all ports exhausted
  - Atomic: concurrent calls allocate different ports (transaction-based)
- [ ] Tests for `generateBearerToken()`:
  - Returns 64-char hex string (32 bytes)
  - Successive calls return different tokens
- [ ] Tests for `hashToken(token)`:
  - Returns bcrypt hash string
  - Hash starts with `$2b$`
- [ ] Tests for `createInstance(userId, plan)`:
  - Creates instance record with status "queued"
  - Sets tenantId, gatewayPort, dashboardTokenHash, subdomain ({tenantId}.overnightdesk.com)
  - Logs fleet event "instance.queued"
  - Returns instance record + plaintext token
  - Idempotent: calling twice for same userId returns existing instance
  - Plaintext token only exists in return value (not persisted)
- [ ] Tests for `updateInstanceStatus(tenantId, status, details?)`:
  - Updates instance status
  - Logs fleet event with details
  - Sets provisionedAt when status is "running"
  - Sets deprovisionedAt when status is "deprovisioned"
  - Note: "awaiting_auth" transition is owned by Feature 6 (Claude Code Onboarding) — provisioner sets "running" after health check, Feature 6 manages auth status separately via claudeAuthStatus column
- [ ] All tests confirmed to FAIL

---

### Task 1.2: Instance Management — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 2 hours
**Dependencies:** Task 1.1

**Description:**
Implement instance management utilities to pass tests from Task 1.1.

**Acceptance Criteria:**
- [ ] `src/lib/instance.ts` exports all functions
- [ ] Uses crypto.randomBytes for token generation
- [ ] Uses bcrypt for token hashing
- [ ] All tests from 1.1 pass

---

### Task 1.3: Provisioner Client — Tests
**Status:** 🟡 Ready
**Effort:** 1.5 hours
**Dependencies:** None
**Parallel with:** Task 1.1
**User Stories:** US-1, US-6

**Description:**
Write tests for the provisioner HTTP client. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for `provisionerClient.provision(params)`:
  - Sends correct POST body (tenantId, plan, gatewayPort, dashboardTokenHash, callbackUrl)
  - Includes Authorization header with PROVISIONER_SECRET
  - Returns success on 202 response
  - Handles timeout (120s)
  - Handles network error gracefully (returns error, doesn't throw)
- [ ] Tests for `provisionerClient.deprovision(tenantId)`:
  - Sends correct POST body (tenantId)
  - Includes Authorization header
  - Returns success on 200 response
  - Handles error response gracefully
- [ ] All tests confirmed to FAIL

---

### Task 1.4: Provisioner Client — Implementation
**Status:** 🔴 Blocked by 1.3
**Effort:** 1 hour
**Dependencies:** Task 1.3

**Description:**
Implement provisioner HTTP client to pass tests from Task 1.3.

**Acceptance Criteria:**
- [ ] `src/lib/provisioner.ts` exports provision() and deprovision()
- [ ] Uses native fetch with timeout via AbortController
- [ ] Reads PROVISIONER_URL and PROVISIONER_SECRET from env
- [ ] All tests from 1.3 pass

---

## Phase 2: Webhook Extensions + Callback (Vercel)

### Task 2.1: Webhook Extension + Callback — Tests
**Status:** 🔴 Blocked by 1.2, 1.4
**Effort:** 3 hours
**Dependencies:** Tasks 1.2, 1.4
**User Stories:** US-1, US-6, US-7

**Description:**
Write tests for webhook extensions and callback endpoint. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for extended `handleCheckoutCompleted()`:
  - After subscription creation, creates instance record
  - Fires provisioner.provision() (mocked — verify call args)
  - Instance created with status "queued"
  - Fleet event logged
  - Idempotent: second call doesn't create duplicate instance
- [ ] Tests for extended `handleSubscriptionDeleted()`:
  - Finds user's instance
  - Fires provisioner.deprovision() (mocked)
  - Updates instance status to "stopped"
  - Logs fleet event
  - Handles case where no instance exists (no-op)
  - Note: Stripe fires `customer.subscription.deleted` at billing period end (not immediately on cancel). Deprovisioning happens when Stripe fires this event, so timing is correct per FR-12.
- [ ] Tests for `POST /api/provisioner/callback`:
  - Valid secret + status "running" → updates instance, sends provisioning email with subdomain and bearer token
  - Valid secret + status "error" → updates instance to error, logs fleet event
  - Valid secret + status "deprovisioned" → updates instance, sets deprovisionedAt
  - Invalid secret → 401
  - Unknown tenantId → 404
  - Sets provisionedAt on "running" status
  - Plaintext token cleared from memory after email send
- [ ] All tests confirmed to FAIL

---

### Task 2.2: Webhook Extension + Callback — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 3 hours
**Dependencies:** Task 2.1

**Description:**
Implement webhook extensions and callback endpoint to pass tests from Task 2.1.

**Acceptance Criteria:**
- [ ] `handleCheckoutCompleted()` extended with instance creation + provisioner call
- [ ] `handleSubscriptionDeleted()` extended with deprovisioning
- [ ] `src/app/api/provisioner/callback/route.ts` — POST handler
  - Verifies PROVISIONER_SECRET
  - Updates instance status
  - Sends welcome email (sendProvisioningEmail from Feature 3)
  - Logs fleet events
- [ ] All tests from 2.1 pass
- [ ] Existing Feature 4 tests still pass (no regression)

---

## Phase 3: Oracle Cloud Provisioner

### Task 3.1: Adapt Shell Scripts from ironclaw-saas
**Status:** 🔴 Blocked by 2.2
**Effort:** 3 hours
**Dependencies:** Task 2.2 (need to understand callback contract)
**User Stories:** US-3, US-4, US-5

**Description:**
Copy and adapt provisioning shell scripts from ironclaw-saas.

**Acceptance Criteria:**
- [ ] `provisioner/scripts/lib.sh` — adapted from ironclaw-saas:
  - Updated paths for overnightdesk
  - Updated domain to overnightdesk.com
  - Removed Postgres-specific functions
- [ ] `provisioner/scripts/container-defaults.sh` — adapted:
  - Updated network name
  - Updated security flags (plan-based resource limits)
  - Starter: 256m memory, 0.25 cpus
  - Pro: 512m memory, 0.5 cpus
- [ ] `provisioner/scripts/provision-tenant.sh` — adapted:
  - Removed PostgreSQL schema creation
  - Removed BYOK encryption
  - Changed image to overnightdesk-engine
  - Updated mounts for Go daemon (/data for SQLite + workspace)
  - Passes bearer token hash as container env var
  - Sends callback to Vercel on completion/failure
- [ ] `provisioner/scripts/deprovision-tenant.sh` — adapted:
  - Removes container and nginx config
  - Preserves data directory
  - No DB status update (Vercel handles via webhook)
- [ ] `provisioner/scripts/purge-expired.sh` — new:
  - Finds data directories older than 30 days (deprovisioned)
  - Permanently deletes them
  - Logs actions
- [ ] DRY_RUN=true works for all scripts
- [ ] Health check: TCP probe every 2s for 60s (30 retries max), cleanup on timeout
- [ ] Resource limits verified: Starter (--memory=256m --cpus=0.25), Pro (--memory=512m --cpus=0.5)
- [ ] Provisioning failure cleanup: remove container and nginx config if any step fails
- [ ] Deprovisioning sends callback with status "deprovisioned" to Vercel
- [ ] Idempotent: provision script checks for existing container before creating

---

### Task 3.2: Adapt Provisioner HTTP Server
**Status:** 🔴 Blocked by 3.1
**Effort:** 2 hours
**Dependencies:** Task 3.1

**Description:**
Adapt provisioner/index.js from ironclaw-saas for OvernightDesk.

**Acceptance Criteria:**
- [ ] `provisioner/index.js` — Express server:
  - POST /provision with shared secret auth
  - POST /deprovision with shared secret auth
  - GET /health (no auth)
  - Responds immediately (202), runs provisioning async
  - Calls provision-tenant.sh with params
  - Sends callback to Vercel on completion
  - Graceful shutdown with in-flight tracking
- [ ] `provisioner/package.json` — minimal dependencies (express)
- [ ] `provisioner/Dockerfile` — Node.js + bash + docker CLI
- [ ] `provisioner/nginx/templates/nginx.conf.template` — adapted for overnightdesk.com

---

## Phase 4: Dashboard Status Display

### Task 4.1: Dashboard Instance Status
**Status:** 🔴 Blocked by 2.2
**Effort:** 1.5 hours
**Dependencies:** Task 2.2
**User Stories:** US-2

**Description:**
Add instance provisioning status to the dashboard.

**Acceptance Criteria:**
- [ ] Dashboard shows instance status card:
  - Queued: "Setting up your instance..."
  - Provisioning: "Creating your container..."
  - Awaiting auth: "Connect your Claude Code account"
  - Running: "Your assistant is live" with subdomain link
  - Error: "Setup failed" with support message
  - No instance: "Subscribe to get started" (links to /pricing)
- [ ] Status auto-refreshes (polling or page reload prompt)
- [ ] Dark theme consistent with existing dashboard
- [ ] Mobile responsive

---

## Phase 5: Quality Gates

### Task 5.1: Security Review
**Status:** 🔴 Blocked by 2.2, 3.2
**Effort:** 1 hour
**Dependencies:** Tasks 2.2, 3.2

**Description:**
Security review on all provisioning code.

**Acceptance Criteria:**
- [ ] Bearer token generation uses sufficient entropy (256 bits)
- [ ] Token stored hashed (bcrypt), never plaintext in DB
- [ ] Provisioner secret validated on all endpoints
- [ ] Container hardening flags verified (read-only, cap-drop, etc.)
- [ ] No secrets in container inspect (env vars from files)
- [ ] Callback endpoint validates auth before processing

---

### Task 5.2: Build Verification + Test Suite
**Status:** 🔴 Blocked by all Phase 4
**Effort:** 1 hour
**Dependencies:** All previous tasks

**Description:**
Final verification.

**Acceptance Criteria:**
- [ ] All tests pass (`npm test`)
- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors
- [ ] No console.log in production code
- [ ] Existing Feature 4 tests still pass
- [ ] Code coverage >= 80% for new Vercel-side code

---

## Dependency Graph

```
Phase 1 (Utilities):
  1.1 (instance tests) ──► 1.2 (instance impl)
  1.3 (provisioner tests) ──► 1.4 (provisioner impl)
  [1.1 and 1.3 run in parallel]

Phase 2 (Webhooks + Callback):
  1.2 + 1.4 ──► 2.1 (webhook/callback tests) ──► 2.2 (webhook/callback impl)

Phase 3 (Oracle Provisioner):
  2.2 ──► 3.1 (shell scripts) ──► 3.2 (HTTP server)

Phase 4 (Dashboard):
  2.2 ──► 4.1 (status display)
  [4.1 runs in parallel with Phase 3]

Phase 5 (Quality):
  2.2 + 3.2 ──► 5.1 (security)
  4.1 + 5.1 ──► 5.2 (final verification)
```

**Parallelization:**
- Tasks 1.1 and 1.3 (both ready, independent)
- Tasks 3.1 and 4.1 (after 2.2, independent of each other)

---

## Critical Path

```
1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 5.1 → 5.2
```

**Critical path effort:** 2 + 2 + 3 + 3 + 3 + 2 + 1 + 1 = **17 hours**
**Total effort (all tasks):** **24 hours**
**With parallelization:** ~**19 hours**

---

## User Story → Task Mapping

| User Story | Tasks |
|-----------|-------|
| US-1: Auto Provisioning | 1.1, 1.2, 1.3, 1.4, 2.1, 2.2 |
| US-2: Track Status | 4.1 |
| US-3: Container Hardening | 3.1 |
| US-4: Subdomain Routing | 3.1, 3.2 |
| US-5: Bearer Token | 1.1, 1.2, 2.1, 2.2 |
| US-6: Deprovisioning | 1.3, 1.4, 2.1, 2.2, 3.1 |
| US-7: Failure Recovery | 2.1, 2.2, 3.1 |
