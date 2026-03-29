# Implementation Plan — Feature 17: Agent Data Model

**Spec:** `.specify/specs/17-agent-data-model/spec.md`
**Branch:** `17-agent-data-model`
**Repo:** `overnightdesk-engine` (Go)

---

## Executive Summary

Add agents as first-class entities to the Go engine. Three new tables (agents, agent_runtime_state, agent_wakeup_requests), one column addition (agent_jobs.agent_id), a bootstrap sequence for Agent Zero, a new agent-aware queue manager, and CRUD API endpoints. All existing behavior preserved — Agent Zero is the default target for all current flows.

---

## Architecture Overview

```
                    ┌─────────────────────────────┐
                    │         API Server           │
                    │  (Echo HTTP + Bearer Auth)   │
                    ├─────────────────────────────┤
                    │  /api/agents (NEW)           │
                    │  /api/agents/:id (NEW)       │
                    │  /api/agents/:id/pause (NEW) │
                    │  /api/agents/:id/wakeup (NEW)│
                    │  /api/jobs (EXISTING)         │
                    │  /api/heartbeat (EXISTING)    │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │     AgentQueueManager        │
                    │  (replaces serial Queue)     │
                    ├─────────────────────────────┤
                    │  agents map[string]*agentQ   │
                    │  Enqueue(agentID, job)       │
                    │  Status() AggregateStatus    │
                    │  AgentStatus(id) Status      │
                    │  Shutdown()                  │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐ ┌──────▼─────┐ ┌────────▼────────┐
    │  agentQ(zero)  │ │ agentQ(A)  │ │   agentQ(B)     │
    │  chan Job (64)  │ │ chan Job    │ │   chan Job       │
    │  serial exec   │ │ serial     │ │   serial         │
    └────────────────┘ └────────────┘ └─────────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │     Claude Executor          │
                    │  (unchanged — per-invocation)│
                    └─────────────────────────────┘
```

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Go 1.25 | Existing engine language |
| Database | SQLite (WAL mode) | Existing engine DB, no new dependencies |
| Migrations | Goose v3 | Existing migration tool |
| HTTP | Echo v4 | Existing HTTP framework |
| IDs | UUID v4 (google/uuid) | Existing pattern, except Agent Zero = "agent-zero" |
| Testing | Go stdlib (testing) | Existing pattern |

**No new dependencies required.**

---

## Technical Decisions

Documented in `research.md`. Key decisions:
1. **Agent Queue Manager** — map of per-agent channels with lazy goroutines
2. **Agent Zero sentinel ID** — "agent-zero" string, not UUID
3. **Bootstrap in Go code** — not SQL migration (needs to read heartbeat_state)
4. **Circular hierarchy detection** — walk-the-chain in Go (max 5 levels)
5. **Budget lazy reset** — check on read, reset if month changed
6. **Heartbeat migration** — copy heartbeat_state values to Agent Zero at bootstrap

---

## Implementation Phases

### Phase A: Database Schema (Migration 005)

**New file:** `internal/database/migrations/005_agents.sql`

Create three tables + modify agent_jobs:
- `agents` with all columns, constraints, indexes
- `agent_runtime_state` with FK to agents
- `agent_wakeup_requests` with FK to agents
- `ALTER TABLE agent_jobs ADD COLUMN agent_id` with default 'agent-zero'

### Phase B: Agent Data Layer

**New file:** `internal/database/agents.go`

Database query functions for agents:
- `CreateAgent(agent)` — insert with all fields
- `GetAgent(id)` — single agent lookup
- `ListAgents(statusFilter)` — all agents with optional status filter
- `UpdateAgent(id, fields)` — partial update
- `UpdateAgentStatus(id, status, pauseReason)` — status transition
- `DeleteAgent(id)` — delete with Agent Zero protection
- `GetAgentRuntimeState(agentID)` — session and state
- `UpsertAgentRuntimeState(agentID, sessionID, stateJSON)` — create or update
- `CreateWakeupRequest(req)` — insert wakeup
- `FindWakeupByIdempotencyKey(key)` — dedup lookup
- `UpdateWakeupStatus(id, status)` — transition wakeup
- `ResetBudgetIfNewMonth(agentID, currentMonth)` — lazy budget reset

### Phase C: Agent Bootstrap

**New file:** `internal/agent/bootstrap.go`

Bootstrap function called at startup (after migrations, before queue start):
- Check if Agent Zero exists
- If not: create Agent Zero, migrate heartbeat config, migrate latest session
- If yes: no-op (log "Agent Zero exists")
- Returns Agent Zero record for use by other components

### Phase D: Agent Queue Manager

**New file:** `internal/queue/manager.go`

Replace the single `Queue` with `AgentQueueManager`:
- Wraps map of per-agent `agentQueue` instances
- `Enqueue(agentID, job)` — routes to correct agent queue (creates lazily)
- Each `agentQueue` has the same serial execution pattern as current `Queue`
- `Status()` returns aggregate status (total running, total queued)
- `AgentStatus(id)` returns per-agent status
- `Shutdown()` stops all agent queues

**Modify existing:** `internal/queue/serial.go`
- Extract the execution logic into a reusable `agentQueue` type
- The `agentQueue` is the single-agent serial executor
- `AgentQueueManager` composes multiple `agentQueue` instances

### Phase E: Agent API Endpoints

**New file:** `internal/api/agents.go`

