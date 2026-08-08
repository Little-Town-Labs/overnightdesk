# Tasks: Local-First Hermes Update Pipeline

**Input**: Design documents from `specs/038-hermes-local-update-pipeline/`

**Scope**: Local qualification only. Aegis deployment, live-volume copying,
production credentials, and production mutation remain out of scope.

## Phase 1: Setup

- [x] T001 Create the shared local harness layout under `infra/hermes-upgrade/`.
- [x] T002 Add the historical baseline manifests at `releases/hermes/0.19.0.yaml` and `releases/hermes/0.19.0-local-2026-08-07.yaml`, then record the accepted pinned `0.20.0` local candidate at `releases/hermes/0.20.0-local-2026-08-07.yaml` for current qualification.
- [x] T003 [P] Add Walter, Titus, and Mitchel qualification profile manifests.
- [x] T004 [P] Add the deterministic local stub catalog and boundary documentation.

## Phase 2: Foundational contracts

- [x] T005 [P] Add red tests for candidate identity and approval-policy validation in `infra/hermes-upgrade/tests/test_candidate.py`.
- [x] T006 [P] Add red tests for environment isolation and value-safe failures in `infra/hermes-upgrade/tests/test_isolation.py`.
- [x] T007 [P] Add red tests for profile coverage, path containment, and local-only stub endpoints in `infra/hermes-upgrade/tests/test_profiles.py`.
- [x] T008 [P] Add red tests for report identity, agent coverage, promotion blocking, and JSON serialization in `infra/hermes-upgrade/tests/test_reporting.py`.
- [x] T009 Implement candidate/profile/stub validation in `infra/hermes-upgrade/candidate.py`.
- [x] T010 Implement value-safe report construction and promotion decisions in `infra/hermes-upgrade/reporting.py`.
- [x] T011 Implement production-boundary detection and the portable runner in `infra/hermes-upgrade/local_qualify.py`.
- [x] T012 Add the documented shell entrypoint at `infra/hermes-upgrade/local-qualify.sh`.

## Phase 3: User Story 1 — Local candidate qualification (P1)

**Goal**: Qualify one candidate against all three canonical profiles without
reading production state or starting an agent process in source mode.

**Independent test**: Run the source command and verify three passing agent
results, safe JSON evidence, and blocked promotion.

- [x] T013 [US1] Add consistent per-agent wrapper commands at `tenants/hermes-walter/qualification/qualify.sh`, `tenants/hermes-titus/qualification/qualify.sh`, and `tenants/hermes-mitchel/qualification/qualify.sh`.
- [x] T014 [US1] Add runtime-mode behavior tests for missing Docker/image identity in `infra/hermes-upgrade/tests/test_runtime_mode.py`.
- [x] T015 [US1] Create unique synthetic state for each profile, execute the source-contract gate, and emit exactly one result per agent.
- [x] T016 [US1] Verify source and runtime command behavior, shell syntax, and JSON evidence using the quickstart command.

## Phase 4: User Story 2 — Uniform stubbed runtime qualification (P1)

**Goal**: Start each candidate runtime in a local-only harness, exercise its
allowed preflight/read paths and denied delivery/privilege paths, then clean up
only resources owned by that run.

**Independent test**: With Docker available, run the runtime command and
observe deterministic stub responses, denied delivery attempts, and cleanup.

- [x] T017 [US2] Add a local stub HTTP server and deterministic fixtures under `infra/hermes-upgrade/stubs/`.
- [x] T018 [US2] Add a Docker Compose runtime harness with an internal network, no default egress, synthetic per-agent volumes, and fail-closed environment defaults.
- [x] T019 [US2] Implement per-agent runtime probe execution and allowed/denied operation assertions in `infra/hermes-upgrade/local_qualify.py`.
- [x] T020 [US2] Add opt-in runtime integration tests covering Walter Guardian/GitHub, Titus channel/MCP/mail boundaries, and Mitchel Trevor/Agiled/browser boundaries.
- [x] T021 [US2] Add cleanup and resource-ownership assertions for interrupted and concurrent local runs.

## Phase 5: User Story 3 — Exact candidate handoff (P2)

**Goal**: Preserve one immutable candidate identity and evidence boundary for
the later Aegis process without authorizing Aegis mutation locally.

**Independent test**: A passing runtime report contains the candidate identity
and the handoff remains blocked until all required runtime gates pass.

- [x] T022 [US3] Carry upstream, derived image, architecture, and approval policy identity into every report.
- [x] T023 [US3] Block promotion on source-only results, missing runtime gates, failed agents, or unsafe isolation findings.
- [x] T024 [US3] Update the platform-standard Hermes runbook to insert local qualification before Aegis volume-copy staging and preserve human approval.
- [x] T025 [US3] Add measurable promotion thresholds, observation windows, evidence retention, and hold/rollback decisions to the handoff documentation.

## Phase 6: Polish and quality gates

- [x] T026 [P] Record the local-first architecture decision in `docs/decisions/005-hermes-local-first-qualification.md`.
- [x] T027 [P] Add the local operator quickstart and negative-check documentation.
- [x] T028 Run affected existing Hermes/Titus/Mitchel checks without changing production behavior.
- [x] T029 Run the full repository quality review, including `git diff --check`, report schema checks, and bounded security review.

## Dependencies and execution order

- Setup precedes foundational contracts.
- Foundational contracts precede all user stories.
- User Story 1 is the current MVP and is independently usable in source mode.
- User Story 2 is required before any local runtime report may authorize Aegis staging.
- User Story 3 documentation must land before the local stage is treated as part of the production update protocol.
- Polish follows the implementation and includes affected-suite verification.

## Current delivery boundary

Runtime mode now qualifies the exact candidate image through the isolated
Compose probe when Docker and the candidate image are available. Without those
local prerequisites it reports `not_run` and remains promotion-blocked.

## Review remediation — Walter intake candidate alignment

- [x] T030 Make `infra/hermes-coder/deploy-walter-intake.sh` consume the exact
  pinned `0.20.0-coder` artifact instead of rebuilding a shared Dockerfile
  under a stale `0.19.0` intake tag.
- [x] T031 Verify the candidate image ID and embedded Hermes version before
  any Walter stop, profile migration, or container replacement, with a source
  contract covering manifest/helper drift.
- [x] T032 Update the Walter image documentation to describe the local
  qualification and Aegis artifact-consumption boundary.
