# Task Breakdown — Feature 19: Execution Runs

## Phase 1: Schema & Data Layer

### Task 1.1: Migration 007_runs.sql
**Effort:** 30 min | **Dependencies:** None

### Task 1.2: Run Data Layer — Tests (RED)
**Effort:** 2 hours | **Dependencies:** 1.1
Tests: CreateRun, GetRun, ListRuns (filters, pagination), UpdateRunStatus, UpdateRunTokens, CreateRunEvent, ListRunEvents, cascade delete, MarkOrphanedRunsFailed.

### Task 1.3: Run Data Layer — Implementation (GREEN)
**Effort:** 2 hours | **Dependencies:** 1.2

## Phase 2: Token Parser

### Task 2.1: Token Parser — Tests (RED)
**Effort:** 1 hour | **Dependencies:** None (parallel with Phase 1)
Tests: parse valid usage line, parse missing usage, parse malformed output, return 0/0 on failure.

### Task 2.2: Token Parser — Implementation (GREEN)
**Effort:** 1 hour | **Dependencies:** 2.1

## Phase 3: Queue Integration

### Task 3.1: Queue Run Integration — Tests (RED)
**Effort:** 2 hours | **Dependencies:** 1.3, 2.2
Tests: execution creates run, successful run → succeeded, failed run → failed, timeout → timed_out, tokens recorded, session tracked, ResultCh still works, issue status updated.

### Task 3.2: Queue Run Integration — Implementation (GREEN)
**Effort:** 3 hours | **Dependencies:** 3.1

## Phase 4: API & Recovery

### Task 4.1: Run API — Tests (RED)
**Effort:** 1 hour | **Dependencies:** 1.3
Tests: list runs, filter by agent/status/issue, get run detail with events, auth required.

### Task 4.2: Run API — Implementation (GREEN)
**Effort:** 1 hour | **Dependencies:** 4.1

### Task 4.3: Orphan Recovery
**Effort:** 1 hour | **Dependencies:** 1.3
Mark "running" runs as "failed" on boot.

## Phase 5: Quality Gates

### Task 5.1: Full test suite + race detector
### Task 5.2: Code review + simplify

## Summary
| Phase | Effort |
|-------|--------|
| 1. Schema & Data | 4.5 hours |
| 2. Token Parser | 2 hours |
| 3. Queue Integration | 5 hours |
| 4. API & Recovery | 3 hours |
| 5. Quality | 2 hours |
| **Total** | **16.5 hours** |

## Critical Path
1.1 → 1.2 → 1.3 → 3.1 → 3.2 → 5.1 → 5.2
