# Data Model: Routines

## Entity: routines

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PK | UUID |
| agent_id | TEXT | NOT NULL | Owning agent |
| name | TEXT | NOT NULL | Human-readable name |
| description | TEXT | | Optional description |
| enabled | INTEGER | NOT NULL DEFAULT 1 | Boolean flag |
| trigger_type | TEXT | NOT NULL | 'cron' or 'interval' |
| trigger_config | TEXT | NOT NULL | Cron expression or interval seconds |
| prompt | TEXT | NOT NULL | Prompt text sent to agent |
| concurrency_policy | TEXT | NOT NULL DEFAULT 'allow' | 'skip', 'queue', 'allow' |
| quiet_start | INTEGER | | Hour 0-23, nullable |
| quiet_end | INTEGER | | Hour 0-23, nullable |
| timezone | TEXT | NOT NULL DEFAULT 'UTC' | IANA timezone |
| last_run_at | TEXT | | ISO8601 timestamp |
| next_run_at | TEXT | | ISO8601 timestamp |
| run_count | INTEGER | NOT NULL DEFAULT 0 | Total executions |
| consecutive_failures | INTEGER | NOT NULL DEFAULT 0 | Auto-disable at 5 |
| created_at | TEXT | NOT NULL | ISO8601 |
| updated_at | TEXT | NOT NULL | ISO8601 |

## Indexes

- `idx_routines_agent_id` on agent_id (filter by agent)
- `idx_routines_next_run` on next_run_at WHERE enabled = 1 (scheduler query)

## Relationships

- routines.agent_id references agents.id (manual cascade on agent delete)
- Routine dispatch creates issues (issues.source = 'routine')
- Issues created by routines link back via source field

## Migration Notes

- Add 'routine' to issues source CHECK constraint
- No FK pragma enforcement — manual cascade in Go DeleteAgent
