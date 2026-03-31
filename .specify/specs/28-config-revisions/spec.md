# Feature 28: Agent Config Revisions

## Overview

Every change to an agent's configuration should be tracked as a revision with before/after snapshots, enabling operators to view change history and rollback to any previous configuration. This provides a safety net against destructive or incorrect configuration changes.

**Business Value:** Operators can confidently modify agent configurations knowing they can instantly revert to a known-good state. Audit trail shows who changed what and when.

## User Stories

### User Story 1: View Config History
**As an** operator
**I want to** see a history of all configuration changes for an agent
**So that** I can understand what changed and when

**Acceptance Criteria:**
- [ ] History shows each revision with timestamp
- [ ] Each revision shows which fields changed
- [ ] Revisions are ordered most recent first
- [ ] Source of change is recorded (manual update, rollback)

**Priority:** High

### User Story 2: Rollback Configuration
**As an** operator
**I want to** rollback an agent's configuration to a previous revision
**So that** I can recover from a bad configuration change

**Acceptance Criteria:**
- [ ] Operator can select any previous revision to rollback to
- [ ] Rollback applies the full configuration from that revision
- [ ] Rollback itself creates a new revision (with source "rollback")
- [ ] The agent's live configuration is immediately updated

**Priority:** High

### User Story 3: Automatic Revision on Update
**As the** system
**I want to** automatically record a revision whenever an agent is updated
**So that** no configuration change goes untracked

**Acceptance Criteria:**
- [ ] Every successful agent update creates a revision
- [ ] Revision captures the before and after state
- [ ] Revision records which specific keys changed
- [ ] No revision is created if the update changes nothing

**Priority:** High

## Functional Requirements

**FR-1:** When an agent is updated via the API, the system must record a revision containing: the agent ID, the source of change, the list of changed field names, the before-config snapshot (JSON), and the after-config snapshot (JSON).

**FR-2:** `GET /api/agents/:id/config-revisions` must return all revisions for the agent, ordered by creation time descending, with pagination support.

**FR-3:** `POST /api/agents/:id/config-revisions/:revisionId/rollback` must restore the agent's configuration to the state captured in the specified revision's `before_config` snapshot.

**FR-4:** A rollback operation must itself create a new revision with source "rollback", capturing the state before and after the rollback.

**FR-5:** The config snapshot must include all mutable agent fields: name, role, reports_to, heartbeat_interval_seconds, heartbeat_prompt, budget_monthly_cents, runtime_config.

**FR-6:** If an update request results in no actual field changes, no revision should be created.

## Non-Functional Requirements

**NFR-1:** Revision creation must not add more than 10ms to the agent update response time.

**NFR-2:** Revision history must support agents with hundreds of revisions without degradation.

**NFR-3:** Rollback must be atomic — if any part fails, the agent config must remain unchanged.

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Rollback to nonexistent revision ID | 404 Not Found |
| Rollback to revision belonging to a different agent | 404 Not Found |
| Agent has no revisions yet | Empty list returned |
| Rollback to the most recent revision (no-op) | Creates a revision, applies config (idempotent) |
| Agent is deleted | Revisions are cascade-deleted |
| Concurrent updates | Each creates its own revision (serialized by SQLite) |

## Success Metrics

- Every agent update produces a corresponding revision
- Rollback restores exact previous config within 50ms
- Zero data loss from configuration changes
