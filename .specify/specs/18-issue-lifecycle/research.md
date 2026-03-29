# Technology Research — Feature 18: Issue Lifecycle

## Decision 1: Issue Table Strategy (New Table vs Alter Existing)

**Context:** We need to evolve `agent_jobs` into a richer `issues` table with identifiers, priority, comments, etc.

**Options:**
1. **New `issues` table + migration** — Create fresh table, migrate data from agent_jobs, keep agent_jobs as read-only backup
2. **ALTER agent_jobs in place** — Add columns to existing table, rename it

**Chosen:** Option 1 — New table + migration
**Rationale:** agent_jobs has a narrow CHECK constraint on status (pending/running/completed/failed) and source. SQLite can't ALTER CHECK constraints — would need table rebuild anyway. A clean table with the right schema from the start is simpler. Keeping agent_jobs as backup means we can roll back.
**Tradeoffs:** Migration script is more complex (INSERT INTO...SELECT), but it's a one-time operation.

## Decision 2: Identifier Format

**Context:** Issues need human-readable identifiers like "OD-42".

**Options:**
1. **Prefix + counter in singleton row** — `issue_counter` table with one row, atomically incremented
2. **Prefix + MAX(id) + 1** — Derive from existing data
3. **Prefix stored per-instance in config** — Configurable prefix

**Chosen:** Option 1 — Singleton counter row
**Rationale:** MAX+1 is fragile under deletes (gaps) and concurrent inserts. A dedicated counter row with atomic increment is simple and reliable. Same pattern as Paperclip's `issueCounter` on companies table.
**Tradeoffs:** One extra table (trivial). Counter survives deletes (identifiers never reused).

## Decision 3: Priority Queue Implementation

**Context:** Issues should be processed in priority order within each agent's queue.

**Options:**
1. **Database-driven priority** — Agent queue fetches next issue from DB ordered by priority, not from channel
2. **Priority channels** — Multiple Go channels per agent (one per priority level), select with bias
3. **Sorted insert into channel** — Sort before enqueuing

**Chosen:** Option 1 — Database-driven priority
**Rationale:** Go channels are FIFO — you can't reorder them. Multiple channels with select don't guarantee strict priority ordering. The cleanest approach: when an agent finishes a job, it queries the DB for its next assigned issue ordered by priority then created_at. The channel becomes a simple "wake up, check for work" signal rather than carrying the full job.
**Tradeoffs:** One DB query per job completion. With SQLite in-process, this is < 1ms.

## Decision 4: Backward Compatibility Approach

**Context:** `/api/jobs` must continue working with the same response shapes.

**Options:**
1. **Thin adapter layer** — `/api/jobs` handlers query issues table, map to legacy response format
2. **Dual write** — Write to both agent_jobs and issues tables
3. **View/alias** — SQLite view over issues table

**Chosen:** Option 1 — Thin adapter layer
**Rationale:** Simplest. The jobs handlers become a translation layer: create issue → return as job, list issues → format as jobs. No dual writes, no sync issues. The 28 contract tests validate the output shape.
**Tradeoffs:** Two code paths for the same data. But the legacy path is frozen — no new features added to /api/jobs.

## Decision 5: Queue Architecture Change

**Context:** Currently the queue carries full `Job` structs with prompts. With priority ordering, the queue needs to pull from DB instead.

**Options:**
1. **Signal-based queue** — Channel carries wake signals, agent queries DB for next issue
2. **Keep current queue, add priority at enqueue time** — Reorder buffer before channel send
3. **Hybrid** — Channel for immediate work, DB for priority overflow

**Chosen:** Option 1 — Signal-based queue
**Rationale:** This is the cleanest evolution of the AgentQueueManager. Instead of `chan Job` (carrying full prompt data), use `chan struct{}` as a wake signal. When the agent goroutine receives a signal, it queries `SELECT * FROM issues WHERE assignee_agent_id = ? AND status = 'todo' ORDER BY priority_rank, created_at LIMIT 1`. This naturally gives priority ordering and survives engine restarts (queued work isn't lost when channel is empty).
**Tradeoffs:** Slightly more complex agent loop. But it's actually more robust — no more lost jobs on engine restart.

## Decision 6: Status Mapping for Legacy API

**Context:** Issues have 6 statuses but legacy API expects 4 (pending/running/completed/failed).

**Chosen mapping:**
- `backlog` → `pending`
- `todo` → `pending`
- `in_progress` → `running`
- `in_review` → `running`
- `done` → `completed`
- `failed` → `failed`

**Rationale:** Closest semantic match. Dashboard users see "pending" for anything not yet started, "running" for anything in progress.
