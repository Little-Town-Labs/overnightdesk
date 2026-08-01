# Tasks: Titus Meeting Briefs

## Phase 1 - Contract, analysis, and checked delivery

- [x] T001 Complete spec, plan, research, data model, contracts, quickstart, requirements checklist, ADR, and roadmap activation.
- [x] T002 Run Spec Kit artifact consistency analysis and resolve every Critical or High contradiction, including the read-only Ringer contract findings.
- [x] T003 Prepare and run the production-sensitive read-only Ringer architecture/security review; freeze scope after at most one remediation.

## Phase 2 - Encrypted transcript custody and recording verification

- [x] T004 Write failing custody tests for key parsing/IDs/rotation, nonce uniqueness, AAD binding, tamper rejection, atomic mode-0600 write, exact 168-hour expiry, overdue fail-closed, missing-key stop, delete retry, and plaintext leak scans in `meeting-processor/internal/custody/`.
- [x] T005 Implement encrypted raw transcript custody, key-ring rotation, idempotent retention sweep, and retention-only rollback command in `meeting-processor/internal/custody/`.
- [x] T006 Write failing tests for legacy-output digest verification, original-digest provenance, exact safe-sentinel replacement, unique-marker handoff removal, every cross-file crash/resume boundary, prior-reader-compatible version-2 discovery state, and separate Feature 035 lifecycle state in `meeting-processor/internal/state/` and `internal/worker/`.
- [x] T007 Implement disabled-first crash-safe legacy sentinel migration plus separate version-1 brief/custody/decision/filing/recording state without changing discovery state version 2 in `meeting-processor/internal/state/` and `internal/worker/`.
- [x] T008 Write failing exact recording URL, no-redirect, MP4, size, constant-memory stream, retry, token-refresh, interrupted-body, and no-residue tests in `meeting-processor/internal/graph/`.
- [x] T009 Implement bounded streaming recording verification without persistence or analysis in `meeting-processor/internal/graph/`.
- [x] T010 Integrate custody sweep and one-recording-per-cycle verification with safe lifecycle events in `meeting-processor/internal/worker/`.

**Checkpoint**: State migrates losslessly; VTT ciphertext is private/expiring;
MP4 is verified without retained bytes; full meeting-processor tests pass.

## Phase 3 - No-tool Hermes analysis and Meeting Brief validation

- [x] T011 Write failing schema/parser tests for every field/bound/unknown key, semantic date/VTT time, UTF-8/NFC, control/bidi/raw-HTML rejection, protected values, Markdown escaping/quoted-data rendering, action-status separation, and canonical digest in `meeting-processor/internal/analyzer/`.
- [x] T012 Implement strict Meeting Brief v1 validation, canonicalization, rendering, and exact project-route matching in `meeting-processor/internal/analyzer/`.
- [x] T013 Write failing analyzer-client tests for authentication, strict request/response, timeout, redirect, oversize, malformed JSON, and no-session behavior in `meeting-processor/internal/analyzer/`.
- [x] T014 Implement the private analyzer client and replace Feature 034 free-form Titus analysis for briefs in `meeting-processor/internal/analyzer/` and `internal/worker/`.
- [x] T015 Add the dedicated pinned Hermes analyzer config/runtime with `api_server: [no_mcp]`, distinct bearer, no state mounts, no public port, and executable projection tests in `tenants/hermes-titus/config/` and `meeting-processor/runtime/`.
- [x] T016 Add one-time Feature 034 processed-artifact reanalysis only when Meeting Brief v1 is absent and prove restart idempotency in `meeting-processor/internal/worker/`.

**Checkpoint**: A fixture produces one strict brief through a zero-tool analyzer;
invalid model output produces no durable brief or outbound action.

## Phase 4 - Fixed internal email and exact review commands

- [x] T017 Write failing outbound-mail tests for exact two-recipient policy, no CC/BCC/attachment, deterministic template, SecurityTeam ordering, provider idempotency/readback, redirect/timeout/conflict, and leak rejection in `meeting-processor/internal/email/`.
- [x] T018 Implement narrow standing-authorized AgentMail delivery without changing ordinary guarded Titus email in `meeting-processor/internal/email/`.
- [x] T019 Write failing private review API tests for bearer auth, exact-body SHA-256 idempotency, HMAC claim signature, expected sender fingerprint/derived actor, signature/fingerprint/body mismatch, time skew, reference lookup, replay, first-terminal-wins concurrency/conflict, and safe errors in `meeting-processor/internal/approval/`.
- [x] T020 Implement the private review endpoint and monotonic approval/hold state transition in `meeting-processor/internal/approval/`.
- [x] T021 Write failing email-poller tests for authorized staging sender/received-at return, post-clean exact command parsing, versioned message digest, exact normalized sender-to-HMAC-fingerprint claim, exact-body key/signature, authenticated decision delivery, acknowledgement bounds, replay, hostile quoting/prose, and zero Hermes submission in `email-poller/internal/{approval,store,worker}/`.
- [x] T022 Implement sender-bound deterministic meeting-command interception after clean claim and before Hermes submission in `email-poller/internal/{approval,store,worker}/`.
- [x] T023 Extend exact Phase projections so processing, mail, and review credentials are omitted while disabled and independently present only when enabled in both services' runtime/tests.

**Checkpoint**: One fixed-recipient draft is sent; exact clean commands decide
once; every negative fixture performs zero filing and zero Hermes run.

## Phase 5 - Deterministic project notes and Kanban filing

