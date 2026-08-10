# Research: Retired Orchestrator Cleanup

**Date**: 2026-08-09

## Scope decision

The user's request is treated as the explicit owner approval required by the
Feature 028 cleanup contract. The cleanup target is retained production state
and its source/runbook records. The active retired-hostname denial and the
durable incident catalog are explicitly outside the deletion set.

## Live evidence

The Aegis preflight at 2026-08-09 11:18 UTC found:

- `overnightdesk-platform-orchestrator`,
  `overnightdesk-docker-socket-proxy`, and
  `overnightdesk-platform-orchestrator-db` all exited with restart policy
  `no`.
- `overnightdesk_orchestrator-fr-snapshots` and
  `overnightdesk_platform-orchestrator-db-data` were present and used only by
  the retired containers; their sizes were approximately 8 KiB and 47 MiB.
- The retired orchestrator image and socket-proxy image had no active
  consumers. `postgres:16-alpine` was consumed only by the retired database
  container and is therefore eligible for removal after the final assertion.
- Retirement-only Ops and operations-audit image tags had no container
  consumers.
- The evidence bundle at
  `/var/lib/overnightdesk/retirement-evidence/20260726T012500Z` contained the
  custom-format dump, incident export, pre/post configuration, checksums, and
  rollback commands. Its `SHA256SUMS` manifest passed when checked from the
  protected directory.
- The persistent reminder timer had fired at exactly
  `2026-08-09 01:33:03 UTC` and had no next activation.

## Target classification

Delete:

- the three retired containers;
- the two exclusive volumes;
- unreferenced retired and retirement-only images;
- the fired reminder timer, service, and dedicated environment file;
- the paused retired Walter heartbeat job and its retired-only script and
  credential reference, after verifying unrelated scheduler hashes;
- stale runtime files that exclusively belong to the retired service;
- the consumed protected evidence bundle after a durable closeout record.

Retain:

- `infra/nginx/orchestrator-retired.conf` and the live Nginx deny vhost;
- `WHAT/platform-incidents.yaml` and the static incident-search behavior;
- the Feature 028 and Feature 038 specifications and the cleanup ADR/runbook;
- unrelated legacy engine source and all active named workloads.

## Risks and controls

The principal risks are deleting a shared image or volume, removing the active
deny boundary, changing unrelated Walter jobs, or losing the final evidence
before recording the result. Exact names, consumer checks, scheduler hashes,
evidence checksums, and a write-before-delete closeout record control those
risks. Any failed precondition aborts before the first deletion.
