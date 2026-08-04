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

## Phase 3 - Original analyzer implementation and Meeting Brief validation

- [x] T011 Write failing schema/parser tests for every field/bound/unknown key, semantic date/VTT time, UTF-8/NFC, control/bidi/raw-HTML rejection, protected values, Markdown escaping/quoted-data rendering, action-status separation, and canonical digest in `meeting-processor/internal/analyzer/`.
- [x] T012 Implement strict Meeting Brief v1 validation, canonicalization, rendering, and exact project-route matching in `meeting-processor/internal/analyzer/`.
- [x] T013 Write failing analyzer-client tests for authentication, strict request/response, timeout, redirect, oversize, malformed JSON, and no-session behavior in `meeting-processor/internal/analyzer/`.
- [x] T014 Implement the private analyzer client and replace Feature 034 free-form Titus analysis for briefs in `meeting-processor/internal/analyzer/` and `internal/worker/`.
- [x] T015 Add the dedicated pinned Hermes analyzer config/runtime with `api_server: [no_mcp]`, distinct bearer, no state mounts, no public port, and executable projection tests in `tenants/hermes-titus/config/` and `meeting-processor/runtime/`.
- [x] T016 Add one-time Feature 034 processed-artifact reanalysis only when Meeting Brief v1 is absent and prove restart idempotency in `meeting-processor/internal/worker/`.

**Historical checkpoint**: The strict brief validator remains reusable. T013-T015
implemented the now-superseded sidecar analyzer and are retained as delivery
history; Phase 7 removes that runtime before production activation.

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

## Phase 7 - Titus Sol/Luna architecture correction (historical, superseded)

The tasks in this phase document the implementation that was deployed but
failed the Gary canary's model-output contract. Phase 9 supersedes the runtime
architecture; these completed tasks remain as delivery history and rollback
context only.

- [x] T039 Commit, push, open the OvernightDesk PR with Spec Kit/Ringer/security/rollback context, pass checks, and merge.
- [x] T040 Revise the Feature 035 spec, plan, research, data model, ADR, quickstart, delivery record, and requirement traceability for Titus-owned Sol/Luna processing in `specs/035-titus-meeting-briefs/` and `docs/decisions/004-titus-meeting-brief-review.md`.
- [x] T041 Run Spec Kit consistency analysis and a production-sensitive read-only Ringer architecture/security review for T042-T049; resolve Critical/Required design findings before implementation.
- [x] T042 [US1] Write failing strict `meeting-qa/v1` envelope tests for pass/block, exact meeting/attempt/source binding, one remediation, matching observed delegation counts, wrong-child/stale-attempt/draft-digest mismatches, unknown fields, protected values, unsupported tool calls, and embedded Meeting Brief validation in `meeting-processor/internal/analyzer/`.
- [x] T043 [US1] Implement strict QA-envelope parsing, canonicalization, safe error codes, and reuse of Meeting Brief validation in `meeting-processor/internal/analyzer/`.
- [x] T044 [US1] Write failing Titus Runs/Sessions client tests for deterministic create/readback conflict, persisted create/run body digests, one run submission under lost responses, session polling, exact single-leaf delegation arguments, bounded child enumeration, child-parent lineage and observed Luna route, latest child-draft binding, restart/unknown reconciliation, cleanup retry/block, verified parent/child `404`, redirect/timeout/oversize/malformed responses, and zero approval resolution in `meeting-processor/internal/orchestrator/`.
- [x] T045 [US1] Implement the authenticated Titus Runs/Sessions client, fixed ASCII 512-byte Luna context prefix, create/run ambiguity handling, polling/audit/child-binding logic, and verified parent/child session deletion in `meeting-processor/internal/orchestrator/`.
- [x] T046 [US1] Write failing state/worker tests for `analysis_pending -> luna_running -> sol_qa_pending -> qa_remediation|cleanup_pending -> email_pending|blocked`, one analysis at a time, restart unknown handling, no email before QA pass, no duplicate dispatch/email, and legacy-record compatibility in `meeting-processor/internal/{state,worker}/`.
- [x] T047 [US1] Implement the durable Sol/Luna analysis state machine and safe events/health in `meeting-processor/internal/{state,worker}/` and wire it in `cmd/titus-meeting-processor/main.go`.
- [x] T048 Write failing Phase/runtime/deploy tests proving Feature 035 reuses the existing Titus API key, projects no analyzer model/API key, never sends a request model override, and can retire the analyzer unit/container without deleting its retained volume in `meeting-processor/tests/`.
- [x] T049 Remove analyzer-sidecar configuration, build, unit, and deployment requirements; update disabled-first activation and rollback to use the existing healthy Titus runtime plus the private filer in `meeting-processor/runtime/` and `meeting-processor/scripts/`.
- [x] T050 Update Titus README/runbook and Feature 035 operator evidence for session lifecycle, shared capacity, unknown attempts, QA block, cleanup failure, and content-free troubleshooting in `tenants/hermes-titus/README.md` and `tenants/hermes-titus/runbooks/meeting-artifact-discovery.md`.
- [x] T051 Run complete Go unit/race/vet/build, Python runtime/security/release contracts, schema validation, shell syntax, leak scans, ARM64 build, and hardened-container qualification.
- [x] T052 Refresh canonical codebase-memory impact and verify every changed seam with targeted source reads.
- [x] T053 Run the final read-only Ringer/Sol quality gate; permit at most one Luna remediation and one Sol delta review.
- [x] T054 Confirm `git diff --check`, task-scoped status, secret scan, no generated artifacts, and reproducible clean handoff.

