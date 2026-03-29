# Feature 17: Agent Data Model

**Status:** Draft
**Priority:** P0 (Critical)
**Complexity:** Medium
**Repos:** `overnightdesk-engine`

---

## Overview

Transform the engine from a single-purpose Claude Code executor into a multi-agent orchestration platform. Agents become first-class entities with identity, state, configuration, execution history, and hierarchy. Agent Zero is pre-seeded on first boot as the default manager agent that all existing inputs (dashboard, bridges, heartbeat, cron) route through.

This is the foundational data model that all subsequent Phase 8 features (issues, runs, projects, costs, routines, approvals) depend on.

### Business Value

- Enables customers to have specialized agents for different aspects of their business (e.g., "Email Agent", "Code Agent", "Report Agent")
- Agent Zero becomes a named entity with persistent identity rather than an anonymous Claude process
- Budget tracking per agent prevents runaway API costs
- Org hierarchy enables Agent Zero to delegate to specialist agents
- Foundation for the multi-agent dashboard experience

### What Changes for Existing Users

- **Nothing breaks.** Existing job creation, heartbeat, cron, and bridge flows continue to work, routed to Agent Zero.
- Agent Zero inherits the current session, heartbeat config, and workspace.
- The `agent_jobs` table remains operational during the transition period (Feature 18 migrates it to issues).

---

## User Stories

### User Story 1: Agent Zero Exists by Default

**As a** customer with a running OvernightDesk instance
**I want** Agent Zero to exist as a named agent from the moment my container starts
**So that** I have a working assistant immediately without any setup

**Acceptance Criteria:**
- [ ] On first engine boot, an agent named "Agent Zero" is automatically created
- [ ] Agent Zero has status "idle" and is ready to accept work
- [ ] Agent Zero inherits the existing heartbeat configuration
- [ ] Agent Zero inherits the existing Claude Code session
- [ ] All existing job sources (dashboard, heartbeat, cron, telegram, discord, automate) route to Agent Zero
- [ ] No action required from the customer — the upgrade is transparent

**Priority:** High

### User Story 2: View All Agents

**As a** customer managing my OvernightDesk instance
**I want** to see a list of all agents with their current status
**So that** I can monitor what my agents are doing at a glance

**Acceptance Criteria:**
- [ ] An API endpoint returns all agents with their name, role, status, and last activity
- [ ] Agent status reflects current state: idle, running, paused, error
- [ ] Response includes agent hierarchy (who reports to whom)
- [ ] Agents are ordered by creation time (Agent Zero first)

**Priority:** High

### User Story 3: Create a Specialist Agent

**As a** customer who wants to delegate specific tasks
**I want** to create a new agent with a name, role, and configuration
**So that** I can have specialized agents for different types of work

**Acceptance Criteria:**
- [ ] A new agent can be created with a name and role description
- [ ] The new agent can be assigned to report to an existing agent (e.g., Agent Zero)
- [ ] The new agent gets its own independent session (not shared with other agents)
- [ ] The new agent starts in "idle" status
- [ ] The new agent can have a custom heartbeat interval or no heartbeat
- [ ] Agent names must be unique within the instance

**Priority:** High

### User Story 4: Configure Agent Budget

**As a** customer concerned about API costs
**I want** to set a monthly spending limit per agent
**So that** no single agent can run up excessive charges

**Acceptance Criteria:**
- [ ] Each agent can have a monthly budget limit (in cents)
- [ ] The system tracks how much each agent has spent in the current billing period
- [ ] When an agent reaches its budget limit, it is paused with reason "budget"
- [ ] A budget of 0 means unlimited (no enforcement)
- [ ] Budget resets at the start of each calendar month

**Priority:** Medium

### User Story 5: Pause and Resume an Agent

**As a** customer who needs to temporarily stop an agent
**I want** to pause an agent and resume it later
**So that** I can control when agents are active without deleting them

**Acceptance Criteria:**
- [ ] An agent can be paused, recording the pause reason (manual, budget, error)
- [ ] A paused agent does not accept new work or run heartbeats
- [ ] A paused agent can be resumed, returning to "idle" status
- [ ] Agent Zero can be paused (all work stops) but cannot be deleted
- [ ] Pausing an agent while it has a running job waits for the job to complete before pausing

