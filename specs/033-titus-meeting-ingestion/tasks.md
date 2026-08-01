# Tasks: Titus Meeting Artifact Discovery

**Input**: Design documents from `/specs/033-titus-meeting-ingestion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/runtime-and-handoff.md, quickstart.md

**Tests**: Behavioral work follows strict RED-GREEN-REFACTOR. Each test task
must fail for the intended missing behavior before its implementation task
begins.

**Organization**: Tasks are grouped by user story so metadata discovery,
operability/recovery, and the metadata-only security boundary remain separately
verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Dependency-ready and path-disjoint from other tasks in the same wave
- **[Story]**: User story mapping from spec.md
- Production credentials, Phase values, Aegis mutation, canonical task status,
  commits, pushes, and scope changes remain Sol/lead-owned

## Phase 1: Setup

**Purpose**: Establish the isolated Go module and deterministic source layout.

- [X] T001 Create the Go 1.24 module and package directories in `tenants/hermes-titus/meeting-processor/go.mod`, `tenants/hermes-titus/meeting-processor/cmd/titus-meeting-processor/`, and `tenants/hermes-titus/meeting-processor/internal/`
- [X] T002 [P] Add the multi-stage ARM64-compatible image skeleton with a non-root runtime in `tenants/hermes-titus/meeting-processor/Dockerfile`
- [X] T003 [P] Add package-level test fixtures for safe Graph responses and sanitized error cases in `tenants/hermes-titus/meeting-processor/internal/testfixture/graph.go`

**Checkpoint**: `go test ./...` discovers the module and packages without implementation behavior.

---

## Phase 2: Foundational Contracts

**Purpose**: Implement the trusted local boundaries required by every user story.

**⚠️ CRITICAL**: No provider workflow starts until config, URL, state, and safe-output boundaries pass.

- [X] T004 [P] Write failing exact-key, UUID, two-organizer, bound, trailing-JSON, and secret-safety tests in `tenants/hermes-titus/meeting-processor/internal/config/config_test.go`
- [X] T005 Implement strict runtime configuration loading and organizer slot assignment in `tenants/hermes-titus/meeting-processor/internal/config/config.go`
- [X] T006 [P] Write failing initial/delta URL construction, host/path/query allowlist, cross-organizer, cross-type, redirect, and response-cap tests in `tenants/hermes-titus/meeting-processor/internal/graph/url_test.go`
- [X] T007 Implement Graph initial URL construction and continuation URL validation in `tenants/hermes-titus/meeting-processor/internal/graph/url.go`
- [X] T008 [P] Write failing version, file-mode, lock, malformed-state, atomic-commit, and prior-state-preservation tests in `tenants/hermes-titus/meeting-processor/internal/state/store_test.go`
- [X] T009 Implement the versioned process-locked atomic JSON store in `tenants/hermes-titus/meeting-processor/internal/state/store.go`
- [X] T010 [P] Write failing structured-event and health redaction/freshness tests in `tenants/hermes-titus/meeting-processor/internal/worker/health_test.go`
- [X] T011 Implement allowlisted structured events and atomic safe health output in `tenants/hermes-titus/meeting-processor/internal/worker/health.go`

**Checkpoint**: All foundational tests pass; malformed external/runtime/state input fails before network I/O.

---

## Phase 3: User Story 1 - Discover Approved Meeting Artifacts (Priority: P1) 🎯 MVP

**Goal**: Complete all four organizer/type delta streams and record unique metadata references without content requests.

**Independent Test**: A fake provider returns paginated Gary transcript/recording artifacts and empty Austin streams; one cycle yields exactly one safe transcript and one safe recording, four final cursors, and no content call.

### Tests for User Story 1

- [X] T012 [P] [US1] Write failing client-credentials caching, expiry-margin, 401-refresh, response-bound, and redaction tests in `tenants/hermes-titus/meeting-processor/internal/graph/token_test.go`
- [X] T013 [P] [US1] Write failing transcript/recording page decode, pagination, delta completion, missing-link, page-limit, and content-field omission tests in `tenants/hermes-titus/meeting-processor/internal/graph/client_test.go`
- [X] T014 [P] [US1] Write failing four-stream, empty-organizer, replayed-artifact, complete-round commit, and partial-round rollback tests in `tenants/hermes-titus/meeting-processor/internal/worker/worker_test.go`

### Implementation for User Story 1

- [X] T015 [US1] Implement bounded client-credentials acquisition and safe token refresh in `tenants/hermes-titus/meeting-processor/internal/graph/token.go`
- [X] T016 [US1] Implement the metadata-only Graph delta client and narrow response models in `tenants/hermes-titus/meeting-processor/internal/graph/client.go`
- [X] T017 [US1] Extend protected stream and artifact persistence with deterministic internal references in `tenants/hermes-titus/meeting-processor/internal/state/model.go` and `tenants/hermes-titus/meeting-processor/internal/state/store.go`
- [X] T018 [US1] Implement four-stream cycle orchestration, staged page completion, deduplication, and atomic cursor advancement in `tenants/hermes-titus/meeting-processor/internal/worker/worker.go`
- [X] T019 [US1] Implement atomic metadata-only handoff generation without provider IDs or URLs in `tenants/hermes-titus/meeting-processor/internal/worker/handoff.go`
- [X] T020 [US1] Add the `run-once` CLI path and safe result shape in `tenants/hermes-titus/meeting-processor/cmd/titus-meeting-processor/main.go`

**Checkpoint**: User Story 1 passes independently with four cursor completions, exact deduplication, safe handoff records, and zero content requests.

---

## Phase 4: User Story 2 - Operate and Recover the Worker Safely (Priority: P2)

**Goal**: Run continuously with bounded retries, diagnosable safe health, restart-safe state, and independent lifecycle controls.

**Independent Test**: A completed cycle survives restart, provider replay creates no duplicate, 429/5xx/network failures retry within bounds, and disabling the unit preserves state without affecting Titus.

### Tests for User Story 2

- [X] T021 [P] [US2] Write failing `Retry-After`, exponential-backoff, retry-exhaustion, 402/403/429/5xx, and safe-error mapping tests in `tenants/hermes-titus/meeting-processor/internal/graph/retry_test.go`
- [X] T022 [P] [US2] Write failing continuous-loop cancellation, immediate-first-cycle, no-overlap, degraded-health, and restart-idempotency tests in `tenants/hermes-titus/meeting-processor/internal/worker/loop_test.go`
- [X] T023 [P] [US2] Write failing CLI command, unknown-argument, health freshness, and volume initialization tests in `tenants/hermes-titus/meeting-processor/cmd/titus-meeting-processor/main_test.go`

### Implementation for User Story 2

- [X] T024 [US2] Implement bounded retry and sanitized provider error classification in `tenants/hermes-titus/meeting-processor/internal/graph/retry.go`
- [X] T025 [US2] Implement the sequential polling loop, signal cancellation, and degraded cycle behavior in `tenants/hermes-titus/meeting-processor/internal/worker/loop.go`
- [X] T026 [US2] Complete `run`, `health`, and `init-volume` commands in `tenants/hermes-titus/meeting-processor/cmd/titus-meeting-processor/main.go`
- [X] T027 [P] [US2] Add the root-owned volume preparation and container stop helpers in `tenants/hermes-titus/meeting-processor/runtime/prepare-volume.sh` and `tenants/hermes-titus/meeting-processor/runtime/stop-container.sh`
- [X] T028 [US2] Add the hardened no-port container launcher and systemd unit in `tenants/hermes-titus/meeting-processor/runtime/run-container.sh` and `tenants/hermes-titus/meeting-processor/runtime/titus-meeting-processor.service`
- [X] T029 [US2] Add disabled-install, initialize, enable, verify, restart-verify, status, disable, and rollback actions in `tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh`

**Checkpoint**: User Story 2 passes independently; restart produces zero duplicates, safe health explains failures, and rollback preserves the private volume.

---

## Phase 5: User Story 3 - Enforce the Metadata-Only Pilot Boundary (Priority: P3)

**Goal**: Prove that production configuration and every runtime/error path cannot download or disclose meeting content or mix Teams identities.

**Independent Test**: Qualification exercises normal, retry, malformed-link, restart, and disabled paths and finds no content request, public port, Docker secret, protected output, or `TEAMS_*`/`MSGRAPH_*` mixing.

### Tests for User Story 3

- [X] T030 [P] [US3] Write failing root-loader tests for exact Phase keys, webhook-disabled state, two UUIDs, narrow projection, modes/ownership, and omitted webhook/join values in `tenants/hermes-titus/meeting-processor/tests/test_runtime_projection.py`
- [X] T031 [P] [US3] Write failing source/runtime contract tests that prohibit content routes, webhook routes, subscriptions, public ports, secret environment variables, raw identifiers, and cross-identity keys in `tenants/hermes-titus/meeting-processor/tests/test_security_contract.py`

### Implementation for User Story 3

- [X] T032 [US3] Implement the strict root-only Phase export and narrow runtime projection in `tenants/hermes-titus/meeting-processor/runtime/load-phase-config.sh`
- [X] T033 [US3] Complete the minimal non-root multi-stage image and health command in `tenants/hermes-titus/meeting-processor/Dockerfile`
- [X] T034 [US3] Add Go, Python, shell, source-leak, binary, container, and metadata-only qualification gates in `tenants/hermes-titus/meeting-processor/scripts/qualify.sh`
- [X] T035 [US3] Add operator setup, safe canaries, failure response, state preservation, and rollback guidance in `tenants/hermes-titus/runbooks/meeting-artifact-discovery.md`
- [X] T036 [US3] Update the separate bot/meeting identity and metadata-only lifecycle guidance in `tenants/hermes-titus/README.md`

**Checkpoint**: All three user stories pass independently and the source contains no content-download authority.

---

## Phase 6: Cross-Cutting Verification and Durable Truth

**Purpose**: Synchronize feature evidence and run complete repository quality gates.

- [X] T037 [P] Update Feature 033 status, scope, evidence, and next gates in `.specify/roadmap.md` and `specs/033-titus-meeting-ingestion/quickstart.md`
- [X] T038 Validate shell syntax, Python tests, `go test ./...`, `go vet ./...`, ARM64 image build, image/container inspection, and `tenants/hermes-titus/meeting-processor/scripts/qualify.sh`
- [X] T039 Run `codebase-memory-mcp` change-impact detection and verify every graph conclusion with targeted `rg`/source reads for `tenants/hermes-titus/meeting-processor/` and shared Titus docs
- [X] T040 Run Spec Kit consistency analysis and resolve all Critical or High artifact contradictions in `specs/033-titus-meeting-ingestion/`
- [X] T041 Prepare the read-only production-sensitive Ringer delivery record and Sol review scope in `specs/033-titus-meeting-ingestion/delivery.md`
- [X] T042 Run the final multi-axis security, correctness, architecture, observability, and verification review over the complete diff and record remediation in `specs/033-titus-meeting-ingestion/tasks.md`
- [X] T043 Prepare the separate `overnightdesk-platform-standard` synchronization plan and exact affected contracts without mutating production in `specs/033-titus-meeting-ingestion/quickstart.md`
- [X] T044 Confirm `git diff --check`, task-scoped status, zero secret-like literals, and a clean reproducible handoff in `specs/033-titus-meeting-ingestion/tasks.md`
- [X] T045 Add a cycle-wide and retained-state memory envelope with multi-stream prior-state-preservation regressions in `tenants/hermes-titus/meeting-processor/internal/graph/url.go`, `tenants/hermes-titus/meeting-processor/internal/graph/client_test.go`, `tenants/hermes-titus/meeting-processor/internal/state/store.go`, and `tenants/hermes-titus/meeting-processor/internal/state/store_test.go`
- [X] T046 Make content-addressed releases root-owned and nonwritable, revalidate their content and filesystem invariants before every build/reuse, and add a deployment security regression in `tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh` and `tenants/hermes-titus/meeting-processor/tests/test_security_contract.py`
- [X] T047 Replace the static release-tree assertion with a behavioral temporary-tree harness covering valid promotion plus altered, writable, wrong-owner, and unsupported-entry rejection without changing source/previous handles, the named state sentinel, or a build marker in `tenants/hermes-titus/meeting-processor/scripts/release-tree.sh` and `tenants/hermes-titus/meeting-processor/tests/test_release_tree.py`

### Final review and handoff evidence

- The complete read-only Sol gate reviewed all 53 candidate files and reran the
  full non-container qualification. Its sole Required finding showed that the
  original unsupported-entry fixture could also fail through mode validation.
- Lead-owned correction replaced that fixture with an expected-owner,
  nonwritable FIFO and asserted the exact type/ownership/mode rejection. The
  corrected five-test release-tree suite passes against production code and
  fails only the unsupported-entry case when the type predicate is removed in
  a scratch mutant.
- The complete Go unit/race/vet/build, 12 Python contracts, shell/security
  qualification, ARM64 image inspection, diff hygiene, task-scoped status, and
  secret-like literal scans pass. No production or remote mutation occurred
  during the gate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on T001; blocks all stories.
- **US1 (Phase 3)**: Depends on T004-T011; delivers the metadata discovery MVP.
- **US2 (Phase 4)**: Depends on US1 state/client/worker contracts.
- **US3 (Phase 5)**: Runtime projection tests can start after config contract;
  final hardening depends on US1 and US2 commands.
- **Verification (Phase 6)**: Depends on all selected story tasks.

### User Story Dependencies

```text
Setup
  └── Foundational boundaries
        └── US1 metadata delta MVP
              ├── US2 continuous operation and recovery
              └── US3 metadata-only production boundary
                    └── Cross-cutting verification
