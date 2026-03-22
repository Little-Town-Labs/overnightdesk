# Feature 12: Platform↔Engine Contract Tests & Integration Fixes

**Status:** Draft
**Author:** Claude (spec-kit)
**Date:** 2026-03-22
**Priority:** P0 (Blocking)
**Complexity:** Medium
**Constitutional Alignment:** Principles 2, 4, 8; Test-First Imperative

---

## Overview

Fix 7 integration bugs at the platform↔engine boundary discovered during a comprehensive audit, then build a contract test suite that validates all 16 engine-client functions against the real Go engine response shapes. This prevents future regressions when either system changes field names, nesting, or response formats.

---

## Context

The overnightdesk platform (Next.js) communicates with the overnightdesk-engine (Go daemon) via 16 functions in `engine-client.ts`, proxied through API routes to dashboard components. An audit of the actual Go handler response shapes against TypeScript consumption found 7 bugs — 2 critical, 3 medium, 2 low. None of these are caught by existing unit tests because the test mocks were written to match the TypeScript expectations rather than the actual engine responses.

---

## Bugs to Fix

### BUG-1: WebSocket URL Mismatch (CRITICAL)
- **Platform:** `terminal-ticket/route.ts:60` builds `wss://{subdomain}/api/terminal/ws`
- **Engine:** `server.go:110` registers handler at `/api/terminal` (no `/ws` suffix)
- **Impact:** Terminal connections fail with 404. Onboarding wizard cannot connect.
- **Fix:** Remove `/ws` suffix from platform URL.

### BUG-2: Heartbeat PUT Field Mapping (CRITICAL)
- **Platform proxy:** Forwards `{ intervalSeconds }` (camelCase from Zod validation)
- **Engine:** Expects `{ interval_seconds }` (snake_case, `heartbeat.go:27`)
- **Impact:** Heartbeat interval changes silently ignored. Engine keeps old value.
- **Fix:** Map camelCase → snake_case in heartbeat proxy PUT handler.

### BUG-3: Heartbeat GET Response Mapping (MEDIUM)
- **Engine returns:** `{ interval_seconds, last_run, next_run, consecutive_failures }` (snake_case)
- **Dashboard expects:** `{ intervalSeconds, lastRun, nextRun, consecutiveFailures }` (camelCase)
- **Impact:** Heartbeat status shows defaults/empty instead of real values.
- **Fix:** Transform snake→camel in heartbeat proxy GET handler.

### BUG-4: Message Struct Missing JSON Tags (MEDIUM)
- **Engine:** `Message` struct in `queries.go:78-84` has no `json:"..."` tags
- **Go behavior:** Serializes as PascalCase (`ID`, `ConversationID`, `Role`, `Content`, `CreatedAt`)
- **Dashboard expects:** snake_case (`id`, `role`, `content`, `created_at`)
- **Impact:** Conversation messages display with undefined fields.
- **Fix:** Add JSON tags to Message struct in engine repo.

### BUG-5: Job Timestamps Field Name (MEDIUM)
- **Engine sends:** `created_at` (snake_case, via `types.go` jobResponse)
- **Dashboard reads:** `createdAt` (camelCase, `job-list.tsx:14,186`)
- **Impact:** Job timestamps show as empty in the job list.
- **Fix:** Update Job interface and references to use `created_at`.

### BUG-6: Engine Status Nested Fields (LOW)
- **Engine sends:** `{ queue: { queue_depth: N }, heartbeat: { last_run: "..." } }`
- **Dashboard reads:** `engineStatus.queue_depth`, `engineStatus.heartbeat_last_run` (top-level)
- **Impact:** Queue depth and last heartbeat never render on overview page.
- **Fix:** Read from nested objects: `engineStatus.queue?.queue_depth`, etc.

### BUG-7: Bridge Reconfigure Detection (LOW)
- **Dashboard checks:** `typeof initialConfig.bot_token === "string"` to detect existing config
- **Engine GET omits:** `bot_token` from response (security: token not echoed back)
- **Impact:** "Already configured" banner never shows.
- **Fix:** Check `initialConfig.enabled !== undefined` instead.

