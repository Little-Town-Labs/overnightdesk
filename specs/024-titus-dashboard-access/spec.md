# Feature Specification: Titus Advanced Dashboard Access

**Feature Branch**: `agent/codex/feature-024-titus-dashboard-access`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Titus should have an Advanced Dashboard as well as Open WebUI chat, using the same capability-driven platform approach as Walter while preserving Titus identity, authorization, data, and runtime boundaries."

## User Scenarios & Testing

### User Story 1 - Open Titus's real dashboard (Priority: P1)

An authorized Titus member sees Advanced Dashboard as an available capability
and can launch Titus's native agent dashboard independently while the Titus
chat workspace remains open and usable.

**Why this priority**: Titus already has a working native dashboard and chat;
the missing authorized platform connection prevents the owner from using both
real capabilities from the selected-agent workspace.

**Independent Test**: Select Titus as an authorized owner, open Chat, launch
Advanced Dashboard, and confirm the native Titus dashboard opens with Titus
context while the existing chat and chat history remain intact.

**Acceptance Scenarios**:

1. **Given** an active member authorized for Titus, **When** the member selects Titus, **Then** Chat and Advanced Dashboard are both shown as available from the same server-resolved agent context.
2. **Given** Titus Chat is open, **When** the member launches Advanced Dashboard, **Then** the native Titus dashboard opens independently and Chat remains open with its current conversation state.
3. **Given** an authorized owner with Titus and Walter, **When** the selected agent changes, **Then** the dashboard action follows the selected agent without agent-specific interface behavior or cross-agent content.
4. **Given** an authorized member with only Titus, **When** the workspace loads, **Then** only Titus capabilities are visible and no selector or capability belonging to another agent is disclosed.

---

### User Story 2 - Fail closed as authority changes (Priority: P2)

Titus dashboard access follows current membership and session authority at
every request. Logout, expiry, revocation, non-membership, suspension, or an
expired membership denies the dashboard without disclosing Titus or another
agent's data; established access can be restored only through valid authority.

**Why this priority**: A direct dashboard route must not become a durable
bypass around the platform's membership and session boundaries.

**Independent Test**: Exercise the established non-member, suspended-member,
expired-member, logout, session-expiry, and revocation denial/restoration
matrix against the dashboard route and confirm every denial fails closed and
every restoration requires valid current authority.

**Acceptance Scenarios**:

1. **Given** a non-member, suspended member, or expired member, **When** the Titus dashboard is requested directly or from the platform, **Then** access is denied with no dashboard content or cross-agent disclosure.
2. **Given** a previously authorized dashboard session, **When** platform authority is logged out, expires, or is revoked, **Then** a subsequent protected request is denied and stale dashboard access cannot silently continue.
3. **Given** authority was denied, **When** a valid membership and session are restored, **Then** dashboard access is restored through the established authentication flow without data loss.
4. **Given** a malformed, unknown, or mismatched selected-agent request, **When** dashboard capability resolution occurs, **Then** it fails closed rather than defaulting to Titus, Walter, or the first available agent.

---

### User Story 3 - Activate and recover safely (Priority: P3)

An operator can qualify, activate, observe, and roll back Titus dashboard
access without disrupting Titus Chat, Walter, native runtime data, or either
agent's provider and credential boundaries.

**Why this priority**: Production routing and session changes must be
recoverable before the new capability is treated as available to members.

**Independent Test**: Keep the public capability unavailable while qualifying
private health and authorization, activate the protected route, prove owner
acceptance and denial behavior, then rehearse rollback while confirming Chat,
history, dashboard data, and Walter remain healthy.

**Acceptance Scenarios**:

1. **Given** an unqualified Titus dashboard route, **When** the platform context is resolved, **Then** Advanced Dashboard remains unavailable rather than exposing a speculative or unprotected link.
2. **Given** private health, authorization, route, and recovery gates have passed, **When** the capability is activated, **Then** only current authorized Titus members can reach the native dashboard.
3. **Given** the route is rolled back, **When** Titus is selected, **Then** Advanced Dashboard is honestly unavailable while Titus Chat and retained dashboard data remain healthy.
4. **Given** a Titus dashboard activation or rollback, **When** Walter and both chat deployments are checked, **Then** their authorization, data, provider policy, and availability are unchanged.

### Edge Cases

- The Titus native dashboard is healthy privately while the protected public
  route is absent, unhealthy, or not yet qualified.
- The public route is reachable but the platform authorization verifier is
  unavailable, times out, or returns an unexpected response.
- A browser revisits a direct dashboard URL after logout, membership expiry,
  suspension, or revocation.
- The dashboard opens in a blocked pop-up environment or on a narrow viewport.
- Titus Chat is healthy while the dashboard is starting, unavailable, or
  rolled back.
- The selected member is authorized for Titus Chat but the dashboard
  assignment is missing, inactive, duplicated, or linked to a different
  runtime.
- A canonical assignment contains a missing, malformed, non-secure, or
  unapproved dashboard destination.
- The Titus native runtime restarts during qualification while persisted Chat
  history and dashboard state must remain intact.
- Walter remains selected in one browser surface while a stale Titus dashboard
  link is requested in another.
- A presentation value such as the Titus name or logo changes without changing
  the underlying dashboard authority or runtime binding.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST expose Titus Advanced Dashboard only as a real
  native dashboard capability backed by an active canonical assignment.
- **FR-002**: The system MUST derive Titus Chat and Advanced Dashboard from the
  same server-resolved, membership-filtered selected-agent context while
  treating them as independent capabilities.
