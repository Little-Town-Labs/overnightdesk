# Feature Specification: Agent Control Surfaces

**Feature Branch**: `agent/root/agent-context-settings-admin`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Keep Open Chat and Advanced Dashboard as Overview actions after the agent selector; redesign Settings and Admin around variable agent identity, allow safe new values for selected Phase-managed variables, and make all agent-tab contents consistent across Titus, Walter, and single-agent users such as Austin."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent selected-agent panels (Priority: P1)

As a member authorized for one or more agents, I see the same information structure for every selected agent. Identity, use case, Runtime, availability, and actions stay in the same places; capability differences are expressed as clear states instead of omitted sections.

**Why this priority**: The current production view renders Runtime for Walter but not Titus. A reliable shared structure is the prerequisite for every later Settings and Admin panel.

**Independent Test**: Render the Overview for a member with Titus and Walter, select each agent, and verify the same named sections appear in the same order while their values and available actions change truthfully. Repeat with a one-agent member and verify no unauthorized agent is shown.

**Acceptance Scenarios**:

1. **Given** a member authorized for Titus and Walter, **When** the member changes the selected agent, **Then** identity, use case, Runtime, status, and action regions retain one consistent structure and show data for only the selected agent.
2. **Given** Titus has Open Chat and Walter does not, **When** each agent is selected, **Then** Titus shows an enabled Open Chat action and Walter shows an explicit not-deployed Open Chat state without changing the surrounding structure.
3. **Given** a member is authorized for only one agent, **When** any agent-scoped surface opens, **Then** only that agent appears and no link or content exposes another agent.
4. **Given** the selected agent lacks a legacy platform instance match, **When** its Overview renders, **Then** Runtime remains present using canonical agent state rather than disappearing.

---

### User Story 2 - Settings separated by scope (Priority: P2)

As an authenticated member, I can distinguish account-wide settings from settings for the currently selected agent, and agent selection behaves exactly as it does on Overview.

**Why this priority**: The existing Settings page assumes one legacy instance and mixes account controls with agent credentials, which is unsafe and confusing for multi-agent members.

**Independent Test**: Open Settings as a two-agent member and verify global account controls are unchanged by selection while the selected-agent header, configuration status, and permitted actions switch together. Open as a one-agent member and verify the same component structure with one choice.

**Acceptance Scenarios**:

1. **Given** an authenticated member, **When** Settings opens, **Then** account profile, password, and account deletion are clearly marked as account-wide.
2. **Given** a member authorized for multiple agents, **When** the member selects Titus or Walter in Settings, **Then** every agent-scoped field resolves from that same selected-agent context.
3. **Given** a member lacks permission to change an agent variable, **When** Settings renders, **Then** the variable value is never shown and the mutation action is absent or explicitly read-only.
4. **Given** an invalid or unauthorized agent selector, **When** Settings is requested, **Then** the request fails closed and does not fall back to the first legacy instance.

---

### User Story 3 - Admin organized by operational scope (Priority: P3)

As a platform administrator, I can move among fleet, metrics, and configuration views while clearly understanding which information is platform-wide and which belongs to the selected agent.

**Why this priority**: The current Admin pages are visually and structurally separate legacy surfaces. A coherent control surface reduces operational mistakes before new mutation features are added.

**Independent Test**: Open Admin as an administrator and verify platform-wide fleet and metrics remain global, selected-agent configuration uses the shared identity context, and a non-administrator receives no Admin content.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** Admin opens, **Then** Fleet, Metrics, and Configuration use one consistent internal navigation and design system.
2. **Given** a global Admin section, **When** the selected agent changes elsewhere, **Then** global data remains explicitly global and is not mislabeled as agent-specific.
3. **Given** an agent-specific Admin section, **When** an agent is selected, **Then** its identity, use case, Runtime, and configuration scope match Overview and Settings.
4. **Given** a non-administrator, **When** any Admin URL is requested, **Then** access is denied without disclosing fleet, agent, or configuration data.

---

### User Story 4 - Safe managed-variable replacement (Priority: P4)

As an authorized owner or administrator, I can provide a new value for an approved agent variable without seeing the existing value or gaining general access to the secret store.

**Why this priority**: Self-service rotation protects the owner's time, but secret mutation is high impact and must follow the shared identity and authorization model first.

