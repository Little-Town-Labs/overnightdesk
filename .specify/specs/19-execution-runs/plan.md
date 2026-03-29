# Implementation Plan — Feature 19: Execution Runs

**Spec:** `spec.md` | **Branch:** `19-execution-runs` | **Repo:** `overnightdesk-engine`

---

## Architecture

```
Agent Queue (agentQueue.execute)
  │
  ├─ 1. Create run (status: queued)
  ├─ 2. Transition run (queued → running)
  ├─ 3. Record session_id_before
  ├─ 4. Execute Claude Code
  ├─ 5. Parse token usage from output
  ├─ 6. Update run (succeeded/failed/timed_out + tokens + exit_code)
  ├─ 7. Record session_id_after
  ├─ 8. Create run events (started, completed/failed)
  ├─ 9. Update issue status + result
  └─ 10. Send to ResultCh
```

## Phases

### Phase A: Migration 007
New `runs` and `run_events` tables.

### Phase B: Run Data Layer
CRUD for runs and events: CreateRun, GetRun, ListRuns, UpdateRunStatus, UpdateRunTokens, CreateRunEvent, ListRunEvents, MarkOrphanedRunsFailed.

### Phase C: Token Parser
Parse Claude Code stderr/stdout for token usage. Simple regex extraction — don't over-engineer. Return (inputTokens, outputTokens) or (0, 0) on parse failure.

### Phase D: Queue Integration
Modify `agentQueue.execute` in `queue/manager.go` to create/update runs around execution. The run wraps the existing execution flow. ResultCh still works.

### Phase E: Run API Endpoints
GET /api/runs (list with filters), GET /api/runs/:id (detail with events). Read-only — no create/update/delete via API.

### Phase F: Orphan Recovery
On engine boot, mark any runs in "running" status as "failed" with a restart event.

## Testing Strategy
- Migration test, run CRUD tests, token parser tests, queue integration tests, API tests, orphan recovery test.

## Constitutional Compliance
- [x] Test-first, 80%+ coverage
- [x] No data loss (runs are additive)
- [x] All endpoints behind bearer auth
