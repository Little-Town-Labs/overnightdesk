# Tasks: OCI Control-Plane Operations

**Input**: Design documents from `specs/041-oci-control-plane-operations/`

**Execution boundary**: The companion source repository is
`/home/powerbox2/src/overnightdesk-maintenance/`. These tasks do not authorize
credential provisioning, live OCI calls, Aegis mutation, or deployment. Those
actions remain separately gated tasks below.

## Phase 1: Setup

**Goal**: Establish the version-controlled companion Go project and preserve a
safe, fixture-first development boundary.

- [x] T001 Create the separate Git repository at `overnightdesk-maintenance/`, preserve the existing Go scaffold, and document the repository boundary in `overnightdesk-maintenance/README.md` — FR-006, FR-011, SC-005
- [x] T002 [P] Add the companion repository ignore rules and a non-secret configuration example in `overnightdesk-maintenance/.gitignore` and `overnightdesk-maintenance/config.example.json` — FR-001, FR-011
- [x] T003 [P] Create the planned Go package and test directories in `overnightdesk-maintenance/internal/`, `overnightdesk-maintenance/fixtures/`, `overnightdesk-maintenance/tests/`, and `overnightdesk-maintenance/deploy/` — FR-002, FR-006
- [x] T004 [P] Add the fixture command and baseline verification commands to `overnightdesk-maintenance/Makefile` and `overnightdesk-maintenance/README.md` — FR-006, SC-002, SC-005

**Checkpoint**: The companion project is version-controlled, has no secret
files, and can run fixture-only commands without OCI or Phase access.

## Phase 2: Foundational Safety Boundaries

**Goal**: Create the boundaries every user story depends on before adding OCI
behavior.

- [x] T005 Write failing configuration and allowlist tests in `overnightdesk-maintenance/internal/config/config_test.go` covering required OCIDs, region, limits, exact target identity, unknown fields, and secret-reference omission — FR-007, FR-011, FR-013
- [x] T006 Implement validated non-secret configuration loading and bounded limits in `overnightdesk-maintenance/internal/config/config.go` — FR-007, FR-009, FR-011, FR-013
- [x] T007 Write failing secret-provider tests in `overnightdesk-maintenance/internal/secret/provider_test.go` proving missing, malformed, sentinel, and provider-failure cases never reach logs, output, or evidence — FR-001, FR-011
- [x] T008 [P] Define the Phase-backed secret-provider interface and safe error taxonomy in `overnightdesk-maintenance/internal/secret/provider.go` — FR-001, FR-011
- [x] T009 Write failing CLI safety tests in `overnightdesk-maintenance/internal/cli/cli_test.go` proving only `preflight`, `inventory`, and `group` are available, no listener starts, Docker-socket paths are rejected, and unsafe modes fail closed — FR-002, FR-013, SC-004
- [x] T010 Implement CLI parsing, safe exit codes, mode gates, and bounded context setup in `overnightdesk-maintenance/internal/cli/cli.go` and `overnightdesk-maintenance/cmd/overnightdesk-maintenance/main.go` — FR-002, FR-009, FR-012, FR-013
- [x] T011 [P] Define the fakeable OCI transport and request metadata interfaces in `overnightdesk-maintenance/internal/oci/client.go` — FR-003, FR-009, FR-010
- [x] T012 [P] Add sanitized event and correlation-ID contracts in `overnightdesk-maintenance/internal/observability/events.go` and `overnightdesk-maintenance/internal/observability/events_test.go` — FR-006, FR-010, FR-011
- [x] T013 Implement sanitized evidence envelope writing with complete/incomplete terminal states in `overnightdesk-maintenance/internal/evidence/envelope.go` and `overnightdesk-maintenance/internal/evidence/envelope_test.go` — FR-004, FR-006, FR-009, FR-011
- [x] T014 [P] Add a threat-model and secret-boundary checklist to `overnightdesk-maintenance/docs/security-boundary.md` — FR-001, FR-002, FR-011, SC-004

**Checkpoint**: Tests prove the project has no production authority, no public
listener, no Docker access, and no secret leakage path before OCI behavior is
implemented.

## Phase 3: User Story 1 — Authenticate and Inventory OCI Evidence (P1)

**Goal**: Produce complete, sanitized backup and host-vulnerability evidence
from fixture responses, with live read-only access designed but separately
qualified.

**Independent test**: Fixture inventory consumes multiple pages, follows every
host-vulnerability summary with a detail retrieval, preserves OCI request IDs,
rejects malformed records, and marks interruption or truncation incomplete.

