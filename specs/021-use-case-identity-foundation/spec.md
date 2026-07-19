# Feature Specification: Use-Case Identity Foundation

**Feature Branch**: `021-use-case-identity-foundation`

**Created**: 2026-07-19

**Status**: In progress — additive schema/resolver and guarded Tenet 1
allocation tooling implemented; production preflight is blocked on the missing
Mitchel Better Auth subject and undeployed identity schema. No identity
backfill, number allocation, authorization cutover, or production migration
has been performed.

**Input**: Establish stable platform identity for use cases, runtimes, people,
personas, and infrastructure resources before expanding shared agent access or
embedding Open WebUI. Preserve all live names and identifiers during an
additive migration.

## User Scenarios & Testing

### User Story 1 - Refer to a Use Case Reliably (Priority: P1)

An operator can identify the same operational use case across the platform,
Hermes, Open WebUI, Phase, Nginx, and future collaboration channels without
treating a mutable hostname, container name, persona, or secret path as its
identity.

**Independent Test**: Resolve the Mitchel business use case, Mitchel's user
membership, its Trevor persona assignment, and current `hermes-mitchel`
resource alias by canonical UUID, stable human-facing number, current slug, and
compatibility resource names; all references return the same boundary.

**Acceptance Scenarios**:

1. **Given** a use case has a canonical UUID and stable number, **when** its
   display name or resource alias changes, **then** authorization and foreign
   keys continue to use the UUID.
2. **Given** a legacy `tenantId`, container, hostname, or Phase path, **when**
   it is resolved, **then** the platform maps it through an explicit resource
   binding rather than deriving authority from the string.
3. **Given** a number is retired, **when** a new use case is created, **then**
   the retired number is not reused.

### User Story 2 - Share a Runtime with Authorized People (Priority: P1)

A use-case runtime can authorize more than one person without creating a
second agent or merging unrelated memory. This supports the planned Titus
collaboration between Gary and Austin.

**Independent Test**: Two active members of one use case can resolve its
runtime, while a non-member and a member of another use case are denied.

**Acceptance Scenarios**:

1. **Given** Gary and Austin are active Titus members, **when** either enters
   an approved Titus surface, **then** both resolve the same runtime boundary.
2. **Given** a person is not a member, **when** they present a valid platform
   session, **then** access is denied before reaching the runtime.
3. **Given** a membership is suspended, **when** cached authorization expires
   or is invalidated, **then** the person can no longer access the use case.

### User Story 3 - Assign Multiple Personas without Splitting Memory (Priority: P2)

An operator can assign one or more personas or profiles to a runtime while the
runtime remains the primary-memory boundary.

**Independent Test**: Walter remains the default persona for the OvernightDesk
runtime while additional profiles resolve to that same runtime and volume.

**Acceptance Scenarios**:

1. **Given** a runtime has several personas, **when** a surface requests an
   allowed persona, **then** the assignment changes presentation or authority
   profile without changing the runtime identity.
2. **Given** two use cases require separate durable memory, **when** they use
   the same persona name, **then** they still resolve to separate runtimes.
3. **Given** a persona assignment is removed, **when** history is retained,
   **then** the runtime and its primary memory remain intact.

### User Story 4 - Migrate Additively (Priority: P1)

The operator can introduce the identity model without renaming or recreating
live containers, volumes, hostnames, Phase paths, OIDC clients, or database
records.

**Independent Test**: Backfill the Mitchel/Trevor vertical slice, run old and new
resolvers against the same live-compatible fixture, and roll back application
use of the new tables without deleting them or changing resources.

## Requirements

### Functional Requirements

- **FR-001**: Every use case MUST have an immutable canonical UUID used for
  authorization, relationships, and internal APIs.
- **FR-002**: Every use case MAY have one immutable, unique, centrally
  allocated non-negative number for human reference and optional routes. The
  allocation sequence is zero-based. Numbers MUST NOT be reused and MUST NOT
  be security credentials or primary keys.
- **FR-003**: The technical canonical term MUST be `use_case`; the UI MAY label
  its stable number as `Tenet N`. Existing `tenant` fields remain legacy
  compatibility selectors until migrated.
- **FR-004**: A runtime identity MUST belong to one use case and MUST represent
  a primary-memory boundary independently of persona count.
- **FR-005**: Persona assignments MUST be many-to-one with a runtime and MUST
  identify a single default persona when the runtime requires one.
