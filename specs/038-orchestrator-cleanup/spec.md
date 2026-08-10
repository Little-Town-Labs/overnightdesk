# Feature Specification: Retired Orchestrator Cleanup

**Feature Branch**: `agent/codex/orchestrator-cleanup`

**Created**: 2026-08-09

**Status**: Owner-approved cleanup in progress

**Input**: Remove the retained platform-orchestrator cleanup artifacts after
the completed observation window, while preserving the fail-closed retired
hostname boundary, durable incident knowledge, and unrelated named workloads.

## User Scenarios & Testing

### User Story 1 - Remove Retained Control-Plane State (Priority: P1)

As the accountable owner, Gary can remove the stopped customer-hosting control
plane after its observation window without touching active business workloads.

**Why this priority**: The retained containers, database volume, socket proxy,
and images are dormant privileged state with no current business purpose.

**Independent Test**: A secret-safe preflight proves the evidence bundle and
database backup are valid, then post-cleanup inspection proves that the exact
retired containers, exclusive volumes, and unreferenced control-plane images
are absent while named runtimes remain healthy.

**Acceptance Scenarios**:

1. **Given** the 14-day observation window has ended and the protected evidence
   checksum manifest passes, **when** cleanup runs, **then** the three stopped
   control-plane containers and their two exclusive volumes are removed.
2. **Given** no active container consumes the retired images, **when** cleanup
   runs, **then** the control-plane and socket-proxy images plus retirement-only
   rollback image tags are removed without pruning unrelated Docker state.
3. **Given** Walter, Titus, Mitchel, communications, Nginx, Ops, databases,
   backups, SSH, and Tailscale are active, **when** cleanup runs, **then** no
   named workload is restarted or changed.

### User Story 2 - Retire Expired Observation Controls (Priority: P1)

As an operator, Gary can remove the one-shot observation reminder and stale
retired-service heartbeat controls after they have fired, including their
dedicated secret path, without changing unrelated Walter schedules.

**Why this priority**: Leaving expired control-plane probes and credentials in
place creates false alerts and unnecessary secret exposure.

**Independent Test**: Scheduler evidence identifies only the retired reminder
and paused heartbeat artifacts; post-cleanup checks show no active timer,
service, dedicated environment file, or retired heartbeat job.

**Acceptance Scenarios**:

1. **Given** the reminder timer has fired at the exact due time, **when** the
   cleanup runs, **then** its timer, oneshot service, and dedicated environment
   file are removed.
2. **Given** the retired heartbeat job is paused and unrelated Walter jobs are
   unchanged, **when** cleanup runs, **then** only that job and its retired
   script/credential reference are removed.

### User Story 3 - Preserve Durable Operational Truth (Priority: P1)

As an operator, Gary can explain what was removed and why after cleanup without
relying on the deleted database or rollback bundle.

**Why this priority**: Cleanup must not erase the incident catalog, security
boundary, or the record of the approved state transition.

**Independent Test**: The platform standard and deployment ledger contain a
secret-free cleanup record, the static incident catalog still has three rows,
and the retired hostname still uses its explicit denial behavior.

**Acceptance Scenarios**:

1. **Given** cleanup is approved and completed, **when** an operator reads the
   platform standard, **then** it records the exact cleanup result and the
   remaining non-negotiable deny boundary.
2. **Given** a request reaches the retired hostname after cleanup, **when** it
   is tested over HTTP and HTTPS, **then** it remains fail-closed and never
   falls through to another application.

## Edge Cases

- Cleanup must stop if the observation end time has not passed, evidence checks
  fail, a target container is running, a target volume is mounted elsewhere, or
  an image is consumed by an active unrelated container.
- The shared `postgres:16-alpine` tag must only be deleted after a live image
  consumer check proves it has no remaining consumers.
- The retired Nginx denial configuration and the platform incident catalog are
  not deletion targets, even though their names mention the retired service.
- A failed production cleanup must leave all targets intact and report the
  exact failed precondition without restarting or modifying named workloads.

## Requirements

### Functional Requirements

- **FR-001**: Cleanup MUST require an explicit owner approval and MUST verify
  that the observation end timestamp `2026-08-09T01:33:03Z` has passed.
- **FR-002**: Cleanup MUST verify the protected retirement evidence checksum
  manifest and the retained custom-format database backup before deletion.
- **FR-003**: Cleanup MUST remove only the exact stopped containers
  `overnightdesk-platform-orchestrator`,
  `overnightdesk-docker-socket-proxy`, and
  `overnightdesk-platform-orchestrator-db`.
- **FR-004**: Cleanup MUST remove only the exact exclusive volumes
  `overnightdesk_orchestrator-fr-snapshots` and
  `overnightdesk_platform-orchestrator-db-data` after confirming no other
  container references them.
- **FR-005**: Cleanup MUST remove the retired orchestrator and Docker
  socket-proxy images and retirement-only rollback image tags only when no
  active container consumes them; it MUST not run broad Docker pruning.
- **FR-006**: Cleanup MUST remove the expired reminder timer, oneshot service,
  and dedicated environment file after confirming the reminder fired at the
  due time.
- **FR-007**: Cleanup MUST remove only the retired Walter heartbeat job and its
  retired script/credential reference; every unrelated Walter job identity,
  schedule, enabled state, and runtime MUST remain unchanged.
- **FR-008**: Cleanup MUST remove stale runtime files that exclusively belong
  to the retired control plane, including its runtime directory, launcher,
  health record, log, and pre-retirement Compose copy.
- **FR-009**: Cleanup MUST retain the explicit retired-hostname denial vhost,
  its source template, the three-record incident catalog, and the durable
  cleanup record.
- **FR-010**: Cleanup MUST not restart, recreate, stop, or mutate any named
  business runtime or active ingress, database, communications, Ops, backup,
  SSH, or Tailscale service.
- **FR-011**: The cleanup result MUST be recorded without secret values in the
  platform standard and deployment ledger, including deleted target names,
  verification results, and the remaining fail-closed boundary.

### Key Entities

- **Cleanup manifest**: The secret-free list of approved deletion targets,
  preconditions, timestamps, and post-cleanup results.
- **Protected evidence bundle**: The pre-cleanup checksummed backup and
  rollback record used to prove that deletion is authorized and bounded.
- **Active boundary**: The retired-hostname deny vhost and static incident
  catalog that remain after cleanup as durable safety and knowledge surfaces.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Zero target control-plane containers and zero target exclusive
  volumes remain after cleanup.
- **SC-002**: Zero running containers mount or reach the Docker socket proxy,
  and zero active containers consume a removed retirement image.
- **SC-003**: 100% of unrelated Walter schedules and named runtime start times
  remain unchanged by cleanup.
- **SC-004**: The retired hostname returns the documented fail-closed behavior
  for 100% of tested HTTP, HTTPS, root, health, and representative API paths.
- **SC-005**: The static incident catalog still contains exactly three
  secret-free records and the platform standard records the cleanup result.

## Assumptions

- The user's request is the explicit owner approval required by Feature 028's
  cleanup contract.
- Cleanup applies to the retained Aegis production artifacts and the source
  and runbook records needed to describe their removal; it does not authorize
  deletion of unrelated legacy engine source or active business runtimes.
- The protected evidence bundle and database dump are consumed for final
  verification and may be deleted as part of this approved cleanup after the
  durable closeout record is written.
- Production deployment and repository publication remain separate actions;
  this change records and verifies them but does not push or merge branches.