### Tests for User Story 1

- [x] T015 [P] [US1] Add OCI signing and request-metadata contract fixtures in `overnightdesk-maintenance/internal/oci/signer_test.go` and `overnightdesk-maintenance/fixtures/signing/` covering runtime PEM parsing, SDK-owned canonical query ordering, request IDs, and clock-skew-safe failures — FR-001, FR-003, FR-009, FR-011
- [x] T016 [P] [US1] Add paginated backup and vulnerability summary/detail fixtures plus malformed-response cases in `overnightdesk-maintenance/fixtures/oci/` and `overnightdesk-maintenance/internal/oci/backups_test.go` and `overnightdesk-maintenance/internal/oci/vulnerabilities_test.go` — FR-003, FR-004, FR-009
- [x] T017 [P] [US1] Add read-only retry, throttle, timeout, empty-page, missing-next-page, and interrupted-run tests in `overnightdesk-maintenance/internal/oci/retry_test.go`, `overnightdesk-maintenance/internal/oci/sdk_client_test.go`, and `overnightdesk-maintenance/internal/evidence/completeness_test.go` — FR-003, FR-009, SC-001
- [x] T018 [US1] Add secret-leak sentinel tests for signed requests, OCI errors, request IDs, normalized records, and JSON output in `overnightdesk-maintenance/tests/security_inventory_test.go` and `overnightdesk-maintenance/internal/oci/sdk_client_test.go` — FR-001, FR-011, SC-001

### Implementation for User Story 1

- [x] T019 [US1] Raise the module baseline to Go 1.25, pin `github.com/oracle/oci-go-sdk/v65@v65.123.2`, and implement its signer/client adapter with region, tenancy, user, fingerprint, runtime PEM key, request ID capture, timeout, and read-only retry policy in `overnightdesk-maintenance/go.mod`, `overnightdesk-maintenance/go.sum`, `overnightdesk-maintenance/internal/oci/sdk_client.go`, and `overnightdesk-maintenance/internal/oci/signer.go` — FR-001, FR-003, FR-009, FR-010
- [x] T020 [US1] Implement bounded boot-volume backup pagination and normalization with exact compartment and boot-volume filtering in `overnightdesk-maintenance/internal/oci/backups.go` — FR-003, FR-004, FR-008
- [x] T021 [US1] Implement host-vulnerability summary pagination followed by bounded detail retrieval and request-ID association in `overnightdesk-maintenance/internal/oci/vulnerabilities.go` — FR-003, FR-004, FR-009, FR-010
- [x] T022 [US1] Implement normalized backup/vulnerability validation and explicit unresolved records in `overnightdesk-maintenance/internal/evidence/records.go` — FR-003, FR-004, FR-005
- [x] T023 [US1] Implement the fixture-backed `inventory` command and sanitized JSON export in `overnightdesk-maintenance/internal/cli/inventory.go` and `overnightdesk-maintenance/internal/evidence/writer.go` — FR-006, FR-009, FR-011, SC-001
- [x] T024 [US1] Add the host-local read-only preflight contract, configured permission summary, backup evidence projection, planned operation, and verification-step output plus disabled-first qualification steps to `overnightdesk-maintenance/deploy/preflight.sh` and `specs/041-oci-control-plane-operations/quickstart.md` — FR-001, FR-002, FR-008, FR-012, SC-005

**Checkpoint**: Fixture inventory is complete, deterministic at the record
level, secret-safe, and unable to perform a mutation. Live read-only
qualification remains separately approved.

## Phase 4: User Story 2 — Group Findings into a Maintenance Plan (P1)

**Goal**: Convert sanitized vulnerability records into stable, reviewable
groups without losing unresolved findings.

**Independent test**: Repeating grouping over the same sanitized input produces
identical group IDs and totals, and every input finding appears in exactly one
resolved or unresolved group.

- [x] T025 [P] [US2] Write deterministic grouping, canonicalization, duplicate, missing-metadata, and 100%-coverage tests in `overnightdesk-maintenance/internal/grouping/grouping_test.go` and `overnightdesk-maintenance/internal/grouping/identity_test.go` — FR-005, FR-006, SC-002
- [x] T026 [P] [US2] Add golden sanitized inventory and maintenance-plan fixtures in `overnightdesk-maintenance/fixtures/grouping/` — FR-005, FR-006, SC-002
- [x] T027 [US2] Implement versioned remediation identity canonicalization and stable group IDs in `overnightdesk-maintenance/internal/grouping/identity.go` — FR-005, SC-002
- [x] T028 [US2] Implement resolved/unresolved finding grouping with source-ID preservation and deterministic counts in `overnightdesk-maintenance/internal/grouping/grouping.go` — FR-005, FR-006, SC-002
- [x] T029 [US2] Implement the fixture-only `group` command and deployment-ledger-compatible sanitized plan export in `overnightdesk-maintenance/internal/cli/group.go` and `overnightdesk-maintenance/internal/evidence/plan.go` — FR-005, FR-006, FR-010, SC-005
- [x] T030 [US2] Document the Issue #239 evidence handoff, unresolved-group policy, and no-package/no-fixed-version handling in `overnightdesk-maintenance/docs/issue-239-evidence.md` — FR-005, FR-006, SC-002, SC-005

