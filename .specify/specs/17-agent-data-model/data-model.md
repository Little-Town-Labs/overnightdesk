# Data Model — Feature 17: Agent Data Model

## Entity Relationship

```
agents (1) ──────── (0..N) agents           [self-ref: reports_to]
agents (1) ──────── (0..1) agent_runtime_state
agents (1) ──────── (0..N) agent_wakeup_requests
agents (1) ──────── (0..N) agent_jobs        [existing table, via new agent_id column]
```

## Tables

### agents

The core agent identity and configuration table. Agent Zero has sentinel ID "agent-zero".

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID or "agent-zero" for the primary agent |
| name | TEXT | NOT NULL, UNIQUE | Human-readable display name |
| role | TEXT | NOT NULL, DEFAULT '' | Free-text role description |
| status | TEXT | NOT NULL, DEFAULT 'idle' | idle, running, paused, error |
| pause_reason | TEXT | DEFAULT NULL | manual, budget, error (null when not paused) |
| adapter_type | TEXT | NOT NULL, DEFAULT 'claude_local' | Execution adapter identifier |
| runtime_config | TEXT | NOT NULL, DEFAULT '{}' | JSON object for adapter-specific config |
| heartbeat_interval_seconds | INTEGER | NOT NULL, DEFAULT 0 | 0 = no heartbeat |
| heartbeat_prompt | TEXT | NOT NULL, DEFAULT '' | Prompt used for heartbeat runs |
| last_heartbeat_at | TEXT | DEFAULT NULL | RFC3339 timestamp of last heartbeat |
| budget_monthly_cents | INTEGER | NOT NULL, DEFAULT 0 | 0 = unlimited |
| spent_monthly_cents | INTEGER | NOT NULL, DEFAULT 0 | Current month's spend |
| budget_reset_month | TEXT | NOT NULL, DEFAULT '' | YYYY-MM of last reset (for lazy reset) |
| reports_to | TEXT | DEFAULT NULL | FK → agents.id (null = top-level) |
| created_at | TEXT | NOT NULL | RFC3339 timestamp |
| updated_at | TEXT | NOT NULL | RFC3339 timestamp |

**Indexes:**
- `idx_agents_status` on (status) — filter by active/paused agents
- `idx_agents_reports_to` on (reports_to) — hierarchy queries

**Constraints:**
- FOREIGN KEY (reports_to) REFERENCES agents(id) ON DELETE SET NULL
- CHECK (status IN ('idle', 'running', 'paused', 'error'))
- CHECK (pause_reason IS NULL OR pause_reason IN ('manual', 'budget', 'error'))

---

### agent_runtime_state

Per-agent session and execution state. Separated from agents to allow config changes without disrupting active sessions.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent_id | TEXT | PRIMARY KEY, FK → agents.id | One runtime state per agent |
| session_id | TEXT | DEFAULT NULL | Claude Code session ID for --resume |
| state_json | TEXT | NOT NULL, DEFAULT '{}' | Arbitrary agent state |
| updated_at | TEXT | NOT NULL | RFC3339 timestamp |

**Constraints:**
- FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE

---

### agent_wakeup_requests

Idempotent wakeup request tracking. Prevents duplicate triggers within a deduplication window.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL, FK → agents.id | Target agent |
| source | TEXT | NOT NULL | timer, manual, bridge, webhook, system |
| issue_id | TEXT | DEFAULT NULL | Future: associated issue |
| idempotency_key | TEXT | DEFAULT NULL | Dedup key (unique within window) |
| status | TEXT | NOT NULL, DEFAULT 'pending' | pending, claimed, completed, rejected |
| created_at | TEXT | NOT NULL | RFC3339 timestamp |

**Indexes:**
- `idx_wakeup_agent_status` on (agent_id, status) — find pending wakeups per agent
- `idx_wakeup_idempotency` on (idempotency_key) WHERE idempotency_key IS NOT NULL — dedup lookup

**Constraints:**
- FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
- CHECK (source IN ('timer', 'manual', 'bridge', 'webhook', 'system'))
- CHECK (status IN ('pending', 'claimed', 'completed', 'rejected'))

---

### agent_jobs (EXISTING — modified)

Add `agent_id` column to associate jobs with agents. Defaults to "agent-zero" for backward compatibility.

| Field | Type | Change | Description |
|-------|------|--------|-------------|
| agent_id | TEXT | **NEW**, NOT NULL, DEFAULT 'agent-zero' | FK → agents.id |

**New Index:**
- `idx_agent_jobs_agent_status` on (agent_id, status) — per-agent job lookup

**Migration:**
- Add column with default 'agent-zero'
- All existing rows automatically get agent_id = 'agent-zero'
- No data loss, no table rebuild needed (SQLite ADD COLUMN is fast)

---

## Bootstrap Sequence (Agent Zero)

On engine startup, after migrations complete:

```
1. Query: SELECT id FROM agents WHERE id = 'agent-zero'
2. If exists → done (normal boot)
3. If not exists → first boot or upgrade:
   a. BEGIN TRANSACTION
   b. INSERT INTO agents (id='agent-zero', name='Agent Zero', role='manager',
      status='idle', adapter_type='claude_local')
   c. Query heartbeat_state for existing config:
      - If exists: copy interval_seconds → heartbeat_interval_seconds,
        enabled → (if disabled, set heartbeat_interval_seconds=0)
   d. Query claude_sessions for latest session:
      - If exists: INSERT INTO agent_runtime_state (agent_id='agent-zero',
        session_id=<latest>)
   e. COMMIT
4. Log: "Agent Zero bootstrapped" or "Agent Zero exists"
```

## Migration Plan

**Migration 005_agents.sql** (Goose up):

```sql
-- Agent identity and configuration
CREATE TABLE agents ( ... );

-- Per-agent runtime state (sessions, custom state)
CREATE TABLE agent_runtime_state ( ... );

-- Idempotent wakeup request tracking
CREATE TABLE agent_wakeup_requests ( ... );

-- Associate existing jobs with agents
ALTER TABLE agent_jobs ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'agent-zero';
CREATE INDEX idx_agent_jobs_agent_status ON agent_jobs(agent_id, status);
```

**Note:** Agent Zero is NOT created in the migration. It's created by Go bootstrap code at startup, which can read heartbeat_state and claude_sessions for migration. SQL migrations should only do schema changes.