- **FR-003**: An authorized Titus member MUST be able to launch the dashboard
  independently without closing, replacing, or resetting Titus Chat.
- **FR-004**: Dashboard availability and launch behavior MUST use the shared
  capability-driven interface and MUST NOT branch on Titus, Walter, persona
  name, membership array position, or another presentation value.
- **FR-005**: The browser MUST receive only a dashboard destination resolved
  from the exact canonical runtime assignment and MUST NOT choose, submit, or
  construct an upstream destination.
- **FR-006**: Unknown, inactive, missing, duplicated, malformed, mismatched, or
  unauthorized assignments MUST fail closed without fallback or cross-agent
  capability disclosure.
- **FR-007**: The dashboard route MUST verify current platform membership and
  session authority for the exact Titus use case and runtime before returning
  protected dashboard content.
- **FR-008**: Non-member, suspended-member, expired-member, logged-out,
  expired-session, and revoked-session requests MUST be denied both from the
  platform and at the direct dashboard boundary.
- **FR-009**: Restoration after a denial MUST require valid current authority
  through the established authentication flow and MUST NOT rely on a stale
  dashboard session alone.
- **FR-010**: Independent launch MUST use accessible native controls, retain a
  safe normal-link fallback, work on supported narrow and wide viewports, and
  prevent the launched surface from controlling the platform opener.
- **FR-011**: The capability MUST NOT be advertised or accepted as production
  ready until private health, protected routing, current-authority denial,
  restoration, session lifecycle, persistence, and rollback gates pass. Any
  temporary protected activation needed to execute those gates MUST remain an
  owner-directed qualification state and MUST NOT be treated as acceptance.
- **FR-012**: Activation and rollback MUST preserve Titus Chat, Titus chat
  history, native dashboard data, persona presentation, runtime credentials,
  and model-provider behavior.
- **FR-013**: Activation and rollback MUST NOT change Walter's dashboard,
  chat, data, membership, provider policy, service account, or runtime boundary.
- **FR-014**: Dashboard health or authorization failure MUST leave Titus Chat
  independently usable and present an honest unavailable dashboard state.
- **FR-015**: The owner acceptance matrix MUST cover Overview, Chat, Settings,
  and Admin selected-agent consistency plus authenticated launch and direct
  dashboard access.
- **FR-016**: Qualification, activation, observation, and rollback evidence
  MUST be value-free and recorded in feature artifacts, the platform standard,
  and the production deployment log.
- **FR-017**: Titus name and logo MUST remain presentation variables attached
  to the canonical persona and MUST NOT determine dashboard authorization,
  routing, storage, or runtime identity.
- **FR-018**: This feature MUST NOT add a new agent runtime, chat deployment,
  model-provider path, or credential-sharing relationship.

### Key Entities

- **Titus Dashboard Capability**: The server-resolved state and safe launch
  behavior for Titus's existing native dashboard, independent from Chat.
- **Canonical Dashboard Assignment**: The active relationship between an
  authorized use case, exact Titus runtime, and approved dashboard instance.
- **Dashboard Session Boundary**: The protected access boundary that applies
  current platform membership and session authority to native dashboard
  requests without merging dashboard and chat sessions.
- **Selected Agent Context**: The membership-filtered identity, role, runtime,
  presentation, and independent capability set for exactly one selected agent.
- **Qualification Evidence**: Value-free proof of health, denial/restoration,
  session lifecycle, persistence, isolation, owner acceptance, and rollback.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An authorized Titus member can launch the native dashboard from
  the selected-agent workspace in no more than two actions while the current
  Chat conversation remains open.
- **SC-002**: The non-member, suspended-member, expired-member, logged-out,
  expired-session, revoked-session, invalid-selection, and mismatched-runtime
  checks produce zero protected-content or cross-agent disclosures.
- **SC-003**: After every denial, access is restored only after valid current
  authority is re-established, with 100% of the restoration matrix passing.
- **SC-004**: Dashboard launch remains reachable and operable at 320px, 768px,
  1024px, and 1440px viewport widths with keyboard-visible focus and no
  horizontal page overflow.
- **SC-005**: Dashboard activation, restart, and rollback preserve one existing
  Titus chat and its visible history, with zero unintended data loss.
- **SC-006**: All production checks show zero unintended availability,
  authorization, configuration, or restart impact to Walter and both Open
  WebUI deployments.
- **SC-007**: A rehearsed rollback makes the Titus dashboard unavailable from
  the platform while Titus Chat remains usable and retained native dashboard
  data is recoverable.
- **SC-008**: The shared interface renders Titus and Walter dashboard state
  from canonical capability data with zero agent-name or tenant-ID branches.
- **SC-009**: Production activation is accepted only after automated gates pass
  and the owner confirms authenticated Titus dashboard launch and selected-agent
  consistency across Overview, Chat, Settings, and Admin.

## Assumptions

- Titus's existing native dashboard is the capability to expose; no substitute
  dashboard or duplicate runtime is required.
- Better Auth remains the platform session authority, and the dashboard keeps
  its own protected surface boundary rather than sharing an Open WebUI session.
- The established Walter dashboard behavior is a reference for capability and
  authorization outcomes, not a reason to copy Walter-specific interface code,
  credentials, hostnames, or runtime records.
- A separate tab or window is an acceptable initial dashboard presentation on
  desktop and mobile; a later qualified layout may compose it differently.
- The existing selected-agent, membership, runtime, instance, and persona
  records remain the sources of truth.
- Production activation requires a separately qualified route and canonical
  binding; the specification alone does not authorize exposure.
