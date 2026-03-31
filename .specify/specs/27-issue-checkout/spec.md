# Feature 27: Issue Checkout/Release

## Overview

Agents must be able to atomically claim ownership of an issue before working on it, preventing two agents from executing the same task simultaneously. This introduces a checkout/release protocol where claiming an issue is a single atomic operation that either succeeds or returns a conflict error.

**Business Value:** Prevents wasted compute (duplicate work), avoids conflicting file changes, and establishes clear ownership for accountability and cost attribution.

## User Stories

### User Story 1: Agent Claims an Issue
**As an** agent
**I want to** check out an issue assigned to me
**So that** no other agent can work on the same task simultaneously

**Acceptance Criteria:**
- [ ] Agent can claim an issue via a single request
- [ ] Claiming transitions the issue status to `in_progress`
- [ ] The claiming agent's current run is recorded on the issue
- [ ] Only one agent can hold checkout at a time
- [ ] A second claim attempt on the same issue returns a conflict error

**Priority:** High

### User Story 2: Agent Releases an Issue
**As an** agent
**I want to** release an issue I previously checked out
**So that** it becomes available for reassignment or re-prioritization

**Acceptance Criteria:**
- [ ] Agent can release an issue it holds
- [ ] Releasing transitions the issue status back to `todo`
- [ ] The checkout record is cleared
- [ ] Only the holding agent (or system) can release

**Priority:** High

### User Story 3: Operator Views Checkout Status
**As an** operator viewing the dashboard
**I want to** see which issues are currently checked out and by whom
**So that** I understand what agents are actively working on

**Acceptance Criteria:**
- [ ] Issue detail shows the checkout run ID when checked out
- [ ] Issue list indicates checked-out status visually
- [ ] Operator can see which agent holds the checkout

**Priority:** Medium

### User Story 4: System Prevents Double Work
**As the** system
**I want to** reject concurrent checkout attempts on the same issue
**So that** compute resources are not wasted on duplicate execution

**Acceptance Criteria:**
- [ ] Concurrent checkout requests for the same issue result in exactly one success
- [ ] The losing request receives a clear conflict response
- [ ] The conflict response must not be retried automatically
- [ ] No partial state is left if a checkout fails

**Priority:** High

## Functional Requirements

**FR-1:** A checkout request must atomically set the assignee, transition status to `in_progress`, and record the run ID in a single operation. If any part fails, none should apply.

**FR-2:** A checkout request on an issue that is already checked out must return a 409 Conflict response with a message identifying the current holder.

**FR-3:** A checkout request must only succeed on issues in `todo` or `backlog` status. Issues in `in_progress`, `in_review`, `done`, or `failed` status must be rejected with a 409.

**FR-4:** A release request must clear the checkout record and transition the issue status to `todo`.

**FR-5:** A release request on an issue not currently checked out must return a 404 or 409 indicating no checkout exists.

**FR-6:** The checkout run ID must be queryable — the issue detail response includes the run association when checked out.

**FR-7:** Issues already in `in_progress` without a checkout record (legacy/manual assignment) must continue to function normally. Checkout is an optional protocol, not a mandatory gate.

## Non-Functional Requirements

**NFR-1:** Checkout response time must be under 50ms (p99) since it is on the critical path of agent execution.

**NFR-2:** The atomicity guarantee must hold under concurrent requests — no race conditions that allow double checkout.

**NFR-3:** The checkout/release protocol must be backwards-compatible — existing issue status transitions via the update endpoint continue to work.

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Two agents checkout the same issue simultaneously | Exactly one succeeds, the other gets 409 |
| Agent checks out issue already in `in_progress` (by another agent) | 409 Conflict |
| Agent checks out issue in `done` status | 409 — terminal status, cannot checkout |
| Agent releases an issue it doesn't hold | 409 — only the holder can release |
| Agent crashes mid-execution (never releases) | Issue remains checked out; operator can manually release or reassign via existing update endpoint |
| Checkout with invalid issue ID | 404 Not Found |
| Checkout with invalid agent/run ID | 400 Bad Request |
| Release on an issue with no checkout record | 409 — nothing to release |

## Success Metrics

- Zero duplicate executions on the same issue after checkout is adopted
- Checkout latency < 50ms p99
- All existing issue workflows continue to function (backwards compatible)
