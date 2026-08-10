# Implementation Plan: Retired Orchestrator Cleanup

**Branch**: `agent/codex/orchestrator-cleanup` | **Date**: 2026-08-09 |
**Spec**: [spec.md](spec.md)

## Summary

Remove the exact retained Aegis artifacts of Feature 028 after its observation
window: stopped control-plane containers, exclusive volumes, unreferenced
images, stale runtime files, and the fired Walter reminder controls. Preserve
the explicit retired-hostname denial, the static incident catalog, and a
secret-free durable closeout record. The production operation is guarded by
fresh evidence checksum verification and exact-target assertions.

## Technical Context

**Language/Version**: POSIX shell, Docker CLI, systemd, YAML, Markdown; no new
application language

**Primary Dependencies**: Aegis Docker Engine, Nginx, systemd, Walter scheduler,
platform-standard repository, deployment ledger

**Storage**: Existing root-protected retirement evidence and database dump,
Docker containers/volumes/images, Aegis runtime files, platform-standard YAML
and runbook records

**Testing**: Secret-safe SSH preflight, evidence checksum verification, exact
Docker and systemd assertions, Nginx negative checks, static catalog checks,
source qualification, YAML/Markdown validation, and final health checks

**Target Platform**: Linux/ARM64 Aegis production VM and the two dedicated
source worktrees

**Project Type**: Brownfield production operations cleanup with documentation
and source retirement

**Performance Goals**: No active runtime restart; cleanup completes within one
bounded maintenance command sequence

**Constraints**: No broad Docker pruning, no wildcard deletion, no secret
output, no active-boundary removal, no unrelated scheduler mutation, no source
publication or remote-state mutation without separate authorization

**Scale/Scope**: Three containers, two exclusive volumes, up to six exact
retirement-only image references, one timer/service/env triplet, one paused
Walter heartbeat job, six stale runtime paths, and two repository records

## Constitution Check

*GATE: Must pass before research and re-check after design.*

- **Business/use-case boundary**: PASS. Cleanup removes only the retired
  customer-hosting control plane and does not alter named business workloads.
- **Least privilege**: PASS. Dormant Docker authority and its secret path are
  removed; the retired hostname denial remains.
- **Agents assist; people decide**: PASS. This plan treats the user's request
  as the separate explicit owner approval required by Feature 028.
- **Named workloads**: PASS. No runtime restart, recreation, or configuration
  change is part of cleanup.
- **Operational truth**: PASS. The platform standard and deployment ledger
  receive the exact result before evidence cleanup.
- **Recoverability**: PASS for the approved end state. The database dump and
  evidence manifest are verified immediately before deletion; after cleanup,
  rollback requires a new owner-approved rebuild rather than stale artifacts.
- **Sensitive/production work**: PASS with bounded Sol ownership. No delegated
  worker receives production mutation authority.

## Project Structure

### Documentation (this feature)

```text
specs/038-orchestrator-cleanup/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/cleanup-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source and operational records

```text
overnightdesk/
├── .specify/feature.json
├── scripts/qualify-orchestrator-retirement.sh
├── infra/nginx/orchestrator-retired.conf   # retained fail-closed boundary
└── specs/038-orchestrator-cleanup/

overnightdesk-platform-standard/
├── WHAT/services.yaml
├── docs/runbooks/orchestrator-retirement.md
└── docs/decisions/008-cleanup-retired-orchestrator.md
```

**Structure Decision**: Keep cleanup policy and evidence in the existing
Spec-Kit feature and platform-standard boundaries. Do not add a cleanup daemon,
database, API, queue, or replacement orchestrator.

## Phase 0: Research complete

Research is recorded in [research.md](research.md). The live preflight found
all three target containers stopped with restart policy `no`, both exclusive
volumes present, no unrelated image consumers, a valid protected evidence
bundle, and an already-fired persistent reminder timer.

## Phase 1: Design complete

- [data-model.md](data-model.md) defines the exact target manifest and retained
  boundaries.
- [contracts/cleanup-contract.md](contracts/cleanup-contract.md) defines
  preconditions, deletion order, abort behavior, and post-cleanup invariants.
- [quickstart.md](quickstart.md) defines the bounded verification sequence.

## Post-design Constitution Check

PASS. The design is deletion-specific, exact-targeted, evidence-gated, and
keeps the retired hostname denial and durable incident knowledge active.

## Complexity Tracking

No constitution violations or complexity exceptions require justification.
