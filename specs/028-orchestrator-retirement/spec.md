# Feature Specification: Internal Workspace and Orchestrator Retirement

**Feature Branch**: `agent/codex/orchestrator-retirement`

**Created**: 2026-07-25

**Status**: Approved for implementation

**Input**: Retire the unused customer-hosting orchestrator and Docker socket
proxy, reframe OvernightDesk as an authenticated internal business workspace
for Gary and Austin, preserve separate Titus membership identities, and move
Aegis to human-approved named workload operations with reversible production
retirement.

## User Scenarios & Testing

### User Story 1 - Remove Dormant Hosting Authority (Priority: P1)

As the accountable owner, Gary can operate Aegis without an unused public
management service or dormant container-hosting authority.

**Why this priority**: The unused management surface can control production
containers and is currently reachable through a public cleartext route. Removing
it reduces the highest unnecessary privilege on the business production plane.

**Independent Test**: Verify that the retired hostname no longer proxies any
management endpoint, the orchestrator and socket proxy are not running, and
Walter, Titus, Mitchel, communications, authentication, backups, and operator
access remain healthy.

**Acceptance Scenarios**:

1. **Given** the customer-hosting control plane has no registered tenants,
   routes, operators, or recent callers, **when** the retirement is activated,
   **then** its public ingress and Docker authority are unavailable.
2. **Given** the orchestrator and socket proxy are stopped, **when** all named
   business workloads are checked, **then** their approved user and service
   journeys remain available.
3. **Given** an unrelated application container, **when** it attempts to reach
   the retired Docker management surface, **then** no reachable endpoint exists.

---

### User Story 2 - Share Titus Without Sharing Identity (Priority: P1)

As business partners, Gary and Austin can use the same Titus workspace through
their own authenticated accounts and independently governed memberships.

**Why this priority**: Titus is a shared business workspace, but accountability
and revocation require separate identities rather than shared credentials.

**Independent Test**: Verify the Titus authorization contract represents Gary
and Austin as separate identities and memberships, and that Austin's later
activation procedure requires his exact authenticated account plus denial and
cross-workspace checks.

**Acceptance Scenarios**:

1. **Given** Gary and Austin have separate accounts and active Titus
   memberships, **when** either launches Titus, **then** each reaches the same
   approved workspace under their own identity.
2. **Given** Austin's Titus membership is absent, inactive, expired, revoked, or
   ambiguous, **when** Austin attempts access, **then** access fails closed while
   Gary's membership remains unaffected.
3. **Given** a member is authorized to Titus, **when** the member uses another
   workspace URL, **then** Titus membership does not grant cross-workspace
   access.

---

### User Story 3 - Operate Named Workloads Deliberately (Priority: P2)

As the accountable owner, Gary can add, update, restart, or retire a named
business runtime only through a reviewed, human-approved production procedure.

**Why this priority**: The business requires a small number of stable named
workloads, not autonomous customer provisioning.

**Independent Test**: Follow the documented change procedure for a harmless
qualification operation and verify that no self-service or subscription event
can create or destroy a runtime.

**Acceptance Scenarios**:

1. **Given** a proposed new runtime, **when** no explicit owner approval exists,
   **then** the runtime is not created.
2. **Given** an approved runtime change, **when** the documented procedure is
   followed, **then** its source, owner, identity, secrets, persistence,
   resource, network, verification, and rollback boundaries are recorded.
3. **Given** a legacy customer signup, billing, or provisioning event,
   **when** it is received, **then** it cannot mutate Aegis runtime state.

---

### User Story 4 - Retire Without Losing Recovery Evidence (Priority: P2)

As an operator, Gary can reverse the retirement during a defined observation
window without losing incident knowledge, configuration evidence, or
persistent state.

**Why this priority**: Security reduction must not become an availability or
data-loss event.

**Independent Test**: Confirm the pre-retirement evidence bundle, incident
export, rollback instructions, retained stopped containers or configuration,
and protected data volumes exist before activation.

**Acceptance Scenarios**:

1. **Given** the orchestrator contains three incident records, **when** the
   service is retired, **then** those records remain available through the
   approved operations knowledge boundary.
2. **Given** the observation window has not ended, **when** rollback is
   authorized, **then** the prior service configuration can be restored without
   reconstructing secrets from documentation or memory.
3. **Given** the observation window succeeds, **when** cleanup is considered,
   **then** deleting containers, volumes, images, database state, or secret
   paths requires a separate explicit approval.

### Edge Cases

- Wildcard DNS may continue resolving the retired hostname; the hostname must
  fail closed rather than fall through to another application.
- A stopped component may be configured with an automatic restart policy; the
  retired state must survive host or container-engine restart.
- An operator tool may contain a hidden or optional dependency that silently
  fails when the orchestrator is absent.
- The preserved incident export may accidentally include credentials or
  request payloads; exports must contain only the approved incident fields.
- A legacy frontend route may still attempt customer provisioning after the
  production service is retired; it must fail safely without changing runtime
  state.
- Austin may already have a platform identity but no exact Titus membership;
  membership activation is separate from orchestrator retirement.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST classify OvernightDesk as an authenticated
  internal business workspace rather than an external customer-hosting product.
- **FR-002**: The system MUST classify Aegis as the production plane for named
  approved business workloads only.
