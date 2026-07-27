# Tasks: Internal Workspace and Orchestrator Retirement

**Input**: Design documents from
`/specs/028-orchestrator-retirement/`

**Tests**: Test-first qualification is required by the constitution and feature
specification.

## Phase 1: Setup

- [x] T001 Confirm dedicated worktrees and clean base branches for `overnightdesk`, `overnightdesk-ops`, `overnightdesk-platform-standard`, and `overnightdesk-operations-audit`
- [x] T002 [P] Complete feature design artifacts in `specs/028-orchestrator-retirement/`
- [x] T003 [P] Update the active feature pointer in `AGENTS.md` and `.specify/feature.json`

## Phase 2: Foundational Retirement Evidence

- [x] T004 Read live Aegis orchestrator row counts, callers, routes, recorder state, dependencies, and container authority without mutation
- [x] T005 Export the three approved incident records into `overnightdesk-platform-standard/WHAT/platform-incidents.yaml`
- [x] T006 Record the retirement decision and reversible runbook in `overnightdesk-platform-standard/docs/decisions/007-retire-platform-orchestrator.md` and `overnightdesk-platform-standard/docs/runbooks/orchestrator-retirement.md`
- [x] T007 Add a failing deterministic source qualification script at `scripts/qualify-orchestrator-retirement.sh`

## Phase 3: User Story 1 - Remove Dormant Hosting Authority (Priority: P1)

**Goal**: Remove active ingress, startup, and Docker authority for the unused
control plane without disrupting named workloads.

**Independent Test**: Source and live qualification prove the retired hostname
has no upstream, all three containers are stopped/restart-disabled, no running
container has Docker socket access, and named workloads remain healthy.

- [x] T008 [P] [US1] Add failing Ops tests proving no orchestrator DB pool or Flight Recorder tool remains in `overnightdesk-ops/src/mcp/`
- [x] T009 [P] [US1] Add failing audit tests proving the Docker socket has zero active exceptions and the retired upstream is absent in `overnightdesk-operations-audit/internal/`
- [x] T010 [US1] Remove orchestrator database and Flight Recorder registration from `overnightdesk-ops/src/mcp/server.ts` and retire `overnightdesk-ops/src/mcp/tools/flight-recorder.ts`
- [x] T011 [US1] Remove active orchestrator, database, proxy, dependencies, and volumes from `docker-compose.yml`
- [x] T012 [US1] Remove proxy exceptions, retired upstreams, and retired log collection from `overnightdesk-operations-audit/standards/`, `overnightdesk-operations-audit/internal/engines/compliance.go`, and `overnightdesk-operations-audit/deploy/collect.sh`
- [x] T013 [US1] Make `scripts/qualify-orchestrator-retirement.sh` pass against the candidate source
- [x] T014 [US1] Capture a protected live evidence bundle and checked database backup on Aegis following `overnightdesk-platform-standard/docs/runbooks/orchestrator-retirement.md`
- [x] T015 [US1] Deploy Ops and standard candidates, explicitly deny the retired Nginx hostname, disable restart, and stop the three retained containers without deletion
- [x] T016 [US1] Run post-activation negative reachability, socket-access, restart-policy, and named-workload health acceptance

## Phase 4: User Story 2 - Share Titus Without Sharing Identity (Priority: P1)

**Goal**: Establish the separate-identity and exact-membership contract for
Gary and Austin's shared Titus workspace.

**Independent Test**: Documentation and machine-readable identity policy require
separate accounts and memberships, fail closed for inactive/non-members, and do
not grant another workspace.

- [x] T017 [P] [US2] Update internal-workspace and Titus-sharing direction in `README.md`, `PRD.md`, and `.specify/memory/constitution.md`
- [x] T018 [P] [US2] Record separate Gary/Austin Titus membership policy in `overnightdesk-platform-standard/HOW/tenant-provisioning.md` and `overnightdesk-platform-standard/WHAT/tenant-provisioning.yaml`
- [x] T019 [US2] Record Austin live membership activation as a separate exact-identity operation in `overnightdesk-platform-standard/docs/runbooks/orchestrator-retirement.md`

## Phase 5: User Story 3 - Operate Named Workloads Deliberately (Priority: P2)

**Goal**: Replace active customer-hosting guidance with human-approved named
runtime operations.

**Independent Test**: Active PRD, architecture, deployment, upgrade, network,
service, secret, and provisioning documents contain no instruction to create a
runtime from signup/billing or redeploy the retired control plane.

- [x] T020 [P] [US3] Replace customer-hosting product direction in `README.md`, `PRD.md`, and `.specify/memory/constitution.md`
- [x] T021 [P] [US3] Replace active provisioning guidance in `overnightdesk-platform-standard/HOW/architecture.md`, `overnightdesk-platform-standard/HOW/deployment.md`, and `overnightdesk-platform-standard/HOW/tenant-provisioning.md`
- [x] T022 [US3] Reconcile active machine inventories in `overnightdesk-platform-standard/WHAT/services.yaml`, `WHAT/network.yaml`, `WHAT/databases.yaml`, `WHAT/secrets.yaml`, `WHAT/hermes.yaml`, and `WHAT/tenant-provisioning.yaml`
- [x] T023 [US3] Mark customer lifecycle provisioner endpoints denied/inert in `overnightdesk-platform-standard/WHAT/services.yaml` and enforce the Nginx denial during production activation

