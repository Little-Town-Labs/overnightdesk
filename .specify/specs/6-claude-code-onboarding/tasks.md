# Task Breakdown — Feature 6: Claude Code Onboarding

**Branch:** 6-claude-code-onboarding
**Created:** 2026-03-22

---

## Phase 1: Schema + Engine Client

### Task 1.1: Engine Client — Tests
**Status:** 🟡 Ready
**Effort:** 1.5 hours
**Dependencies:** None

**Description:**
Write tests for engine API client. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for `getAuthStatus(subdomain, apiKey)`:
  - Returns "authenticated" when engine reports authenticated
  - Returns "not_authenticated" when engine reports not_authenticated
  - Returns "unknown" when engine is unreachable
  - Sends correct Authorization header (Bearer token)
- [ ] Tests for `getTerminalTicket(subdomain, apiKey)`:
  - Returns ticket string on success
  - Returns null when engine is unreachable
  - Sends correct Authorization header
- [ ] All tests confirmed to FAIL

---

### Task 1.2: Engine Client — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 1 hour
**Dependencies:** Task 1.1

**Acceptance Criteria:**
- [ ] `src/lib/engine-client.ts` exports getAuthStatus() and getTerminalTicket()
- [ ] Uses native fetch with timeout
- [ ] All tests from 1.1 pass

---

### Task 1.3: Schema Migration + Instance Update
**Status:** 🟡 Ready
**Effort:** 1 hour
**Dependencies:** None
**Parallel with:** Task 1.1

**Acceptance Criteria:**
- [ ] Add `engineApiKey` column to instance table in schema.ts
- [ ] Generate migration with `drizzle-kit generate`
- [ ] Update `createInstance()` in instance.ts to generate + store engineApiKey
- [ ] engineApiKey is a random hex string (32 bytes) separate from bearer token
- [ ] Build passes with schema change

---

## Phase 2: API Routes

### Task 2.1: API Routes — Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 2 hours
**Dependencies:** Task 1.2

**Acceptance Criteria:**
- [ ] Tests for `GET /api/instance/auth-status`:
  - Unauthenticated → 401
  - No instance → 404
  - Instance not running → returns current DB status without engine call
  - Instance running → proxies to engine, returns mapped status
  - Updates claudeAuthStatus in DB when status changes
- [ ] Tests for `POST /api/instance/terminal-ticket`:
  - Unauthenticated → 401
  - No instance → 404
  - Instance not running → 409
  - Instance running → returns ticket + wsUrl
  - Engine unreachable → 502
- [ ] All tests confirmed to FAIL

---

### Task 2.2: API Routes — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 1.5 hours
**Dependencies:** Task 2.1

**Acceptance Criteria:**
- [ ] `src/app/api/instance/auth-status/route.ts` — GET handler
- [ ] `src/app/api/instance/terminal-ticket/route.ts` — POST handler
- [ ] Both routes verify Better Auth session
- [ ] Both routes find instance and check status
- [ ] Auth status route updates claudeAuthStatus on change
- [ ] Terminal ticket route returns wsUrl with subdomain
- [ ] All tests from 2.1 pass

---

## Phase 3: Frontend Components

### Task 3.1: Install xterm.js + Create Terminal Component
**Status:** 🔴 Blocked by 2.2
**Effort:** 2 hours
**Dependencies:** Task 2.2

**Acceptance Criteria:**
- [ ] Install `@xterm/xterm`, `@xterm/addon-attach`, `@xterm/addon-fit`
- [ ] `src/app/(protected)/dashboard/terminal-embed.tsx` — client component:
  - Creates xterm.js Terminal instance
  - Connects via WebSocket using ticket
  - Uses FitAddon for responsive sizing
  - Handles disconnect with error message + retry button
  - Cleans up on unmount (dispose terminal, close WebSocket)
- [ ] Dark theme matching dashboard (zinc-950 background)
- [ ] Build passes

---

### Task 3.2: Auth Status Badge + Onboarding Wizard
**Status:** 🔴 Blocked by 2.2
**Effort:** 2 hours
**Dependencies:** Task 2.2
**Parallel with:** Task 3.1

**Acceptance Criteria:**
- [ ] `src/app/(protected)/dashboard/auth-status-badge.tsx` — client component:
  - Green dot + "Connected" for connected
  - Amber dot + "Expired" for expired
  - Gray dot + "Not Configured" for not_configured
- [ ] `src/app/(protected)/dashboard/onboarding-wizard.tsx` — client component:
  - 3-step wizard UI (Connect → Log in → Done)
  - Step 1: Privacy notice + "Connect" button
  - Step 2: Embedded terminal (mounts TerminalEmbed)
  - Step 3: Success confirmation
  - Polls auth status every 30s during Step 2
  - Auto-advances to Step 3 when auth status becomes "connected"
  - "Reconnect" variant for expired status
- [ ] Privacy notice: "You're logging into YOUR Claude Code account. We never see your credentials."
- [ ] Mobile responsive

---

### Task 3.3: Dashboard Integration
**Status:** 🔴 Blocked by 3.1, 3.2
**Effort:** 1.5 hours
**Dependencies:** Tasks 3.1, 3.2

**Acceptance Criteria:**
- [ ] Dashboard page updated:
  - Shows AuthStatusBadge in instance status card
  - Shows OnboardingWizard when instance is running + auth not configured
  - Shows OnboardingWizard in reconnect mode when auth expired
  - Hides onboarding when auth is connected
- [ ] Instance status card shows auth status alongside provisioning status
- [ ] Dashboard placeholder text removed ("More dashboard features coming soon")

---

## Phase 4: Quality Gates

### Task 4.1: Build + Test Verification
**Status:** 🔴 Blocked by 3.3
**Effort:** 1 hour
**Dependencies:** All previous tasks

**Acceptance Criteria:**
- [ ] All tests pass (`npm test`)
- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors
- [ ] xterm.js CSS imported correctly
- [ ] Existing Feature 4 and 5 tests still pass
- [ ] Code coverage >= 80% for new backend code

---

## Dependency Graph

```
Phase 1:
  1.1 (engine tests) ──► 1.2 (engine impl)
  1.3 (schema + migration)
  [1.1 and 1.3 in parallel]

Phase 2:
  1.2 + 1.3 ──► 2.1 (API tests) ──► 2.2 (API impl)

Phase 3:
  2.2 ──► 3.1 (terminal component)
  2.2 ──► 3.2 (badge + wizard)
  3.1 + 3.2 ──► 3.3 (dashboard integration)

Phase 4:
  3.3 ──► 4.1 (verification)
```

**Parallelization:**
- Tasks 1.1 and 1.3 (both ready, independent)
- Tasks 3.1 and 3.2 (both depend on 2.2, independent of each other)

---

## Critical Path

```
1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.3 → 4.1
```

**Critical path effort:** 1.5 + 1 + 2 + 1.5 + 2 + 1.5 + 1 = **10.5 hours**
**Total effort:** **13.5 hours**

---

## User Story → Task Mapping

| User Story | Tasks |
|-----------|-------|
| US-1: Connect Claude Code | 1.1-1.3, 2.1-2.2, 3.1-3.3 |
| US-2: View Auth Status | 1.1-1.2, 2.1-2.2, 3.2-3.3 |
| US-3: Re-authenticate | 2.1-2.2, 3.2-3.3 |
| US-4: Guided Onboarding | 3.2-3.3 |
| US-5: Privacy Assurance | 3.2 |
