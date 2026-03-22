# Implementation Plan — Feature 12: Platform↔Engine Contract Tests & Integration Fixes

**Spec:** [spec.md](./spec.md)
**Date:** 2026-03-22
**Approach:** Fix bugs first (TDD), then build contract test suite

---

## Phase 1: Fix Critical Bugs

### 1a: WebSocket URL (BUG-1)
**File:** `src/app/api/instance/terminal-ticket/route.ts`
- Write test: verify `wsUrl` in response does NOT contain `/ws` suffix
- Fix line 60: change `/api/terminal/ws` to `/api/terminal`
- Run test — GREEN

### 1b: Heartbeat PUT field mapping (BUG-2)
**File:** `src/app/api/engine/heartbeat/route.ts`
- Write test: mock `updateHeartbeatConfig`, verify it receives `interval_seconds` (snake_case)
- Fix PUT handler: transform `{ intervalSeconds }` → `{ interval_seconds }` before calling engine
- Run test — GREEN

## Phase 2: Fix Medium Bugs

### 2a: Heartbeat GET response mapping (BUG-3)
**File:** `src/app/api/engine/heartbeat/route.ts`
- Write test: mock `getHeartbeatConfig` returning snake_case, verify response has camelCase
- Fix GET handler: transform snake→camel before returning
- Run test — GREEN

### 2b: Message struct JSON tags (BUG-4)
**File (engine):** `/mnt/f/overnightdesk-engine/internal/database/queries.go`
- Add JSON tags to Message struct: `json:"id"`, `json:"conversation_id"`, etc.
- Run engine tests to verify

### 2c: Job timestamps field name (BUG-5)
**File:** `src/app/(protected)/dashboard/jobs/job-list.tsx`
- Update `Job` interface: `createdAt` → `created_at`
- Update references: `job.createdAt` → `job.created_at` at display points
- Verify with existing tests

## Phase 3: Fix Low Bugs

### 3a: Engine status nested fields (BUG-6)
**File:** `src/app/(protected)/dashboard/page.tsx`
- Fix line 239: read `queue_depth` from nested `queue` object
- Fix line 244: read `last_run` from nested `heartbeat` object

### 3b: Bridge reconfig detection (BUG-7)
**Files:** `telegram-wizard.tsx`, `discord-wizard.tsx`
- Change `typeof initialConfig.bot_token === "string"` to `initialConfig.enabled !== undefined`

## Phase 4: Define Engine Response Contracts

### 4a: Create contract types
**File (new):** `src/lib/engine-contracts.ts`
- Define interfaces matching exact engine JSON shapes:
  - `EngineJobResponse`, `EngineJobListEnvelope`
  - `EngineConversationResponse`, `EngineConversationListEnvelope`
  - `EngineMessageResponse`, `EngineMessageListEnvelope`
  - `EngineHeartbeatResponse`, `EngineHeartbeatUpdatePayload`
  - `EngineStatusResponse` (with nested `QueueStatus`, `HeartbeatStatus`)
  - `EngineAuthStatusResponse`
  - `EngineTelegramConfig`, `EngineDiscordConfig`
  - `EngineTerminalTicketResponse`
  - `EngineLogResponse`

## Phase 5: Contract Tests

### 5a: Engine-client contract tests
**File (new):** `src/lib/__tests__/engine-contracts.test.ts`
- For each of the 16 engine-client functions:
  - Mock fetch with exact engine response shape (from contract types)
  - Verify function returns correctly unwrapped/typed data
  - Test error cases (non-ok response, network error)

### 5b: Proxy route contract tests
**File (new):** `src/app/api/engine/__tests__/proxy-contracts.test.ts`
- Test each proxy route with mocked engine-client:
  - Heartbeat GET: verify snake→camel transformation
  - Heartbeat PUT: verify camel→snake transformation
  - Jobs GET: verify array passthrough
  - Conversations GET: verify array passthrough
  - Terminal ticket: verify correct wsUrl format
  - Auth status: verify claudeAuthStatus mapping

### 5c: Snapshot tests
**File (new):** `src/lib/__tests__/engine-contract-snapshots.test.ts`
- Snapshot-test each contract type fixture
- These break if anyone changes field names without updating contracts

## Phase 6: Component Integration Tests

### 6a: HeartbeatForm test
**File (new):** `src/app/(protected)/dashboard/heartbeat/__tests__/heartbeat-form.test.tsx`
- Render with camelCase config (post-proxy-transform)
- Verify interval, lastRun, nextRun display
- Verify save sends camelCase to proxy

### 6b: JobList test
**File (new):** `src/app/(protected)/dashboard/jobs/__tests__/job-list.test.tsx`
- Render with snake_case job data
- Verify timestamps render via `created_at`

### 6c: ActivityList test
**File (new):** `src/app/(protected)/dashboard/activity/__tests__/activity-list.test.tsx`
- Render with snake_case conversation/message data
- Verify message content and timestamps render

---

## Execution Order

Phases 1-3 (bug fixes) are mostly independent and can be parallelized.
Phase 4 (contract types) must complete before Phase 5 (contract tests).
Phase 6 (component tests) depends on Phases 2-3 fixes being in place.

```
Phase 1 (critical fixes) ─┐
Phase 2 (medium fixes)  ───┼── Phase 4 (contracts) → Phase 5 (contract tests)
Phase 3 (low fixes)     ───┘                       → Phase 6 (component tests)
```

---

## Verification

After all phases:
1. `npm test` — all tests pass (501 + new contract/component tests)
2. `npm run build` — build succeeds
3. Engine tests pass after Message struct JSON tag fix
