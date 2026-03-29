# Task Breakdown — Feature 17: Agent Data Model

**Spec:** `spec.md` | **Plan:** `plan.md` | **Branch:** `17-agent-data-model`

---

## Phase 1: Database Schema & Data Layer

### Task 1.1: Database Migration (005_agents.sql)
**Status:** 🟡 Ready
**Effort:** 1 hour
**Dependencies:** None
**User Stories:** Foundation for all stories

**Description:**
Create Goose migration `005_agents.sql` with:
- `agents` table (all columns, constraints, indexes from data-model.md)
- `agent_runtime_state` table (FK to agents, cascade delete)
- `agent_wakeup_requests` table (FK to agents, indexes, constraints)
- `ALTER TABLE agent_jobs ADD COLUMN agent_id` with default 'agent-zero'
- New index `idx_agent_jobs_agent_status` on agent_jobs

**Acceptance Criteria:**
- [ ] Migration applies cleanly on fresh database
- [ ] Migration applies cleanly on database with existing agent_jobs data
- [ ] All CHECK constraints enforced
- [ ] Foreign keys enforced
- [ ] Goose down migration drops tables and column

---

### Task 1.2: Agent Data Layer — Tests
**Status:** 🟡 Ready
**Effort:** 3 hours
**Dependencies:** Task 1.1
**Parallel with:** None (needs schema first)
**User Stories:** US-1, US-2, US-3, US-4, US-5

**Description:**
Write tests for `internal/database/agents.go` — **TESTS FIRST (TDD RED)**.

Test cases:
- **CRUD:** CreateAgent, GetAgent, ListAgents, UpdateAgent, DeleteAgent
- **Agent Zero protection:** DeleteAgent("agent-zero") returns error
- **Unique name:** Creating two agents with same name fails
- **Status filter:** ListAgents with status filter returns correct subset
- **Runtime state:** GetAgentRuntimeState, UpsertAgentRuntimeState
- **Wakeup requests:** CreateWakeupRequest, FindWakeupByIdempotencyKey, UpdateWakeupStatus
- **Idempotency dedup:** Two wakeups with same key returns existing
- **Budget lazy reset:** ResetBudgetIfNewMonth resets when month changes, no-ops when same month
- **Budget resume:** Budget-paused agents auto-resume on reset
- **Hierarchy:** reports_to set correctly, ON DELETE SET NULL works

**Acceptance Criteria:**
- [ ] All tests written and confirmed to FAIL (no implementation yet)
- [ ] Tests cover happy path and error cases
- [ ] Tests use in-memory SQLite with migrations applied

---

### Task 1.3: Agent Data Layer — Implementation
**Status:** 🔴 Blocked by 1.2
**Effort:** 3 hours
**Dependencies:** Task 1.1, Task 1.2
**User Stories:** US-1, US-2, US-3, US-4, US-5

**Description:**
Implement `internal/database/agents.go` to pass all tests from Task 1.2.

Functions to implement:
- `CreateAgent(agent Agent) error`
- `GetAgent(id string) (*Agent, error)`
- `ListAgents(statusFilter string) ([]Agent, error)`
- `UpdateAgent(id string, updates AgentUpdate) error`
- `UpdateAgentStatus(id, status, pauseReason string) error`
- `DeleteAgent(id string) error` (reject "agent-zero")
- `GetAgentRuntimeState(agentID string) (*AgentRuntimeState, error)`
- `UpsertAgentRuntimeState(agentID, sessionID, stateJSON string) error`
- `CreateWakeupRequest(req WakeupRequest) error`
- `FindWakeupByIdempotencyKey(key string) (*WakeupRequest, error)`
- `UpdateWakeupStatus(id, status string) error`
- `ResetBudgetIfNewMonth(agentID, currentMonth string) (bool, error)`

**Acceptance Criteria:**
- [ ] All tests from Task 1.2 pass (GREEN)
- [ ] No raw SQL string interpolation (parameterized queries only)
- [ ] Agent Zero deletion check in DeleteAgent
- [ ] Budget reset is atomic (single UPDATE with WHERE condition)

---

## Phase 2: Agent Bootstrap

### Task 2.1: Bootstrap — Tests
**Status:** 🔴 Blocked by 1.3
**Effort:** 2 hours
**Dependencies:** Task 1.3
**User Stories:** US-1

**Description:**
Write tests for `internal/agent/bootstrap.go` — **TESTS FIRST (TDD RED)**.

