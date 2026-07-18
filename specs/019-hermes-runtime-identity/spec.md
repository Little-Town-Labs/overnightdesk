# Feature Specification: Align Hermes Runtime Identity

**Feature Branch**: `019-hermes-runtime-identity`

**Created**: 2026-07-18

**Status**: Draft

**Input**: Model each Hermes runtime around one use case and its primary shared-memory boundary, allow multiple personas and authorized people to use one runtime, and rename the Aegis platform-operations runtime from `hermes-agent` to `hermes-walter` without changing the distinct Rex, Titus, or Mitchel use cases.

## User Scenarios & Testing

### User Story 1 - Understand Runtime, Persona, and Memory Boundaries (Priority: P1)

As the platform owner, I want each Hermes runtime documented by use case and
memory boundary so a persona name is not mistaken for a separate agent or a
separate store of knowledge.

**Why this priority**: A rename is unsafe until runtime identity, human access,
persona assignment, and memory ownership are distinct concepts with one shared
meaning across source, operations, and documentation.

**Independent Test**: Review the runtime inventory and determine, without
examining implementation details, which use case each runtime serves, which
personas and people may use it, which memory is private to it, and which
cross-runtime knowledge sources it may access.

**Acceptance Scenarios**:

1. **Given** one runtime has more than one persona, **when** either persona is
   used, **then** both operate within the same runtime, tools, and primary
   memory boundary unless an explicit narrower policy applies.
2. **Given** two activities require separate primary memory, **when** their
   runtime placement is reviewed, **then** they are assigned to separate Hermes
   runtimes rather than represented only as two personas in one runtime.
3. **Given** a runtime may serve more than one authorized person, **when** its
   identity is reviewed, **then** human access is represented separately from
   persona assignment and does not create duplicate runtimes by itself.
4. **Given** a runtime can read an explicitly shared knowledge service, **when**
   its memory boundary is reviewed, **then** that access is recorded separately
   from its runtime-local history and primary memory ownership.

---

### User Story 2 - Identify the Aegis Platform Runtime as Walter (Priority: P2)

As the platform owner, I want the Aegis runtime that operates and oversees the
OvernightDesk platform to be identified as Walter and named `hermes-walter` so
it is no longer confused with my separate personal Hermes runtime, Rex.

**Why this priority**: The current generic name `hermes-agent` and its
description as a personal assistant obscure the runtime's actual platform
operations use case.

**Independent Test**: Follow every active entry point for the Aegis platform
runtime and confirm it resolves to Walter while Rex remains a separate off-host
personal runtime and the public Aegis endpoint remains available.

**Acceptance Scenarios**:

1. **Given** the current Aegis platform runtime is healthy, **when** the identity
   migration completes, **then** its active runtime, operator surfaces, intake
   route, monitoring, and documentation consistently identify
   `hermes-walter`/Walter.
2. **Given** the runtime's existing data and knowledge are required after the
   rename, **when** Walter starts, **then** its conversations, configuration,
   credentials, skills, schedules, and memory access remain available without
   reset or cross-runtime reassignment.
3. **Given** Rex runs on the gaming desktop for personal use, **when** Aegis is
   migrated, **then** Rex is neither renamed nor moved onto Aegis and any
   deliberate access Rex has to Aegis knowledge remains explicit.

---

### User Story 3 - Preserve the Other Use-Case Runtimes (Priority: P3)

As the platform owner, I want Titus and Mitchel to remain independent runtimes
so the Walter migration cannot blend TTS collaboration, Mitchel's business
workflows, or their primary memory into OvernightDesk platform operations.

**Why this priority**: These runtimes have different users, secrets, tools,
channels, action boundaries, and data responsibilities even though they use the
same Hermes software.

**Independent Test**: Verify Titus and Mitchel before and after the Walter
cutover and confirm their runtime identities, authorized users, channels,
secrets, and memory remain unchanged.

**Acceptance Scenarios**:

1. **Given** Titus supports the TTS use case and may eventually serve both Gary
   and Austin, **when** Walter is migrated, **then** Titus remains
   `hermes-titus` with its existing TTS boundary and can add authorized people
   without becoming another runtime.
