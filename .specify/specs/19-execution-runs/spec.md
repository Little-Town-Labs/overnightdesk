# Feature 19: Execution Runs

**Status:** Draft
**Priority:** P0 (Critical)
**Complexity:** Medium
**Repos:** `overnightdesk-engine`

---

## Overview

Separate "what needs to be done" (issues) from "what happened when we tried" (runs). Today, execution state (running, completed, duration, result) lives directly on the issue. This conflates the work item with the execution attempt. An issue that fails and is retried has no history — only the latest attempt is visible.

Execution runs are the record of each time an agent works on an issue. Each run captures status, timing, token usage, exit code, and session state. An issue can have multiple runs (retries, rework). The agent queue consumes issues but produces runs.

### Business Value

- Customers see execution history per issue (not just "it failed" but "it failed twice, then succeeded")
- Token usage tracked per run enables cost attribution (Feature 21)
- Session state tracked per run enables session continuity debugging
- Run events provide structured logs for diagnosing agent behavior
- Foundation for cost governance (Feature 21) and activity log (Feature 25)

### What Changes

- The agent queue creates a run when it starts working on an issue, updates it when done
- Issue status still reflects the latest outcome, but runs hold the full history
- Token usage (input/output tokens) captured from Claude's stream-json output
- The existing `ResultCh` pattern now carries run information, not just output text

---

## User Stories

### User Story 1: View Execution History for an Issue

**As a** customer reviewing an issue
**I want** to see every execution attempt with timing and outcome
**So that** I can understand what happened and why

**Acceptance Criteria:**
- [ ] Each issue shows a list of runs ordered by creation time
- [ ] Each run shows: status, agent, duration, token usage, started/finished timestamps
- [ ] Failed runs show the error or stderr output
- [ ] Successful runs show the result output
- [ ] An issue retried 3 times shows 3 separate runs

**Priority:** High

### User Story 2: Track Token Usage Per Run

**As a** customer monitoring costs
**I want** each run to record how many input and output tokens were used
**So that** I can track API consumption per agent and per issue

**Acceptance Criteria:**
- [ ] Each run records input_tokens and output_tokens
- [ ] Token counts come from Claude Code's execution output
- [ ] Token usage is available via API on the run detail
- [ ] Aggregate token usage can be queried per agent

**Priority:** High

### User Story 3: Run Lifecycle Tracking

**As a** system executing agent work
**I want** runs to have a clear lifecycle
**So that** the state of execution is always unambiguous

**Acceptance Criteria:**
- [ ] Runs have statuses: queued, running, succeeded, failed, timed_out, cancelled
- [ ] A run transitions queued → running when the agent starts execution
- [ ] A run transitions running → succeeded when Claude completes successfully
- [ ] A run transitions running → failed when Claude exits with error
- [ ] A run transitions running → timed_out when the 10-minute timeout is reached
- [ ] A run can be cancelled (running → cancelled) if the agent is paused or deleted
- [ ] Only one run per agent can be in "running" status at a time

**Priority:** High

### User Story 4: Session Continuity Tracking

**As a** system managing agent sessions
**I want** each run to record the session state before and after execution
**So that** session continuity can be debugged and managed

**Acceptance Criteria:**
- [ ] Each run records session_id_before (the session used for --resume)
- [ ] Each run records session_id_after (the session returned by Claude)
- [ ] Session state is updated on the agent's runtime state after each run
- [ ] If a session is rotated (new session started), the run shows the change

**Priority:** Medium

### User Story 5: Run Events (Structured Logging)

**As a** customer debugging agent behavior
**I want** structured events within each run
**So that** I can see what happened step by step

**Acceptance Criteria:**
- [ ] Events are recorded during run execution with type and payload
- [ ] Event types include: started, completed, failed, timed_out, log, error
- [ ] Events are ordered by creation time
- [ ] Events are accessible via API on the run detail
- [ ] The execution output is stored as a "completed" event (not duplicated on the run)

**Priority:** Medium

### User Story 6: List and Filter Runs

