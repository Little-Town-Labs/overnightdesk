# Feature Specification: Composable Agent Workspace

**Feature Branch**: `agent/codex/feature-023-composable-workspace`

**Created**: 2026-07-22

**Status**: In Progress — frontend prototype qualified; Walter deployment not authorized

**Input**: User description: "Define and prototype a capability-driven selected-agent workspace that lets an authorized owner keep chat and the native Hermes dashboard available at the same time without agent-specific interface code, then qualify Walter Open WebUI in isolation while retaining Codex OAuth as Walter's primary model-provider path."

## User Scenarios & Testing

### User Story 1 - Use chat and dashboard together (Priority: P1)

An authorized operator opens one selected agent workspace and can continue a
chat while launching that same agent's native dashboard without losing the
chat state. The workspace presents only capabilities assigned to that agent and
does not require a fixed side-by-side layout.

**Why this priority**: This is the immediate owner need and proves the shared
capability contract before another chat deployment is added.

**Independent Test**: Open a fixture for an agent with both capabilities,
launch the dashboard from the chat workspace, and confirm the chat remains
open while the dashboard opens independently with the selected identity
visible in both launch context and accessible labels.

**Acceptance Scenarios**:

1. **Given** an authenticated member authorized for an agent with chat and a native dashboard, **When** the member opens chat and launches the dashboard, **Then** both surfaces remain available without resetting or replacing the chat workspace.
2. **Given** an authenticated member authorized for more than one agent, **When** the member changes the selected agent, **Then** chat, dashboard, identity, and availability state all change together from the same membership-filtered selection.
3. **Given** an agent with chat but no dashboard, **When** the workspace opens, **Then** chat remains usable and the dashboard is shown honestly as not deployed or unavailable.
4. **Given** an agent with a dashboard but no chat, **When** the workspace opens, **Then** the dashboard remains launchable and chat is shown honestly as not deployed.

---

### User Story 2 - Operate safely across devices and session changes (Priority: P2)

An authorized member can use the workspace on desktop or mobile with keyboard
access, understandable focus behavior, and safe fallbacks when an independent
window cannot be opened. Session expiry, logout, revocation, and restoration
apply independently to each surface without exposing another agent.

**Why this priority**: Independent surfaces add lifecycle and accessibility
risks that must be qualified before production activation.

**Independent Test**: Exercise desktop, mobile, keyboard, blocked-window,
refresh, logout, expiry, revocation, and restoration fixtures and confirm that
every state is explicit, recoverable, and membership filtered.

**Acceptance Scenarios**:

1. **Given** a narrow mobile viewport, **When** the member launches the dashboard, **Then** the dashboard opens as an independent tab or window while the chat page remains usable.
2. **Given** keyboard-only navigation, **When** the member moves through selector and surface controls, **Then** focus order, labels, and actions are complete and no pointer-only control is required.
3. **Given** the browser cannot open an independent window, **When** launch is attempted, **Then** a normal safe link remains available and the chat state is preserved.
4. **Given** membership or session authority expires or is revoked, **When** either surface is requested, **Then** access is denied without leaking content and is restored only after the established authorization is restored.

---

### User Story 3 - Qualify Walter chat in isolation (Priority: P3)

The owner can add a Walter-scoped Open WebUI chat capability only after its
deployment, authorization, persistence, session lifecycle, rollback, and
provider policy are independently proven. Walter's native dashboard remains a
separate capability and Codex OAuth remains Walter's primary model-provider
path.

**Why this priority**: Walter chat provides the second real runtime proof of
the shared interface, but it must not inherit Titus's credentials or provider
policy by presentation convention.

**Independent Test**: Install Walter Open WebUI disabled, prove exact Walter
runtime and service-account isolation, enable only the Walter route and OIDC
mapping, then repeat the established denial/restoration, chat persistence,
session lifecycle, rollback, and owner acceptance matrix.

**Acceptance Scenarios**:

1. **Given** a disabled Walter Open WebUI candidate, **When** its configuration is inspected, **Then** its data, OIDC client, hostname, service account, runtime binding, and rollback path are distinct from Titus.
2. **Given** an authorized Walter member, **When** Walter chat is enabled and selected, **Then** the shared workspace presents Walter identity, chat, and native dashboard without Walter-specific page code.
3. **Given** a non-member, suspended member, or expired member, **When** Walter chat or dashboard is requested, **Then** access is denied and no other runtime's session or content is returned.
4. **Given** Walter chat is rolled back, **When** the prior production state is restored, **Then** Walter's native dashboard, Codex OAuth provider path, runtime data, and Titus deployment remain healthy.

### Edge Cases

- An explicit unknown, malformed, duplicate, or unauthorized agent selector
  fails closed and never falls back to the first agent.
- Directory or instance lookup failure exposes no capability URLs and renders
  an explicit temporarily unavailable state.
- Duplicate runtime-instance linkage or conflicting capability assignments
  makes the selected workspace unavailable rather than choosing one.
- A capability URL is absent, malformed, non-HTTPS, or outside the approved
  OvernightDesk host boundary.
- One capability is healthy while the other is not deployed, unavailable,
  logged out, expired, or revoked.
- The independent dashboard window is closed, refreshed, reopened, or blocked
  while chat remains active.
