# Feature Specification: OCI Control-Plane Operations

**Feature Branch**: `041-oci-control-plane-operations`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "Create a new project that allows us to use the OCI REST API with PEM authentication to inspect and safely update the Aegis host."

## Clarifications

### Session 2026-08-20

- Q: Where must the project execute? → A: On the approved local
  OvernightDesk/Aegis operations machine, as a host-local CLI or one-shot
  process; the initial read-only slice must not expose a network listener.
- Q: Which OCI REST API capabilities are first in scope? → A: The first
  implementation wave is the maintenance decision loop: approved-target
  inventory, boot-volume backup readiness, host-vulnerability evidence,
  deterministic maintenance grouping, preflight, and sanitized operational
  evidence. General OCI administration and unrelated resource CRUD are out of
  scope.
- Q: When may the tool perform maintenance writes? → A: Not in the current
  MVP. The approved-operation story remains a mock-only contract until a
  separate owner-approved plan covers identity, target allowlists, rollback,
  and post-update verification.

### Session 2026-08-21

- Q: Where should approved target values and sanitized run artifacts live? → A:
  The host-local runtime uses a root-owned non-secret JSON configuration file
  and immutable sanitized JSON evidence files. An application database is out
  of scope for the one-shot CLI.
- Q: How should live inventory be enabled? → A: Add an explicit opt-in live
  mode that remains fixture-default, runs manually through the approved Phase
  launcher, and reuses the existing inventory/evidence seam. No daemon,
  scheduler, listener, or mutation authority is added.

## MVP Boundary

The implementation MVP is User Story 1 plus User Story 2: a host-local,
fixture-tested, read-only evidence and maintenance-planning tool. User Story 3
defines future fail-closed approval and work-request behavior for tests only;
it does not authorize a live OCI write endpoint, package update, reboot,
restore, deletion, or scheduler.

The next post-MVP delivery slice enables live read-only inventory only. It does
not change the mutation boundary or make live qualification part of ordinary
CI; Aegis execution remains a separately approved production-read-only gate.

## Post-MVP Live Read-Only Slice

The live slice adds an explicit `--live` inventory mode. Fixture mode remains
the default, and `--live` and `--input` are mutually exclusive. Live execution
must be invoked through the Phase launcher with the approved read-only
identity, load the root-owned non-secret configuration from the host, and
write sanitized evidence under the approved host evidence directory.

The slice does not add a database. Target configuration remains a host-local
JSON file, and each run remains an immutable JSON evidence artifact. Grouping
continues to consume captured evidence as a separate command.

## User Scenarios & Testing

### User Story 1 - Authenticate and inventory OCI evidence (Priority: P1)

As an authorized platform operator, I need to use the OCI API with the
registered OCI key pair so that I can verify backups and retrieve complete host
vulnerability details without logging into the OCI Console.

**Why this priority**: Read-only evidence is required before any production
maintenance decision. It also provides immediate value for grouping the 193
critical findings.

**Independent Test**: With a valid OCI profile and read-only permissions, run an
inventory command against the approved compartment and confirm that it returns
paginated boot-volume backups and host vulnerabilities, including OCI request
identifiers and sanitized records.

**Acceptance Scenarios**:

1. **Given** a configured OCI profile whose public key is registered in OCI,
   **When** the operator runs the read-only inventory command, **Then** the tool
   signs requests with the matching private key and returns backup and host
   vulnerability evidence without exposing key material.
2. **Given** a missing, malformed, or mismatched key, **When** the operator runs
   an API command, **Then** the tool fails before making a mutating request and
   reports a remediation-focused error without printing the private key.
3. **Given** more than one page of OCI results, **When** inventory completes,
   **Then** all pages are retrieved with bounded retries and the output reports
   the source compartment, collection counts, and OCI request identifiers.

### User Story 2 - Group findings into an updateable maintenance plan (Priority: P1)

As an authorized platform operator, I need to group OCI host findings by CVE,
package, severity, and available remediation so that one patch backlog can be
reviewed instead of treating every finding as an independent issue.

**Why this priority**: The current P0 appears to be a broad host software
update backlog. Grouping is the decision-support step between OCI evidence and
any production mutation.

