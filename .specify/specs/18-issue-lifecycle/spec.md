# Feature 18: Issue Lifecycle

**Status:** Draft
**Priority:** P0 (Critical)
**Complexity:** Large
**Repos:** `overnightdesk-engine`, `overnightdesk`

---

## Overview

Replace the flat `agent_jobs` table with a full issue lifecycle. Issues are the unit of work in OvernightDesk — every prompt, heartbeat check, cron task, and bridge message becomes an issue with a human-readable identifier (e.g., "OD-42"), a status workflow, priority, and an assigned agent. Issues support comments for agent-to-user collaboration and maintain full history.

This is the single largest user-facing change in Phase 8. The dashboard's jobs page becomes an issues page. The engine's job creation API becomes an issue creation API. Bridges create issues instead of jobs.

### Business Value

- Customers see meaningful work items instead of anonymous "pending/completed" jobs
- Status workflow gives visibility into what's happening (backlog, in progress, in review, done)
- Human-readable identifiers ("OD-42") are referenceable in Telegram, Discord, and dashboard
- Comments enable Agent Zero to explain its reasoning and customers to provide feedback
- Priority lets customers and agents triage what matters most
- Foundation for projects (Feature 20) which group issues

### What Changes for Existing Users

- **`POST /api/jobs` still works** — creates an issue internally, returns the same response shape for backward compatibility
- **`GET /api/jobs` still works** — reads from issues table, returns the same response shape
- **New `/api/issues` endpoints** provide the full issue experience (status workflow, comments, identifiers)
- **Bridges** create issues assigned to Agent Zero, with the message as description
- **Heartbeat/cron** create issues with source tracking
- **Dashboard** can use either `/api/jobs` (legacy) or `/api/issues` (new) — migration is gradual

---

## User Stories

### User Story 1: Issues Have Human-Readable Identifiers

**As a** customer reviewing my agent's work
**I want** each work item to have a readable identifier like "OD-42"
**So that** I can reference specific items in conversation ("what happened with OD-42?")

**Acceptance Criteria:**
- [ ] Each issue gets a sequential identifier with a configurable prefix (default: "OD")
- [ ] Identifiers are unique and never reused within an instance
- [ ] The identifier is included in all API responses for issues
- [ ] Bridges include the identifier when reporting results (e.g., "OD-42 completed: ...")
- [ ] Identifiers are assigned at creation time, not retroactively

**Priority:** High

### User Story 2: Issues Have a Status Workflow

**As a** customer monitoring my agents' progress
**I want** issues to progress through clear statuses
**So that** I can see what's queued, what's being worked on, and what's done

**Acceptance Criteria:**
- [ ] Issues support these statuses: backlog, todo, in_progress, in_review, done, failed
- [ ] New issues from dashboard/bridges start in "todo" status
- [ ] New issues from heartbeat/cron start in "todo" status
- [ ] When an agent starts working on an issue, status moves to "in_progress"
- [ ] When execution completes successfully, status moves to "done"
- [ ] When execution fails, status moves to "failed"
- [ ] Status can be manually changed via API (e.g., reopen a failed issue)
- [ ] The "backlog" status is available for issues created but not yet ready for agents

**Priority:** High

### User Story 3: Issues Are Assigned to Agents

**As a** system routing work to agents
**I want** each issue to be assigned to a specific agent
**So that** the right agent handles the right work

**Acceptance Criteria:**
- [ ] Every issue has an assignee (an agent) — defaults to Agent Zero
- [ ] Issues created via bridges are assigned to Agent Zero
- [ ] Issues created via heartbeat are assigned to the agent whose heartbeat triggered
- [ ] An issue's assignee can be changed via API
- [ ] Unassigning an issue (setting assignee to null) puts it in "backlog"
- [ ] An agent's queue only contains issues assigned to it

**Priority:** High

### User Story 4: Issues Have Priority

**As a** customer with multiple pending items
**I want** to set priority on issues
**So that** my agents work on the most important things first

**Acceptance Criteria:**
- [ ] Issues support priority levels: urgent, high, normal, low
- [ ] Default priority is "normal"
- [ ] Priority can be set at creation time
- [ ] Priority can be changed via API
- [ ] Agent queues process higher-priority issues first (urgent before high before normal before low)
- [ ] Within the same priority, issues are processed in creation order (FIFO)

**Priority:** Medium

### User Story 5: Issue Comments

**As a** customer collaborating with my agents
**I want** to add comments to issues and see agent responses
**So that** there's a conversation thread attached to each work item