**Checkpoint**: The read-only MVP can produce a reviewable maintenance plan
from sanitized evidence without selecting unresolved findings for update.

## Phase 5: User Story 3 — Explicitly Approved Maintenance Operation (P2, Mock-Only Roadmap)

**Goal**: Define and test the future mutation boundary without enabling live
OCI writes or provisioning production credentials.

- [ ] T031 [P] [US3] Write failing negative mutation tests proving missing approval, stale/unavailable backup, target mismatch, unsupported operation, and missing IAM permission stop before an OCI write in `overnightdesk-maintenance/internal/mutation/gate_test.go` — FR-002, FR-007, FR-008, FR-012, SC-003, SC-004
- [ ] T032 [P] [US3] Define the immutable maintenance-plan and approval-reference types in `overnightdesk-maintenance/internal/mutation/plan.go` — FR-006, FR-007, FR-012
- [ ] T033 [US3] Implement mock-only exact target, backup recency, approval, and supported-operation gates in `overnightdesk-maintenance/internal/mutation/gate.go` — FR-002, FR-007, FR-008, FR-012, FR-013
- [ ] T034 [US3] Add accepted, terminal, timeout, and unknown work-request fixtures and tests in `overnightdesk-maintenance/internal/mutation/work_request_test.go` — FR-009, FR-010, SC-003
- [ ] T035 [US3] Implement mock-only immutable operation records and accepted/terminal/unknown work-request events in `overnightdesk-maintenance/internal/mutation/operation.go`, then document the required separate owner approval, read/write identity split, rollback reference, maintenance window, and post-update scan in `specs/041-oci-control-plane-operations/quickstart.md` and `overnightdesk-maintenance/docs/mutation-gate.md` — FR-002, FR-006, FR-007, FR-008, FR-009, FR-010, FR-012

**Checkpoint**: Mock mutation decisions are fail-closed and observable; no
live write endpoint is constructed by the MVP binary.

## Phase 6: Host Qualification and Durable Closeout

**Goal**: Make source, host installation, evidence, rollback, and operational
documentation agree before any live read-only qualification.

- [ ] T036 [P] Add root-owned install, disabled-first activation, status, and rollback scripts in `overnightdesk-maintenance/deploy/install.sh`, `overnightdesk-maintenance/deploy/status.sh`, and `overnightdesk-maintenance/deploy/rollback.sh` — FR-006, FR-011, SC-005
- [ ] T037 [P] Add the approved Phase app/environment/service-account reference, pinned Phase CLI version, named PEM secret, and non-secret host configuration checklist to `overnightdesk-maintenance/deploy/phase-boundary.md` — FR-001, FR-011, SC-005
- [ ] T038 [P] Add structured event and deployment-ledger field mapping to `overnightdesk-maintenance/docs/observability.md` — FR-006, FR-010, SC-005
- [ ] T039 [P] Reconcile the companion project's purpose, commands, security boundary, and no-listener runtime in `overnightdesk-maintenance/README.md` — FR-002, FR-006, FR-011, FR-013
- [ ] T040 Run the complete fixture qualification suite, race/vet/build checks, secret scans, and no-listener/no-Docker checks; record sanitized results in `specs/041-oci-control-plane-operations/quickstart.md` — FR-004, FR-009, FR-011, SC-001, SC-002, SC-004, SC-005
- [ ] T042 Keep live mutation disabled; if a future owner-approved mutation phase is authorized, create a new scoped implementation plan and re-run constitution, security, and code-quality gates before changing `overnightdesk-maintenance/internal/mutation/` or installing a write identity — FR-002, FR-007, FR-008, FR-009, FR-013, SC-003, SC-004

**Checkpoint**: The fixture-tested, read-only project is ready for a separately
approved host qualification. Mutation remains a future decision, not a result
of completing this roadmap.

