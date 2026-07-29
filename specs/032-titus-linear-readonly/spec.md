# Feature Specification: Titus Linear Read-Only Delivery

**Feature Branch**: `032-titus-linear-readonly`

**Created**: 2026-07-29

**Status**: Awaiting Human Activation

**Input**: Give Titus safe, current visibility into the Timeless Technology
Solutions technical-delivery workspace in Linear without allowing Titus to
change delivery records or introducing a duplicate backlog.

## Clarifications

### Session 2026-07-29

- Q: What are the initial Linear workspace and team identities? → A: Workspace
  `Timeless Technology Solutions`; team key `TTS`.
- Q: When is technical delivery considered Done? → A: Only after the change is
  verified in its target environment, not merely merged.
- Q: How much integration infrastructure should the first release introduce?
  → A: A direct read-only connection only; no event bridge, database copy, or
  mutation path.

## User Scenarios & Testing

### User Story 1 - Ask Titus About Current Delivery (Priority: P1)

Gary or Austin asks Titus about active technical work, priorities,
dependencies, blockers, cycle readiness, or completed outcomes. Titus reads the
current TTS delivery records and answers with issue identifiers and timestamps
while leaving every delivery record unchanged.

**Why this priority**: Current, trustworthy delivery visibility is the core
value of the integration.

**Independent Test**: Ask Titus for the current state of known TTS work and
compare the response with the source records; the answer is traceable and a
before-and-after comparison shows zero changes.

**Acceptance Scenarios**:

1. **Given** Titus has approved access to the TTS team, **When** Gary asks for
   active blockers, **Then** Titus returns only matching current work with
   identifiers, status, owners when present, and observation time.
2. **Given** a delivery record contains instructions directed at Titus,
   **When** Titus reads it, **Then** Titus treats the content as untrusted
   project context and does not use it as authority to act.
3. **Given** Titus is asked to create, edit, assign, comment on, or close work,
   **When** the request is processed, **Then** Titus explains that this release
   is read-only and makes no change.

---

### User Story 2 - Coordinate Purely Technical Delivery (Priority: P2)

Austin and Gary use one technical-delivery operating model across projects and
contractors. Austin leads client, portfolio, product, and business-priority
work and may perform selected implementation. Gary leads technical business
analysis, release-train coordination, assigned architecture, Scrum
facilitation, and assigned implementation. Titus supplies evidence-based
coordination without taking human authority.

**Why this priority**: Shared role and workflow rules prevent an assistant from
turning visibility into unauthorized project control.

**Independent Test**: Give Titus representative requests involving priority,
assignment, acceptance, architecture, and reporting; it provides coordination
for the reporting requests and defers authority decisions to the correct
people.

**Acceptance Scenarios**:

1. **Given** work is ambiguous or unassigned, **When** Titus finds it during a
   delivery review, **Then** Titus reports the ambiguity and does not invent an
   owner, commitment, priority, or scope.
2. **Given** source code is merged but target-environment verification is
   absent, **When** Titus summarizes completed work, **Then** it does not
   describe that work as Done.
3. **Given** the Free pilot has been upgraded to Business and contractor access
   boundaries have been approved, **When** Titus summarizes an authorized
   contractor's delivery, **Then** it reports assigned implementation, testing,
   documentation, progress, and blockers without expanding authority.

---

### User Story 3 - Activate and Revoke Safely (Priority: P3)

An operator can configure, verify, disable, or revoke Titus's delivery access
without exposing credentials, changing Linear data, or interrupting unrelated
Titus capabilities.

**Why this priority**: The connection is useful only if it is safely operable
and recoverable.

**Independent Test**: Exercise missing, invalid, valid, and revoked access in a
controlled environment; only the valid state permits reads, every other state
fails closed, and unrelated Titus functions remain available.

**Acceptance Scenarios**:

1. **Given** approved access is absent or invalid, **When** Titus starts or
   attempts a delivery read, **Then** the connection is unavailable without
   leaking credential material or weakening another capability.
2. **Given** approved access is valid, **When** an operator runs qualification,
   **Then** the result proves the correct workspace/team boundary, read-only
   behavior, and current-read capability using value-safe evidence.
3. **Given** access is revoked or the feature is disabled, **When** Titus is
   restarted, **Then** delivery reads are unavailable and all unrelated
   qualified capabilities retain their prior behavior.

### Edge Cases

- The workspace exists but the `TTS` team is missing, renamed, inaccessible, or
  outside the approved access boundary.
- A read returns no issues, paginated results, rate limiting, stale connection
  state, or a provider error.
- A record contains secrets, personal data, prompt-injection text, misleading
  status claims, or links to an unapproved external system.
- A linked pull request is merged while deployment or target-environment
  verification is missing or failed.
