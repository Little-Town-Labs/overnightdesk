# Task Breakdown — Feature 18: Issue Lifecycle

**Spec:** `spec.md` | **Plan:** `plan.md` | **Branch:** `18-issue-lifecycle`

---

## Phase 1: Schema & Data Layer

### Task 1.1: Database Migration (006_issues.sql)
**Status:** 🟡 Ready
**Effort:** 2 hours
**Dependencies:** None

Create migration with issues, issue_comments, issue_counter tables. Migrate agent_jobs data.

**Acceptance Criteria:**
- [ ] Migration applies on fresh DB
- [ ] Migration applies on DB with existing agent_jobs data
- [ ] Migrated issues have sequential identifiers
- [ ] Status mapping correct (pending→todo, etc.)
- [ ] issue_counter reflects migrated count
- [ ] Goose down reverses cleanly

### Task 1.2: Issue Data Layer — Tests (TDD RED)
**Status:** 🔴 Blocked by 1.1
**Effort:** 3 hours
**Dependencies:** Task 1.1

Tests for `internal/database/issues.go`:
- CRUD: Create, Get (by ID and identifier), List, Update, Delete
- Identifier generation: sequential, atomic, unique
- Status filter, assignee filter, priority filter, source filter
- Priority ordering: NextIssueForAgent returns highest priority first
- Pagination with total count
- Delete rejection for active issues
- Comments: Create, List (ordered)
- Cascade delete (issue deleted → comments deleted)

### Task 1.3: Issue Data Layer — Implementation (TDD GREEN)
**Status:** 🔴 Blocked by 1.2
**Effort:** 4 hours
**Dependencies:** Task 1.2

Implement all query functions to pass tests.

### Task 1.4: Status Transition — Tests (TDD RED)
**Status:** 🟡 Ready
**Effort:** 1 hour
**Dependencies:** None
**Parallel with:** Task 1.1

Test `ValidateTransition(from, to)` for all valid and invalid transitions per FR-6.

### Task 1.5: Status Transition — Implementation (TDD GREEN)
**Status:** 🔴 Blocked by 1.4
**Effort:** 1 hour
**Dependencies:** Task 1.4

Implement transition validation map.

---

## Phase 2: Queue Evolution

### Task 2.1: Signal-Based Queue — Tests (TDD RED)
**Status:** 🔴 Blocked by 1.3
**Effort:** 3 hours
**Dependencies:** Task 1.3

Tests for modified `agentQueue`:
- Wake signal → fetches next issue from DB by priority
- No issue available → goes back to waiting (no panic)
- Priority ordering: urgent processed before normal
- Status transitions: todo→in_progress→done on successful execution
- Status transitions: todo→in_progress→failed on error
- Result stored on issue after execution
- ResultCh still works (bridges receive completion)
- Backward compat: legacy Enqueue still functions
- Completion comment added automatically

### Task 2.2: Signal-Based Queue — Implementation (TDD GREEN)
**Status:** 🔴 Blocked by 2.1
**Effort:** 4 hours
**Dependencies:** Task 2.1, Task 1.5

Modify `agentQueue` execution loop and add issue-aware executor.

---

## Phase 3: API Endpoints

### Task 3.1: Issue API — Tests (TDD RED)
**Status:** 🔴 Blocked by 1.3
**Effort:** 3 hours
**Dependencies:** Task 1.3
**Parallel with:** Task 2.1

Tests for all issue endpoints:
- List with filters (status, assignee, priority, source, pagination)
- Create issue (happy path, validation, identifier assigned)
- Get by UUID and by identifier ("OD-42")
- Update (status transition validation, partial update)
- Delete (backlog/todo only, reject active)
- Comments: list and create
- Auth required on all endpoints

### Task 3.2: Issue API — Implementation (TDD GREEN)
**Status:** 🔴 Blocked by 3.1, 1.5
**Effort:** 3 hours
**Dependencies:** Task 3.1, Task 1.5

Implement all handlers.

---

## Phase 4: Legacy Adapter & Integration

### Task 4.1: Job Adapter — Tests (TDD RED)
**Status:** 🔴 Blocked by 1.3
**Effort:** 2 hours
**Dependencies:** Task 1.3
**Parallel with:** Tasks 2.1, 3.1

Tests verifying:
- POST /api/jobs creates issue, returns legacy shape
- GET /api/jobs lists issues in legacy format
- GET /api/jobs/:id returns issue in legacy format
- DELETE /api/jobs/:id deletes backlog/todo issue
- Status mapping: todo→pending, in_progress→running, done→completed
- All 28 existing contract tests pass (import and run them)

### Task 4.2: Job Adapter — Implementation (TDD GREEN)
**Status:** 🔴 Blocked by 4.1
**Effort:** 2 hours
**Dependencies:** Task 4.1

Rewrite jobs.go handlers to use issues table with response mapping.

### Task 4.3: Bridge Integration
**Status:** 🔴 Blocked by 2.2
**Effort:** 2 hours
**Dependencies:** Task 2.2

Modify Telegram and Discord handlers:
- Replace `queries.CreateJob()` with issue creation
- Include identifier in bridge responses ("OD-42: result...")
- Wake agent queue after issue creation
- Preserve ResultCh pattern

### Task 4.4: Scheduler Integration
**Status:** 🔴 Blocked by 2.2
**Effort:** 1 hour
**Dependencies:** Task 2.2

Modify heartbeat and cron:
- Replace `queries.CreateJob()` with issue creation
- Wake agent queue after issue creation
- Preserve ResultCh pattern for heartbeat

---

## Phase 5: Quality Gates

### Task 5.1: Full Test Suite + Race Detector
**Status:** 🔴 Blocked by 4.4
**Effort:** 1 hour
**Dependencies:** All implementation tasks

- `go test ./...` passes
- `go test -race ./...` passes
- Coverage >= 80% on new code
- All 28 pre-existing contract tests pass

### Task 5.2: Code Review
**Status:** 🔴 Blocked by 5.1
**Effort:** 1 hour
**Dependencies:** Task 5.1

Run `/code-review` on all changed files.

### Task 5.3: Simplify
**Status:** 🔴 Blocked by 5.2
**Effort:** 1 hour
**Dependencies:** Task 5.2

Run `/simplify` to clean up code quality.

---

## Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1. Schema & Data | 1.1-1.5 | 11 hours |
| 2. Queue Evolution | 2.1-2.2 | 7 hours |
| 3. API Endpoints | 3.1-3.2 | 6 hours |
| 4. Legacy + Integration | 4.1-4.4 | 7 hours |
| 5. Quality Gates | 5.1-5.3 | 3 hours |
| **Total** | **16 tasks** | **34 hours** |

## Critical Path

```
1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 4.3 → 4.4 → 5.1 → 5.2 → 5.3
```

## Parallelization

```
After 1.1: 1.2 and 1.4 can run in parallel
After 1.3: 2.1, 3.1, and 4.1 can all run in parallel
After 2.2: 4.3 and 4.4 can run in parallel
```