**Acceptance Criteria:**
- [ ] Comments can be added to any issue
- [ ] Comments have an author — either an agent (by ID) or a source (dashboard, telegram, etc.)
- [ ] Comments are ordered by creation time
- [ ] Agents can add comments programmatically (e.g., progress updates during execution)
- [ ] The execution result is stored as the final comment on the issue when it completes
- [ ] Comments are returned as part of the issue detail API response

**Priority:** Medium

### User Story 6: View and Filter Issues

**As a** customer managing my OvernightDesk instance
**I want** to list issues with filtering and sorting
**So that** I can find what I'm looking for quickly

**Acceptance Criteria:**
- [ ] Issues can be listed with pagination (limit/offset)
- [ ] Issues can be filtered by status (single or multiple)
- [ ] Issues can be filtered by assignee agent
- [ ] Issues can be filtered by priority
- [ ] Issues can be filtered by source
- [ ] Issues are sorted by priority (descending) then creation time (descending) by default
- [ ] Total count is available for filtered results

**Priority:** High

### User Story 7: Backward-Compatible Job API

**As a** the existing dashboard and contract test suite
**I want** the `/api/jobs` endpoints to continue working unchanged
**So that** nothing breaks during the transition from jobs to issues

**Acceptance Criteria:**
- [ ] `POST /api/jobs` creates an issue internally, returns `{id, status: "pending"}` (same shape)
- [ ] `GET /api/jobs` returns issues formatted as the legacy job response shape
- [ ] `GET /api/jobs/:id` returns a single issue in legacy job format
- [ ] `DELETE /api/jobs/:id` deletes a pending issue
- [ ] All existing contract tests pass without modification
- [ ] The `source` field values remain the same (dashboard, heartbeat, cron, telegram, discord, automate)

**Priority:** High

---

## Functional Requirements

### FR-1: Issues Table
The engine must store issues with the following attributes:
- Unique identifier (internal, for FK references)
- Human-readable identifier (e.g., "OD-42", sequential, unique)
- Title (derived from prompt or explicitly set)
- Description (full prompt text or user-provided description)
- Status: backlog, todo, in_progress, in_review, done, failed
- Priority: urgent, high, normal, low
- Assignee agent reference (FK to agents, nullable for unassigned/backlog)
- Project reference (nullable FK, for Feature 20)
- Source: dashboard, heartbeat, cron, telegram, discord, automate, manual
- Result text (output from execution, nullable)
- Conversation reference (FK to conversations, nullable — preserves bridge context)
- Start and completion timestamps
- Creation and update timestamps

### FR-2: Issue Identifier Counter
The engine must maintain a monotonically increasing counter for issue identifiers:
- Counter starts at 1 for new instances
- Counter never decreases, even if issues are deleted
- Identifier prefix is configurable (default: "OD")
- Counter is atomic (no duplicates under concurrent creation)

### FR-3: Issue Comments
The engine must support comments on issues:
- Unique identifier per comment
- Issue reference (FK)
- Author agent reference (nullable — null for non-agent authors)
- Author source (dashboard, telegram, discord, system, agent)
- Content text
- Creation timestamp

### FR-4: Issue CRUD API
The engine must expose endpoints to:
- List issues with filters (status, assignee, priority, source) and pagination
- Get a single issue by ID or by identifier (e.g., "OD-42")
- Create an issue (title, description/prompt, priority, assignee, source)
- Update an issue (title, description, status, priority, assignee)
- Delete an issue (only if status is backlog or todo — active issues cannot be deleted)

### FR-5: Issue Comments API
The engine must expose endpoints to:
- List comments for an issue (ordered by creation time)
- Add a comment to an issue

### FR-6: Issue Status Transitions
Valid status transitions:
- `backlog` → `todo` (issue is ready for work)
- `todo` → `in_progress` (agent starts execution)
- `todo` → `backlog` (issue deprioritized)
- `in_progress` → `done` (execution succeeded)
- `in_progress` → `failed` (execution failed)
- `in_progress` → `in_review` (agent wants human review)
- `in_review` → `done` (review approved)
- `in_review` → `in_progress` (review rejected, rework needed)
- `failed` → `todo` (retry — requeue for execution)
- `done` → `todo` (reopen — needs more work)

Invalid transitions must be rejected with a clear error.

### FR-7: Priority Queue Ordering
When an agent's queue has multiple pending issues:
- Process in priority order: urgent > high > normal > low
- Within the same priority, process in creation order (FIFO)
- A newly created "urgent" issue should be processed before existing "normal" issues