- [x] T024 Create the `meeting-filer` Go module and write failing configuration/auth/exact-body-idempotency/error-contract tests in `tenants/hermes-titus/meeting-filer/internal/{api,policy}/`.
- [x] T025 Implement strict private filing API validation, bearer auth, bounded bodies, correlation, and consistent errors in `meeting-filer/internal/api/`.
- [x] T026 Write failing note tests for exact route digest, safe path, symlink/traversal/overwrite rejection, deterministic Markdown, atomic create-only write, and idempotent readback in `meeting-filer/internal/filing/`.
- [x] T027 Implement known-project and unknown-inbox create-only note filing in `meeting-filer/internal/filing/`.
- [x] T028 Write failing Kanban adapter tests for exact board allowlist, `meeting-triage`, supported CLI argv, one triage card, one task per action/commitment, bounded titles/bodies, versioned NUL-delimited per-kind/index idempotency keys, and replay in `meeting-filer/internal/kanban/`.
- [x] T029 Implement the supported Hermes Kanban CLI adapter and deterministic task rendering in `meeting-filer/internal/kanban/`.
- [x] T030 Write failing worker filer-client/orchestration tests for approved-only calls, held/no-decision denial, immutable route snapshot, retry, ambiguous response readback, and completed replay in `meeting-processor/internal/filer/` and `internal/worker/`.
- [x] T031 Implement approved filing orchestration and safe result persistence in `meeting-processor/internal/filer/` and `internal/worker/`.
- [x] T032 Add filer Docker/runtime/release/deploy/qualification scripts with exact volumes, no unrelated credentials, no public port, and independent activation marker in `tenants/hermes-titus/meeting-filer/`.

**Checkpoint**: Known and unknown approvals create exact notes/tasks once; held
or malformed inputs create nothing; no component can exceed its authority.

## Phase 6 - Observability, documentation, and local qualification

- [x] T033 Extend content-free structured events, aggregate health, overdue/missing-key failed-closed custody status, actionable operator sentinel, and allowlisted errors across worker, poller, and filer.
- [x] T034 Update the Titus README, meeting runbook, qualification scripts, runtime contract, ADR-004, and rollback guidance.
- [x] T035 Run complete Go unit/race/vet/build, Python runtime/security contracts, JSON Schema/OpenAPI validation, shell syntax, leak scans, ARM64 builds, and hardened container inspections.
- [x] T036 Refresh canonical codebase-memory change impact and verify every graph conclusion with targeted source reads.
- [x] T037 Run the final read-only Ringer/Sol multi-axis quality gate; allow at most one Luna remediation and one Sol delta review.
- [x] T038 Confirm `git diff --check`, task-scoped status, generated-artifact exclusion, and reproducible clean handoff.

## Phase 7 - Publication, production, and durable closeout

- [ ] T039 Commit, push, open the OvernightDesk PR with Spec Kit/Ringer/security/rollback context, pass checks, and merge.
- [ ] T040 Deploy analyzer, filer, worker, and poller disabled; verify exact mounts, secrets, networks, hardening, preserved state, and unrelated service continuity.
- [ ] T041 Enable brief processing, run the Gary canary, prove one draft email, seven-day encrypted custody contract, no-tool analysis, recording stream/discard, and restart idempotency.
- [ ] T042 Enable filing, process Gary/Austin exact approval or hold, and prove deterministic note/Kanban outcome with no external action.
- [ ] T043 Exercise scoped rollback/restoration, monitor one normal interval, and append safe evidence to suite-root `deploys.log`.
- [ ] T044 Update, review, merge, deploy, and verify the separate `overnightdesk-platform-standard` change.
- [ ] T045 Update issue 159 with safe acceptance evidence, open the separate channel-bot/subscription follow-on, and close only the organizer meeting-brief/recording-custody scope.
- [ ] T046 Update roadmap/feature pointer to the next selected feature and reconcile both repositories to clean `main`.

## Dependencies and Ringer Ownership

- T002 depends on T001. T003 depends on T002 and delegates read-only review only.
- T004-T010, T011-T016, T017-T023, and T024-T032 are sequential vertical
  waves; tests in each task must fail before implementation.
- Production-sensitive tasks T039-T046 are Sol/operator only.
- Ringer workers own no mutable paths, commits, Git state, task checkboxes,
  secrets, or production operations. The prepared read-only task may inspect
  `specs/035-titus-meeting-briefs/` and the exact source paths named above.
- Each implementation task should touch no more than five files; split it if
  source discovery proves the owned surface larger.

## Requirement Traceability

| Requirements | Primary executable tasks |
|--------------|--------------------------|
| FR-001, FR-025 | T016 |
| FR-002, FR-003, FR-032 | T004-T007, T033, T041 |
| FR-004 | T013-T016 |
| FR-005 | T013-T015, T035, T040-T041 |
| FR-006-FR-009 | T011-T016, T035 |
| FR-010-FR-012 | T017-T018, T041 |
| FR-013-FR-015, FR-030 | T019-T023, T042 |
| FR-016-FR-019 | T024-T032, T042 |
| FR-020-FR-021 | T008-T010, T041 |
| FR-022, FR-031 | T004-T032, T035, T041-T042 |
| FR-023 | T010, T033, T035, T040-T043 |
| FR-024, FR-029 | T006-T007, T023, T032, T040, T043 |
| FR-026 | T041-T042 |
| FR-027 | T034, T044-T046 |
| FR-028 | T006-T007, T035, T040 |