**Independent Test**: Replace one approved test variable for an authorized agent and verify the new value reaches only the bound secret boundary, the old and new values are never returned or logged, the required runtime effect is reported, and unauthorized, malformed, cross-agent, or arbitrary-key requests are rejected without mutation.

**Acceptance Scenarios**:

1. **Given** an authorized owner and an approved variable, **When** the owner submits a valid replacement and confirms the impact, **Then** only that variable in the selected agent's bound secret location is replaced and the result contains no secret value.
2. **Given** a client submits an unapproved key, path, application, environment, runtime, or agent, **When** the request is evaluated, **Then** it is rejected before any external write.
3. **Given** a member can view an agent but cannot rotate its variables, **When** the member submits a forged mutation, **Then** the request is denied even if the browser UI was bypassed.
4. **Given** the secret service, audit sink, or canonical authorization source is unavailable, **When** a replacement is attempted, **Then** the operation fails closed with a safe actionable message and no claimed success.
5. **Given** a successful or failed replacement attempt, **When** the audit record is reviewed, **Then** it identifies actor, selected use case/runtime, approved variable identifier, outcome, and time without recording the submitted value, token, raw external response, or personal data.

### Edge Cases

- The member has no active, unexpired agent memberships.
- The requested agent key is malformed, duplicated, stale, suspended, or no longer authorized.
- Canonical agent state exists but no legacy instance, Open Chat deployment, advanced dashboard, or writable configuration exists.
- A broad use-case membership spans multiple runtimes while a variable is runtime-scoped.
- Two replacements for the same variable arrive concurrently or a user retries after a timeout.
- The replacement succeeds but the required runtime restart or reload fails.
- The external secret service returns a malformed response, a rate-limit response, or an authentication error.
- A submitted value is empty, too long, incorrectly formatted, or contains unexpected control characters.
- A user navigates directly between Overview, Settings, and Admin with a stale or unauthorized selector.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST resolve one canonical, membership-filtered selected-agent context for every agent-scoped surface.
- **FR-002**: The selected-agent context MUST include stable identity, use case, runtime identity and state, member role, capabilities, and safe presentation data.
- **FR-003**: Every enabled agent-scoped surface MUST show the same identity and core section structure for the same selected agent.
- **FR-004**: Runtime MUST be present for every selected agent; missing optional runtime capabilities MUST be shown as explicit unavailable, not deployed, or not applicable states rather than by removing the section.
- **FR-005**: Invalid, duplicate, stale, or unauthorized selectors MUST fail closed and MUST NOT fall back to a first instance, first membership, tenant label, or hard-coded agent branch.
- **FR-006**: Agent name, logo, use case, status, capabilities, and actions MUST be data-driven; agent-specific conditional layouts are prohibited.
- **FR-007**: Open Chat and Advanced Dashboard MUST remain selected-agent actions on Overview after the selector and MUST NOT become permanent primary-navigation tabs.
- **FR-008**: Settings MUST separate account-wide controls from selected-agent controls.
- **FR-009**: Account-wide Settings MUST remain available independently of agent runtime availability.
- **FR-010**: Agent Settings MUST use the same selector, identity, Runtime, and authorization result as Overview.
- **FR-011**: Admin MUST provide a consistent internal structure for global Fleet, global Metrics, and selected-agent Configuration.
- **FR-012**: Every Admin route and mutation MUST enforce administrator authorization on the server.
- **FR-013**: Global Admin content MUST be labeled and modeled as global; selected-agent content MUST be labeled and modeled as agent-scoped.
- **FR-014**: Hidden legacy agent tabs MUST remain hidden until they consume the shared selected-agent context and satisfy this feature's consistency requirements.
- **FR-015**: Managed-variable replacement MUST accept only a server-defined variable identifier and a new value; clients MUST NOT supply secret-store application, environment, path, raw key, runtime target, or restart command.
- **FR-016**: The approved variable catalog MUST define display label, sensitivity, allowed roles, scope, validation rules, and post-write runtime effect for every editable variable.
- **FR-017**: Existing secret values MUST never be returned to the browser, inserted into page markup, persisted in client storage, or written to logs or audit records.
- **FR-018**: The server MUST derive the exact secret boundary from the selected canonical use case and runtime and MUST reject missing, conflicting, or multiple bindings.
- **FR-019**: The server MUST revalidate the authenticated session, active membership, member role, selected runtime, variable allowlist, and administrator role where applicable immediately before mutation.
- **FR-020**: High-impact replacements MUST require an explicit human confirmation that names the variable and runtime effect without echoing the submitted value.
- **FR-021**: Replacement requests MUST have bounded input sizes, safe validation errors, request timeouts, rate-limit handling, and protection against unintended duplicate execution.
- **FR-022**: Every attempted replacement MUST produce metadata-only audit evidence before success is reported; audit failure MUST fail closed.
- **FR-023**: If the secret write succeeds but its post-write runtime effect fails, the user MUST receive an accurate partial-success state and recovery guidance.
- **FR-024**: The existing generic credential endpoint MUST no longer accept arbitrary secret maps or select a legacy first instance.
- **FR-025**: Desktop and mobile layouts MUST preserve the same content hierarchy, keyboard access, visible focus, and honest empty/error states.
- **FR-026**: This feature MUST use test-first delivery, including negative authorization, arbitrary-key, cross-agent, value-non-exposure, and inconsistent-section regression tests.