**Independent Test**: Feed a captured, sanitized OCI host-vulnerability export
to the grouping command and verify deterministic groups, unresolved records,
counts, and an export suitable for the deployment ledger.

**Acceptance Scenarios**:

1. **Given** host findings containing CVE, package, severity, and remediation
   fields, **When** the operator creates a plan, **Then** findings with the same
   update identity are grouped and the plan preserves source IDs and counts.
2. **Given** findings with incomplete package or remediation metadata, **When**
   the operator creates a plan, **Then** they remain visible in an unresolved
   group and are never silently discarded.
3. **Given** the same input and tool version, **When** the operator repeats the
   grouping, **Then** it produces the same stable group identifiers and totals.

### User Story 3 - Execute an explicitly approved maintenance operation (Priority: P2)

As the accountable platform operator, I need a bounded API-assisted update path
so that approved package changes can be executed only after backup and target
preflight evidence is present.

**Why this priority**: Production mutation is valuable, but it must follow
read-only discovery and a reviewed maintenance plan.

**Independent Test**: In a non-production or mocked OCI environment, attempt an
update without the required approval, backup evidence, or exact target
allowlist, and verify that it is rejected; then run a fully approved fixture
and verify the operation record and rollback metadata.

**Acceptance Scenarios**:

1. **Given** no explicit maintenance approval, **When** an operator requests a
   write operation, **Then** the tool refuses before invoking a mutating OCI
   endpoint.
2. **Given** approval but no current `AVAILABLE` boot-volume backup or no exact
   target identity, **When** an operator requests a write operation, **Then** the
   tool refuses and identifies the missing precondition.
3. **Given** an approved target, current backup evidence, a reviewed plan, and
   the required IAM permission, **When** the operator executes the operation,
   **Then** the tool records the operation ID, target, request IDs, result,
   rollback reference, and post-operation verification requirements.
4. **Given** an OCI timeout or ambiguous work-request result, **When** execution
   ends, **Then** the tool reports the operation as unknown and does not retry a
   potentially duplicating mutation automatically.

## Edge Cases

- OCI returns an expired, disabled, or malformed profile or cannot load the
  private key; fail closed before mutation.
- The public key registered in OCI does not match the private key used locally;
  report authentication failure without revealing key contents.
- OCI throttles requests or returns a transient 5xx; use bounded, observable
  retries for read-only requests and require explicit handling for writes.
- OCI returns malformed or unexpected response fields; reject the record rather
  than using unvalidated third-party data for a patch decision.
- A finding has no package, fixed version, or remediation metadata; preserve it
  as unresolved and exclude it from automatic update selection.
- A backup exists but is not for the selected boot volume, is not `AVAILABLE`,
  or is outside the approved recency window; reject the maintenance operation.
- A supplied target does not exactly match the approved compartment, instance,
  and boot-volume identity; reject it.
- The operator interrupts a long paginated read; the tool must not claim a
  complete inventory or persist partial evidence as complete.
- OCI returns an accepted work request with a later failure; preserve both the
  accepted request and terminal result in the operation record.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST authenticate OCI API requests using the OCI API
  key-pair model, where the public key is registered with OCI and the matching
  private key is supplied only through an approved local secret boundary.
- **FR-002**: The system MUST default to read-only behavior and MUST NOT invoke
  a mutating OCI operation unless the operator supplies explicit approval and
  all configured preconditions pass.
- **FR-003**: The system MUST support inventory of approved OCI boot-volume
  backups and host-vulnerability records, including pagination, source OCIDs,
  lifecycle state, severity, CVE references, remediation metadata, and OCI
  request identifiers.
- **FR-004**: The system MUST validate OCI response shapes and reject malformed
  or incomplete records before using them in grouping or update decisions.
- **FR-005**: The system MUST group host findings deterministically by available
  remediation identity and preserve unresolved findings with an explicit reason.
- **FR-006**: The system MUST export sanitized inventory, grouping, and
  operation records in machine-readable form suitable for the deployment ledger
  and linked GitHub issue evidence.
- **FR-007**: The system MUST enforce exact allowlists for the approved OCI
  tenancy/compartment, compute instance, boot volume, and supported operation
  types before any write.
