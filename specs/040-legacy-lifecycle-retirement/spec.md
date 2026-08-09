# Feature Specification: Legacy Customer Lifecycle Retirement

**Feature Branch**: `agent/codex/legacy-lifecycle-retirement`

**Created**: 2026-08-09

**Status**: Draft

**Input**: Complete the separate migration deferred by ADR 007 by removing
legacy customer signup, Stripe billing, setup wizard, callback, and
self-service provisioning behavior while preserving invite-only internal
registration and every approved named-runtime operation. Tracks
[Issue #215](https://github.com/Little-Town-Labs/overnightdesk/issues/215).

## User Scenarios & Testing

### User Story 1 - Use only the internal workspace (Priority: P1)

As an approved collaborator, I want OvernightDesk to present only its current
internal workspace so that I can register by invitation, authenticate, and use
my approved workspaces without encountering obsolete customer plans, checkout,
billing, or self-service hosting flows.

**Why this priority**: The current product direction is an authenticated
internal workspace. Public customer-hosting offers contradict that direction
and retain paths into payment and provisioning behavior that the business no
longer supports.

**Independent Test**: An invited collaborator can create and verify an account,
sign in, and reach only membership-approved workspaces, while anonymous and
authenticated users cannot view or initiate a customer subscription, billing,
setup-wizard, or self-service provisioning flow.

**Acceptance Scenarios**:

1. **Given** an invited collaborator with no account, **When** they register and
   verify their email, **Then** they can authenticate without selecting a paid
   plan or initiating runtime provisioning.
2. **Given** an uninvited visitor, **When** they attempt registration, **Then**
   registration remains denied without exposing a customer purchase path.
3. **Given** any visitor or authenticated collaborator, **When** they request a
   retired pricing, checkout, billing, wizard, callback, or customer-hosting
   surface, **Then** the system returns the defined fail-closed outcome and
   performs no payment or runtime action.

---

### User Story 2 - Preserve approved named-runtime operations (Priority: P1)

As the platform owner, I want active named-runtime operations separated from
retired customer lifecycle authority so that current Walter, Titus, and Mitchel
workflows continue without retaining a general customer-hosting control plane.

**Why this priority**: The existing mixed-authority service contains both
retired lifecycle behavior and approved operations. Removing it wholesale
would break current business workflows, while retaining it unchanged preserves
unnecessary high authority.

**Independent Test**: Every approved named-runtime operation has an explicit
owner, caller, target, authorization rule, input contract, audit result, and
bounded runtime effect; those operations pass their existing positive and
denial checks while customer container creation, deprovisioning, broad restart,
and arbitrary secret writing remain unavailable.

**Acceptance Scenarios**:

1. **Given** an approved managed-variable replacement for an exact qualified
   runtime boundary, **When** an authorized collaborator submits a valid
   replacement, **Then** the value is handled secret-safely, the operation is
   idempotent and audited, and only the approved runtime effect occurs.
2. **Given** a request outside an approved named-runtime boundary, **When** it
   reaches the operations boundary, **Then** it is denied without creating,
   deleting, or broadly restarting a runtime and without changing a secret.
3. **Given** an operation that appears unused or ambiguously owned, **When**
   retirement readiness is evaluated, **Then** removal stops until consumer
   absence or an approved replacement is proven.

---

### User Story 3 - Reconcile payment and compatibility data safely (Priority: P1)

As the accountable owner, I want payment obligations and legacy application
records reconciled before removal so that the migration neither abandons a
financial obligation nor destroys identity, membership, runtime, audit, or
business data.

**Why this priority**: Payment state, account behavior, authorization, and
legacy instance records are currently coupled. A source-only deletion could
silently change access, leave an active subscription unmanaged, or make a
future audit impossible.

**Independent Test**: A secret-safe census classifies every retained payment,
subscription, customer-lifecycle, and compatibility record; each class has an
approved preserve, archive, migrate, or delete treatment, and a reversible
backup and verification result exist before any destructive data change.

**Acceptance Scenarios**:

1. **Given** any active, disputed, refundable, legally retained, or otherwise
   unresolved payment obligation, **When** the retirement reaches payment
   disconnection, **Then** it stops and requires an explicit owner decision.
2. **Given** a collaborator whose access was historically associated with a
   subscription, **When** subscription-derived authorization is removed,
   **Then** access is determined only by current internal identity and
   membership rules.
3. **Given** legacy records with no current authority or operational consumer,
   **When** their approved treatment is applied, **Then** the result is
   reversible, count-reconciled, and does not alter active identity,
   membership, named-runtime, or business records.

---

### User Story 4 - Close out durable retirement truth (Priority: P2)

As an operator, I want source, configuration, production state, and canonical
documentation to agree so that future maintenance does not attempt to use
retired payment or customer-hosting capabilities.

**Why this priority**: A retirement is incomplete while code, routes, secrets,
service state, inventories, or runbooks still describe the retired lifecycle
as usable.

**Independent Test**: Repository, public-surface, configuration, service,
secret-metadata, inventory, and documentation checks identify zero active
customer lifecycle path and confirm all approved named-runtime operations and
internal collaborator flows remain healthy.

**Acceptance Scenarios**:

1. **Given** the source migration is merged but production activation is not
   separately approved, **When** closeout is reviewed, **Then** production
   remains unchanged and the feature is not marked deployed.
2. **Given** an approved production activation, **When** postflight completes,
   **Then** retired surfaces fail closed, approved internal workflows pass,
   rollback evidence is intact, and the result is recorded in canonical
   operational records.
3. **Given** an observation-window regression, **When** the rollback threshold
   is met, **Then** the bounded rollback restores only the affected approved
   capability and does not reactivate customer lifecycle authority.

### Edge Cases

- A payment provider reports no active subscription while a local record still
  appears active, or the reverse: treat the state as unresolved and stop the
  payment retirement gate.
- A callback or webhook delivery arrives during cutover: acknowledge or deny it
  according to the approved drain contract without mutating payment,
  authorization, or runtime state.
- A user has legacy subscription data but no current membership: the legacy
  record grants no workspace access and remains subject to its approved data
  treatment.
- A named runtime still calls a function hosted by the mixed-authority service:
  preserve or replace that exact operation before retiring the service.
- A secret or configuration key appears unused but consumer absence cannot be
  proven: retain it inactive and record the unresolved owner decision.
- Wildcard routing could send a removed hostname or path to another
  application: preserve an explicit fail-closed response.
- Rollback source contains customer lifecycle behavior: rollback may restore
  only the bounded approved internal capability, not public customer-hosting
  access or dynamic lifecycle authority.

## Requirements

### Functional Requirements

- **FR-001**: OvernightDesk MUST retain invite-only registration, email
  verification, authentication, session management, password recovery, and
  membership-scoped internal workspace access.
- **FR-002**: The system MUST remove public customer plan, pricing, checkout,
  billing-management, checkout-success, setup-wizard, provisioning-progress,
  and self-service hosting experiences.
- **FR-003**: Retired customer lifecycle web and service requests MUST fail
  closed and MUST NOT initiate payment, secret, ingress, certificate,
  container, runtime, or data mutation.
- **FR-004**: Current authorization MUST NOT depend on a legacy subscription,
  plan, payment status, or customer identifier.
- **FR-005**: Account deletion MUST preserve the current internal identity and
  data-custody contract and MUST NOT invoke legacy payment cancellation or
  customer-runtime deprovisioning behavior.
- **FR-006**: The migration MUST reconcile provider-side payment obligations
  and local payment records before disabling payment callbacks, removing
  payment configuration, or changing retained payment data.
- **FR-007**: Any unresolved financial obligation or provider/local state
  mismatch MUST stop the affected retirement action and require an explicit
  owner decision.
- **FR-008**: Every still-required named-runtime operation MUST have an exact
  owner, caller, target, authorization rule, input boundary, audit outcome, and
  bounded runtime effect before the mixed-authority provisioning boundary is
  retired.
- **FR-009**: The replacement operations boundary MUST NOT expose dynamic
  customer runtime creation, customer deprovisioning, arbitrary secret maps,
  unrestricted runtime selection, broad restart, or customer-controlled
  ingress and certificate changes.
- **FR-010**: The qualified managed-variable replacement capability MUST retain
  exact boundary matching, current role and membership authorization,
  input validation, rate limiting, durable idempotency, metadata-only auditing,
  value-free responses, and its approved runtime effect.
- **FR-011**: Operations whose consumers or business ownership cannot be proven
  MUST remain inactive or unchanged until an owner-approved treatment exists.
- **FR-012**: Legacy wizard and provisioning callback behavior MUST be removed
  only after in-flight work is proven absent or handled by an approved drain
  contract.
- **FR-013**: Legacy payment, subscription, wizard, provisioning, and instance
  compatibility data MUST be inventoried and assigned an explicit preserve,
  archive, migrate, or delete treatment.
- **FR-014**: Every destructive data treatment MUST have a checked backup,
  count reconciliation, rollback procedure, and separate explicit production
  approval.
- **FR-015**: Active identity, membership, named-runtime, conversation, memory,
  audit, tenant, prospect, and business records MUST remain unchanged except
  through separately approved requirements.
- **FR-016**: Payment and service credentials MUST remain secret-safe during
  discovery and MUST be removed or rotated in their owning systems only after
  all consumers are proven absent and the owner approves the action.
- **FR-017**: Removed public hostnames and paths MUST retain an explicit
  fail-closed outcome wherever wildcard or default routing could expose a
  different application.
- **FR-018**: The migration MUST provide independently executable preflight,
  cutover, postflight, rollback, and observation checks for each production
  boundary it changes.
- **FR-019**: Source publication, payment disconnection, data migration,
  production service retirement, secret removal, and observation closeout MUST
  remain distinct approval gates.
- **FR-020**: Canonical product documentation, architecture decisions,
  machine-readable inventories, runbooks, and the production deployment ledger
  MUST record the final source and production state without secret or private
  payment data.

### Key Entities

- **Internal collaborator**: An invited person with an individual account and
  explicit workspace memberships; no payment record grants this access.
- **Legacy customer lifecycle**: The retired plan selection, payment,
  setup-wizard, callback, and automated customer-runtime lifecycle behavior.
- **Payment obligation**: Provider-side and local records that may require
  cancellation, refund, dispute, tax, audit, or retention treatment before
  integration removal.
- **Compatibility record**: Legacy subscription or instance state retained in
  the application data model but not authoritative for current workspace
  access.
- **Named-runtime operation**: An owner-approved action against one explicit
  business runtime with bounded authority and verification.
- **Retirement evidence**: Secret-safe inventories, backups, counts,
  qualification results, approvals, rollback handles, observation results, and
  durable deployment records.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All tested public and authenticated customer lifecycle entry
  points produce the approved fail-closed outcome, with zero payment,
  credential, ingress, certificate, container, runtime, or database mutation.
- **SC-002**: 100% of invite-only registration, verification, authentication,
  password recovery, membership denial, and approved workspace access checks
  pass after the migration.
- **SC-003**: Zero current authorization decisions or account-deletion actions
  depend on legacy payment or subscription state.
- **SC-004**: 100% of provider-side and local payment records are
  count-reconciled and assigned an owner-approved treatment before payment
  integration removal.
- **SC-005**: Every retained named-runtime operation has one explicit owner,
  caller set, target set, authorization contract, audit contract, and rollback
  handle; no customer lifecycle operation remains available.
- **SC-006**: The managed-variable replacement regression suite passes all
  approved success, denial, idempotency, secret-leak, and bounded runtime-effect
  cases with zero value disclosure.
- **SC-007**: All changed data classes have a checked backup and 100% before/
  after count reconciliation, and rollback rehearsal restores the pre-change
  state without affecting active business data.
- **SC-008**: Required internal workspace and named-runtime health checks show
  no regression through the approved observation window.
- **SC-009**: Repository, public-route, service, configuration, secret-metadata,
  inventory, and documentation scans report zero contradictory active customer
  lifecycle claim after closeout.

## Assumptions

- Invite-only registration is a current internal workspace requirement and is
  distinct from retired public customer acquisition and purchase flows.
- Existing identity and membership records are the authoritative access model;
  subscription records are compatibility data only.
- Any payment obligation discovered during reconciliation is handled before
  disconnecting the payment provider or deleting related data.
- Current named runtimes and their data remain in place throughout this
  migration.
- The qualified managed-variable replacement capability remains required until
  the owner separately changes that product requirement.
- Operations without proven current consumers default to inactive retention,
  not deletion or continued authority.
- Production, payment-account, secret, and data mutations require separate
  explicit owner approval after reviewed source and rollback procedures exist.

## Non-goals

- Removing invite-only registration, authentication, sessions, password
  recovery, email verification, or membership management.
- Creating a replacement customer-hosting, paid-plan, billing, or automated
  tenant-provisioning product.
- Adding new named runtimes, supported managed variables, runtime authority,
  payment providers, or external integrations.
- Deleting or recreating named runtime containers, volumes, conversations,
  memory, tenant data, prospect data, or business records.
- Removing historical platform-orchestrator source preserved by ADR 007.
- Performing production deployment, payment-provider mutation, credential
  rotation/removal, or destructive data migration as part of specification.
