# Data Model — Feature 19: Execution Runs

## Entity Relationship

```
agents (1) ──── (0..N) runs
issues (1) ──── (0..N) runs
runs   (1) ──── (0..N) run_events
```

## Tables

### runs

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | FK → agents.id |
| issue_id | TEXT | NOT NULL | FK → issues.id |
| status | TEXT | NOT NULL, DEFAULT 'queued' | queued, running, succeeded, failed, timed_out, cancelled |
| source | TEXT | NOT NULL | Inherited from issue |
| exit_code | INTEGER | DEFAULT NULL | Claude process exit code |
| input_tokens | INTEGER | NOT NULL, DEFAULT 0 | Tokens consumed |
| output_tokens | INTEGER | NOT NULL, DEFAULT 0 | Tokens produced |
| cost_cents | INTEGER | NOT NULL, DEFAULT 0 | Estimated cost (Feature 21) |
| session_id_before | TEXT | DEFAULT NULL | Session used for --resume |
| session_id_after | TEXT | DEFAULT NULL | Session after execution |
| started_at | TEXT | DEFAULT NULL | RFC3339 |
| finished_at | TEXT | DEFAULT NULL | RFC3339 |
| created_at | TEXT | NOT NULL | RFC3339 |

**Indexes:**
- `idx_runs_agent_status` on (agent_id, status)
- `idx_runs_issue` on (issue_id, created_at)

**Constraints:**
- CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled'))

### run_events

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| run_id | TEXT | NOT NULL | FK → runs.id |
| event_type | TEXT | NOT NULL | started, completed, failed, timed_out, cancelled, log, error |
| payload | TEXT | NOT NULL, DEFAULT '{}' | JSON structured data |
| created_at | TEXT | NOT NULL | RFC3339 |

**Indexes:**
- `idx_run_events_run` on (run_id, created_at)

## Migration 007_runs.sql

- Create `runs` and `run_events` tables
- No data migration needed (new tables, no existing run data)