2. **Given** Mitchel's workflows use `hermes-mitchel`, **when** Walter is
   migrated, **then** Mitchel's tools, business data, channels, and runtime
   memory are not moved into Walter.
3. **Given** all three Aegis runtimes are healthy before cutover, **when** the
   migration is verified, **then** each remains independently addressable and
   no route or credential crosses its intended use-case boundary.

---

### User Story 4 - Roll Back Without Losing Runtime State (Priority: P4)

As the platform operator, I want the identity cutover to be reversible so an
unexpected routing, authentication, or startup failure can restore the prior
runtime without deleting or rewriting its data.

**Why this priority**: Runtime identity touches stateful storage and several
control surfaces; rollback must be possible without reconstructing memory or
credentials.

**Independent Test**: Exercise the documented rollback using preserved prior
identity artifacts and confirm the original runtime can be restored with the
same data and public endpoint.

**Acceptance Scenarios**:

1. **Given** Walter fails an activation gate, **when** rollback is invoked,
   **then** the previous `hermes-agent` runtime can resume from preserved state
   without a data restore from backup.
2. **Given** Walter passes all verification gates, **when** the initial cutover
   closes, **then** rollback artifacts remain retained for an observation
   period and are not deleted as part of this feature.

### Edge Cases

- An active selector or monitor still uses the generic `hermes-agent` identity
  after the main runtime has been renamed.
- The new identity starts with an empty or partially copied data store.
- The public route is healthy while email intake, dashboard authentication, or
  internal API routing still targets the old identity.
- A route label is changed but its durable polling or idempotency state is not
  carried forward, causing duplicate message handling.
- A persona name is mistakenly used as a human authorization identity or as a
  memory-isolation boundary.
- A shared knowledge service makes two runtimes appear to share all memory even
  though their local histories and primary stores remain separate.
- A rollback starts both old and new identities against the same writable state
  at once.
- Historical evidence and rollback references are incorrectly treated as
  active obsolete selectors.

## Requirements

### Functional Requirements

- **FR-001**: The platform MUST define a Hermes runtime as the execution,
  tool, channel, and primary shared-memory boundary for one use case.
- **FR-002**: A runtime MUST support zero or more named personas without
  requiring a separate runtime for each persona.
- **FR-003**: Persona assignment, authorized human access, runtime identity,
  and memory ownership MUST be represented as separate relationships.
- **FR-004**: Activities requiring separate primary memory MUST use separate
  Hermes runtimes.
- **FR-005**: Cross-runtime access to a shared knowledge service MUST be
  explicit and MUST NOT be described as ownership of another runtime's local
  history or primary memory.
- **FR-006**: The active Aegis platform-operations runtime MUST be identified as
  Walter with canonical runtime name `hermes-walter`.
- **FR-007**: Active runtime-related infrastructure that uses a mutable display
  or routing identity MUST use the Walter identity after cutover; stable
  platform record identifiers may remain unchanged when changing them would
  add risk without improving the use-case boundary.
- **FR-008**: The Walter migration MUST preserve the current runtime's durable
  data, configuration, credentials, skills, schedules, channel state, dashboard
  access, external knowledge access, and public endpoint behavior.
- **FR-009**: The migration MUST preserve route-level message idempotency and
  polling state so the rename neither drops nor duplicates accepted messages.
- **FR-010**: Rex MUST remain a separate off-host personal-use runtime and MUST
  NOT be provisioned, renamed, or assigned Aegis platform state by this
  feature.
- **FR-011**: Titus MUST remain the distinct TTS runtime `hermes-titus`; adding
  Gary, Austin, or another authorized collaborator MUST NOT by itself require a
  new runtime or persona-specific memory store.
- **FR-012**: Mitchel MUST remain the distinct business runtime
  `hermes-mitchel`, and its business tools and records MUST NOT be moved into
  Walter.
- **FR-013**: Walter, Titus, and Mitchel MUST retain their established Phase
  application trust boundaries from Feature 018.