- The selected member has exactly one authorized agent and must never see a
  selector or URL for an unassigned agent.
- The browser returns from a dashboard login flow after the original chat
  session or platform session has expired.
- Walter Open WebUI succeeds with its separately qualified chat provider while
  Walter's primary Codex OAuth model path remains unchanged.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST derive chat and native dashboard availability
  from one server-resolved, membership-filtered selected-agent context.
- **FR-002**: The system MUST model chat and native dashboard as independent
  capabilities with explicit available, not deployed, unavailable, or not
  applicable states.
- **FR-003**: An authorized member MUST be able to keep chat available while
  launching the selected agent's native dashboard independently.
- **FR-004**: The workspace MUST use shared capability-driven rendering and
  MUST NOT branch on Walter, Titus, persona name, tenant ID, or array position.
- **FR-005**: The browser MUST receive only capability URLs already resolved
  from canonical server-side assignments and MUST NOT choose or submit an
  upstream host.
- **FR-006**: Explicit invalid or unauthorized agent selection MUST fail closed
  without default-agent fallback or cross-agent capability disclosure.
- **FR-007**: Agents with only one assigned surface MUST retain that usable
  surface while the absent surface remains visibly and honestly unavailable.
- **FR-008**: Independent surface launch MUST use accessible native controls,
  preserve a normal safe-link fallback, and work on desktop and mobile.
- **FR-009**: Every independent external launch MUST prevent the launched
  surface from controlling the OvernightDesk opener.
- **FR-010**: The prototype MUST preserve each surface's existing
  authentication, authorization, OIDC client, CSP, framing, hostname, runtime,
  and persistence boundary.
- **FR-011**: Logout, expiry, revocation, denial, restoration, refresh,
  close/reopen, and window-blocked behavior MUST be verified before production
  activation.
- **FR-012**: Walter Open WebUI MUST be installed and qualified as a distinct
  Walter-scoped deployment with its own durable data, hostname, OIDC mapping,
  service account, runtime binding, and rollback evidence.
- **FR-013**: Walter Open WebUI qualification MUST NOT replace, downgrade, or
  implicitly reroute Walter's primary Codex OAuth subscription model path.
- **FR-014**: Any Walter OpenRouter credential MUST remain a separately named,
  separately authorized supplemental or fallback capability.
- **FR-015**: Walter production activation MUST remain disabled until the
  denial/restoration, persistence, OAuth/session lifecycle, rollback, provider
  isolation, public health, and authenticated owner acceptance gates pass.
- **FR-016**: Qualification and production results MUST be value-free, recorded
  in the feature artifacts and platform standard, and appended to
  `deploys.log` for production changes.

### Key Entities

- **Selected Agent Context**: The exact authorized runtime, presentation
  identity, membership role, optional linked instance, and capability set for
  one server-resolved selection.
- **Agent Capability**: A stable capability identifier, state, safe detail,
  launch behavior, and optional server-resolved URL. Chat and native dashboard
  remain independent records.
- **Workspace Composition**: The selected agent's available surfaces and the
  responsive interaction used to keep them available together without merging
  their sessions.
- **Walter Chat Deployment**: The isolated Open WebUI runtime, data store,
  hostname, OIDC client, service account, runtime binding, and rollback target
  qualified for Walter.
- **Qualification Evidence**: Value-free proof for membership denial and
  restoration, persistence, session lifecycle, rollback, provider isolation,
  health, and owner acceptance.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An authorized member can open chat and launch the selected
  agent's dashboard in no more than two actions while the chat remains open.
- **SC-002**: All supported 320px, 768px, 1024px, and 1440px viewport checks
  expose the same authorized capability set with no horizontal page overflow.
- **SC-003**: All workspace controls are operable by keyboard with visible
  focus and descriptive accessible names.
- **SC-004**: The invalid-selector, non-member, suspended-member, expired-member,
  logged-out, expired-session, and revoked-session checks produce zero
  cross-agent capability or content disclosures.
- **SC-005**: Closing, reopening, refreshing, or blocking the dashboard window
  does not reset the active chat page in every supported browser check.
- **SC-006**: The shared workspace renders Titus, Walter, and a one-agent member
  from data fixtures with zero agent-name or tenant-ID branches in the interface.
- **SC-007**: Walter qualification proves one persistent chat across restart,
  complete denial/restoration and OAuth/session lifecycle matrices, and one
  rehearsed rollback without changing Walter's primary Codex OAuth path or
  affecting Titus.
- **SC-008**: Production activation occurs only after automated checks pass and
  the owner accepts the authenticated Walter chat/dashboard experience.

## Assumptions

- Better Auth remains the platform session authority and existing per-surface
  OIDC clients remain independent.
- The initial prototype embeds the already qualified chat surface and launches
  the native dashboard independently; this does not prohibit a later qualified
  split view.
- A normal new tab is an acceptable mobile equivalent to a desktop pop-out
  window.
- No new database schema is required for the frontend prototype; canonical
  membership, runtime, instance, and OIDC assignment records remain sources of
  truth.
- Walter Open WebUI follows the established Titus qualification sequence but
  receives new Walter-scoped resources rather than copied credentials or
  provider policy.
- The feature does not authorize production deployment merely by documenting
  or prototyping the workspace.