Test cases:
- **Fresh boot:** Empty agents table → Agent Zero created with correct defaults
- **Fresh boot defaults:** Agent Zero has id="agent-zero", name="Agent Zero", role="manager", status="idle"
- **Upgrade boot with heartbeat:** heartbeat_state exists → interval/prompt migrated to Agent Zero
- **Upgrade boot with disabled heartbeat:** heartbeat enabled=0 → Agent Zero heartbeat_interval_seconds=0
- **Upgrade boot with session:** claude_sessions has rows → latest session_id migrated to agent_runtime_state
- **Upgrade boot without session:** No claude_sessions → agent_runtime_state created with null session
- **Idempotent boot:** Agent Zero exists → bootstrap returns without error, no duplicate
- **Return value:** Bootstrap returns Agent Zero record

**Acceptance Criteria:**
- [ ] All tests written and confirmed to FAIL
- [ ] Tests set up realistic pre-existing data (heartbeat_state, claude_sessions)
- [ ] Tests verify transactional safety (all-or-nothing)

---

### Task 2.2: Bootstrap — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 2 hours
**Dependencies:** Task 2.1
**User Stories:** US-1

**Description:**
Implement `internal/agent/bootstrap.go` with `BootstrapAgentZero(db, queries, logger)` function.

Logic:
1. Check if agent-zero exists
2. If yes, return it
3. If no, begin transaction:
   a. Create agent-zero with defaults
   b. Read heartbeat_state → migrate config
   c. Read claude_sessions → migrate latest session to runtime_state
   d. Commit
4. Log what happened

**Acceptance Criteria:**
- [ ] All tests from Task 2.1 pass (GREEN)
- [ ] Uses database transaction for atomicity
- [ ] Logs migration details for debugging
- [ ] Handles both fresh and upgrade scenarios

---

## Phase 3: Agent Queue Manager

### Task 3.1: Queue Manager — Tests
**Status:** 🔴 Blocked by 1.3
**Effort:** 3 hours
**Dependencies:** Task 1.3
**Parallel with:** Task 2.1 (independent concern)
**User Stories:** US-6, US-7

**Description:**
Write tests for `internal/queue/manager.go` — **TESTS FIRST (TDD RED)**.

Test cases:
- **Single agent serial:** Enqueue 3 jobs for agent-zero → execute in order, one at a time
- **Multi-agent parallel:** Enqueue 1 job each to agent-a and agent-b → both run concurrently
- **Lazy creation:** Enqueue to unknown agent → agentQueue created on demand
- **Queue depth:** Enqueue 5 jobs → AgentStatus reports depth=5 (minus running)
- **Aggregate status:** Multiple agents running → Status() reports total running and total queued
- **Agent paused rejection:** Enqueue to paused agent → returns error
- **Shutdown:** Shutdown stops all agent queues, running jobs complete
- **ResultCh forwarding:** ResultCh on job is populated after execution
- **Session per agent:** Each agentQueue uses agent-specific session from runtime_state

Also test refactored `agentQueue` (extracted from serial.go):
- **Serial execution:** Jobs run one at a time
- **10-minute timeout:** Job exceeding timeout is killed
- **Error handling:** Failed job updates DB status to "failed"
- **Agent status transition:** idle→running→idle on execute

**Acceptance Criteria:**
- [ ] All tests written and confirmed to FAIL
- [ ] Tests use mock executor (interface-based) for deterministic behavior
- [ ] Tests verify concurrency properties (multi-agent parallel, per-agent serial)

---

### Task 3.2: Queue Manager — Implementation
**Status:** 🔴 Blocked by 3.1
**Effort:** 4 hours
**Dependencies:** Task 3.1
**User Stories:** US-6, US-7

**Description:**
Implement the agent-aware queue system.

**Step 1:** Refactor `internal/queue/serial.go`
- Extract execution logic into `agentQueue` type
- `agentQueue` has its own channel, goroutine, and agent ID
- `agentQueue` reads session from `agent_runtime_state` for its agent
- `agentQueue` updates agent status (idle↔running)

**Step 2:** Create `internal/queue/manager.go`
- `AgentQueueManager` wraps `map[string]*agentQueue` with sync.RWMutex
- `Enqueue(agentID, job)` → find or create agentQueue → send to its channel
- `Status()` → aggregate across all agentQueues
- `AgentStatus(id)` → single agent queue status
- `Shutdown()` → iterate and stop all queues

**Step 3:** Define `Executor` interface
- Extract interface from `*claude.Executor` for testability
- `Run(ctx, prompt, sessionID) (*ExecutionResult, error)`

**Acceptance Criteria:**
- [ ] All tests from Task 3.1 pass (GREEN)
- [ ] Existing serial.go tests still pass (backward compat)
- [ ] No goroutine leaks (all queues stopped on Shutdown)
- [ ] Executor is interface-based for testability

