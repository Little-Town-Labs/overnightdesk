# Feature Specification: Hermes Titus Runtime

**Feature Branch**: `013-hermes-titus-runtime`

**Created**: 2026-07-17

**Status**: Deployed and verified

**Input**: Install a dedicated Hermes agent named Titus on Aegis, connect it to Control Tower and the OvernightDesk network, give it private persistent TencentDB Agent Memory, and prepare a fail-closed Microsoft Teams integration for the Timeless Technology Solutions workspace.

## User Scenarios & Testing

### User Story 1 - Run Titus Safely (Priority: P1)

The operator can run Titus as an isolated, restartable agent without exposing its credentials or affecting another Hermes tenant.

**Why this priority**: Every other Titus capability depends on a trustworthy runtime boundary.

**Independent Test**: Start Titus, verify its health from the internal network, inspect its security controls, and restart it without losing tenant state.

**Acceptance Scenarios**:

1. **Given** the approved Aegis host and scoped Titus configuration, **When** the runtime starts, **Then** only the Titus container receives its secrets and persistent storage.
2. **Given** a host restart or container failure, **When** Titus is recovered, **Then** it returns healthy without exposing a public dashboard or losing tenant data.
3. **Given** an incomplete optional integration, **When** Titus starts, **Then** the unavailable integration remains disabled without blocking the core runtime.

---

### User Story 2 - Monitor Through Control Tower (Priority: P2)

Titus can authenticate to Control Tower as its registered agent identity and use only the workspace and capabilities returned by its session.

**Why this priority**: Azure monitoring is Titus's primary operational role.

**Independent Test**: Request a Control Tower session from the internal network and verify that the returned agent, workspace, and profile match the registered Titus record.

**Acceptance Scenarios**:

1. **Given** the Titus caller token, **When** Titus requests its session, **Then** Control Tower returns only the token-bound identity, workspace, and capability profile.
2. **Given** missing Azure workspace credentials, **When** Titus attempts an Azure-backed operation, **Then** the operation fails closed without exposing dependency details or credentials.

---

### User Story 3 - Retain Private Agent Memory (Priority: P2)

Titus can capture and recall useful context across sessions from private tenant-local storage.

**Why this priority**: Long-running monitoring and support work should not require the operator to repeat established context.

**Independent Test**: Capture a synthetic non-secret memory, retrieve it in a later request, and confirm that the memory database remains inside Titus's storage boundary.

**Acceptance Scenarios**:

1. **Given** a normal Titus conversation, **When** the memory provider captures eligible context, **Then** it stores that context only in Titus's persistent tenant volume.
2. **Given** a later session, **When** Titus searches memory, **Then** the matching synthetic context can be recalled without reaching another tenant's storage.
3. **Given** a memory-gateway failure, **When** Titus continues operating, **Then** the failure is visible to the operator and no unauthenticated network memory service is exposed.

---

### User Story 4 - Support TTS in Microsoft Teams (Priority: P3)

Authorized Timeless Technology Solutions users can interact with Titus from the TTS Microsoft Teams workspace after the Microsoft app credentials and allow-list are provisioned.

**Why this priority**: Teams is an important user channel but must not weaken the runtime or delay the core monitoring agent.

**Independent Test**: With valid tenant credentials and an authorized user ID, install the bot in TTS Teams, mention it in an approved channel, and verify that unauthorized identities are ignored.

**Acceptance Scenarios**:

1. **Given** placeholder or incomplete Teams configuration, **When** Titus starts, **Then** Teams remains disabled and no webhook endpoint is published.
2. **Given** valid Teams credentials and a non-empty allow-list, **When** the operator activates Teams, **Then** the authenticated public webhook accepts Microsoft Bot Framework traffic and authorized users can reach Titus.
3. **Given** a user outside the allow-list, **When** that user addresses Titus, **Then** the request is silently rejected.

---

### User Story 5 - Use the Dedicated Titus Inbox (Priority: P2)

The operator can ask Titus to inspect and summarize his dedicated AgentMail
inbox, prepare a draft, and perform an explicitly approved mailbox action.

**Why this priority**: Email is a core operating channel, but outbound and
mailbox mutations must remain human-controlled.

**Independent Test**: Connect to the hosted AgentMail MCP endpoint with the
Phase-loaded key, discover the available tools, identify the Titus inbox, and
perform a read-only inbox listing without exposing the key.

**Acceptance Scenarios**:

1. **Given** the scoped AgentMail key, **When** Titus starts or tests the MCP connection, **Then** the key is interpolated from the process environment and is not stored in configuration.
2. **Given** a read-only inbox request, **When** Titus uses AgentMail, **Then** it selects only the dedicated Titus inbox and does not mutate mailbox state.
3. **Given** a requested send, reply, forward, draft mutation, or mailbox change, **When** no immediate explicit operator approval is present, **Then** Titus prepares or describes the action but does not execute it.

### Edge Cases

- Phase is temporarily unavailable while the service is starting.
- A Phase value is empty, malformed, or still set to `NOT_CONFIGURED`.
- The Control Tower token is valid but Azure workspace credentials are absent.
- The memory package cannot load its native ARM64 SQLite/vector dependency.
- The memory sidecar becomes unhealthy after Hermes starts.
- Teams credentials exist but the authorized-user allow-list is absent.
- A request reaches the future Teams route without a valid Bot Framework identity.

## Requirements

### Functional Requirements

- **FR-001**: Titus MUST run in a dedicated container with a dedicated persistent data volume.
- **FR-002**: Titus MUST join the private OvernightDesk application network and MUST NOT publish its dashboard or agent API directly to the host.
- **FR-003**: Titus MUST retrieve runtime credentials from its scoped Phase records without persisting their values in its image, container metadata, or data volume.
- **FR-004**: Titus MUST authenticate to Control Tower using its dedicated caller token and MUST treat the returned session as the only workspace authority.
- **FR-005**: Azure-backed Control Tower operations MUST remain fail-closed until the registered workspace has all required Azure credentials.
- **FR-006**: Titus MUST use a private persistent memory store that is not shared with another tenant.
- **FR-007**: The memory gateway MUST be reachable only from inside the Titus container and MUST expose a bounded health signal.
- **FR-008**: Titus MUST continue to provide its core runtime when the optional memory or Teams integration is unavailable, while reporting the degraded state.
- **FR-009**: Microsoft Teams MUST remain disabled until the client ID, client secret, tenant ID, and authorized-user allow-list are all populated with non-placeholder values.
- **FR-010**: Microsoft Teams activation MUST use an authenticated HTTPS webhook and MUST NOT permit an allow-all user policy in production.
- **FR-011**: Runtime logs, health output, deployment evidence, and repository files MUST NOT contain secret values or authorization headers.
- **FR-012**: The operator MUST have a repeatable start, stop, restart, status, and rollback surface for Titus.
- **FR-013**: AgentMail MUST use the dedicated Titus credential and inbox through the hosted MCP endpoint without persisting the API key in configuration.
- **FR-014**: Titus MUST follow an installed AgentMail skill that keeps reads non-mutating and requires explicit operator approval immediately before sends or mailbox mutations.

### Key Entities

- **Titus runtime**: The isolated Hermes process, its security limits, internal network membership, and lifecycle state.
- **Titus credential set**: Scoped Phase records for model access, AgentMail, Control Tower, and optional Teams activation.
- **Control Tower session**: The server-issued agent, workspace, and capability binding Titus is allowed to use.
- **Titus memory store**: Tenant-local conversations, derived memories, indexes, and provider state retained across restarts.
- **TTS Teams connection**: The future Microsoft bot identity, tenant binding, explicit authorized-user list, and public webhook route.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Titus reaches a healthy core runtime within 90 seconds of an authorized start on Aegis.
- **SC-002**: Automated checks find zero secret values in container environment metadata, image history, repository files, or deployment evidence.
- **SC-003**: A live Control Tower session identifies Titus and its exact token-bound workspace with no cross-workspace enumeration.
- **SC-004**: A synthetic memory can be captured and recalled after a container restart while another Hermes tenant remains unchanged.
- **SC-005**: Teams activation remains blocked for every tested case where any required credential or allow-list value is absent or placeholder.
- **SC-006**: Stop, start, and restart operations affect only Titus and preserve its named data volume.
- **SC-007**: Hermes discovers AgentMail tools and identifies the dedicated Titus inbox while automated checks find no AgentMail key literal in repository or Docker metadata.

## Assumptions

- The existing pinned OvernightDesk Hermes image remains the base runtime.
- Phase app `azure-ops`, environment `production`, remains the Titus secret source.
- The current Titus Control Tower token is valid, while Azure workspace credentials may still be pending.
- TencentDB Agent Memory uses its local SQLite and vector backend for the MVP; Tencent Cloud VectorDB is out of scope.
- TTS Teams credentials will be generated from the TTS Microsoft tenant and replace the Phase placeholders before Teams activation.
- Teams meeting ingestion and automatic Graph subscription maintenance are deferred until the basic TTS bot channel is activated and separately approved.