## Phase 8 - Correction publication, production, and durable closeout

- [x] T055 Commit, push, open the correction PR with Spec Kit/Ringer/security/rollback context, pass checks, merge, and reconcile local main.
- [x] T056 Deploy filer, corrected worker, and poller disabled; retire the analyzer unit/container without deleting retained rollback state; verify exact mounts, secrets, networks, hardening, preserved state, and unrelated Titus continuity.
- [x] T057 Enable brief processing, reprocess the retained Gary transcript, prove one bounded tool-free Titus Markdown request using the proven four-section contract, local validation or fail-closed block, one fixed-recipient email only after validation, seven-day encrypted custody, recording stream/discard, and restart idempotency. Structured JSON routing is deferred to T058+; final canary and restart evidence are in `delivery.md`.
- [ ] T058 Enable filing, process Gary/Austin exact approval or hold, and prove deterministic note/Kanban outcome with no external action.
- [ ] T059 Exercise scoped rollback/restoration, monitor one normal interval, and append safe evidence to suite-root `deploys.log`.
- [x] T060 Update, review, merge, deploy, and verify the separate `overnightdesk-platform-standard` change. PR 77 merged at `d0650bf`; the canonical Aegis checkout was fast-forwarded and `overnightdesk-ops` restarted and verified healthy.
- [x] T061 Update issue 159 with safe acceptance evidence, reference the separate channel-bot/subscription issue, and close only the organizer meeting-brief/recording-custody scope. Issue #159 now records the fail-safe canary and remaining gates; channel-bot/webhook work remains in issue #165.
- [ ] T062 Update roadmap/feature pointer to the next selected feature and reconcile both repositories to clean `main`.

## Phase 9 - Single-pass Titus simplification

The Phase 9-11 JSON/session tasks are historical implementation records.
Their completed checkboxes do not define the active T057 contract: T063, T064,
T070, T071, and T079 describe superseded JSON/session qualification. T057 is
the bounded Markdown MVP; canonical JSON is deferred to the separately gated
T058 path.

- [x] T063 [US1] Write failing Titus client and worker tests for one bounded tool-free JSON request, strict local Meeting Brief validation, invalid-output blocking, custody preservation, and no session/delegation calls in `tenants/hermes-titus/meeting-processor/internal/{titus,worker}/`.
- [x] T064 [US1] Change `internal/titus/client.go` to request one Meeting Brief v1 JSON object and reject unsafe or non-schema output without legacy Markdown translation.
- [x] T065 [US1] Replace the `MeetingOrchestrator` state machine with direct single-pass processing in `internal/worker/meeting_briefs.go` and `internal/state/`, preserving restart idempotency and existing custody/email/recording transitions.
- [x] T066 [US1] Remove orchestrator construction and runtime dependency from `cmd/titus-meeting-processor/main.go`, `internal/worker/worker.go`, and obsolete orchestrator tests/source after the direct path is green.
- [x] T067 [US1] Update the Feature 035 spec, ADR, runbook, qualification contracts, and deployment evidence to document the simplified lifecycle and keep brief processing disabled by default.
- [x] T068 Run the Spec Kit consistency analysis, refresh codebase-memory impact, and prepare a read-only production-sensitive Ringer/Sol quality gate for the refactor.
- [x] T069 Run full focused and repository qualification, then stop at disabled-first readiness; do not activate production until a new bounded canary is explicitly authorized.

## Phase 10 - PR 175 review corrections

