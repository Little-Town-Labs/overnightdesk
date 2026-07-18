# Feature Specification: Consolidate Phase Apps by Use Case

**Feature Branch**: `018-phase-app-consolidation`

**Created**: 2026-07-18

**Status**: Complete — active with rollback sources under observation

**Input**: Consolidate the historical `Infrastructure` Phase app into
`overnightdesk`, rename `azure-ops` to `timeless-tech-solutions`, and route
each Aegis consumer to the Phase app matching its use case and shared-memory
boundary.

## User Scenarios & Testing

### User Story 1 - Consolidate OvernightDesk Infrastructure (Priority: P1)

As the platform owner, I want OvernightDesk infrastructure credentials grouped
with the OvernightDesk platform so the application boundary reflects one use
case instead of historical deployment placement.

**Why this priority**: `Infrastructure` consumes one of three available app
slots and is the only source for the live email-fetch job.

**Independent Test**: Copy the complete active source key set into the
OvernightDesk email-fetch path, switch the real job, and confirm one successful
run while the source remains available for rollback.

**Acceptance Scenarios**:

1. **Given** the source and destination key sets have been inventoried without
   revealing values, **when** the copy finishes, **then** destination key count
   and protected fingerprint match the source exactly.
2. **Given** the source app remains unchanged, **when** email-fetch runs from
   the OvernightDesk app and path, **then** it completes without a secret-load
   or application error.

---

### User Story 2 - Separate Intake Routes by Use Case (Priority: P2)

As the platform owner, I want Titus email intake to remain with Timeless Tech
Solutions while Agent and Mitchel intake move to OvernightDesk so each route
shares the same application boundary as its Hermes runtime.

**Why this priority**: The three routes currently share one historical app
selector even though they cross two use cases.

**Independent Test**: Resolve each route through its target app, confirm its
exact 14-key configuration, and verify all three real intake services remain
healthy.

**Acceptance Scenarios**:

1. **Given** the Agent and Mitchel destinations are empty, **when** their
   configurations are copied, **then** each destination matches its source
   count and protected fingerprint.
2. **Given** route-aware selection is active, **when** all intake services are
   restarted, **then** Titus loads from the TTS boundary and Agent and Mitchel
   load from the OvernightDesk boundary.

---

### User Story 3 - Complete a Reversible Cutover (Priority: P3)

As the platform owner, I want all application names, service-account access,
runtime selectors, and standards to agree so future restarts do not depend on
obsolete app names.

**Why this priority**: The app rename is safe only after every name-based
consumer and required access grant is ready.

**Independent Test**: Search active source and live runtime configuration for
obsolete selectors, restart every affected consumer, and run the production
health checks with rollback sources still retained.

**Acceptance Scenarios**:

1. **Given** consumer changes and access grants are ready, **when** `azure-ops`
   is renamed, **then** all TTS consumers load successfully from
   `timeless-tech-solutions`.
2. **Given** the cutover is healthy, **when** standards and deployment evidence
   are reviewed, **then** they show the two-app target and retain
   `Infrastructure` only as a rollback source.

### Edge Cases

- Destination paths already contain one or more keys before copy.
- Source and destination key names match while one or more values differ.
- A service account can read its old app but has not been granted its target
  app and Production environment.
- The app rename succeeds but a name-based consumer was missed.
- A route restart fails after another route has already cut over.
- A source app or path is accidentally selected for deletion during the
  initial cutover.

## Requirements

### Functional Requirements

- **FR-001**: The migration MUST preserve all source apps and source paths
  through cutover and observation.
- **FR-002**: The migration MUST copy all 55 active `Infrastructure` root
  entries into the OvernightDesk email-fetch path before changing the job.
- **FR-003**: The migration MUST copy the 14-entry Agent and Mitchel intake
  paths into OvernightDesk before changing those routes.
- **FR-004**: Every copied path MUST match its source key count and protected
  full-value fingerprint without printing values.
- **FR-005**: Titus runtime and Titus intake MUST use the Timeless Tech
  Solutions application boundary.
- **FR-006**: Agent and Mitchel intake plus email-fetch MUST use the
  OvernightDesk application boundary.
- **FR-007**: Each affected service account MUST have access to its target app
  and Production environment before its consumer is restarted.
- **FR-008**: The app formerly named `azure-ops` MUST retain its application
  identity when renamed `timeless-tech-solutions`.
- **FR-009**: The cutover MUST provide a documented selector rollback for each
  affected consumer.
- **FR-010**: Active source, live runtime configuration, standards, and deploy
  evidence MUST not describe `Infrastructure` or `azure-ops` as active consumer
  targets after verification.
- **FR-011**: Deleting `Infrastructure` MUST remain outside this feature and
  require separate explicit approval.
- **FR-012**: Secret values MUST NOT appear in commits, terminal output,
  deployment logs, or documentation.
- **FR-013**: Active consumers MUST use exactly two Phase service-account
  identities: the TTS identity for Titus and the AgentZero identity for
  OvernightDesk consumers. The legacy `platform-cli-cloud` identity MUST NOT
  remain in active use after cutover.

### Key Entities

- **Phase App**: The use-case and blast-radius boundary identified by a stable
  application ID and a mutable display name.
- **Secret Path**: An organizational location within one app and environment,
  described by its key set and protected value fingerprint.
- **Consumer**: A job or service that selects one app, environment, and path at
  secret-load time.
- **Access Grant**: The app and environment access assigned to a consumer's
  service account.
- **Cutover Evidence**: Key counts, fingerprints, service health, source
  preservation, source-control state, and deployment log records.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Three copied destinations match their sources exactly: 55 of 55
  email-fetch entries and 14 of 14 entries for each moved intake route.
- **SC-002**: All five affected consumers complete a real secret load and report
  healthy after cutover: email-fetch, Hermes Titus, and three intake routes.
- **SC-003**: Zero active consumer selectors use `Infrastructure` or
  `azure-ops` after the coordinated cutover.
- **SC-004**: Both source apps and all copied source paths remain available
  throughout initial verification and observation.
- **SC-005**: The production deployment record and platform standard agree on
  the two active use-case boundaries in the same work session.
- **SC-006**: Runtime verification identifies exactly two active Phase
  service-account identities across the affected consumers.

## Assumptions

- Phase App names are case-sensitive; the current source name is
  `Infrastructure`.
- Both source and destination apps use the Production environment.
- Paths organize secret loading but do not replace app-level authorization.
- Existing TTS and AgentZero service tokens remain valid and can be installed
  in separate consumer-owned token files without creating another identity.
- The accepted platform-standard ADR is the authority for target boundaries,
  migration ordering, and deletion safeguards.