**Priority:** Medium

### User Story 6: Agent Execution Independence

**As a** system running multiple agents
**I want** each agent to execute work independently with its own session
**So that** agents don't interfere with each other's context

**Acceptance Criteria:**
- [ ] Each agent maintains its own session state (session ID, custom state)
- [ ] Each agent's session persists across runs (resumable)
- [ ] Multiple agents can be queued for execution simultaneously
- [ ] Each agent processes its own queue serially (one job at a time per agent)
- [ ] Different agents can run in parallel (agent-level parallelism, not job-level)
- [ ] An agent's failure does not affect other agents' execution

**Priority:** High

### User Story 7: Trigger a Specific Agent

**As a** system or customer
**I want** to wake up a specific agent to perform work
**So that** the right agent handles the right task

**Acceptance Criteria:**
- [ ] A wakeup request can target a specific agent by ID
- [ ] Duplicate wakeup requests for the same agent with the same idempotency key are deduplicated
- [ ] A wakeup request for a paused agent is rejected with a clear error
- [ ] A wakeup request for an already-running agent is queued
- [ ] The wakeup source is recorded (timer, manual, bridge, webhook)

**Priority:** High

---

## Functional Requirements

### FR-1: Agents Table
The engine must store agents with the following attributes:
- Unique identifier
- Display name (unique within instance)
- Role description (free text)
- Current status: idle, running, paused, error
- Pause reason (if paused): manual, budget, error
- Adapter type (default: "claude_local" for Claude Code CLI)
- Runtime configuration (arbitrary key-value, stored as structured data)
- Heartbeat interval in seconds (0 = no heartbeat)
- Last heartbeat timestamp
- Monthly budget limit in cents (0 = unlimited)
- Monthly spend in cents (current period)
- Reports-to reference (self-referential, nullable — null means top-level)
- Creation and update timestamps

### FR-2: Agent Runtime State
The engine must store per-agent runtime state separately from the agent definition:
- Agent reference
- Current session identifier (for Claude Code `--resume`)
- Custom state (arbitrary structured data for agent-specific context)
- Last updated timestamp

This separation allows agent config to change without disrupting active sessions.

### FR-3: Agent Wakeup Requests
The engine must support idempotent agent wakeup requests:
- Unique identifier
- Target agent reference
- Source (timer, manual, bridge, webhook, system)
- Associated work item reference (nullable — for future issue association)
- Idempotency key (for deduplication within a time window)
- Status: pending, claimed, completed, rejected
- Creation timestamp

### FR-4: Agent Zero Bootstrap
On first engine boot (empty agents table), the engine must:
- Create an agent named "Agent Zero" with role "manager"
- Set Agent Zero as the top-level agent (reports_to = null)
- Migrate the existing heartbeat configuration to Agent Zero's heartbeat interval
- Associate the existing Claude Code session with Agent Zero's runtime state
- Set Agent Zero's status to "idle"

On subsequent boots, Agent Zero must already exist — no duplicate creation.

### FR-5: Agent CRUD API
The engine must expose endpoints to:
- List all agents (with status, role, budget, hierarchy)
- Get a single agent by ID (full detail including runtime state)
- Create a new agent (name, role, reports_to, heartbeat config, budget)
- Update an agent (name, role, reports_to, heartbeat config, budget, runtime config)
- Pause an agent (with reason)
- Resume a paused agent
- Delete an agent (not allowed for Agent Zero)

### FR-6: Agent-Aware Queue
The engine must evolve the job queue to be agent-aware:
- Each agent has its own logical queue
- Jobs are enqueued targeting a specific agent
- Each agent processes its queue serially (one at a time)
- Multiple agents can execute in parallel
- Queue depth is reported per agent and in aggregate
- The existing job creation API continues to work by defaulting to Agent Zero

### FR-7: Backward Compatibility
All existing API endpoints must continue to function:
- `POST /api/jobs` — creates a job assigned to Agent Zero
- `GET /api/heartbeat` — returns Agent Zero's heartbeat config
- `PUT /api/heartbeat` — updates Agent Zero's heartbeat config
- `GET /api/status` — includes aggregate queue status across all agents
- Telegram/Discord bridges enqueue jobs to Agent Zero
- Cron jobs enqueue to Agent Zero
- Heartbeat triggers enqueue to Agent Zero