### FR-8: Job API Backward Compatibility
The existing `/api/jobs` endpoints must continue to function by mapping to issues:
- `POST /api/jobs` → creates an issue with source from request, assignee = Agent Zero, status = todo
- `GET /api/jobs` → lists issues, formats response as legacy `EngineJobResponse` shape
- `GET /api/jobs/:id` → gets issue by internal ID, formats as legacy shape
- `DELETE /api/jobs/:id` → deletes issue if status is backlog or todo
- Response field mapping: issue.id → job.id, issue.description → job.prompt, issue.result → job.result, issue.status mapped (todo→pending, in_progress→running, done→completed, failed→failed)

### FR-9: Data Migration
On engine upgrade (migration):
- Existing `agent_jobs` rows must be migrated to the `issues` table
- Each existing job gets a sequential identifier
- Job status maps to issue status: pending→todo, running→in_progress, completed→done, failed→failed
- Job source, prompt, result, timestamps preserved
- All migrated issues assigned to Agent Zero
- `agent_jobs` table retained as read-only backup during transition

### FR-10: Bridge Integration
Telegram and Discord bridges must create issues instead of directly enqueuing jobs:
- Bridge creates issue with title derived from first line of message
- Bridge assigns issue to Agent Zero
- Bridge creates conversation link on the issue
- When issue completes, bridge includes identifier in response ("OD-42: [result]")

---

## Non-Functional Requirements

### NFR-1: Performance
- Issue list query with filters must return in < 100ms for up to 1000 issues
- Issue creation must complete in < 50ms
- Identifier generation must be atomic and contention-free
- Priority queue reordering must not add measurable latency to the existing queue

### NFR-2: Data Integrity
- Issue identifiers must be unique and sequential (no gaps under normal operation)
- Status transitions must be validated — invalid transitions rejected
- Assignee must reference an existing agent (FK enforced in application code)
- Migration must preserve all existing job data with zero loss

### NFR-3: Backward Compatibility
- All 28 existing contract tests must pass unchanged
- Dashboard proxy routes (`/api/engine/jobs/*`) must continue to work
- Engine status API must still include queue depth information
- No breaking changes to the Telegram/Discord bridge user experience

### NFR-4: Migration Safety
- Migration must be reversible (Goose down)
- Engine must function correctly whether migration has run or not (graceful degradation)
- No downtime during migration — engine can serve requests while migrating

---

## Edge Cases & Error Handling

### EC-1: Concurrent Identifier Generation
- Two issues created simultaneously must get unique sequential identifiers
- Counter update must be atomic (no duplicates, no gaps)

### EC-2: Status Transition Validation
- Attempting `backlog` → `done` (skipping in_progress) must be rejected
- Attempting to transition a deleted issue must return 404
- Agent completing an issue that was manually moved to "backlog" while running — issue stays in "done" (agent's completion takes precedence)

### EC-3: Assignee Agent Deleted
- If an agent is deleted while it has assigned issues, those issues become unassigned (assignee = null, status = backlog)
- Agent Zero cannot be deleted (Feature 17), so this only affects specialist agents

### EC-4: Migration with Large Job History
- Instances with thousands of existing jobs must migrate within the engine's startup timeout
- Migration runs in batches if needed
- If migration fails partway, the engine should still start using the `agent_jobs` table

### EC-5: Legacy API Status Mapping
- Issue status "backlog" maps to job status "pending" in legacy API
- Issue status "in_review" maps to job status "running" in legacy API (closest equivalent)
- New statuses not representable in legacy API are mapped to the closest equivalent

### EC-6: Issue Deletion with Comments
- Deleting an issue also deletes its comments (cascade)
- Deleting an issue that is in_progress is rejected — must be failed or done first

### EC-7: Empty Title
- Issues created via `POST /api/jobs` (no title field) derive title from first 100 chars of prompt
- Issues created via bridges derive title from first line of message
- Title must never be empty — fall back to "Untitled issue"

---

## Success Metrics

- All existing contract tests pass without modification (28 tests)
- Issue creation and listing performs within NFR-1 bounds
- Migration completes successfully for instances with 0, 100, and 10,000 existing jobs
- Bridges include issue identifiers in responses
- Priority queue correctly processes urgent issues before normal issues

---

## Out of Scope

- Project association (Feature 20)
- Execution run tracking as separate entity (Feature 19)
- Cost tracking per issue (Feature 21)
- Dashboard UI for issues (Feature 26)
- Issue labels/tags
- Issue attachments/documents
- Issue-to-issue linking
