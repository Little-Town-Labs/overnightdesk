# Tasks: Titus Transcript Custody

## Phase 1 - Design and dependency contract

- [x] T001 Complete Spec Kit spec, plan, research, data model, contracts, quickstart, checklist, and delivery profile.
- [x] T002 Run artifact consistency analysis and resolve every Critical or High contradiction.
- [x] T003 Run the read-only production-sensitive Ringer architecture/security review and freeze scope.
- [x] T004 Create an isolated `overnightdesk-securityteam` worktree from fresh `origin/main`.
- [x] T005 Write failing SecurityTeam tests for default queue compatibility and block-on-review zero-enqueue behavior.
- [x] T006 Implement the optional `approvalMode=block` contract and pass focused plus full SecurityTeam tests.
- [x] T007 Review, commit, push, merge, and deploy the SecurityTeam dependency with a harmless no-retention canary.

## Phase 2 - Transcript retrieval and state migration

- [x] T008 Write failing Graph content URL, redirect, MIME, UTF-8, VTT, size, retry, token-refresh, and redaction tests.
- [x] T009 Implement the bounded transcript-content Graph client without recording content support.
- [x] T010 Write failing version-1 to version-2 migration, lifecycle validation, bounds, atomicity, and prior-state-preservation tests.
- [x] T011 Implement deterministic state migration and transcript content lifecycle fields.

## Phase 3 - Screening and Titus analysis

- [x] T012 Write failing authenticated SecurityTeam client tests covering safe, blocked, pending, malformed, redirect, timeout, oversize, and source mismatch.
- [x] T013 Implement the fixed-origin SecurityTeam block-mode client.
- [x] T014 Write failing stateless Titus client tests covering exact request, no session key, no tools requested, output bounds, malformed shapes, timeout, redirect, exact protected-value rejection, Graph-route rejection, and credential-marker safety.
- [x] T015 Implement the authenticated stateless Titus chat-completions client.
- [x] T016 Write failing orchestration tests for one-per-cycle processing, raw-memory-only custody, stage ordering, retry, terminal block, completed idempotency, and metadata-commit independence.
- [x] T017 Implement transcript content orchestration and bounded derived handoff version 2.

## Phase 4 - Runtime, observability, and operations

- [x] T018 Write failing loader/marker tests for disabled omission, enabled exact merge, modes, ownership, malformed marker, and secret-safe failures.
- [x] T019 Implement the root-owned activation marker and exact conditional Phase projection.
- [x] T020 Extend health/events with aggregate content lifecycle and allowlisted error codes only.
- [x] T021 Extend disabled-first deployment, enable-content, verify-content, restart-verify, and disable-content actions.
- [x] T022 Update the meeting runbook, Titus README, ADR, roadmap, and qualification contracts.

## Phase 5 - Quality, delivery, and production

- [x] T023 Run Go unit/race/vet/build, Python/runtime contracts, shell syntax, secret/content leak scans, ARM64 build, and hardened container qualification.
- [x] T024 Refresh codebase-memory change impact and verify graph conclusions with targeted source reads.
- [x] T025 Run the final read-only Ringer multi-axis quality gate; allow at most one remediation round and one Sol delta review. Both allowed attempts stopped on missing installed review-skill reference files before producing a report; the accountable Sol lead completed and documented the final delta review without another automated loop.
- [x] T026 Confirm `git diff --check`, task-scoped status, and a reproducible clean handoff.
- [ ] T027 Commit, push, open the OvernightDesk PR, pass checks, merge, and deploy disabled.
- [ ] T028 Enable transcript content, process the Gary canary, prove raw-content non-retention and restart idempotency, and append `deploys.log`.
- [ ] T029 Synchronize and merge the platform-standard change, deploy the standard, and verify ops/Titus/meeting-worker continuity.
- [ ] T030 Update issue 159 with safe evidence and close only the transcript-to-Titus scope; explicitly retain recording-content and Austin-meeting limitations as later decisions.
