# Tasks: Titus Obsidian Headless Sync

**Input**: Design documents from `/specs/030-titus-obsidian-sync/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/runtime-sidecar.md`

## Phase 1: Specification and Dependency Evidence

- [x] T001 Record user stories, boundaries, activation gates, and measurable
  outcomes in `specs/030-titus-obsidian-sync/spec.md`
- [x] T002 Complete the requirements checklist in
  `specs/030-titus-obsidian-sync/checklists/requirements.md`
- [x] T003 Inspect the published npm package for credential, config, conflict,
  and state behavior and record findings in
  `specs/030-titus-obsidian-sync/research.md`
- [x] T004 Resolve and record immutable npm and Node OCI dependency identities
- [x] T005 Create the implementation plan, data model, runtime contract, and
  qualification quickstart

## Phase 2: Runtime Foundation

- [x] T006 [US2] Add failing sidecar source and hardening contract assertions
  to `tenants/hermes-titus/scripts/qualify.sh`
- [x] T007 [US2] Add exact npm dependency files under
  `tenants/hermes-titus/obsidian-sync/`
- [x] T008 [US2] Add the pinned, non-root sidecar Dockerfile and value-safe
  entrypoint/healthcheck scripts
- [x] T009 [US2] Add strict Phase token loader and sidecar container lifecycle
  scripts under `tenants/hermes-titus/runtime/`
- [x] T010 [US2] Add a disabled-by-default independent systemd unit with
  bounded restart and hardening controls
- [x] T011 [US2] Prove shell syntax, package-lock integrity, image build,
  uninitialized health behavior, and secret scans

## Phase 3: User Story 1 - Shared Project Knowledge

- [x] T012 [US1] Add failing tests for marker-gated Titus mount behavior and
  copy/manifest requirements
- [x] T013 [US1] Add the marker-gated
  `titus-project-knowledge-data:/opt/data/project-briefs` mount to
  `tenants/hermes-titus/runtime/run-container.sh`
- [x] T014 [US1] Implement idempotent volume creation, copy-only migration,
  root-only manifests, ownership checks, and comparison in
  `tenants/hermes-titus/runtime/prepare-obsidian-sync.sh`
- [x] T015 [US1] Implement interactive immutable-ID setup, private password
  prompting, conflict/no-config policy, and value-safe validation in the deploy
  workflow
- [x] T016 [US1] Document the durable-background-only vault contract and
  untrusted-note boundary in `tenants/hermes-titus/README.md`
- [x] T017 [US1] Prove local fixture migration and that deployment preparation
  cannot activate the mount or service

## Phase 4: User Story 3 - Backup, Recovery, and Operations

- [x] T018 [US3] Add failing backup tests for the knowledge dataset, exact
  read-only path, state exclusion, and quiesce/resume hooks
- [x] T019 [US3] Add `titus-project-knowledge` to
  `scripts/aegis-backup/config.production.json` with no SQLite or sync-state
  capture
- [x] T020 [US3] Implement and test fail-safe sidecar quiesce/resume around the
  backup unit
- [x] T021 [US3] Extend backup documentation with dataset, consistency,
  restore, and sidecar-state recreation boundaries
- [x] T022 [US3] Add value-safe install-disabled, status, activation, and
  rollback commands to the Titus deployment script
- [x] T023 [US3] Prove rollback removes only the validated marker, restarts
  only Titus, and preserves both volumes

## Phase 5: Platform Contract

- [x] T024 [US3] Create platform-standard Feature 004 artifacts for the
  project knowledge boundary
- [x] T025 [US3] Add ADR 012 for the sidecar and systems-of-record decision
- [x] T026 [US3] Add the operator runbook and exact service/volume/secret
  inventory without touching pending Linear work-management files
- [x] T027 [US3] Reconcile encrypted-backup documentation and validate all
  standard YAML

## Phase 6: Analysis and Quality Gates

- [x] T028 Run Spec Kit cross-artifact analysis and resolve any approved
  critical inconsistency before implementation completion
- [x] T029 Run all runtime, backup, syntax, parse, diff, and secret
  qualifications across the three worktrees
- [x] T030 Run multi-axis code, security, operations, and documentation review
- [x] T031 Update this task list with exact completed/deferred gates and report
  production account enrollment and activation as pending
- [x] T032 [US1] Add and validate the `titus-project-knowledge` skill, wire it
  into the Titus identity, and preserve task/code/platform authority boundaries

## Deferred Production Activation

- [ ] T033 Provision the dedicated Phase token path without printing values
- [ ] T034 Install the reviewed sidecar image/unit disabled on Aegis
- [ ] T035 Migrate and compare the live project briefs without deleting source
- [ ] T036 Interactively link the owner-approved remote vault and run one-shot
  sync qualification
- [ ] T037 Complete an encrypted backup and isolated knowledge-vault restore
- [ ] T038 Activate the marker and sidecar under explicit owner authorization
- [ ] T039 Run bidirectional, conflict, outage-isolation, restart, and
  observation canaries
- [ ] T040 Append exact value-safe production evidence to `deploys.log` and
  reconcile the platform standard

## Dependencies

- T006-T011 establish the isolated runtime and block all sync behavior.
- T012-T017 depend on the runtime foundation.
- T018-T023 can proceed after the volume contract is stable.
- T024-T027 document the reviewed runtime and backup contract.
- T028-T031 are required before handoff.
- T033-T040 require merged source, owner-provided account/vault state, a
  successful restore drill, and separate explicit activation authorization.
