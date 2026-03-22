# Task Breakdown — Feature 7: Customer Dashboard

## Summary

- **Total Tasks:** 20
- **Phases:** 5
- **Total Effort:** 16 hours
- **Critical Path:** 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 4.2 → 5.1

---

## Phase 1: Engine Client & API Foundation

### Task 1.1: Engine Client Extension — Tests
**Status:** 🟡 Ready
**Effort:** 1.5 hours
**Dependencies:** None
**User Stories:** US-1, US-2, US-3, US-4, US-7

**Description:**
Write tests for new engine-client.ts functions. Mock fetch calls. Cover success, timeout, and error cases for each function.

**Functions to test:**
- `getEngineStatus(subdomain, apiKey)`
- `getHeartbeatConfig(subdomain, apiKey)`
- `updateHeartbeatConfig(subdomain, apiKey, config)`
- `getJobs(subdomain, apiKey, params)`
- `createJob(subdomain, apiKey, data)`
- `getJob(subdomain, apiKey, id)`
- `deleteJob(subdomain, apiKey, id)`
- `getConversations(subdomain, apiKey, params)`
- `getConversationMessages(subdomain, apiKey, id, params)`
- `getEngineLogs(subdomain, apiKey, lines)`

**Acceptance Criteria:**
- [ ] Tests for all 10 functions
- [ ] Each function tested: success, timeout (10s), error response
- [ ] Tests confirmed to FAIL

---

### Task 1.2: Engine Client Extension — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 1 hour
**Dependencies:** Task 1.1

**Description:**
Implement all engine-client.ts functions following the existing pattern (fetch with Bearer auth, 10s timeout, graceful error handling).

