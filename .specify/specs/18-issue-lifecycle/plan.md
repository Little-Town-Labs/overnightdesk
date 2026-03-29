# Implementation Plan — Feature 18: Issue Lifecycle

**Spec:** `spec.md` | **Branch:** `18-issue-lifecycle` | **Repo:** `overnightdesk-engine`

---

## Executive Summary

Replace the flat `agent_jobs` model with a full issue lifecycle. New `issues` table with human-readable identifiers, status workflow, priority queue, and comments. Migrate existing job data. Preserve `/api/jobs` backward compatibility via adapter layer. Evolve the agent queue from channel-based FIFO to signal-based priority queue.

---

## Architecture Overview

```
                    ┌─────────────────────────────┐
                    │         API Server           │
                    ├─────────────────────────────┤
                    │  /api/issues (NEW)           │
                    │  /api/issues/:id/comments    │
                    │  /api/jobs (LEGACY ADAPTER)  │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │     Issue Service            │
                    │  CreateIssue()               │
                    │  NextIssueForAgent()         │
                    │  UpdateIssueStatus()         │
                    │  ValidateTransition()        │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  AgentQueueManager (modified)│
                    │  Signal-based wake           │
                    │  DB-driven priority ordering │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  issues table (SQLite)       │
                    │  Priority: urgent>high>...   │
                    │  Status: todo→in_progress→...│
                    └─────────────────────────────┘
```

---

## Implementation Phases

### Phase A: Database Schema (Migration 006)

**New file:** `internal/database/migrations/006_issues.sql`

- Create `issues` table with all columns, constraints, indexes
- Create `issue_comments` table
- Create `issue_counter` table with seed
- Migrate data from `agent_jobs` → `issues`
- Update counter to reflect migrated data

### Phase B: Issue Data Layer

**New file:** `internal/database/issues.go`

Query functions:
- `NextIssueNumber()` — atomic increment of counter, returns "OD-42" style identifier
- `CreateIssue(issue)` — insert with generated identifier
- `GetIssue(id)` — by UUID
- `GetIssueByIdentifier(identifier)` — by "OD-42"
- `ListIssues(filters, limit, offset)` — with status/assignee/priority/source filters + total count
- `UpdateIssue(id, updates)` — partial update
- `UpdateIssueStatus(id, status)` — with validation
- `UpdateIssueResult(id, result)` — store execution output
- `DeleteIssue(id)` — only backlog/todo
- `NextIssueForAgent(agentID)` — priority-ordered next work item
- `CountIssuesByAgent(agentID, status)` — queue depth
- `CreateComment(comment)` — add comment to issue
- `ListComments(issueID)` — ordered by created_at

### Phase C: Status Transition Validation

**New file:** `internal/issue/transitions.go`

Pure function for status transition validation:
- `ValidateTransition(from, to) error` — returns nil if valid, error with message if not
- Transition map as defined in spec FR-6

### Phase D: Queue Evolution (Signal-Based)

**Modify:** `internal/queue/manager.go`

Evolve `agentQueue` from `chan Job` to `chan struct{}` (wake signal):
- On signal received, query `NextIssueForAgent(agentID)` from DB
- If issue found: set status to in_progress, execute, set status to done/failed
- If no issue: go back to waiting
- `Enqueue(agentID, job)` becomes `Wake(agentID)` — just sends a signal
- Existing `Enqueue` with full Job still works for backward compat during transition

**New file:** `internal/queue/issue_executor.go`

Issue-aware execution logic:
- Fetch issue from DB
- Set status in_progress
- Build prompt from issue.description
- Execute via Claude
- Store result, set status done/failed
- Add completion comment
- Send to ResultCh if present

### Phase E: Issue API Endpoints

**New file:** `internal/api/issues.go`

CRUD + comments:
- `GET /api/issues` — list with filters
- `POST /api/issues` — create (generates identifier, assigns agent)
- `GET /api/issues/:id` — detail with comments (accepts UUID or identifier)
- `PUT /api/issues/:id` — update (validates status transitions)
- `DELETE /api/issues/:id` — delete (backlog/todo only)
- `GET /api/issues/:id/comments` — list comments
- `POST /api/issues/:id/comments` — add comment

### Phase F: Legacy Job Adapter

**Modify:** `internal/api/jobs.go`

Rewrite handlers to read/write issues table:
- `handleCreateJob` → creates issue, returns legacy shape
- `handleListJobs` → lists issues, maps status/format to legacy
- `handleGetJob` → gets issue, maps to legacy
- `handleDeleteJob` → deletes issue (backlog/todo only)

### Phase G: Bridge + Scheduler Integration

**Modify:** Telegram handlers, Discord handlers, heartbeat, cron

Replace `queries.CreateJob()` calls with issue creation:
- Create issue with source, title, description, assignee
- Wake the agent queue
- ResultCh pattern preserved — bridges still wait for completion

### Phase H: Enqueuer Interface Update

**Modify:** `internal/queue/enqueuer.go`

Add issue-aware methods to the interface so callers can create issues + wake agents in one call.

---

## Testing Strategy

1. **Migration tests** — migration applies, data preserved, counter correct
2. **Issue data layer tests** — CRUD, filters, priority ordering, identifier generation, comments
3. **Transition validation tests** — all valid/invalid transitions
4. **Queue tests** — signal-based wake, priority ordering, backward compat
5. **API tests** — all issue endpoints + legacy job adapter
6. **Integration tests** — bridge creates issue, agent executes, result returned

---

## Constitutional Compliance

- [x] **Principle 1 (Data Sacred):** Migration preserves all data. agent_jobs kept as backup.
- [x] **Principle 2 (Security):** All new endpoints behind bearer auth. Input validated.
- [x] **Principle 4 (Simple):** Signal-based queue is simpler than sorted channels. Adapter pattern for backward compat.
- [x] **Principle 8 (Quality):** Human-readable identifiers. Clear status workflow.
- [x] **Test-First Imperative:** TDD for all new code.
