# Tasks — Feature 12: Platform↔Engine Contract Tests & Integration Fixes

**Plan:** [plan.md](./plan.md)
**Date:** 2026-03-22

---

## Story 1: Terminal Connection Works (US-1)

### Task 1.1: Fix WebSocket URL
- **File:** `src/app/api/instance/terminal-ticket/route.ts`
- **Action:** Write test verifying wsUrl format, then fix line 60: `/api/terminal/ws` → `/api/terminal`
- **TDD Phase:** RED → GREEN
- **Blocked by:** None

---

## Story 2: Heartbeat Works End-to-End (US-2)

### Task 2.1: Fix heartbeat PUT field mapping
- **File:** `src/app/api/engine/heartbeat/route.ts`
- **Action:** Write test verifying engine receives `interval_seconds`. Transform camelCase→snake_case in PUT handler.
- **TDD Phase:** RED → GREEN
- **Blocked by:** None

### Task 2.2: Fix heartbeat GET response mapping
- **File:** `src/app/api/engine/heartbeat/route.ts`
- **Action:** Write test verifying response has camelCase fields. Transform snake→camel in GET handler.
- **TDD Phase:** RED → GREEN
- **Blocked by:** None

---

## Story 3: Messages Display Correctly (US-3)

### Task 3.1: Add JSON tags to engine Message struct
- **File (engine):** `/mnt/f/overnightdesk-engine/internal/database/queries.go`
- **Action:** Add `json:"id"`, `json:"conversation_id"`, `json:"role"`, `json:"content"`, `json:"created_at"` tags
- **TDD Phase:** Verify engine tests pass
- **Blocked by:** None

---

## Story 4: Job Timestamps Display (US-4)

### Task 4.1: Fix Job interface field names
- **File:** `src/app/(protected)/dashboard/jobs/job-list.tsx`
- **Action:** Change `createdAt` to `created_at` in interface and display references
- **Blocked by:** None

---

## Story 5: Dashboard Overview Shows Status (US-5)

### Task 5.1: Fix engine status nested field access
- **File:** `src/app/(protected)/dashboard/page.tsx`
- **Action:** Read `queue_depth` from `engineStatus.queue`, `last_run` from `engineStatus.heartbeat`
- **Blocked by:** None

---

## Story 6: Bridge Reconfig Detection (US-1 related)

### Task 6.1: Fix bridge reconfigure detection
- **Files:** `telegram-wizard.tsx`, `discord-wizard.tsx`
- **Action:** Change `typeof initialConfig.bot_token === "string"` to `initialConfig.enabled !== undefined`
- **Blocked by:** None

---

## Story 7: Contract Types (US-6)

### Task 7.1: Create engine contract type definitions
- **File (new):** `src/lib/engine-contracts.ts`
- **Action:** Define TypeScript interfaces for all engine JSON response shapes (snake_case)
- **Blocked by:** None

---

## Story 8: Contract Tests (US-6)

### Task 8.1: Engine-client contract tests
- **File (new):** `src/lib/__tests__/engine-contracts.test.ts`
- **Action:** Test all 16 engine-client functions with real engine response shapes
- **TDD Phase:** RED → GREEN (verify existing implementation handles shapes)
- **Blocked by:** 7.1

### Task 8.2: Proxy route contract tests
- **File (new):** `src/app/api/engine/__tests__/proxy-contracts.test.ts`
- **Action:** Test proxy routes for correct transformations (heartbeat camel↔snake, terminal wsUrl, auth-status mapping)
- **TDD Phase:** RED → GREEN
- **Blocked by:** 2.1, 2.2, 7.1

### Task 8.3: Contract snapshot tests
- **File (new):** `src/lib/__tests__/engine-contract-snapshots.test.ts`
- **Action:** Snapshot-test each contract type fixture for regression detection
- **Blocked by:** 7.1

---

## Story 9: Component Integration Tests (US-2, US-3, US-4)

### Task 9.1: HeartbeatForm integration test
- **File (new):** `src/app/(protected)/dashboard/heartbeat/__tests__/heartbeat-form.test.tsx`
- **Action:** Render HeartbeatForm with mock camelCase data, verify display and save
- **Blocked by:** 2.1, 2.2

### Task 9.2: JobList integration test
- **File (new):** `src/app/(protected)/dashboard/jobs/__tests__/job-list.test.tsx`
- **Action:** Render JobList with snake_case data, verify timestamps render
- **Blocked by:** 4.1

### Task 9.3: ActivityList integration test
- **File (new):** `src/app/(protected)/dashboard/activity/__tests__/activity-list.test.tsx`
- **Action:** Render ActivityList with snake_case data, verify message fields render
- **Blocked by:** 3.1

---

## Story 10: Final Verification

### Task 10.1: Run full test suite + build
- **Action:** `npm test` and `npm run build`
- **Blocked by:** All above

### Task 10.2: Run engine tests
- **Action:** `cd /mnt/f/overnightdesk-engine && go test ./...`
- **Blocked by:** 3.1

### Task 10.3: Commit
- **Action:** Commit platform changes. Commit engine change separately.
- **Blocked by:** 10.1, 10.2

---

## Execution Order

**Parallel group A** (independent fixes): 1.1, 2.1, 2.2, 3.1, 4.1, 5.1, 6.1, 7.1
**After group A**: 8.1, 8.2, 8.3 (need 7.1 + fixes)
**After fixes verified**: 9.1, 9.2, 9.3 (need component fixes in place)
**Final**: 10.1, 10.2, 10.3
