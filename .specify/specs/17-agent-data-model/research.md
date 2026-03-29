# Technology Research — Feature 17: Agent Data Model

## Decision 1: Multi-Agent Queue Architecture

**Context:** The engine currently uses a single serial queue (buffered Go channel, capacity 64). We need per-agent serial execution with inter-agent parallelism.

**Options Considered:**

1. **Agent Queue Manager (map of channels)** — One buffered channel per agent, managed by a central `AgentQueueManager`. Each agent's channel has a dedicated goroutine consuming jobs serially. New agents get channels lazily when first job arrives.

2. **Worker Pool with Agent Affinity** — Fixed pool of N worker goroutines, with job routing that ensures only one job per agent runs at a time. Uses a mutex map for agent-level locking.

3. **Single Queue with Agent Lock Table** — Keep the existing single channel, add a per-agent lock table. Dequeue checks if the target agent is already running; if so, re-enqueue or defer.

**Chosen:** Option 1 — Agent Queue Manager
**Rationale:** Cleanest separation of concerns. Each agent is truly independent. Lazy goroutine creation means idle agents consume zero CPU (NFR-4). The existing `Queue` type's interface (`Enqueue`, `Status`, `Shutdown`) maps directly to an `AgentQueueManager` wrapper. The `ResultCh` pattern works unchanged per-agent.
**Tradeoffs:** More goroutines than the current 1 (one per active agent). Acceptable — Go goroutines are cheap (~4KB stack). With max 50 agents, overhead is negligible.

---

## Decision 2: Agent ID Generation

**Context:** Agents need unique identifiers. Options for ID format.

**Options Considered:**

1. **UUID v4** — Random, globally unique, consistent with existing `agent_jobs.id` pattern
2. **ULID** — Sortable, timestamp-prefixed, still unique
3. **Slug-based** — Derived from agent name (e.g., "agent-zero")

**Chosen:** UUID v4
**Rationale:** Consistent with every other ID in the engine (`agent_jobs`, `conversations`, `claude_sessions`). The `google/uuid` package is already a dependency. No new libraries needed.
**Tradeoffs:** Not human-readable or sortable, but agents are listed by creation time (indexed) so sortability doesn't matter.

---

## Decision 3: Agent Zero Detection Strategy

**Context:** Agent Zero must be created on first boot and never duplicated. Need a reliable detection mechanism.

**Options Considered:**

1. **Well-known UUID** — Agent Zero always has a hardcoded UUID (e.g., "00000000-0000-0000-0000-000000000000")
2. **Well-known name** — Query for agent where name = "Agent Zero"
3. **Is-primary flag** — Boolean column `is_primary` on agents table, only one row can be true
4. **Sentinel ID** — Agent Zero always has id = "agent-zero" (non-UUID)

**Chosen:** Option 4 — Sentinel ID "agent-zero"
**Rationale:** Simplest to query, impossible to accidentally create duplicates (unique constraint on ID), easy to reference in code without magic UUIDs. Other agents still use UUID. The ID column is TEXT type so mixed formats work. Deletion check is trivial: `if id == "agent-zero" { reject }`.
**Tradeoffs:** Inconsistent ID format (one sentinel, rest UUID). Acceptable — Agent Zero is special by design.

---

## Decision 4: Heartbeat State Migration

**Context:** The existing `heartbeat_state` table has a singleton row with heartbeat config. This needs to move to Agent Zero's agent record.

**Options Considered:**

1. **Migration SQL reads heartbeat_state, writes to agents** — Done in Goose migration script
2. **Bootstrap code reads heartbeat_state, creates Agent Zero with those values** — Done in Go at startup
3. **Keep heartbeat_state, agents.heartbeat_interval references it** — Avoid migration

**Chosen:** Option 2 — Bootstrap code at startup
**Rationale:** Goose migrations run before application code, but the bootstrap logic is complex (conditional: only if agents table is empty AND heartbeat_state exists). Go code can handle this cleanly with transaction safety. The `heartbeat_state` table stays as a read source during migration but is deprecated after Agent Zero exists.
**Tradeoffs:** Migration logic in Go code instead of pure SQL. But this is a one-time bootstrap, and the Go code can log what it does for debugging.

---

## Decision 5: Circular Hierarchy Detection

**Context:** Agents have a `reports_to` self-reference. Cycles must be prevented.

**Options Considered:**

1. **Walk-the-chain validation** — On create/update, walk reports_to chain up to max depth (5). If current agent ID found, reject.
2. **Materialized path** — Store full ancestor path (e.g., "/agent-zero/agent-a/agent-b"). Check for substring.
3. **Trigger-based SQL** — SQLite trigger validates on insert/update.

**Chosen:** Option 1 — Walk-the-chain in Go
**Rationale:** Simple, correct, bounded (max 5 levels means max 5 queries). SQLite triggers are fragile for recursive validation. Materialized paths add update complexity. With max 50 agents, the walk is trivial.
**Tradeoffs:** N+1 queries during validation. With max depth 5 and SQLite in-process, this is < 1ms.

---

## Decision 6: Budget Reset Mechanism

**Context:** Agent `spent_monthly_cents` must reset to 0 at the start of each calendar month, and budget-paused agents must auto-resume.

**Options Considered:**

1. **Cron-like check in heartbeat tick** — Every 30s tick checks if month has changed, resets if so
2. **Separate monthly goroutine** — Dedicated timer that fires at midnight on the 1st
3. **Lazy reset on read** — When reading an agent, check if last_budget_reset is in a prior month; if so, reset inline

**Chosen:** Option 3 — Lazy reset on read
**Rationale:** Zero additional goroutines. Works correctly even if engine was offline during month boundary. No race conditions. The "reset" is an atomic update-if-stale check.
**Tradeoffs:** First read after month boundary has slightly higher latency (one extra write). Acceptable.