- **FR-014**: Every active source, runtime selector, route, monitor, dashboard
  mapping, operator command, and platform-standard entry that targets the
  Aegis platform runtime MUST be inventoried before activation.
- **FR-015**: Activation MUST proceed one control surface at a time with a
  health gate after each state-changing step.
- **FR-016**: The prior runtime identity and its durable state MUST remain
  available for rollback throughout the initial observation period.
- **FR-017**: Old runtime artifacts MUST NOT be deleted by this feature, and
  any later cleanup MUST require separate explicit approval after dependency
  and retention review.
- **FR-018**: Secret values, private conversation content, and memory records
  MUST NOT appear in source control, terminal output, migration evidence, or
  deployment logs.
- **FR-019**: The platform standard and deployment evidence MUST record the
  active identity model, intentional shared-knowledge relationships, completed
  verification, and retained rollback artifacts in the same work session as
  production activation.

### Key Entities

- **Hermes Runtime**: One independently operated Hermes instance serving a
  defined use case, with its own execution state, tools, channels, and primary
  memory boundary.
- **Use Case**: The business or operational purpose that determines runtime,
  secret, tool, and primary-memory placement.
- **Persona**: A named role or behavioral profile assigned to a runtime. A
  persona does not independently own runtime state or memory.
- **Authorized Person**: A human principal permitted to use one or more
  runtime channels. Human access is independent of persona assignment.
- **Primary Memory**: Durable runtime context whose isolation determines when a
  separate Hermes runtime is required.
- **Shared Knowledge Source**: An explicitly granted cross-runtime reference
  service that does not merge runtime-local history or ownership.
- **Runtime Identity Mapping**: The relationship among stable records, mutable
  runtime names, routes, channels, monitors, storage, and operator labels.
- **Rollback Artifact**: Preserved prior identity, configuration, route, or
  storage state sufficient to restore service without losing data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A runtime inventory accounts for 100% of active Aegis Hermes
  instances and separately identifies use case, personas, authorized people,
  primary memory, and shared knowledge access for each.
- **SC-002**: After cutover, 100% of active platform-runtime selectors and
  operator surfaces resolve to `hermes-walter`, with zero generic
  `hermes-agent` targets outside documented historical or rollback evidence.
- **SC-003**: Walter retains all required pre-cutover runtime state and passes
  its public route, authenticated dashboard, internal API, memory, channel,
  intake, and monitoring checks.
- **SC-004**: Titus and Mitchel pass their existing health and boundary checks
  with zero intended identity, secret-app, channel, tool, or memory changes.
- **SC-005**: A failed activation step can restore the prior runtime identity
  within 15 minutes without deleting, restoring, or rewriting durable data.
- **SC-006**: Zero secret values, conversation bodies, or memory records appear
  in committed artifacts or deployment evidence.
- **SC-007**: Source, production runtime state, platform standard, and the
  deployment record agree on the Walter identity before the migration is
  declared complete.

## Assumptions

- Walter is the persona and canonical runtime name for the Aegis
  platform-operations use case.
- Runtime naming is use-case-driven; this feature does not introduce numeric
  Tenet identifiers or renumber existing stable platform records.
- A runtime can intentionally expose more than one persona and serve more than
  one authorized person when they should share the same primary memory.
- Separate Hermes runtimes isolate local execution/history and primary memory,
  while an explicitly shared knowledge service may still be available to more
  than one runtime.
- Rex remains on the gaming desktop for personal work and may retain deliberate
  read access to selected Aegis knowledge without becoming an Aegis runtime.
- The existing `timeless-tech-solutions` and `overnightdesk` Phase app and
  service-account boundaries remain unchanged.
- Stable record IDs and the existing public Aegis hostname are compatibility
  identities, not persona names, and need not change unless inventory proves
  they actively misroute the runtime.
- The existing AgentMail inbox address is a stable external channel handle; it
  may remain unchanged while its route and target runtime become Walter.
- Cleanup of the prior identity, storage, Phase paths, or rollback artifacts is
  outside this feature.
