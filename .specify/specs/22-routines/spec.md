# Feature 22: Routines

## Overview

Routines unify the engine's two independent scheduling systems (heartbeat and cron) into a single DB-backed model. Each routine is a named, scheduled task tied to a specific agent. Routines support cron expressions, fixed intervals, and webhook triggers. Concurrency policies control behavior when a routine fires while its previous execution is still running. The existing heartbeat and cron systems continue to function but are superseded by routines for new configuration.

## User Stories

### US-1: Create a Routine
**As an** operator
**I want** to create a named routine with a schedule and prompt
**So that** my agent performs recurring work automatically

**Acceptance Criteria:**
- [ ] Routine has name, description, prompt, trigger type, and trigger config
- [ ] Routine is assigned to a specific agent
- [ ] Supported trigger types: cron, interval
- [ ] Cron trigger accepts standard 5-field cron expressions
- [ ] Interval trigger accepts seconds value (minimum 60)
- [ ] Routine is enabled by default on creation

**Priority:** High

### US-2: Manage Routine Lifecycle
**As an** operator
**I want** to enable, disable, update, and delete routines
**So that** I can control what recurring work my agents perform

**Acceptance Criteria:**
- [ ] Routine can be enabled or disabled without deletion
- [ ] Routine prompt, schedule, and concurrency policy are editable
- [ ] Deleting a routine does not affect past runs or issues
- [ ] Disabled routines do not fire

**Priority:** High

### US-3: View Routine Status
**As an** operator
**I want** to see when a routine last ran and when it will next fire
**So that** I can verify my schedules are working

**Acceptance Criteria:**
- [ ] Each routine shows last_run_at timestamp
- [ ] Each routine shows next_run_at timestamp
- [ ] Routine list shows run count
- [ ] Routine list is filterable by agent

**Priority:** Medium

### US-4: Concurrency Policy
**As an** operator
**I want** to control what happens when a routine fires while its previous run is still executing
**So that** I avoid duplicate work or queue buildup

**Acceptance Criteria:**
- [ ] Policy "skip": skip this firing if previous is still running
- [ ] Policy "queue": enqueue and run after current finishes
- [ ] Policy "allow": fire regardless (default)
- [ ] Policy is per-routine, configurable at creation and update

**Priority:** Medium

### US-5: Quiet Hours
**As an** operator
**I want** routines to respect quiet hours
**So that** agents don't run during off-hours

**Acceptance Criteria:**
- [ ] Each routine can optionally specify quiet_start and quiet_end hours
- [ ] Quiet hours are timezone-aware
- [ ] Routines that would fire during quiet hours are silently skipped
- [ ] Quiet hours default to none (always active)

**Priority:** Low

## Functional Requirements

- **FR-1:** Routines are stored in the database with full CRUD via REST API
- **FR-2:** A routine scheduler ticks periodically, evaluating which routines are due
- **FR-3:** Due routines create issues assigned to the routine's agent and enqueue jobs
- **FR-4:** Routine execution updates last_run_at and calculates next_run_at
- **FR-5:** Concurrency policy is evaluated before dispatch
- **FR-6:** Routines track consecutive failures and auto-disable after 5
- **FR-7:** Quiet hours are evaluated per-routine before dispatch
- **FR-8:** Disabled or paused-agent routines do not fire

## Non-Functional Requirements

- **NFR-1:** Scheduler tick interval: 30 seconds (same as current heartbeat)
- **NFR-2:** Routine evaluation must complete within 1 second for 100 routines
- **NFR-3:** No missed firings due to scheduler restart (next_run_at persisted in DB)

## Edge Cases

- Routine agent is paused or deleted: skip firing, log warning
- Cron expression is invalid: reject at creation, not at runtime
- Clock skew after restart: compare next_run_at to current time, fire if overdue
- Multiple routines due simultaneously: process all in single tick
- Interval shorter than execution time with "queue" policy: allow queue buildup (capped by agent queue size of 64)

## Success Metrics

- All existing heartbeat behavior reproducible via a routine
- Routine CRUD API responds in <50ms
- Scheduler evaluates 100 routines per tick in <1s