- **FR-006**: Membership MUST be modeled independently from runtime ownership
  and MUST support multiple authorized people with explicit roles and states.
- **FR-007**: Containers, volumes, hostnames, subdomains, Phase paths, OIDC
  clients, intake routes, and external registry IDs MUST be resource bindings,
  not canonical identities.
- **FR-008**: Resource bindings MUST record type, value, lifecycle state, and
  the canonical entity they belong to. Active values MUST be unique within
  their resource type and provider scope.
- **FR-009**: Phase App boundaries MUST remain secret blast-radius boundaries
  and MUST NOT be treated as equivalent to a use case or runtime.
- **FR-010**: The migration MUST add tables and nullable references before any
  read-path cutover. It MUST NOT rename or delete live resources in the
  foundation slice.
- **FR-011**: The current platform `instance.id` UUID and orchestrator
  `tenant_id` UUID MUST remain valid. Their relationship MUST be explicit; no
  implementation may assume independently generated UUIDs are identical.
- **FR-012**: Authorization MUST ultimately resolve through active membership
  and a canonical runtime/use-case assignment rather than exact single-owner
  equality or a client-provided slug.
- **FR-013**: Compatibility adapters MUST preserve existing `tenantId`,
  `containerId`, hostname, Phase path, callback, and provisioning behavior
  until each consumer is separately migrated and verified.
- **FR-014**: Allocation, membership, alias changes, and authorization denials
  MUST produce metadata-only audit events without secrets or conversation data.
- **FR-015**: The Mitchel business use case MUST be the first vertical-slice
  backfill and resolver canary. Mitchel is the person/member, Trevor is the
  agent's default persona, and `hermes-mitchel` is the current runtime resource
  alias. The owner-approved initial allocations are `Tenet 0` for
  OvernightDesk/Walter, `Tenet 1` for Mitchel/Trevor, and `Tenet 2` for
  TTS/Titus; each remains pending an audited canonical database allocation.
  Existing `tenant-0`, `tenet-0`, and `tenet0-postgres`
  names remain resource
  bindings; their use for Trevor data does not assign Mitchel to Tenet 0.
  Titus, Rex, and customer-wide backfills require separate reviewed tasks.
  Titus's current standalone runtime and Gary access, plus the planned
  canonical Gary membership, do not depend on the later Austin membership or
  Teams integration.
- **FR-016**: Feature 020 Open WebUI authentication research MAY proceed after
  this identity contract is accepted, but the Mitchel/Trevor canary MUST wait
  for the Mitchel use-case identity, Mitchel membership, Trevor persona, and
  runtime-resource mapping.

### Key Entities

- **Use Case**: Canonical operational purpose and trust context; UUID identity,
  optional stable number, mutable slug and display name.
- **Runtime Identity**: One agent process and primary-memory boundary assigned
  to one use case.
- **Persona Assignment**: A presentation/behavior/authority profile assigned
  to a runtime; many assignments may share one runtime.
- **Membership**: A person's role and lifecycle state within a use case or a
  more narrowly scoped runtime.
- **Resource Binding**: A versioned compatibility mapping from canonical
  identity to a container, volume, hostname, Phase path, OIDC client, route, or
  external registry identifier.
- **Secret Boundary**: A Phase App and environment access boundary that may
  contain secrets for several related resources without becoming their identity.

## Success Criteria

- **SC-001**: One resolver returns the same Mitchel use case and Trevor-assigned runtime from
  canonical UUID, stable number, legacy `tenantId`, container, and hostname
  fixture inputs.
- **SC-002**: Membership tests prove two authorized users can share one runtime
  and a valid non-member is denied.
- **SC-003**: A persona can be added or removed without changing runtime UUID,
  primary-memory binding, or membership records.
- **SC-004**: The additive migration can be deployed with existing readers
  unchanged and rolled back without dropping new tables or changing resources.
- **SC-005**: No deployed container, volume, hostname, Phase path, OIDC client,
  or intake route is renamed by the identity-foundation release.

## Non-Goals

- Renaming live infrastructure to include numeric identifiers.
- Replacing UUIDs with sequential integers.
- Assigning additional production Tenet numbers without an approved allocation.
- Merging separate runtime memories because people or personas overlap.
- Changing the two-app Phase boundary.
- Deploying Open WebUI, redesigning the Vercel frontend, or integrating Titus
  with Teams in this feature.