### FR-8: Agent Status Lifecycle
Agent status transitions must follow these rules:
- `idle` → `running` (when a job starts executing)
- `running` → `idle` (when job completes and no more queued)
- `running` → `error` (when job fails with unrecoverable error)
- `idle` → `paused` (manual pause or budget exceeded)
- `running` → `paused` (after current job completes, if pause requested)
- `paused` → `idle` (resume)
- `error` → `idle` (resume or manual recovery)
- Any → `paused` with reason "budget" (when spend >= budget limit and budget > 0)

---

## Non-Functional Requirements

### NFR-1: Performance
- Agent list query must return in < 50ms for up to 50 agents
- Agent creation must complete in < 100ms
- Wakeup request deduplication must be evaluated in < 10ms
- Agent-aware queue must not add measurable latency vs current serial queue for single-agent workloads

### NFR-2: Data Integrity
- Agent Zero must exist at all times — deletion must be prevented at the data layer
- Agent names must be unique (enforced by constraint)
- Self-referential hierarchy must not allow circular references
- Budget tracking must be atomic (no double-counting)

### NFR-3: Migration Safety
- Existing `agent_jobs` table must remain functional throughout the migration
- Existing heartbeat state must be preserved when Agent Zero is bootstrapped
- Existing Claude sessions must be associated with Agent Zero
- No data loss during the upgrade from single-agent to multi-agent model

### NFR-4: Resource Efficiency
- Multi-agent queue must not consume significantly more memory than the current single queue
- Idle agents should consume zero CPU
- Per-agent goroutines should be created lazily (only when work is queued)

---

## Edge Cases & Error Handling

### EC-1: First Boot vs Upgrade
- **First boot (fresh database):** Agent Zero created, no heartbeat state to migrate, default config applied
- **Upgrade boot (existing data):** Agent Zero created, existing heartbeat_state row migrated to Agent Zero's config, existing claude_sessions associated with Agent Zero

### EC-2: Agent Zero Protection
- Deleting Agent Zero returns an error with clear message
- Agent Zero cannot be made to report to another agent (always top-level)
- If Agent Zero is the only agent and is paused, all work stops — this is intentional

### EC-3: Circular Hierarchy
- Agent A reports to Agent B, Agent B reports to Agent A — must be rejected
- Validation on create/update must walk the hierarchy to detect cycles
- Maximum hierarchy depth: 5 levels

### EC-4: Budget Boundary
- Agent at $49.99 spent of $50.00 budget starts a job that costs $2.00 — job completes, then agent is paused (budget checked after run, not before)
- Budget reset at month boundary: spend resets to 0, paused agents with reason "budget" are automatically resumed

### EC-5: Concurrent Wakeups
- Two simultaneous wakeup requests for the same agent with different idempotency keys — both are valid, second queues behind first
- Two simultaneous wakeup requests with the same idempotency key — second is deduplicated (returns existing request)

### EC-6: Agent Deletion with Queued Work
- Deleting an agent with queued jobs — queued jobs are canceled, running job completes first
- Deleting an agent that other agents report to — dependents' reports_to set to null (become top-level)

### EC-7: Session Isolation
- Agent A and Agent B must never share a Claude Code session ID
- If session state becomes corrupted, the agent can be reset (clear session, start fresh)

---

## Success Metrics

- Agent Zero bootstraps correctly on 100% of engine starts (both fresh and upgrade)
- All existing API endpoints pass contract tests without modification
- Multi-agent queue processes work correctly with 1-10 concurrent agents
- No increase in engine startup time beyond 100ms for Agent Zero bootstrap
- Per-agent budget tracking accurate to within 1 cent

---

## Out of Scope

- Issue lifecycle (Feature 18)
- Execution run tracking (Feature 19)
- Projects (Feature 20)
- Cost event granular tracking (Feature 21)
- Dashboard UI for agents (Feature 26)
- Agent-to-agent communication protocol
- Remote agent adapters (HTTP, process) — only claude_local for now