## Phase 6: User Story 4 - Retire Without Losing Recovery Evidence (Priority: P2)

**Goal**: Preserve incident knowledge and rollback state for the observation
window.

**Independent Test**: Static incident search returns all three records, the
database backup and configuration inventory pass checksums, and the runbook can
restore prior policies and startup order without deleting business data.

- [x] T024 [P] [US4] Add failing static incident-search tests in `overnightdesk-ops/src/mcp/tools/find-similar-incidents.test.ts`
- [x] T025 [US4] Replace database incident search with knowledge-backed search in `overnightdesk-ops/src/mcp/tools/find-similar-incidents.ts` and `overnightdesk-ops/src/mcp/server.ts`
- [x] T026 [US4] Add `platform-incidents` to the Ops resource contract in `overnightdesk-ops/src/mcp/server.ts`
- [x] T027 [US4] Verify incident count, checksums, retained volumes/configuration, rollback ordering, and 14-day no-cleanup boundary from the live evidence bundle

## Phase 7: Polish and Publication

- [x] T028 Run `npm test` and `npm run build` in `overnightdesk-ops`
- [x] T029 Run `go test ./...` in `overnightdesk-operations-audit`
- [x] T030 Run YAML, Markdown, Compose, shell, and feature qualification checks across all four worktrees
- [x] T031 Perform scoped code and security review of all candidate diffs
- [x] T032 Re-run Spec Kit cross-artifact analysis and mark completed tasks in `specs/028-orchestrator-retirement/tasks.md`
- [x] T033 Append the exact production result and rollback handles to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [x] T034 Commit and push each owning repository branch, open reviewed pull requests, merge approved changes, and synchronize exact merged revisions on Aegis
- [x] T035 Record the 14-day observation end date and leave destructive cleanup unapproved in `overnightdesk-platform-standard/docs/runbooks/orchestrator-retirement.md`

## Phase 8: Corrective Observation Reconciliation

**Goal**: Stop the retired Flight Recorder probe from producing false alerts
while preserving rollback evidence and supplying the missing restart-persistent
observation-end reminder through the communication module.

**Independent Test**: Walter job `eb193b734d68` is paused with every unrelated
job unchanged; the one-shot systemd timer is enabled for
`2026-08-09T01:33:03Z`, passes a non-sending readiness check against the
communication-module contract, and no named runtime restarts.

- [x] T036 [US1] Reproduce the stale heartbeat, verify the retired service state, and search Walter cron, task, and host schedules for the required observation reminder without reading secret values
- [x] T037 [US1] Add failing contract tests for the fixed communication-module payload, secret-safe failure behavior, exact one-shot schedule, and persistent timer in `scripts/test-walter-orchestrator-retirement-reminder.py`
- [x] T038 [US1] Implement the reminder client, hardened one-shot service, and persistent timer in `infra/orchestrator-retirement/`
- [x] T039 [P] [US1] Record the heartbeat correction, reminder control, rollback boundary, and post-observation cleanup gate in `overnightdesk-platform-standard/docs/runbooks/orchestrator-retirement.md` and `overnightdesk-platform-standard/WHAT/services.yaml`
- [x] T040 [US1] Run reminder tests, shell/static validation, YAML parsing, Spec Kit analysis, scoped secret review, and one bounded Luna implementation plus Sol quality gate
- [ ] T041 [US1] Back up Walter cron state, pause only job `eb193b734d68`, install and enable the reminder timer on Aegis, and avoid all service restarts
- [ ] T042 [US1] Verify the exact Walter cron delta, timer persistence and due time, non-sending communication readiness, named-runtime health, stopped orchestrator state, and zero early notification
- [ ] T043 [US1] Record the deployment, publish and merge both reviewed repository changes, synchronize exact merged revisions on Aegis, and mark the corrective tasks complete

## Dependencies

- Setup and foundational evidence block all implementation.
- US1 source dependency removal must pass before live activation.
- US2 and US3 documentation can proceed after the feature artifacts.
- US4 static incident search must deploy before the retired database stops.
- Publication follows all source tests, review, and production acceptance.
- T036 authorizes the corrective slice. T037 must fail before T038 begins.
  T038 and T039 may proceed in parallel; T040 gates T041. Live verification in
  T042 gates publication and task completion in T043.

## Implementation Strategy

The MVP is US1 plus US4: preserve evidence and eliminate dormant Docker
authority. US2 and US3 synchronize the business and operating contract in the
same reviewed retirement. No task authorizes deletion of retained state or a
placeholder Austin identity.