- **FR-008**: The system MUST verify a recent `AVAILABLE` boot-volume backup for
  the exact target before permitting a production update.
- **FR-009**: The system MUST use bounded timeouts, bounded retries, and clear
  terminal states for OCI calls; ambiguous write results MUST be reported as
  unknown rather than retried automatically.
- **FR-010**: The system MUST emit structured, correlation-ready operational
  events for authentication, inventory completion, grouping completion, denied
  mutations, accepted work requests, terminal work-request results, and
  verification failures.
- **FR-011**: The system MUST NOT log, export, persist, or commit private keys,
  API secrets, authorization headers, signed request material, or full
  configuration contents.
- **FR-012**: The system MUST provide a dry-run or preflight mode that shows the
  selected target, required permissions, backup evidence, planned operation,
  and verification steps without performing a mutation.
- **FR-013**: The system MUST keep the OCI integration bounded to approved
  operations for Aegis vulnerability remediation and MUST NOT provide general
  tenancy administration, resource deletion, unrestricted reboot, or automatic
  patch scheduling.
- **FR-014**: The system MUST require an explicit live-inventory opt-in, keep
  fixture inventory as the default, and reject simultaneous live and fixture
  inputs.
- **FR-015**: The live inventory path MUST use the existing Phase-backed secret
  boundary and OCI adapter, write only sanitized JSON evidence to an approved
  host-local path, and MUST NOT introduce an application database, listener,
  daemon, or scheduler.

### Key Entities

- **OCI Profile**: Approved tenancy, user, fingerprint, region, key reference,
  and compartment scope; never contains the private key value in durable
  output.
- **OCI Evidence Record**: A sanitized backup or host-vulnerability record
  with source OCID, observed state, timestamps, request identifier, and source
  endpoint.
- **Finding Group**: A deterministic grouping of host findings by available
  update identity, with source IDs, counts, metadata completeness, and an
  unresolved reason when applicable.
- **Maintenance Plan**: The reviewed target identity, selected finding groups,
  backup evidence, requested operation, approval reference, and verification
  steps.
- **Operation Record**: The immutable execution summary containing operation
  ID, target, request IDs, terminal state, timestamps, rollback reference, and
  follow-up verification status.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An authorized operator can retrieve the complete approved host
  vulnerability inventory and boot-volume backup evidence without using the OCI
  Console, with zero private-key disclosure in logs or exported artifacts.
- **SC-002**: For a fixed sanitized input, grouping produces identical group
  identifiers and totals across repeated runs, with 100% of input findings
  represented in either a resolved or unresolved group.
- **SC-003**: Every attempted write is either rejected before mutation with a
  named failed precondition or produces an operation record containing target,
  approval, backup, request, terminal-state, and rollback evidence.
- **SC-004**: The tool never performs a write, delete, or reboot outside the
  exact configured target and supported operation allowlists in automated
  negative tests.
- **SC-005**: A fresh run can produce sanitized evidence sufficient to update
  Issue #239 and the deployment ledger with source key, run ID, counts,
  persistence/verification status, and remaining unresolved findings.
- **SC-006**: A live inventory run on the approved host can produce the same
  sanitized evidence contract as fixture inventory, with no credential values
  in configuration output, evidence, or logs, and with no OCI mutation.

## Assumptions

- The OCI public key has already been uploaded to the intended OCI user and the
  operator can obtain the matching private key through an approved secret
  boundary. The project will not generate, escrow, or distribute private keys.
- The operator will supply exact tenancy, user, fingerprint, region,
  compartment, instance, and boot-volume identifiers through protected local
  configuration or environment; they are not inferred from untrusted input.
- OCI IAM policies and, if selected for execution, OS Management Hub managed
  instance registration are provisioned separately and reviewed before any
  write phase.
- The first implementation targets Aegis host vulnerability evidence and its
  approved maintenance workflow. Other OCI services and generic resource
  management are out of scope.
- The first implementation runs as a host-local Go CLI or one-shot process on
  the approved OvernightDesk/Aegis operations machine. It does not expose a
  public or internal HTTP listener and does not require Docker-socket access.
- Production mutation remains subject to explicit owner approval, a current
  backup, maintenance-window coordination, post-update host verification, and
  a fresh OCI scan.