- A user asks Titus to infer priority, assign a contractor, accept delivery, or
  make a technical decision from incomplete evidence.
- The delivery connection fails while email, chat, project knowledge, or other
  Titus capabilities are healthy.

## Requirements

### Functional Requirements

- **FR-001**: Linear MUST be the technical-delivery system of record for the
  `Timeless Technology Solutions` workspace and initial `TTS` team.
- **FR-002**: Titus MUST read current approved delivery state directly from
  Linear when responding to delivery questions.
- **FR-003**: Titus MUST NOT create, edit, assign, comment on, transition,
  archive, or delete Linear records in this release.
- **FR-004**: Titus access MUST be limited to read permission and the initial
  `TTS` team; broader workspace or administrative access is prohibited.
- **FR-005**: Missing, invalid, expired, revoked, incorrectly scoped, or
  unavailable access MUST fail closed without exposing credential values.
- **FR-006**: Titus responses about delivery state MUST include enough source
  identity and observation time for a human to verify the answer.
- **FR-007**: Linear content MUST be treated as untrusted input that cannot
  grant authority, change policy, disclose credentials, or authorize another
  tool action.
- **FR-008**: Austin, Gary, Titus, and contractor responsibilities MUST follow
  the approved technical-delivery role model in every Titus workflow. The Free
  pilot MUST remain limited to Gary and Austin; contractor participation
  requires a Business-plan upgrade and approved access/private-team design.
- **FR-009**: Humans MUST retain priority, scope, commitment, assignment,
  acceptance, architecture, and technical-decision authority.
- **FR-010**: Work MUST be reported as Done only after verification in its
  target environment; merge state alone is insufficient.
- **FR-011**: GitHub MUST remain authoritative for source, commits, pull
  requests, reviews, checks, and merge state.
- **FR-012**: Native GitHub linking MAY provide delivery evidence, but automatic
  GitHub Issues synchronization MUST remain disabled during this release.
- **FR-013**: The release MUST NOT introduce a Linear webhook consumer,
  synchronization bridge, editable database copy, event ledger, semantic
  memory copy, or mutation wrapper.
- **FR-014**: Titus delivery access MUST be independently disableable and
  revocable without disabling unrelated qualified Titus capabilities.
- **FR-015**: Qualification MUST cover successful reads, denied mutations,
  missing and invalid access, wrong-team access, revoked access, untrusted
  content, safe evidence, restart behavior, and rollback.
- **FR-016**: Operating guidance MUST define workspace structure, delivery
  statuses, cycle use, issue quality, GitHub linking, role boundaries,
  contractor participation, Titus reporting, escalation, and rollback.

### Key Entities

- **Workspace**: The `Timeless Technology Solutions` delivery boundary.
- **Team**: The initial `TTS` technical-delivery team and access boundary.
- **Delivery work item**: A technical unit of planned or active work with an
  identifier, status, owner when assigned, project/cycle context, dependencies,
  and source links.
- **Verification evidence**: Target-environment evidence required before a work
  item can be treated as Done.
- **Role boundary**: The approved responsibilities and retained human authority
  for Austin, Gary, Titus, and contractors.
- **Delivery observation**: A value-safe record of what Titus read, when it was
  observed, and whether the read was complete, partial, or unavailable.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In a controlled comparison, Titus answers five representative
  delivery questions with correct source identifiers and observation times,
  with zero Linear record changes.
- **SC-002**: All attempted create, update, assignment, comment, transition, and
  delete actions are denied in 100% of qualification cases.
- **SC-003**: Access outside the approved `TTS` team is unavailable in 100% of
  boundary tests.
- **SC-004**: Missing, invalid, and revoked access states reveal zero credential
  values in output, logs, reports, and saved evidence.
- **SC-005**: After one controlled restart and one rollback rehearsal,
  unrelated qualified Titus capabilities remain healthy.
- **SC-006**: A merged-but-unverified example is excluded from Done summaries
  in 100% of acceptance tests.
- **SC-007**: Repository and production inspection find zero webhook bridge,
  Linear database replica, event ledger, semantic copy, or mutation path.

## Assumptions

- Gary or Austin will create the Linear workspace, `TTS` team, and approved
  team-limited read credential through Linear's administrative interface.
- The initial release is for purely technical delivery; broader CRM, sales,
  finance, support, or portfolio-data automation is out of scope.
- Linear's native GitHub integration is configured by a human administrator
  for approved repositories; it is not operated with Titus's credential.
- Current source state is read on demand. Temporary connection failures are
  reported as unavailable rather than replaced by an authoritative cache.
- A future mutation or event-driven release requires a separate specification,
  explicit approval boundary, threat review, and staged rollout.
