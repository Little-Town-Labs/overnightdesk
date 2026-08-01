# Delivery Profile: 033-titus-meeting-ingestion

## Classification

- Project: `overnightdesk`
- Context: `brownfield`
- Scale: `system`
- Risk: `production`
- Mode: `readonly-delegation`
- Spec Kit required: `yes`
- Mutation owner: `sol-lead`

## Model Routing

- Planning and orchestration: `codex-sol`
- Implementation: `lead-only`
- Final quality gate: `codex-sol`
- Automated remediation ceiling: one Luna remediation and one Sol delta review

## Codebase Graph

- Policy: `required-before-planning`
- Project: `home-frosted639-src-overnightdesk-suite-overnightdesk-worktrees-codex-feature-033-titus-meeting-ingestion`
- Status: `ready`

- Feature worktree moderate index resolved the CLI to worker to constrained Graph client to state handoff and health path.
- Change tracing confirmed the new meeting processor remains isolated from Hermes tools, public ingress, and the interactive Teams identity.
- Targeted source reads after the T045 re-scope verified per-stream bounds, aggregate state bounds, incremental atomic serialization, and prior-state preservation.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| rescope-final-readiness | T042, T044 | no | codex-luna read-only | none | `python3 /home/frosted639/src/ringer-workflows/scripts/delivery_profile.py validate-report --kind readonly --report report.md` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Prior Sol Quality Gate

- The initial Sol gate reviewed all candidate Feature 033 source, tests, runtime,
  deployment, and Spec Kit surfaces. Its report is
  `/tmp/ringer-delivery/overnightdesk-033-titus-meeting-ingestion/quality-gate/sol-quality-gate/report.md`.
- It raised six Required findings: provider continuation-token spelling,
  persisted-state semantic validation, bounded identity retry and telemetry,
  aggregate memory, the atomic-state documentation contract, and immutable
  deletion-aware deployment releases with a prior-version handle.
- Lead-owned test-first remediation cleared five findings. The permitted Sol
  delta report at
  `/tmp/ringer-delivery/overnightdesk-033-titus-meeting-ingestion/quality-delta/sol-quality-delta/report.md`
  confirmed those five and found that the first memory remediation was still
  per-stream rather than cycle-wide.

## Lead Re-scope Decision After Delta Review

- The automated remediation loop stopped after the single permitted Luna
  remediation round and Sol delta review.
- The accountable lead re-scoped the remaining memory finding into `FR-021`,
  `SC-009`, and `T045`: the complete four-stream retained-state transaction and
  incremental atomic serialization must remain inside the 256 MiB runtime
  envelope and must preserve prior state on rejection.
- `T045` implements 8 MiB and 2,500-artifact per-stream bounds, 10,000-artifact
  and 32 MiB decoded-string document bounds, a 64 MiB encoded-state-file bound,
  pre-read oversized-file rejection, and bounded incremental deterministic JSON
  persistence without a second whole-document allocation.
- Focused multi-page, four-stream, encoded-file, oversized-file, redirect, and
  prior-state-preservation regressions pass. Full local qualification, including
  the Docker-format ARM64 image and runtime metadata checks, passed after this
  re-scope.
- The next review is a fresh read-only final feature gate over the re-scoped
  complete candidate. It is not another automated delta-remediation loop.

## Lead Re-scope Decision After Fresh Feature Gate

- The fresh Sol feature gate cleared `FR-021`, `SC-009`, and `T045`, including a
  temporary near-maximum four-stream persistence probe that remained well below
  the 256 MiB runtime limit.
- That complete review found one separate Required deployment blocker: `cp -a`
  preserved uploader ownership and owner-write access in content-addressed
  release directories, and an existing directory was not re-hashed before
  reuse.
- The accountable lead re-scoped only that finding into `T046`. The task is to
  promote a root-owned nonwritable regular-file tree, recompute its content
  digest and validate its ownership/type/mode before every build, and add a
  regression that keeps this verification ahead of the build and source-link
  selection.
- After lead-owned test-first implementation and local qualification, one new
  read-only Sol final feature gate is permitted. No Luna mutation, automatic
  remediation, or delta loop is authorized.

## Lead Re-scope Decision After T046 Final Gate

- The T046 final Sol gate confirmed that the production release-tree logic
  clears the mutable-release defect, but demonstrated that the regression was
  only a source-string assertion: deleting the unsupported-entry guard in a
  temporary mutant still left all seven Python contracts green.
- The accountable lead stopped that review loop and re-scoped only the missing
  proof into `T047`. A parameterized release-tree helper must be exercised
  against real temporary trees for valid promotion plus content alteration,
  writable mode, wrong owner, and unsupported-entry rejection. Every rejection
  must leave source and previous handles, a named-state sentinel, and a build
  marker unchanged.
- T047 remains lead-owned because it changes production deployment code. After
  RED-GREEN qualification, one fresh read-only Sol feature gate is authorized;
  no Luna mutation or automatic remediation loop is authorized.

## T047 Final Gate and Lead Closeout

- The fresh Sol gate reviewed the complete 53-file candidate and confirmed the
  production helper, deployment ordering, metadata-only boundary, full local
  qualification, and prior review remediations. It requested one change because
  the unsupported-entry fixture was a writable symlink, so the mode predicate
  could reject it even when the type predicate was removed.
- The accountable lead did not start another Ringer remediation or review loop.
  The fixture was corrected to an expected-owner FIFO with mode `0444`, which
  keeps the release digest, owner, and nonwritable invariants valid and isolates
  unsupported type as the only rejection reason.
- The corrected suite is GREEN against the production helper. A scratch mutant
  deleting only the unsupported-type predicate now fails exactly that test
  while the other four release-tree tests remain green. All five rejection
  paths retain the source and previous handles, named-state bytes, and build
  marker.
- T042, T044, and T047 are complete. Publication and production activation
  remain accountable-lead actions under the explicit owner authorization.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