```

### Parallel Opportunities

- T002 and T003 are path-disjoint after T001.
- T004, T006, T008, and T010 are separate RED test packages.
- T012, T013, and T014 are separate US1 RED test files after foundations.
- T021, T022, and T023 are separate US2 RED test files.
- T030 and T031 are separate Python contract-test files.
- T035, T036, and T037 are documentation-only and path-disjoint after behavior
  stabilizes.
- Production-sensitive source permits read-only Ringer analysis/review only;
  implementation remains lead-owned.

## Parallel Example: User Story 1

```text
T012: token caching and refresh RED tests in internal/graph/token_test.go
T013: delta page and pagination RED tests in internal/graph/client_test.go
T014: four-stream transaction RED tests in internal/worker/worker_test.go
```

These tests touch disjoint files, but T015-T020 remain sequential because the
token client, Graph client, state model, worker, handoff, and CLI form one
dependency chain.

## Implementation Strategy

### MVP first

1. Complete T001-T011.
2. Complete T012-T020 with a visible RED result before each implementation
   slice.
3. Stop and prove four final cursors, exact Gary discoveries, empty Austin
   success, deduplication, and zero content calls.

### Incremental delivery

1. Add continuous operation and lifecycle controls through T021-T029.
2. Add root projection and hardening through T030-T036.
3. Synchronize documentation and execute T037-T047.
4. Publication and production deployment remain later explicitly authorized
   actions; source readiness does not authorize either.

## Task Summary

- **Total tasks**: 47
- **Setup/foundational**: 11
- **US1**: 9
- **US2**: 9
- **US3**: 7
- **Cross-cutting**: 11
- **Suggested MVP**: T001-T020
- **Format validation**: Every task uses checkbox, sequential ID, optional `[P]`, required story label in story phases, and explicit file path.