## Phase 7: Post-MVP Live Read-Only Inventory

**Goal**: Enable one explicit, manual live inventory path while preserving the
fixture default, file-based evidence custody, and the no-mutation boundary.

- [x] T043 [P] Write failing CLI contract tests for `--live`, fixture/live exclusivity, default fixture behavior, and safe rejection of live mode without the required runtime boundary in `overnightdesk-maintenance/internal/cli/cli_test.go` and `overnightdesk-maintenance/internal/cli/inventory_test.go` — FR-014, FR-015, SC-006
- [x] T044 Implement the explicit live inventory option and dependency wiring in `overnightdesk-maintenance/internal/cli/cli.go`, `overnightdesk-maintenance/internal/cli/inventory.go`, and `overnightdesk-maintenance/internal/inventory/oci.go`, reusing the existing OCI adapter, target scope, normalization, and evidence seam — FR-003, FR-014, FR-015, SC-006
- [x] T045 [P] Add live-path secret-boundary, target-mismatch, incomplete-run, and no-credential-output tests using fake Phase and OCI providers in `overnightdesk-maintenance/internal/secret/`, `overnightdesk-maintenance/internal/oci/`, `overnightdesk-maintenance/internal/inventory/`, and `overnightdesk-maintenance/tests/` — FR-001, FR-004, FR-009, FR-011, FR-014, FR-015, SC-006
- [x] T046 Implement root-owned host installation/config/evidence path checks and manual runbook instructions for `/opt/overnightdesk-maintenance/bin`, `/etc/overnightdesk-maintenance/config.json`, and `/var/lib/overnightdesk-maintenance/evidence/` in `overnightdesk-maintenance/deploy/`, `overnightdesk-maintenance/README.md`, and `specs/041-oci-control-plane-operations/quickstart.md` — FR-006, FR-011, FR-015, SC-005, SC-006
- [x] T047 Run the complete local quality gate and record the live-path contract results without contacting OCI in `specs/041-oci-control-plane-operations/quickstart.md` — FR-009, FR-011, FR-014, FR-015, SC-001, SC-006
- [ ] T048 After T047 and explicit owner approval, perform one manual read-only Aegis qualification through the Phase launcher, verify target identity, evidence completeness, request-ID correlation, file permissions, and absence of credential material, then append metadata-only results to `/opt/overnightdesk/deploys.log` — FR-003, FR-006, FR-010, FR-011, FR-015, SC-001, SC-005, SC-006

**Checkpoint**: Live inventory is an explicit, manually invoked, read-only
path with the same sanitized evidence contract as fixtures. No database,
listener, scheduler, or mutation path is introduced.

## Dependencies and Execution Order

```text
Setup
  |
  v
Foundational safety boundaries
  |
  +--> US1 read-only inventory
  |       |
  |       +--> US2 deterministic grouping
  |
  +--> US3 mock-only mutation gates
          |
          v
Host qualification and closeout
```

- T001-T014 are foundational and must precede story implementation.
- T015-T024 are the MVP inventory slice; no live qualification task may run
  before T040 and explicit owner approval.
- T025-T030 may begin after the normalized evidence contract is stable and can
  run in parallel with late US1 fixture work when paths remain disjoint.
- T031-T035 are mock-only and do not authorize OCI writes.
- T036-T040 are required before any host installation or live qualification.
- T048 is the sole explicit production-read-only gate and is not an ordinary
  build or test task. T042 prevents the roadmap from silently expanding into
  mutation. T043-T047 must complete before T048.

## Parallel Execution Examples

After T004:

```text
T005 config tests  || T007 secret tests || T009 CLI safety tests
T008 secret interface || T011 OCI interface || T012 event contract
```

After T014:

```text
T015 signing fixtures || T016 pagination fixtures || T017 retry fixtures
T020 backup inventory || T021 vulnerability inventory
```

After US1 evidence contracts stabilize:

```text
T025 grouping tests || T026 golden fixtures || T030 Issue #239 handoff docs
T031 mutation denial tests || T034 work-request fixtures
```

## MVP and Non-Goals

The MVP is T001-T030 plus T036-T040: a version-controlled, fixture-tested,
host-local, maintenance-first read-only inventory and deterministic grouping tool with secure
operational documentation. T048 requires separate owner approval and is not
part of ordinary implementation. T043-T047 define the post-MVP live read-only
path. T031-T035 define mock-only future behavior.

The roadmap does not include automatic patch scheduling, general OCI tenancy
administration, deletion, unrestricted reboot, public API hosting, Docker
socket access, credential provisioning, or live package mutation.