---

## Phase 4: API Endpoints

### Task 4.1: Agent API — Tests
**Status:** 🔴 Blocked by 1.3
**Effort:** 3 hours
**Dependencies:** Task 1.3
**Parallel with:** Task 3.1 (independent concern)
**User Stories:** US-2, US-3, US-4, US-5, US-7

**Description:**
Write tests for `internal/api/agents.go` — **TESTS FIRST (TDD RED)**.

Test cases:
- **List agents:** GET /api/agents returns all agents, ordered by created_at
- **List with filter:** GET /api/agents?status=idle returns only idle agents
- **Create agent:** POST /api/agents with valid body → 201 + agent returned
- **Create duplicate name:** POST /api/agents with existing name → 409
- **Create with circular hierarchy:** POST /api/agents with reports_to creating cycle → 400
- **Create with max depth exceeded:** reports_to chain > 5 levels → 400
- **Get agent:** GET /api/agents/:id → 200 + agent detail with runtime_state and queue_depth
- **Get nonexistent:** GET /api/agents/bad-id → 404
- **Update agent:** PUT /api/agents/:id with partial body → 200
- **Update name to duplicate:** PUT with existing name → 409
- **Delete agent:** DELETE /api/agents/:id → 204
- **Delete Agent Zero:** DELETE /api/agents/agent-zero → 403
- **Delete agent with reports:** Agent with children → children become top-level
- **Pause agent:** POST /api/agents/:id/pause → 200, status=paused
- **Pause already paused:** → 400
- **Resume agent:** POST /api/agents/:id/resume → 200, status=idle
- **Resume not paused:** → 400
- **Wakeup agent:** POST /api/agents/:id/wakeup → 200
- **Wakeup paused agent:** → 400
- **Wakeup with idempotency:** Same key → returns existing, deduplicated=true
- **Auth required:** All endpoints return 401 without bearer token
- **Input validation:** Name > 255 chars → 400, budget < 0 → 400

**Acceptance Criteria:**
- [ ] All tests written and confirmed to FAIL
- [ ] Tests cover auth, validation, happy path, error cases (constitutional requirement)
- [ ] Tests use httptest for Echo handler testing

---

### Task 4.2: Agent API — Implementation
**Status:** 🔴 Blocked by 4.1, 3.2
**Effort:** 4 hours
**Dependencies:** Task 4.1, Task 3.2 (needs queue manager for wakeup and queue_depth)
**User Stories:** US-2, US-3, US-4, US-5, US-7

**Description:**
Implement `internal/api/agents.go` with all handlers.

- `handleListAgents` — query with optional status filter
- `handleCreateAgent` — validate input, check hierarchy, insert
- `handleGetAgent` — fetch agent + runtime_state + queue_depth from manager
- `handleUpdateAgent` — partial update with hierarchy revalidation
- `handleDeleteAgent` — reject agent-zero, cascade cleanup
- `handlePauseAgent` — set status=paused with reason
- `handleResumeAgent` — set status=idle, clear pause_reason
- `handleWakeupAgent` — create wakeup request, check idempotency, enqueue to manager

Add `validateHierarchy(agentID, reportsTo)` helper for cycle detection.

**Acceptance Criteria:**
- [ ] All tests from Task 4.1 pass (GREEN)
- [ ] Input validation for all fields
- [ ] Consistent error response format
- [ ] Hierarchy validation prevents cycles (max 5 levels)

---

## Phase 5: Backward Compatibility Wiring

### Task 5.1: Wire Existing Systems — Tests
**Status:** 🔴 Blocked by 3.2, 4.2
**Effort:** 2 hours
**Dependencies:** Task 3.2, Task 4.2
**User Stories:** US-1 (transparent upgrade)

**Description:**
Write backward compatibility tests — **TESTS FIRST (TDD RED)**.

Test cases:
- **Job creation:** POST /api/jobs creates job with agent_id="agent-zero"
- **Job execution:** Job created via /api/jobs executes through agent-zero queue
- **Heartbeat GET:** GET /api/heartbeat returns Agent Zero's heartbeat config
- **Heartbeat PUT:** PUT /api/heartbeat updates Agent Zero's heartbeat config
- **Status API:** GET /api/status includes queue info from AgentQueueManager
- **Status agents section:** GET /api/status includes agents count and summary

**Acceptance Criteria:**
- [ ] All tests written and confirmed to FAIL
- [ ] Tests verify exact response shapes match current API contracts
- [ ] No existing API tests broken

---