CRUD + lifecycle endpoints:
- `GET /api/agents` — list agents
- `POST /api/agents` — create agent (with hierarchy validation)
- `GET /api/agents/:id` — get agent detail + runtime state + queue depth
- `PUT /api/agents/:id` — update agent
- `DELETE /api/agents/:id` — delete agent (reject Agent Zero)
- `POST /api/agents/:id/pause` — pause with reason
- `POST /api/agents/:id/resume` — resume
- `POST /api/agents/:id/wakeup` — trigger wakeup (with idempotency)

### Phase F: Backward Compatibility Wiring

**Modify:** `internal/api/jobs.go`
- `POST /api/jobs` defaults `agent_id` to "agent-zero"
- Enqueue uses `manager.Enqueue("agent-zero", job)` instead of `queue.Enqueue(job)`

**Modify:** `internal/scheduler/heartbeat.go`
- Read Agent Zero's heartbeat config instead of heartbeat_state table
- Dispatch jobs to Agent Zero via `manager.Enqueue("agent-zero", job)`
- Update Agent Zero's `last_heartbeat_at` after dispatch

**Modify:** `internal/scheduler/cron.go`
- Dispatch jobs to Agent Zero via `manager.Enqueue("agent-zero", job)`

**Modify:** `internal/api/server.go`
- Register new agent routes
- Replace `Queue` with `AgentQueueManager` in ServerConfig

**Modify:** `cmd/engine/main.go`
- Call agent bootstrap after database setup
- Create `AgentQueueManager` instead of `Queue`
- Pass manager to heartbeat, cron, API server
- Wire session manager per-agent (Agent Zero gets existing session)

### Phase G: Status API Update

**Modify:** `internal/api/status.go`
- `GET /api/status` includes aggregate queue info from manager
- Add `agents` section with count and status summary

---

## Security Considerations

- **Agent Zero deletion protection:** Enforced at both API layer (403 response) and database layer (query rejects id="agent-zero")
- **Input validation:** Agent name max 255 chars, role max 1000 chars, budget >= 0, interval 0-86400
- **No new auth model:** All agent endpoints use existing bearer token auth
- **Agent API keys are NOT part of this feature** — all access is through the existing engine bearer token
- **Circular hierarchy:** Validated server-side, not trusted from client input

---

## Performance Strategy

- Agent list query is a simple SELECT with optional WHERE — indexed by status
- Agent creation/update is single INSERT/UPDATE — < 100ms on SQLite
- Queue manager uses lazy goroutine creation — idle agents = zero overhead
- Wakeup dedup is an indexed lookup on idempotency_key — < 10ms
- Budget lazy reset adds one conditional UPDATE per first-read-of-month — negligible

---

## Testing Strategy

Following TDD (constitution mandate):

1. **Database tests** (`internal/database/agents_test.go`)
   - CRUD operations for agents, runtime state, wakeup requests
   - Agent Zero protection (delete rejection)
   - Unique name constraint
   - Budget lazy reset
   - Wakeup idempotency dedup

2. **Bootstrap tests** (`internal/agent/bootstrap_test.go`)
   - Fresh boot: Agent Zero created
   - Upgrade boot: heartbeat config migrated, session migrated
   - Repeat boot: idempotent (no error, no duplicate)

3. **Queue manager tests** (`internal/queue/manager_test.go`)
   - Single agent serial execution (backward compatible)
   - Multi-agent parallel execution
   - Per-agent queue depth tracking
   - Lazy goroutine creation
   - Shutdown behavior

4. **API tests** (`internal/api/agents_test.go`)
   - List agents
   - Create agent (happy path, duplicate name, circular hierarchy)
   - Get agent detail
   - Update agent
   - Delete agent (success, reject Agent Zero)
   - Pause/resume lifecycle
   - Wakeup with idempotency

5. **Backward compatibility tests**
   - `POST /api/jobs` still works, targets Agent Zero
   - `GET/PUT /api/heartbeat` still works, reads/writes Agent Zero config
   - `GET /api/status` still works, includes agent info

---

## Deployment Strategy

- Migration 005 runs automatically on engine start (Goose auto-migrate)
- Agent Zero bootstrap runs after migration, before queue start
- Existing containers get Agent Zero on next restart
- No manual intervention required
- Dashboard proxy layer is NOT modified in this feature (Feature 26)

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| SQLite write contention with multi-agent | Execution delays | Medium | WAL mode + busy timeout already handle this. Agent count is small (< 50). |
| Heartbeat migration loses config | Heartbeat stops working | Low | Bootstrap reads heartbeat_state in transaction. Logs values for debugging. heartbeat_state table kept as backup. |
| Agent queue goroutine leak | Memory growth | Low | Shutdown method sends stop signal to all. Context cancellation propagates. |
| Backward compat regression | Existing features break | Medium | Full backward compat test suite. All existing API tests must pass unchanged. |

---

## Constitutional Compliance

- [x] **Principle 1 (Data Sacred):** No data deleted during migration. Agent Zero inherits existing state.
- [x] **Principle 2 (Security):** All new endpoints behind existing bearer auth. Input validated.
- [x] **Principle 3 (Agent Acts, Owner Decides):** Agent status changes are logged. Pause/resume is owner-controlled.
- [x] **Principle 4 (Simple Over Clever):** Sentinel ID for Agent Zero. Lazy goroutines. Walk-the-chain validation.
- [x] **Principle 8 (Quality):** Status reflects real-time truth. Error messages are clear.
- [x] **Test-First Imperative:** TDD for all new code. Tests must fail before implementation.