**Acceptance Criteria:**
- [ ] All tests from 1.1 pass
- [ ] Consistent error handling (return null/empty on failure, don't throw)
- [ ] 10s timeout on all requests
- [ ] Functions follow existing getAuthStatus/getTerminalTicket pattern

---

### Task 1.3: Engine Proxy API Routes — Tests
**Status:** 🟡 Ready
**Effort:** 1.5 hours
**Dependencies:** None
**Parallel with:** Task 1.1

**Description:**
Write tests for engine proxy API routes. Mock session, instance lookup, and engine-client calls. Test auth, validation, success, and error cases.

**Routes to test:**
- `GET /api/engine/status`
- `GET /api/engine/heartbeat`
- `PUT /api/engine/heartbeat`
- `GET /api/engine/jobs`
- `POST /api/engine/jobs`
- `GET /api/engine/jobs/[id]`
- `DELETE /api/engine/jobs/[id]`
- `GET /api/engine/conversations`
- `GET /api/engine/conversations/[id]/messages`
- `GET /api/engine/logs`
- `POST /api/engine/restart`

**Acceptance Criteria:**
- [ ] Each route tested: unauthorized (401), instance not found (404), engine unreachable (502), success (200)
- [ ] PUT heartbeat: validation errors (400)
- [ ] POST jobs: validation errors, rate limit (429)
- [ ] POST restart: rate limit (429)
- [ ] Tests confirmed to FAIL

---

### Task 1.4: Engine Proxy API Routes — Implementation
**Status:** 🔴 Blocked by 1.2, 1.3
**Effort:** 2 hours
**Dependencies:** Tasks 1.2, 1.3

**Description:**
Implement engine proxy API routes. Create shared `resolveInstance()` helper. Each route: verify session → resolve instance → call engine-client → return response.

**Acceptance Criteria:**
- [ ] All tests from 1.3 pass
- [ ] `resolveInstance()` helper extracts session + instance lookup
- [ ] Zod validation on PUT heartbeat, POST jobs
- [ ] Rate limiting on restart (5 min) and job creation (10/min)
- [ ] Consistent response format: `{ success, data?, error? }`

---

### Task 1.5: Account Management API — Tests
**Status:** 🟡 Ready
**Effort:** 0.5 hours
**Dependencies:** None
**Parallel with:** Task 1.1, 1.3

**Description:**
Write tests for account management API routes.

**Routes to test:**
- `POST /api/account/delete` — password confirmation, "DELETE" text, subscription cancellation

**Acceptance Criteria:**
- [ ] Test: unauthorized (401)
- [ ] Test: wrong password (401)
- [ ] Test: missing confirmation text (400)
- [ ] Test: successful deletion with subscription cancellation
- [ ] Tests confirmed to FAIL

---

### Task 1.6: Account Management API — Implementation
**Status:** 🔴 Blocked by 1.5
**Effort:** 0.5 hours
**Dependencies:** Task 1.5

**Description:**
Implement account deletion route. Verify password, check confirmation text, cancel Stripe subscription, delete user.

**Acceptance Criteria:**
- [ ] All tests from 1.5 pass
- [ ] Password verified against Better Auth
- [ ] Stripe subscription canceled before user deletion
- [ ] Platform audit log entry created
- [ ] User session invalidated after deletion

---

## Phase 2: Dashboard Layout & Navigation

### Task 2.1: Dashboard Layout — Tests
**Status:** 🔴 Blocked by 1.4
**Effort:** 0.5 hours
**Dependencies:** Task 1.4

**Description:**
Write tests for the dashboard layout and navigation behavior. Test that navigation renders correct tabs and highlights active route.

**Acceptance Criteria:**
- [ ] Navigation renders all 6 tabs (Overview, Heartbeat, Jobs, Activity, Logs, Settings)
- [ ] Active tab is highlighted based on current path
- [ ] Tests confirmed to FAIL

---

### Task 2.2: Dashboard Layout & Navigation — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 1 hour
**Dependencies:** Task 2.1

**Description:**
Create dashboard layout.tsx with tab navigation. Create dashboard-nav.tsx client component. Refactor existing page.tsx to work as overview tab under new layout. Move header (Welcome back, Sign Out) into layout.

**Acceptance Criteria:**
- [ ] All tests from 2.1 pass
- [ ] Layout wraps all /dashboard/* routes
- [ ] Tab navigation is responsive (horizontal on desktop, dropdown or horizontal scroll on mobile)
- [ ] Existing dashboard page content preserved as overview
- [ ] Management tabs only shown when instance status is "running"

---

## Phase 3: Heartbeat & Jobs UI

### Task 3.1: Heartbeat Configuration Page — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours
**Dependencies:** Task 2.2

**Description:**
Write tests for heartbeat form component. Test form submission, validation, loading states, and error handling.

**Acceptance Criteria:**
- [ ] Form loads current config and displays it
- [ ] Toggle enable/disable sends correct payload
- [ ] Interval validation (1 min - 24 hours)
- [ ] Success message shown after save
- [ ] Error message shown on failure
- [ ] Tests confirmed to FAIL

---

### Task 3.2: Heartbeat Configuration Page — Implementation
**Status:** 🔴 Blocked by 3.1
**Effort:** 1 hour
**Dependencies:** Task 3.1

**Description:**
Create heartbeat server page (loads config) and client form component. Interval input in human-readable units (minutes/hours). Quiet hours with start/end time pickers. Enable/disable toggle.

**Acceptance Criteria:**
- [ ] All tests from 3.1 pass
- [ ] Server component loads heartbeat config via engine-client
- [ ] Form saves via PUT /api/engine/heartbeat
- [ ] Shows last run, next run, consecutive failures
- [ ] Loading state during save

---

### Task 3.3: Job Management Page — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours
**Dependencies:** Task 2.2
**Parallel with:** Task 3.1

**Description:**
Write tests for job list, create job form, and delete job action.

**Acceptance Criteria:**
- [ ] Job list renders with pagination controls
- [ ] Create job form validates prompt (required, max 100k chars)
- [ ] Delete button only shown for pending jobs
- [ ] Empty state shown when no jobs
- [ ] Tests confirmed to FAIL

---

### Task 3.4: Job Management Page — Implementation
**Status:** 🔴 Blocked by 3.3
**Effort:** 1.5 hours
**Dependencies:** Task 3.3

**Description:**
Create jobs server page, job-list client component (with pagination), create-job-form client component, and job-detail expandable view.

**Acceptance Criteria:**
- [ ] All tests from 3.3 pass
- [ ] Server component loads initial job list
- [ ] Pagination via client-side fetch to /api/engine/jobs
- [ ] Create job submits to POST /api/engine/jobs
- [ ] Job detail shows prompt, result (if completed), error (if failed)
- [ ] Delete pending jobs via DELETE /api/engine/jobs/[id]
- [ ] Status badges color-coded (pending: amber, running: blue, completed: emerald, failed: red)

---

## Phase 4: Activity, Logs & Settings UI

### Task 4.1: Activity Log Page — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours
**Dependencies:** Task 2.2
**Parallel with:** Task 3.1, 3.3

**Description:**
Write tests for activity log list and expandable conversation detail.

**Acceptance Criteria:**
- [ ] Conversation list renders with timestamps and channel
- [ ] Expanding shows message content
- [ ] Pagination works
- [ ] Empty state shown when no activity
- [ ] Tests confirmed to FAIL

---

### Task 4.2: Activity Log Page — Implementation
**Status:** 🔴 Blocked by 4.1
**Effort:** 1 hour
**Dependencies:** Task 4.1

**Description:**
Create activity server page and activity-list client component. Expandable rows that load messages on demand.

**Acceptance Criteria:**
- [ ] All tests from 4.1 pass
- [ ] Server component loads recent conversations
- [ ] Client expands conversation to show messages (fetched on expand)
- [ ] Pagination for conversation list
- [ ] Shows channel/source for each conversation

---

### Task 4.3: Engine Logs & Instance Restart — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.25 hours
**Dependencies:** Task 2.2
**Parallel with:** Task 4.1

**Description:**
Write tests for log viewer display and restart button behavior.

**Acceptance Criteria:**
- [ ] Log viewer renders lines in monospace container
- [ ] Refresh button triggers reload
- [ ] Restart button shows confirmation dialog
- [ ] Restart button disabled state after click
- [ ] Tests confirmed to FAIL

---

### Task 4.3b: Engine Logs & Instance Restart — Implementation
**Status:** 🔴 Blocked by 4.3
**Effort:** 0.5 hours
**Dependencies:** Task 4.3

**Description:**
Create logs server page with log-viewer client component (monospace, scrollable). Add restart button to overview page with confirmation dialog.

**Acceptance Criteria:**
- [ ] All tests from 4.3 pass
- [ ] Log viewer displays last 100 lines in monospace font
- [ ] Manual refresh button reloads logs
- [ ] Restart button shows confirmation dialog
- [ ] Restart button disabled during restart and for 5 minutes after
- [ ] Success/error feedback after restart

---

### Task 4.4: Account Settings Page — Tests
**Status:** 🔴 Blocked by 1.6
**Effort:** 0.5 hours
**Dependencies:** Task 1.6
**Parallel with:** Task 4.1

**Description:**
Write tests for password change form and account deletion flow.

**Acceptance Criteria:**
- [ ] Password change requires current + new password
- [ ] Account deletion requires password + "DELETE" confirmation
- [ ] Warning message shown before deletion
- [ ] Success/error states for both actions
- [ ] Tests confirmed to FAIL

---

### Task 4.5: Account Settings Page — Implementation
**Status:** 🔴 Blocked by 4.4
**Effort:** 1 hour
**Dependencies:** Task 4.4

**Description:**
Create settings server page, change-password client component (uses Better Auth client API), change-email client component (uses Better Auth client API), delete-account client component (calls POST /api/account/delete).

**Acceptance Criteria:**
- [ ] All tests from 4.4 pass
- [ ] Email change uses Better Auth changeEmail API (triggers re-verification)
- [ ] Password change uses Better Auth changePassword API
- [ ] Account deletion flow: enter password → type "DELETE" → confirm → redirect to home
- [ ] Warning explains: subscription will be canceled, data will be deleted
- [ ] Audit log entry on account deletion

---

## Phase 5: Quality Gates

### Task 5.1: Code Review
**Status:** 🔴 Blocked by all Phase 3 & 4 tasks
**Effort:** 0.5 hours
**Dependencies:** Tasks 3.2, 3.4, 4.2, 4.3, 4.5

**Description:**
Run `/code-review` on all changed files. Address CRITICAL and HIGH issues.

**Acceptance Criteria:**
- [ ] No CRITICAL issues
- [ ] All HIGH issues addressed
- [ ] Code follows project conventions (Tailwind dark theme, response format, file size < 800 lines)

---

### Task 5.2: Security Review
**Status:** 🔴 Blocked by 5.1
**Effort:** 0.5 hours
**Dependencies:** Task 5.1

**Description:**
Run `/security-review` on account management and engine proxy routes.

**Acceptance Criteria:**
- [ ] No hardcoded secrets
- [ ] All routes authenticate properly
- [ ] Input validation complete
- [ ] Bearer tokens never exposed to client
- [ ] Account deletion properly secured

---

### Task 5.3: Build & Test Verification
**Status:** 🔴 Blocked by 5.2
**Effort:** 0.5 hours
**Dependencies:** Task 5.2

**Description:**
Run full test suite and production build. Verify all tests pass and build succeeds.

**Acceptance Criteria:**
- [ ] All tests pass (existing + new)
- [ ] Production build succeeds
- [ ] No TypeScript errors
- [ ] Test coverage ≥ 80% on new code

---

## Dependency Graph

```
Phase 1 (parallel starts):
  1.1 ──→ 1.2 ──┐
  1.3 ───────────┼──→ 1.4
  1.5 ──→ 1.6   │

Phase 2:
  1.4 ──→ 2.1 ──→ 2.2

Phase 3 & 4 (parallel after 2.2):
  2.2 ──→ 3.1 ──→ 3.2
  2.2 ──→ 3.3 ──→ 3.4
  2.2 ──→ 4.1 ──→ 4.2
  2.2 ──→ 4.3
  1.6 ──→ 4.4 ──→ 4.5

Phase 5:
  3.2, 3.4, 4.2, 4.3b, 4.5 ──→ 5.1 ──→ 5.2 ──→ 5.3
```

## Critical Path

1.1 → 1.2 → 1.4 → 2.1 → 2.2 → 3.1 → 3.2 → 5.1 → 5.2 → 5.3

**Duration:** ~10 hours on critical path (with parallelization, remaining tasks absorbed)

## User Story → Task Mapping

| User Story | Tasks |
|-----------|-------|
| US-1: Instance Overview | 1.1-1.4, 2.1-2.2 |
| US-2: Heartbeat Config | 1.1-1.4, 3.1-3.2 |
| US-3: Job Management | 1.1-1.4, 3.3-3.4 |
| US-4: Activity Log | 1.1-1.4, 4.1-4.2 |
| US-5: Account Settings | 1.5-1.6, 4.4-4.5 |
| US-6: Instance Restart | 1.3-1.4, 4.3 |
| US-7: Engine Logs | 1.1-1.4, 4.3 |