### Key Entities

- **Selected Agent Context**: The active member's authorized use case/runtime selection, role, identity presentation, core status, capabilities, and safe actions used by every agent-scoped surface.
- **Agent Capability**: A data-derived ability or integration for the selected agent, with an explicit state such as available, not deployed, unavailable, or not applicable.
- **Managed Variable Definition**: An approved configuration item with a stable public identifier, label, sensitivity, authorized roles, scope, validation policy, and declared runtime effect; it contains no stored value.
- **Secret Boundary**: The single server-resolved external application, environment, and path bound to a canonical use case/runtime; it is never client-selectable.
- **Variable Replacement Attempt**: A bounded mutation request and metadata-only outcome record associated with an authenticated actor, selected use case/runtime, approved variable identifier, and time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Titus, Walter, and a one-agent fixture each render the same core selected-agent sections in the same order, with zero agent-specific layout branches.
- **SC-002**: In automated desktop and mobile checks, 100% of selector changes update identity, Runtime, capabilities, and actions together without showing data from another authorized agent.
- **SC-003**: 100% of invalid or unauthorized selector tests fail closed without falling back to a first legacy instance.
- **SC-004**: A user can distinguish account-wide Settings, agent Settings, global Admin, and agent Admin scope from the visible heading and context without inspecting a URL.
- **SC-005**: 100% of unauthorized, arbitrary-key, arbitrary-path, cross-agent, malformed, oversized, and duplicate replacement tests cause zero external secret writes.
- **SC-006**: No existing or replacement secret value appears in browser responses, rendered markup, application logs, audit records, test snapshots, or committed artifacts.
- **SC-007**: Every accepted replacement produces one bounded outcome and tells the operator whether no runtime action, reload, restart, or manual recovery is required.
- **SC-008**: Critical selected-agent and replacement flows are keyboard-operable and usable at 320, 768, 1024, and 1440 pixel viewport widths.
- **SC-009**: The full automated suite and production build pass with no new high or critical dependency findings before release.

## Assumptions

- Better Auth remains the platform session authority and canonical active membership remains the agent-visibility authority.
- Use-case membership roles `owner`, `operator`, `member`, and `viewer` remain available; the variable catalog grants the narrowest role appropriate to each variable.
- Account controls are global. Runtime and integration configuration are agent-scoped. Fleet and aggregate metrics are global unless a later spec explicitly introduces an agent filter.
- A user with one authorized agent uses the same selector/context components as a multi-agent user; the selector may collapse to a single non-switching identity.
- Phase remains the external secret store. Only server-side service identities may call it, and each identity remains restricted to its approved application and environment.
- The first release replaces approved values only. Secret deletion, arbitrary creation, browsing, reveal, rollback, service-account management, and Phase role management are out of scope.
- A safe catalog may initially expose only OpenRouter and approved messaging variables; adding a new variable requires a reviewed catalog change and tests.
- Legacy agent tabs stay hidden until separately migrated to the shared context rather than receiving temporary per-agent branches.