### Task 5.2: Wire Existing Systems — Implementation
**Status:** 🔴 Blocked by 5.1
**Effort:** 3 hours
**Dependencies:** Task 5.1, Task 2.2
**User Stories:** US-1

**Description:**
Modify existing files to use the agent model:

1. **`internal/api/jobs.go`** — `handleCreateJob` adds agent_id="agent-zero" to job, uses `manager.Enqueue("agent-zero", job)`
2. **`internal/api/server.go`** — Replace `*queue.Queue` with `*queue.AgentQueueManager` in ServerConfig. Register new /api/agents routes.
3. **`internal/scheduler/heartbeat.go`** — Read heartbeat config from Agent Zero record instead of heartbeat_state. Use `manager.Enqueue("agent-zero", job)`. Update Agent Zero's last_heartbeat_at.
4. **`internal/scheduler/cron.go`** — Use `manager.Enqueue("agent-zero", job)`.
5. **`internal/api/status.go`** — Use `manager.Status()` for queue info. Add agents summary.
6. **`cmd/engine/main.go`** — Call bootstrap, create AgentQueueManager, wire everything.

**Acceptance Criteria:**
- [ ] All tests from Task 5.1 pass (GREEN)
- [ ] All pre-existing tests still pass
- [ ] Engine starts successfully with new wiring
- [ ] Heartbeat reads from Agent Zero, not heartbeat_state

---

## Phase 6: Quality Gates

### Task 6.1: Security Review
**Status:** 🔴 Blocked by 4.2
**Effort:** 1 hour
**Dependencies:** Task 4.2

**Description:**
Run security review on all new code:
- No SQL injection (all queries parameterized)
- Input validation on all API endpoints
- Agent Zero deletion protection verified
- Bearer auth required on all new endpoints
- No hardcoded secrets

**Acceptance Criteria:**
- [ ] No CRITICAL or HIGH security issues
- [ ] All inputs validated and bounded

---

### Task 6.2: Code Review
**Status:** 🔴 Blocked by 5.2
**Effort:** 1 hour
**Dependencies:** Task 5.2

**Description:**
Run code review on all changes:
- Code quality and readability
- Error handling completeness
- Naming consistency with existing codebase
- No unused code
- No console.log/fmt.Println left in

**Acceptance Criteria:**
- [ ] No CRITICAL issues
- [ ] Code follows existing engine patterns

---

### Task 6.3: Full Test Suite + Coverage
**Status:** 🔴 Blocked by 5.2
**Effort:** 1 hour
**Dependencies:** Task 5.2

**Description:**
Run complete test suite. Verify:
- All new tests pass
- All pre-existing tests pass
- Coverage >= 80% on new code
- No race conditions (`go test -race`)

**Acceptance Criteria:**
- [ ] `go test ./...` passes
- [ ] `go test -race ./...` passes
- [ ] Coverage report shows >= 80% on new packages

---

## Summary

| Phase | Tasks | Total Effort |
|-------|-------|-------------|
| 1. Schema & Data Layer | 1.1, 1.2, 1.3 | 7 hours |
| 2. Bootstrap | 2.1, 2.2 | 4 hours |
| 3. Queue Manager | 3.1, 3.2 | 7 hours |
| 4. API Endpoints | 4.1, 4.2 | 7 hours |
| 5. Backward Compat | 5.1, 5.2 | 5 hours |
| 6. Quality Gates | 6.1, 6.2, 6.3 | 3 hours |
| **Total** | **15 tasks** | **33 hours** |

## Parallelization Opportunities

```
Phase 1: 1.1 → 1.2 → 1.3 (sequential, foundation)
Phase 2: 2.1 → 2.2         ┐
Phase 3: 3.1 → 3.2         ├ Parallel after 1.3
Phase 4: 4.1 ──────────────┘ (4.2 blocked by 3.2)
Phase 5: 5.1 → 5.2 (after 3.2 + 4.2)
Phase 6: 6.1-6.3 (after 5.2)
```

## Critical Path

```
1.1 → 1.2 → 1.3 → 3.1 → 3.2 → 4.2 → 5.1 → 5.2 → 6.3
                                              (33 hrs sequential,
                                               ~25 hrs with parallelization)
```

## Dependency Graph

```
Task 1.1 ─→ Task 1.2 ─→ Task 1.3 ─┬→ Task 2.1 ─→ Task 2.2 ──────────┐
                                    ├→ Task 3.1 ─→ Task 3.2 ─┬→ Task 4.2 ─→ Task 5.1 → Task 5.2 → 6.1,6.2,6.3
                                    └→ Task 4.1 ─────────────┘          │
                                                                Task 2.2 ┘
```