---

## User Stories

### US-1: Terminal Connection Works
**As** a customer completing onboarding,
**I want** the xterm.js terminal to connect to my engine instance,
**So that** I can authenticate Claude Code through the browser.

**Acceptance Criteria:**
- WebSocket URL points to `/api/terminal` (not `/api/terminal/ws`)
- Terminal ticket is consumed and PTY session opens

### US-2: Heartbeat Configuration Works End-to-End
**As** a customer configuring heartbeat,
**I want** to set the interval and see the current status,
**So that** my assistant checks in at the right frequency.

**Acceptance Criteria:**
- Changing interval in dashboard sends `interval_seconds` to engine
- GET response shows real `lastRun`, `nextRun`, `consecutiveFailures` values
- Round-trip: set interval → save → reload → same value displays

### US-3: Conversation Messages Display Correctly
**As** a customer viewing activity,
**I want** to see conversation messages with role, content, and timestamp,
**So that** I can review what my assistant has been doing.

**Acceptance Criteria:**
- Messages render with `id`, `role`, `content`, `created_at` fields
- Engine Message struct serializes snake_case via JSON tags

### US-4: Job List Shows Timestamps
**As** a customer viewing jobs,
**I want** to see when each job was created,
**So that** I can track my assistant's activity over time.

**Acceptance Criteria:**
- Job list renders `created_at` timestamps correctly

### US-5: Dashboard Overview Shows Engine Status
**As** a customer on the dashboard overview,
**I want** to see queue depth and last heartbeat time,
**So that** I know my engine is healthy and active.

**Acceptance Criteria:**
- Queue depth reads from `engineStatus.queue.queue_depth`
- Last heartbeat reads from `engineStatus.heartbeat.last_run`

### US-6: Contract Tests Prevent Future Regressions
**As** a developer,
**I want** contract tests that validate engine response shapes,
**So that** field name changes or nesting changes are caught before deployment.

**Acceptance Criteria:**
- TypeScript interfaces define exact engine JSON shapes (snake_case)
- Contract tests mock fetch with real engine shapes
- All 16 engine-client functions covered
- Proxy route transformation tests verify camel↔snake mapping
- Snapshot tests catch unintentional shape drift

---

## Out of Scope

- Engine API date filtering (`created_after` param) — tracked separately
- Distributed rate limiting — acceptable at current scale
- E2E Playwright tests — deferred to separate feature
- Engine-side test changes (except Message struct JSON tags)

---

## Technical Notes

### Naming Convention Strategy
The platform adopts a **transform-at-proxy** pattern:
- Engine always uses snake_case (Go convention)
- Dashboard always uses camelCase (TypeScript/React convention)
- Proxy routes in `/api/engine/*` are the boundary where transformation happens
- For simple passthrough (jobs, conversations, logs), snake_case flows to dashboard components which use snake_case interfaces
- For complex responses (heartbeat, status), proxy transforms snake→camel

### Engine-Side Change
BUG-4 requires adding JSON tags to the `Message` struct in `/mnt/f/overnightdesk-engine/internal/database/queries.go`. This is a one-line-per-field change. The engine has its own test suite that should pass after the change.

### Contract Type File
`src/lib/engine-contracts.ts` defines TypeScript interfaces matching exact engine JSON. These are used by tests only (not imported by production code) to validate that engine-client correctly parses real responses.

---

## Dependencies

- BUG-4 fix requires change in overnightdesk-engine repo
- All other fixes are platform-only
- No database schema changes
- No new dependencies

---

## Constitutional Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| P2: Security | Compliant | No security changes; bridge reconfig fix improves UX |
| P4: Simple Over Clever | Compliant | Transform-at-proxy is the simplest boundary pattern |
| P8: Platform Quality | **Fixes violations** | 7 UI bugs fixed; status/timestamps/heartbeat now render correctly |
| Test-First | Required | Contract tests written before fixes verified |
