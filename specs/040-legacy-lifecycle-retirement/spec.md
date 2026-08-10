# Feature Specification: Legacy Customer Lifecycle Retirement

**Feature Branch**: `040-legacy-lifecycle-retirement`

**Created**: 2026-08-09

**Status**: Source and zero-state data retirement complete; production closeout
pending owner-authenticated T043 acceptance

**Input**: Complete the separate migration deferred by ADR 007 by removing
legacy customer signup, Stripe billing, setup wizard, callback, and
self-service provisioning behavior while preserving the existing authenticated
Timeless Technology Solutions frontend and its approved named-runtime support.
Tracks
[Issue #215](https://github.com/Little-Town-Labs/overnightdesk/issues/215).

### Closeout status

The source retirement and Neon zero-state cleanup are complete. T044 deployed
the isolated managed-variable service and retired the remaining provisioner
lifecycle routes. T045 completed as a metadata-only no-op because no obsolete
provider or secret target was identified; the active managed-variable service
credentials remain in use. The owner waived the proposed T046 observation
period after a passing baseline sample. T043 remains open because durable
owner-authenticated password-recovery, chat, and dashboard smoke evidence has
not yet been recorded, so T047 and Issue #215 remain open.

## Clarifications

### Session 2026-08-09

- Q: How should account deletion behave after retirement? → A: Retire
  self-service deletion; account deletion is owner-operated only.
- Q: Which privileged provisioner capability survives retirement? → A:
  Preserve only qualified managed-variable replacement and its required
  health/readiness endpoints.
- Q: What final outcome should retired routes use? → A: Remove the entire
  unused Stripe integration and return 404 for retired UI and API routes.
- Q: What product posture should retirement leave? → A: Keep a limited-use
  Timeless Technology Solutions frontend for existing sign-in, chat, and
  dashboard use; remove registration and all customer lifecycle behavior.

## User Scenarios & Testing

### User Story 1 - Use the limited internal frontend (Priority: P1)

As an existing authorized collaborator, I want OvernightDesk to present only
the limited Timeless Technology Solutions frontend so that I can sign in and
use chat and the dashboard without encountering registration, customer plans,
checkout, billing, or self-service hosting flows.

**Why this priority**: The current product direction is an authenticated
internal workspace. Public customer-hosting offers contradict that direction
and retain paths into payment and provisioning behavior that the business no
longer supports.

**Independent Test**: The existing owner account can sign in, recover access,
use chat, and reach the dashboard, while anonymous and authenticated users
cannot register or view or initiate a customer subscription, billing,
setup-wizard, or self-service provisioning flow.

**Acceptance Scenarios**:

1. **Given** the existing owner account, **When** the owner signs in, **Then**
   chat and the dashboard remain available without any paid-plan or runtime
   provisioning step.
2. **Given** any visitor, **When** they request a registration surface or submit
   a registration request, **Then** the system returns `404 Not Found` and does
   not create an identity.
3. **Given** any visitor or authenticated collaborator, **When** they request a
   retired pricing, checkout, billing, wizard, callback, or customer-hosting
   surface, **Then** the system returns `404 Not Found` without redirecting and
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

**Independent Test**: The qualified managed-variable replacement capability
and its required health/readiness endpoints have explicit owners, callers,
targets, authorization rules, input contracts, audit results, and bounded
runtime effects; they pass their existing positive and denial checks while
every other privileged provisioner operation remains unavailable.

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

### User Story 3 - Prove legacy payment state is empty (Priority: P1)

As the accountable owner, I want one bounded preflight to confirm that the
unused Stripe integration has no provider obligation or local subscription
record so that its remaining schema and configuration can be removed.

**Why this priority**: Stripe was never fully established, but the source still
contains payment and subscription coupling. A zero-state check is sufficient
unless it finds unexpected evidence.

**Independent Test**: A secret-safe preflight reports zero provider obligations,
zero local subscription rows, and no active callback or schema consumer before
the separately approved removal migration runs.

**Acceptance Scenarios**:

1. **Given** zero provider obligations and zero local subscription rows,
   **When** the removal migration is reviewed, **Then** it is eligible for
   separate approval with backup, rollback, and verification.
2. **Given** a collaborator whose access was historically associated with a
   subscription, **When** subscription-derived authorization is removed,
   **Then** access is determined only by current internal identity and
   membership rules.
3. **Given** any unexpected provider obligation, local subscription row, or
   active consumer, **When** preflight runs, **Then** only the affected cleanup
   stops for an owner decision and no record is automatically deleted.

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

- **FR-001**: OvernightDesk MUST retain existing-account authentication,
  session management, password recovery, chat, dashboard access, and the
  membership rules those surfaces require. It MUST remove all registration UI
  and registration endpoints and MUST NOT create a replacement signup flow.
- **FR-002**: The system MUST remove public customer plan, pricing, checkout,
  billing-management, checkout-success, setup-wizard, provisioning-progress,
  and self-service hosting experiences. It MUST also remove Stripe API routes,
  webhook handlers, application libraries, package dependencies, tests,
  configuration references, and operational documentation.
- **FR-003**: Retired customer lifecycle web and service requests MUST fail
  closed with `404 Not Found`, MUST NOT redirect to another application
  surface, and MUST NOT initiate payment, secret, ingress, certificate,
  container, runtime, or data mutation. This includes direct submission to the
  Better Auth email-registration path, not only the removed signup page.
- **FR-004**: Current authorization MUST NOT depend on a legacy subscription,
  plan, payment status, or customer identifier.
- **FR-005**: The system MUST remove the self-service account-deletion UI and
  endpoint. Any account deletion MUST use an explicit owner-operated process,
  MUST NOT invoke legacy payment cancellation or customer-runtime
  deprovisioning, and MUST fail closed rather than delete the sole active owner
  identity.
- **FR-006**: The migration MUST reconcile provider-side payment obligations
  and local payment records before production activation disables payment
  callbacks, removes payment configuration, or changes retained payment data.
  Source removal may be reviewed and merged while remaining undeployed. If the
  census proves no provider obligation and no callback requiring handling, no
  callback drain is required.
- **FR-007**: Any unresolved financial obligation or provider/local state
  mismatch MUST stop the affected retirement action and require an explicit
  owner decision.
- **FR-008**: Every still-required named-runtime operation MUST have an exact
  owner, caller, target, authorization rule, input boundary, audit outcome, and
  bounded runtime effect before the mixed-authority provisioning boundary is
  retired. The only surviving privileged operation is the qualified
  managed-variable replacement capability, together with the minimum
  health/readiness endpoints required to operate it.
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
- **FR-012**: Production activation of legacy wizard and provisioning callback
  removal MUST occur only after one preflight proves no in-flight customer
  lifecycle work. Source removal may be reviewed and merged while remaining
  undeployed; any unexpected work MUST stop only that activation for an owner
  decision.
- **FR-013**: The data preflight MUST report provider-obligation count, local
  subscription-row count, meaningful wizard-state count, and active schema
  consumers. Zero-state surfaces may proceed to removal; any non-zero or
  ambiguous result MUST stop and MUST NOT be automatically deleted.
- **FR-014**: Every destructive data treatment MUST have a checked backup,
  count reconciliation, executable rollback procedure, successful rollback
  rehearsal against a disposable database, and separate explicit production
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

- **Internal collaborator**: A person with an existing authorized account and
  explicit workspace memberships; no registration or payment record grants
  new access after retirement.
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
- **SC-002**: 100% of existing-owner authentication, password recovery, chat,
  dashboard access, session denial, and membership denial checks pass after the
  migration, while registration attempts create zero identities.
- **SC-003**: Zero current authorization decisions depend on legacy payment or
  subscription state, and no self-service account-deletion surface remains
  available.
- **SC-004**: The removal preflight reports zero provider obligations, zero
  local subscription rows, zero meaningful wizard state, and zero active
  consumers; otherwise the affected destructive cleanup remains unapplied.
- **SC-005**: The managed-variable replacement capability and its required
  health/readiness endpoints each have one explicit owner, caller set, target
  set, authorization contract, audit contract, and rollback handle; no other
  privileged provisioner or customer lifecycle operation remains available.
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

- The existing owner account is the required active user; no registration flow
  is required for the limited Timeless Technology Solutions frontend.
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

- Removing existing-account authentication, sessions, password recovery, chat,
  dashboard access, or the membership controls those surfaces require.
- Deleting or modifying Austin's, Mitchel's, or any other dormant identity as
  part of the customer lifecycle source cleanup.
- Creating a replacement customer-hosting, paid-plan, billing, or automated
  tenant-provisioning product.
- Adding new named runtimes, supported managed variables, runtime authority,
  payment providers, or external integrations.
- Deleting or recreating named runtime containers, volumes, conversations,
  memory, tenant data, prospect data, or business records.
- Removing historical platform-orchestrator source preserved by ADR 007.
- Performing production deployment, payment-provider mutation, credential
  rotation/removal, or destructive data migration as part of specification.
