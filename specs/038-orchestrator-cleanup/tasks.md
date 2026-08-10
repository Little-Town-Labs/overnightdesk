# Tasks: Retired Orchestrator Cleanup

**Input**: Design documents from
`/specs/038-orchestrator-cleanup/`

**Tests**: Secret-safe preflight, exact-target assertions, source qualification,
and post-cleanup health checks are required by the feature contract.

## Phase 1: Setup and design

- [x] T001 Create the dedicated cleanup worktrees for `overnightdesk` and
  `overnightdesk-platform-standard`.
- [x] T002 [P] Create and quality-check `spec.md`, `plan.md`, `research.md`,
  `data-model.md`, `quickstart.md`, and `contracts/cleanup-contract.md`.
- [x] T003 Point `.specify/feature.json` at `specs/038-orchestrator-cleanup`.
- [ ] T004 Run cross-artifact analysis and resolve any scope or coverage issue
  before mutation.

## Phase 2: Preflight and durable closeout preparation

- [ ] T005 [P] Re-run the evidence checksum manifest and confirm the database
  dump is present on Aegis without exposing its contents.
- [ ] T006 [P] Capture exact container, volume, image, timer, scheduler, and
  runtime-path inventories and assert non-target active workload boundaries.
- [ ] T007 Add the cleanup completion ADR and update the platform-standard
  retirement runbook and service inventory with the approved cleanup scope.
- [ ] T008 Record the secret-free cleanup intent and final pre-cleanup hashes in
  the deployment ledger before deletion.

## Phase 3: User Story 1 - Remove retained control-plane state (P1)

- [ ] T009 [US1] Remove the exact stopped containers after final assertions.
- [ ] T010 [US1] Remove the two exact exclusive volumes after confirming no
  references remain.
- [ ] T011 [US1] Remove only unreferenced retired and retirement-only images;
  retain any shared image that fails the consumer assertion.
- [ ] T012 [US1] Remove stale runtime files that exclusively belong to the
  retired control plane while retaining the deny vhost.

## Phase 4: User Story 2 - Retire expired observation controls (P1)

- [ ] T013 [US2] Remove the fired reminder timer, oneshot service, and dedicated
  environment file with `daemon-reload` and no named-runtime restart.
- [ ] T014 [US2] Remove only the paused retired Walter heartbeat job and its
  retired-only script/credential reference after proving unrelated scheduler
  hashes are unchanged.

## Phase 5: User Story 3 - Preserve durable operational truth (P1)

- [ ] T015 [US3] Verify the retired hostname denial, static three-record catalog,
  active named workloads, and unrelated Walter schedules.
- [ ] T016 [US3] Remove the consumed protected evidence directories only after
  all cleanup verification passes.
- [ ] T017 [US3] Write the final platform-standard and deployment-ledger result,
  including exact deletion outcomes and preserved boundaries.

## Phase 6: Quality gate

- [ ] T018 Run source qualification, YAML/Markdown validation, and targeted
  cleanup-contract checks.
- [ ] T019 Run a bounded security review for secret exposure, wildcard deletion,
  active-boundary removal, and non-target runtime mutation.
- [ ] T020 Confirm the latest reviewed head, branch status, and separate
  publication/deployment authorization state; do not push or merge.

## Dependencies and execution order

- T004 blocks production work.
- T005–T008 must pass before T009–T014.
- T009–T014 are sequential within the bounded production mutation because
  later assertions depend on earlier exact deletions.
- T015 must pass before T016; T016 must pass before T017.
- T018–T020 are the final handoff gate.

## Scope guardrails

- Do not delete `infra/nginx/orchestrator-retired.conf` or the live deny vhost.
- Do not delete the incident catalog or unrelated engine source.
- Do not restart or mutate named workloads.
- Do not use broad Docker pruning, `compose down`, wildcard deletes, push,
  merge, or remote branch changes.