**As a** customer monitoring agent activity
**I want** to list runs across all issues with filtering
**So that** I can see overall execution activity

**Acceptance Criteria:**
- [ ] Runs can be listed with pagination
- [ ] Runs can be filtered by agent
- [ ] Runs can be filtered by status
- [ ] Runs can be filtered by issue
- [ ] Runs are sorted by creation time (newest first)

**Priority:** Medium

---

## Functional Requirements

### FR-1: Runs Table
Store execution runs with:
- Unique identifier
- Agent reference (FK to agents)
- Issue reference (FK to issues)
- Status: queued, running, succeeded, failed, timed_out, cancelled
- Source (inherited from issue: dashboard, heartbeat, etc.)
- Exit code (from Claude process, nullable)
- Input tokens consumed (integer, 0 if unknown)
- Output tokens produced (integer, 0 if unknown)
- Cost in cents (integer, 0 if unknown — for Feature 21)
- Session ID before execution (nullable)
- Session ID after execution (nullable)
- Started and finished timestamps
- Creation timestamp

### FR-2: Run Events Table
Store structured events within runs:
- Unique identifier
- Run reference (FK to runs)
- Event type: started, completed, failed, timed_out, cancelled, log, error
- Payload (structured data, stored as text)
- Creation timestamp

### FR-3: Run CRUD API
- List runs with filters (agent, status, issue) and pagination
- Get a single run by ID (includes events)
- Runs are created internally by the queue, not via direct API creation
- No update/delete API — runs are immutable records

### FR-4: Queue Creates Runs
When the agent queue starts working on an issue:
1. Create a run (status: queued → running)
2. Record session_id_before from agent runtime state
3. Execute Claude Code
4. Record result, exit code, token usage, session_id_after
5. Update run status (succeeded/failed/timed_out)
6. Update issue status and result
7. Store completion as run event
8. Update agent runtime state with new session ID
9. Send result to ResultCh (for bridges/heartbeat)

### FR-5: Token Extraction
Parse Claude Code output for token usage:
- Claude's `--output-format stream-json` includes usage data
- For `--print` mode (current), parse stderr for usage summary
- If parsing fails, record 0 tokens (don't block execution)

### FR-6: Run-Issue Relationship
- An issue can have many runs (retries, rework)
- The issue's status and result reflect the most recent run's outcome
- Deleting an issue cascades to its runs and run events

---

## Non-Functional Requirements

### NFR-1: Performance
- Run creation must add < 10ms to the existing execution path
- Run list query must return in < 100ms for up to 5000 runs
- Run events must not significantly increase DB size (cap at 50 events per run)

### NFR-2: Data Integrity
- Only one run per agent can be "running" at a time (enforced by queue, not DB constraint)
- Token counts must be non-negative
- Runs are append-only — no updates after status is terminal (succeeded/failed/timed_out/cancelled)

### NFR-3: Backward Compatibility
- Existing ResultCh pattern must continue working
- Issue status/result still updated for backward compat with `/api/jobs` adapter
- No changes to bridge or heartbeat behavior

---

## Edge Cases

### EC-1: Engine Restart During Run
- If the engine restarts while a run is "running", the run should be marked "failed" on next boot with an event explaining the restart

### EC-2: Zero Token Usage
- If Claude output can't be parsed for tokens, store 0 (not null) — callers can assume 0 means "unknown"

### EC-3: Issue Has No Runs
- Newly created issues have no runs until an agent picks them up
- The API should return an empty runs array, not an error

### EC-4: Concurrent Runs on Same Issue
- If an issue is reassigned to a different agent while another agent's run is in progress, the second agent should not create a duplicate run — the issue's status check (in_progress) prevents this

---

## Success Metrics

- Every execution creates a run record (100% coverage)
- Token usage captured on > 90% of successful runs
- Run history queryable per issue and per agent
- No increase in execution latency beyond 10ms

---

## Out of Scope

- Cost calculation from tokens (Feature 21)
- Dashboard UI for runs (Feature 26)
- Run cancellation via API (future — requires process management)
- Streaming run events via WebSocket (future)