- **FR-003**: External customer signup, billing-triggered hosting, and
  self-service runtime provisioning MUST be outside the active product scope.
- **FR-003A**: Future customer workloads and customer data planes MUST normally
  use separately approved infrastructure outside `aegis-prod`, such as an
  engagement-specific Azure, Vultr, or other provider environment selected for
  the customer's requirements.
- **FR-003B**: A customer workload or customer data exception on `aegis-prod`
  MUST require explicit owner approval after documented security, capacity,
  contractual, data-custody, cost, and recovery review.
- **FR-004**: Production runtime creation, removal, identity changes, secret
  changes, and authority changes MUST require explicit human approval.
- **FR-005**: The retired orchestrator hostname MUST NOT proxy any application
  or management service over cleartext or encrypted public ingress.
- **FR-006**: The platform orchestrator MUST NOT run after retirement
  activation.
- **FR-007**: The Docker socket proxy MUST NOT run after retirement activation.
- **FR-008**: No active internal application service MUST mount or reach the
  Docker management socket through a network proxy.
- **FR-009**: Named business runtimes MUST remain available after retirement,
  including Walter, Titus, and Mitchel.
- **FR-010**: The communication module, authentication shell, Open WebUI
  workspaces, operations tools, audit services, backups, SSH, and Tailscale
  administration MUST remain available after retirement.
- **FR-011**: The three existing platform incident records MUST be preserved in
  an approved operations knowledge boundary before the database is stopped.
- **FR-012**: Optional operations tools MUST not report the retired
  orchestrator or its recorder as an active platform capability.
- **FR-013**: The orchestrator database, persistent volumes, configuration,
  and required secret references MUST be retained during the observation
  window without exposing secret values.
- **FR-014**: Destructive cleanup after the observation window MUST require a
  separate explicit approval.
- **FR-015**: The platform standard, active product direction, operating
  procedures, and production deployment ledger MUST reflect the retirement.
- **FR-016**: Gary and Austin MUST use separate authenticated identities and
  separate exact memberships when Titus access is shared.
- **FR-017**: Titus membership MUST be independently grantable, auditable,
  expirable, revocable, and restorable for each person.
- **FR-018**: Titus membership MUST NOT grant access to Walter, Mitchel, or any
  unrelated workspace.
- **FR-019**: The retirement MUST include a documented rollback sequence and
  objective activation and rollback gates.
- **FR-020**: The retired state MUST survive a production host restart without
  automatically restoring the orchestrator or socket proxy.
- **FR-021**: Legacy customer provisioning interfaces MUST remain unable to
  mutate Aegis while their complete source removal is handled separately.
- **FR-022**: Source code retained for historical reference MUST be clearly
  excluded from active production deployment and maintenance procedures.
- **FR-023**: New first-party services, agents, operational daemons, CLIs, and
  infrastructure automation SHOULD use Go when practical; exceptions and any
  decision not to migrate an existing stable service MUST be explicit.

### Key Entities

- **Internal workspace**: The authenticated business shell through which
  approved people reach named workspaces and operating surfaces.
- **Business runtime**: A named agent process with an explicit use case,
  accountable owner, membership boundary, persistent state, and secrets scope.
- **Workspace membership**: A revocable authorization joining one authenticated
  person to one exact active workspace and runtime.
- **Retired component**: A previously deployed service excluded from ingress,
  startup, active dependencies, and routine maintenance while rollback evidence
  is retained.
- **Retirement evidence bundle**: The secret-free configuration, inventory,
  incident export, validation results, and rollback instructions captured
  before activation.
- **Observation window**: The bounded period during which retired state is
  retained and the remaining production plane is monitored before cleanup.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The retired public hostname returns a fail-closed response for
  100% of tested management and health paths and never serves another
  OvernightDesk application.
- **SC-002**: Zero running containers retain direct or proxied Docker socket
  access after retirement.
- **SC-003**: All approved Walter, Titus, Mitchel, communication, workspace,
  authentication, backup, and administration checks pass after activation.
- **SC-004**: All three pre-existing incident records are preserved with zero
  credential or secret values in the export.
- **SC-005**: The orchestrator and socket proxy remain stopped throughout a
  14-day observation window and after any host restart during that window.
- **SC-006**: The Titus sharing contract and activation runbook require
  separate Gary and Austin accounts, independent memberships, non-member and
  inactive-member denial, and no cross-workspace grant. Live Austin activation
  is recorded only after his exact authenticated account is available and the
  owner separately approves the grant.
- **SC-007**: Zero active standards or runbooks instruct operators to deploy,
  update, route to, or depend on the retired orchestrator or socket proxy.
- **SC-008**: Rollback can be initiated from the preserved evidence without
  deleting or recreating any persistent business-runtime data.

## Assumptions

- Gary's approval to proceed authorizes reversible retirement and publication,
  but not deletion of containers, volumes, images, database state, or secrets.
- Answer 2 from the business-direction clarification means all new runtime
  deployments are human-approved and self-service provisioning is not desired.
- Austin will share the Titus workspace through his own platform identity and
  exact membership, not through shared credentials.
- Existing named runtimes are managed independently of the platform
  orchestrator.
- The observation window is 14 days unless the owner later chooses a longer
  period.
- Complete removal of legacy signup, Stripe, subscription, and provisioning
  source is a follow-up feature because it changes more product and data
  surfaces than are required to eliminate current Aegis authority.
