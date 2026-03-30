# Feature 23: Approval Workflows

## Overview

Approval workflows allow agents to request human approval for sensitive actions before proceeding. Approvals are first-class entities in the engine with a status lifecycle (pending, approved, rejected, revision_requested), optional association to issues, comments for context, and integration with messaging bridges for notification. This generalizes the concept from the existing SecurityTeam approval queue into a structured, agent-aware system native to the engine.

## User Stories

### US-1: Agent Requests Approval
**As an** agent (via API)
**I want** to create an approval request with a type, payload, and context
**So that** the operator can review and decide before I proceed

**Acceptance Criteria:**
- [ ] Approval has type (e.g., "code_push", "spend", "external_api", "custom")
- [ ] Approval has JSON payload describing what needs approval
- [ ] Approval is optionally linked to an issue
- [ ] Approval is assigned to the requesting agent
- [ ] New approvals default to "pending" status
- [ ] Approval has a human-readable title

**Priority:** High

### US-2: Operator Reviews Approvals
**As an** operator
**I want** to view pending approvals and approve, reject, or request revision
**So that** I maintain control over sensitive agent actions

**Acceptance Criteria:**
- [ ] List approvals filterable by status, agent, and type
- [ ] View individual approval with full payload and comments
- [ ] Approve sets status to "approved" and records decided_at
- [ ] Reject sets status to "rejected" and records decided_at
- [ ] Request revision sets status to "revision_requested"
- [ ] Decision records who decided (decided_by field)

**Priority:** High

### US-3: Approval Comments
**As an** operator or agent
**I want** to add comments to an approval for context
**So that** decisions have documented rationale

**Acceptance Criteria:**
- [ ] Comments have author_source (dashboard, agent, system, telegram, discord)
- [ ] Comments are ordered chronologically
- [ ] Comments are returned with approval detail view

**Priority:** Medium

### US-4: Approval Notifications
**As an** operator
**I want** to be notified when a new approval is pending
**So that** I can respond promptly

**Acceptance Criteria:**
- [ ] Creating an approval can optionally trigger notification (future bridge integration)
- [ ] Approval count is available via status endpoint

**Priority:** Low

## Functional Requirements

- **FR-1:** Approvals stored in database with full CRUD via REST API
- **FR-2:** Approval status lifecycle: pending → approved/rejected/revision_requested
- **FR-3:** Approval comments stored separately with author tracking
- **FR-4:** Approvals filterable by status, agent_id, type
- **FR-5:** Pending approval count available for dashboard badges
- **FR-6:** Decided approvals record decided_at and decided_by

## Non-Functional Requirements

- **NFR-1:** Approval list API responds in <50ms
- **NFR-2:** No cascading deletes — approvals persist after issue deletion

## Edge Cases

- Agent deleted while approval pending: approval remains with original agent_id
- Issue deleted while approval linked: approval keeps issue_id reference (no FK cascade)
- Multiple pending approvals for same issue: allowed
- Approval decided twice: reject with 409 Conflict
- Empty payload: allowed (type alone may be sufficient context)