- [x] T070 [historical, superseded] [US1] Write failing client and command-wiring tests proving Feature 034 retains its four-section Markdown contract while the then-planned Feature 035 path used canonical Meeting Brief v1 JSON in `meeting-processor/internal/titus/` and `cmd/titus-meeting-processor/`.
- [x] T071 [US1] Implement explicit Markdown and Meeting Brief Titus client contracts without a boolean mode or duplicated transport in `meeting-processor/internal/titus/` and wire each configuration path to its exact constructor.
- [x] T072 [US1] Write failing worker tests proving a deterministic valid meeting reference exists before the real mailer boundary, is preserved on restart, and is backfilled for an incomplete retained record in `meeting-processor/internal/worker/`.
- [x] T073 [US1] Assign or backfill the deterministic meeting reference before analysis and email eligibility in `meeting-processor/internal/worker/meeting_briefs.go`.
- [x] T074 [US1] Write failing restart tests proving ambiguous Titus transport or response outcomes become terminal for the stored attempt and perform no email or repeated model request in `meeting-processor/internal/worker/`.
- [x] T075 [US1] Implement fail-closed post-dispatch ambiguity handling while retaining only provably pre-dispatch retry semantics in `meeting-processor/internal/worker/analysis.go`.
- [x] T076 Run Spec Kit consistency analysis, refresh codebase-memory impact, prepare and run the production-sensitive read-only Ringer quality gate, and complete focused plus repository qualification.
- [x] T077 Commit the three independently reviewable fixes, push one correction branch, open one PR closing issues 176-178, pass checks and review, and merge without activating Feature 035 production processing.

## Phase 11 - Retained-custody canary correction

- [x] T078 [US1] Add failing retained-custody fixtures for missing and mismatched source digests, then backfill only the missing digest and fail closed on mismatch in `meeting-processor/internal/worker/`.
- [x] T079 [historical, superseded] Deploy the retained-custody correction disabled-first, rerun the bounded Gary canary, verify one strict JSON brief and fixed-recipient email or a safe terminal block, verify restart idempotency, and reconcile production evidence. The retained-custody and prompt-aware canaries reached Titus but terminally blocked with `titus_output_rejected`; custody was retained, no brief/email was sent, and both post-block restarts were idempotent. The active T057 release subsequently qualified Markdown.

## Phase 12 - P2 review corrections

- [x] T080 Add a failing worker regression for permanent `meeting_email_rejected` responses, then terminally block the stored brief instead of restoring `email_pending` and retrying an impossible delivery.
- [x] T081 Reconcile the current roadmap checkpoint with the final Markdown release PR chain, canary aggregate, marker state, and restart-idempotency evidence.
- [x] T082 Run focused worker tests, full Go qualification, and documentation consistency checks for the combined P2 correction.

Phases 9-11 above preserve the superseded strict-JSON implementation and
canary history for traceability. The active T057 Markdown MVP and the deferred
T058 JSON boundary are governed by Phase 13 and the reconciled spec artifacts.

## Phase 13 - P2 follow-up corrections

- [x] T083 Add a failing worker regression proving recording verification still runs after a terminal `meeting_email_rejected` result and does not replay after restart in `meeting-processor/internal/worker/`.
- [x] T084 Reconcile the active T057 Markdown MVP and deferred T058 JSON boundary across `spec.md`, `plan.md`, `quickstart.md`, `data-model.md`, `checklists/requirements.md`, `delivery.md`, and the qualification contract.
- [x] T085 Run focused worker tests, full Go/race/vet/build qualification, documentation consistency checks, and the read-only Sol quality gate for the combined P2 follow-up. Ringer transport was unavailable (HTTP 403); the bounded local Sol delta review and all qualification checks passed.

## Dependencies and Ringer Ownership

- T002 depends on T001. T003 depends on T002 and delegates read-only review only.
- T004-T010, T011-T016, T017-T023, T024-T032, and T042-T049 are sequential vertical
  waves; tests in each task must fail before implementation.
- T041 is the pre-implementation read-only gate. T053 and T068 are final
  read-only gates. Production-sensitive mutation T040 and T042-T069 is
  Sol/operator only.
- T070-T075 are three test-first correction slices: T071 depends on T070, T073
  depends on T072, and T075 depends on T074. T076 depends on all three slices;
  T077 depends on T076. All mutation remains Sol-owned and Ringer is read-only.
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
| FR-004 | T011-T012, T042-T047 |
| FR-005-FR-006, FR-033-FR-036 | T040-T053, T056-T057, T084-T085 |
| FR-007-FR-009 | T011-T012, T042-T047, T051 |
| FR-010-FR-012 | T017-T018, T047, T057 |
| FR-013-FR-015, FR-030 | T019-T023, T058 |
| FR-016-FR-019 | T024-T032, T058 |
| FR-020-FR-021 | T008-T010, T057 |
| FR-022, FR-031 | T004-T032, T044-T051, T057-T058 |
| FR-023 | T010, T033, T047, T050-T053, T056-T059 |
| FR-024, FR-029 | T006-T007, T023, T032, T048-T050, T056, T059 |
| FR-026 | T057-T058 |
| FR-027 | T050, T060-T062 |
| FR-028 | T006-T007, T051, T056 |
| FR-037-FR-041 | T063-T069, T084-T085 |
| FR-034, FR-042 | T070-T071, T074-T075, T084-T085 |
| FR-012, FR-022, FR-033, FR-043 | T072-T073 |
| SC-001-SC-002 | T057, T084-T085 |
| SC-010-SC-011 | T070-T076, T084-T085 |
