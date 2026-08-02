# Feature Specification: Titus Meeting Briefs

**Feature Branch**: `035-titus-meeting-briefs`

**Created**: 2026-08-01

**Status**: Ready for implementation

**Input**: Continue issue 159 by turning organizer-scoped Teams transcripts into
reviewable Titus meeting briefs, retrieving the associated recording safely,
and filing approved internal results into project knowledge and Titus Kanban.

## Classification

- **Context**: Brownfield
- **Scale**: System
- **Risk**: Sensitive and production
- **Accountable lead**: Sol
- **Delegation**: Read-only Ringer analysis and review only; all mutation remains with Sol

## User Scenarios & Testing

### User Story 1 - Receive a private meeting brief (Priority: P1)

After a Gary- or Austin-organized Teams meeting produces a transcript, Titus
creates a structured draft brief and automatically emails it to exactly Gary
and Austin. The raw transcript is encrypted at rest for seven days, excluded
from the email and all general Titus memory, and then deleted automatically.

**Independent Test**: Process a bounded fixture and the retained Gary meeting,
then prove one schema-valid brief, one fixed-recipient email, encrypted raw
custody, no parent tool call except bounded delegation, no duplicate work, and deletion after the retention
clock is advanced beyond seven days.

**Acceptance Scenarios**:

1. **Given** an eligible transcript without a current brief, **When** the worker runs, **Then** it downloads, screens, encrypts, opens one dedicated Titus meeting session, has Luna draft the brief, has Sol QA it, validates the result, and emails exactly one bounded draft brief to Gary and Austin only after `QA_PASS`.
2. **Given** model output containing extra fields, unsafe values, invalid owners, unsupported projects, or an attempt to turn source-derived instruction-like text into executable direction or evidence of a performed action, **When** validation runs, **Then** the draft is rejected and no email, note, or task is created; instruction-like source text that passes every concrete predicate remains inert quoted data under an explicit source-derived label.
3. **Given** encrypted raw custody older than seven days, **When** the retention sweep runs, **Then** the ciphertext is deleted while the safe brief, provenance, and audit state remain.

---

### User Story 2 - Approve or hold the brief by email (Priority: P2)

Gary or Austin can reply with the exact command `APPROVE <reference>` or
`HOLD <reference>`. The command is accepted only after the existing inbound
SecurityTeam boundary and exact-sender validation. The first terminal command
wins, is auditable, and never enters general Hermes processing.

**Independent Test**: Feed clean and hostile reply fixtures through the email
poller and prove exact parsing, sender authorization, authenticated delivery,
idempotency, first-terminal-command semantics, and zero Hermes-run submission.

**Acceptance Scenarios**:

1. **Given** a pending brief and an exact command from Gary or Austin, **When** the clean message is claimed, **Then** the poller sends one authenticated decision to the meeting worker and returns a bounded acknowledgement.
2. **Given** a command from any other sender, an automated message, quoted command, extra prose, wrong reference, or blocked content, **When** intake runs, **Then** no decision is recorded and no filing occurs.
3. **Given** an already approved or held brief, **When** another terminal command arrives, **Then** the original decision remains and the caller receives a safe conflict acknowledgement.

---

### User Story 3 - File approved internal results (Priority: P3)

Approval creates a permanent internal meeting note and Kanban work without
allowing model text to select arbitrary paths or boards. Identified projects
use an exact operator-managed project map. Unidentified meetings go to a
dedicated meeting-triage board. Every internal action item becomes a Kanban
task; external commitments remain internal tasks and never trigger outreach.

**Independent Test**: Approve known- and unknown-project fixtures through the
private filing boundary and prove deterministic create-only notes, exact board
routing, one task per action item, stable idempotency, and no external action.

**Acceptance Scenarios**:

1. **Given** an approved brief mapped to a known project, **When** filing runs, **Then** a create-only meeting note is written below that project's approved path and each action item is added to that project's Kanban board.
2. **Given** an approved brief without an exact project-map match, **When** filing runs, **Then** the note is written to the meeting inbox, a tracking card is created on `meeting-triage`, and action items are created there.
3. **Given** a replay after restart or ambiguous timeout, **When** filing retries, **Then** idempotency keys prevent duplicate notes and cards.

---

### User Story 4 - Verify recording custody without analyzing it (Priority: P4)

The organizer-scoped recording associated with a processed meeting is
retrieved from Microsoft Graph as a bounded stream, correlated to the meeting,
hashed, and discarded. Titus does not inspect audio or video in this feature.

**Independent Test**: Stream MP4 fixtures through success, redirect, oversize,
wrong MIME, interrupted, and retry cases; assert constant-memory retrieval,
safe metadata only, and zero recording bytes after completion.

**Acceptance Scenarios**:

1. **Given** an eligible recording, **When** recording verification runs, **Then** the exact Graph content route is streamed under a hard cap and only digest, size, timestamps, and safe status remain.
2. **Given** a redirect, wrong content type, oversize body, or interrupted stream, **When** retrieval runs, **Then** the recording is retryable or blocked according to allowlisted error semantics and no partial bytes remain.
3. **Given** a successfully verified recording, **When** a later cycle runs, **Then** the content is not downloaded again.

### Edge Cases

- The legacy Feature 034 artifact is already processed but has no Meeting Brief v1.
- Graph transcript or recording content has expired before reprocessing.
- A transcript has no useful speech, no speaker labels, or conflicting names.
- Hermes returns valid JSON that contains instruction-like content, unknown keys,
  invalid timestamps, invented due dates, or a project alias not in the map.
- Sol dispatches Luna but Titus restarts before the child completes, leaving an
  attempt whose external completion cannot be proven.
- Luna's first draft fails Sol QA, or the one permitted remediation also fails.
- The dedicated Titus meeting session completes but cannot be deleted or still
  appears through the authenticated Sessions API.
- AgentMail returns an ambiguous timeout, duplicate idempotency response, or
  recipient-policy denial.
- Gary and Austin send conflicting decisions nearly simultaneously.
- Filing succeeds but its response is lost before state commit.
- Project map configuration changes while a brief is pending.
- The raw-custody key is unavailable, malformed, or rotated.
- The retention sweep cannot delete a ciphertext file.

## Requirements

### Functional Requirements

- **FR-001**: The worker MUST create Meeting Brief v1 only for organizer-scoped transcript artifacts discovered by the existing Feature 033 boundary.
- **FR-002**: Raw VTT MUST be encrypted before durable write using authenticated encryption, a Phase-managed versioned 256-bit key ring, a unique nonce, versioned associated data, mode-0600 files, and a dedicated private volume.
- **FR-003**: Raw transcript ciphertext MUST expire seven days after first successful custody write and MUST be deleted by an idempotent sweep. Plaintext and screened text MUST never be written to meeting-processor state, handoff, telemetry, general Titus memory, project knowledge, notes, or Kanban; the only temporary durable exception is the dedicated Titus parent/delegated-child session required for background processing, which MUST be deleted and verified after terminal QA.
- **FR-004**: Transcript input MUST continue through authenticated SecurityTeam block-on-review screening before any model call.
- **FR-005**: Meeting analysis MUST run through the existing private Titus Hermes API and its existing provider credentials in a dedicated persisted meeting session. Sol MUST remain the accountable parent and MUST delegate the bounded first draft to the configured Luna child. Before accepting any result, the processor MUST prove through the authenticated Sessions API that the parent inherited the approved Titus Sol route with its fixed system prompt and no per-session model lock, discover the one or two child sessions, prove their `parent_session_id` is the dedicated parent and their observed model is the already-approved Titus Luna route, and fail closed on any mismatch. Feature 035 MUST NOT introduce a separate analyzer service, select a model in any request, add a provider credential, OAuth identity, public port, or feature-specific model route.
- **FR-006**: Sol MUST QA Luna's draft for transcript faithfulness, decisions, action items, owners and explicit dates, external commitments, project identification, unsupported claims, proposed follow-up, and schema compliance. Sol may request at most one Luna remediation and perform at most one delta QA review; a remaining rejection MUST become `QA_BLOCKED` and MUST NOT send email or file work.
- **FR-007**: The validated brief MUST separate facts, decisions, internal action items, external commitments, unresolved questions, and a proposed follow-up; it MUST NOT claim an action occurred.
- **FR-008**: Action-item owners MUST be exactly `gary`, `austin`, or `unassigned`; due dates MUST be present only when explicit in the transcript.
- **FR-009**: Project selection MUST use an exact normalized match against an operator-managed allowlist; model text MUST NOT create a project, board, path, owner, or alias.
- **FR-010**: The draft email MUST be sent automatically to exactly the configured Gary and Austin addresses, with no CC/BCC, attachment, raw transcript, recording, provider identifier, or external recipient.
- **FR-011**: Automatic meeting-brief email MUST use a narrow standing authorization distinct from ordinary Titus sending, MUST pass SecurityTeam outbound screening, MUST use provider idempotency/readback, and MUST fail closed on recipient-policy mismatch.
- **FR-012**: The email MUST include a stable internal reference and exact instructions for `APPROVE <reference>` and `HOLD <reference>`.
- **FR-013**: The email poller MUST recognize a meeting decision only after exact sender validation and a clean SecurityTeam claim; accepted command bodies MUST contain only one exact command after bounded whitespace normalization.
- **FR-014**: Accepted meeting decisions MUST bypass normal Hermes-run submission and MUST be delivered to the meeting worker through an authenticated private interface with replay protection.
- **FR-015**: Brief state transitions MUST be monotonic `pending_review -> approved|held`; the first valid terminal command wins and conflicting later commands MUST return conflict without mutation.
- **FR-016**: Approval MUST invoke an authenticated deterministic filer that has no Graph, AgentMail, model, or general Titus tool credentials.
- **FR-017**: The filer MUST write create-only approved Markdown below exact allowlisted project paths or `00-inbox/meetings`, and MUST reject traversal, symlinks, overwrite, unknown schema versions, and mutable project-map mismatches.
- **FR-018**: The filer MUST create one Kanban tracking card for an unidentified project and one Kanban task per internal action item, using exact allowlisted boards and stable idempotency keys.
- **FR-019**: External commitments MUST be represented only as internal Kanban follow-up tasks; this feature MUST NOT send client email, schedule meetings, update CRM, create Linear issues, or perform any other external action.
- **FR-020**: Recording content MUST use the Graph v1.0 meeting-specific `/recordings/{id}/content` route, no redirects, bounded timeouts, `video/mp4` validation, constant-memory streaming, and a configured hard byte cap.
- **FR-021**: Recording bytes MUST be discarded after streaming; only digest, byte count, safe lifecycle, and timestamps MAY persist, and no model or media analysis MAY receive them.
- **FR-022**: Every provider call, decision, filing operation, and retention sweep MUST be idempotent across retries and restarts.
- **FR-023**: Feature 035 structured events, health, deployment evidence, and processor/filer/poller logs MUST expose correlation reference, stage, safe status, duration, counts, and allowlisted error codes only; raw text, participant names, email addresses, identifiers, tokens, paths, brief bodies, and model output MUST not enter those surfaces. Hermes-owned session/delegation artifacts MAY contain bounded derived model output but MUST contain no raw VTT kickoff preview and remain within the session-retention boundary.
- **FR-024**: Deployment MUST be disabled-first with independent markers for brief processing and approval filing; rollback MUST preserve encrypted custody and safe state while stopping new email and filing.
- **FR-025**: The Feature 034 Gary artifact MAY be reprocessed exactly once into Meeting Brief v1 when no brief exists; normal completed briefs MUST never be reanalyzed.
- **FR-026**: The Gary production canary MUST be sufficient for acceptance while Austin is unavailable.
- **FR-027**: Channel-meeting discovery, meeting-chat bot behavior, Graph change-notification subscriptions/webhooks, and transcript-triggered client actions MUST remain outside this feature and be recorded as the next separately gated roadmap item.
- **FR-028**: Before Feature 035 activation, migration MUST replace legacy free-form `TitusOutput` in the version-2 discovery state with the exact fixed safe retirement sentinel and its digest, preserve the verified original digest only in separate Feature 035 provenance, omit output bodies from the new handoff, and prove with crash-boundary fixtures and a production value-safe scan that no legacy output body survives.
- **FR-029**: Feature 035 lifecycle MUST use a separate version-1 state document while the existing discovery document remains readable version 2; rollback MUST stop Feature 035 writers and allow the prior version-2 meeting worker to resume without a down-migration.
- **FR-030**: A review request MUST NOT accept a caller-selected actor; it MUST carry a versioned HMAC sender fingerprint and claim signature derived by the poller from the exact normalized allowed sender and clean-message decision fields, and the worker MUST derive `gary` or `austin` only after signature and expected-fingerprint verification.
- **FR-031**: Each private API idempotency header MUST equal lowercase SHA-256 of the exact transmitted request body; a mismatched header or a reused key with different bytes MUST fail with no mutation. Note, triage, action, and commitment keys MUST use the committed versioned length-delimited derivation.
- **FR-032**: Raw custody MUST include a non-secret key identifier. Rotation MUST retain every referenced old key until its last ciphertext expires. Any overdue ciphertext or missing active/referenced key MUST make health fail closed, stop new meeting transitions, continue deletion sweeps, and emit an actionable content-free operator signal until corrected.
- **FR-033**: The worker MUST use the authenticated Hermes Runs and Sessions APIs rather than stateless chat completion and persist only deterministic session/run/child correlation plus safe lifecycle metadata. Email eligibility requires an exact bounded `meeting-qa/v1` `QA_PASS` envelope whose meeting reference, infrastructure attempt, and source digest exactly match local state. The processor MUST validate the envelope and embedded Meeting Brief as untrusted output, parse the latest assistant result from the last verified Luna child as Meeting Brief v1, and require its canonical digest to equal the envelope brief's canonical digest.
- **FR-034**: A meeting session attempt MUST be idempotent across worker restart. The processor MUST durably record the exact create-body digest before session creation and the exact run-body digest plus an ambiguous-dispatch marker before its sole run submission for that attempt. A `409` create response is reusable only when local attempt/body state matches and authenticated readback proves the deterministic ID, title, source, and system-prompt presence. A lost create/run response, a running child that loses Titus, or any response/state ambiguity MUST become unknown/retryable, never an assumed success or a second run submission; the processor MUST poll the deterministic session until the bounded attempt deadline, then delete and retry with the next attempt without duplicate email.
- **FR-035**: After terminal QA, the worker MUST enumerate and retain the one or two verified child-session IDs, request deletion of the dedicated parent session, and verify authenticated `404 session_not_found` readback for the parent and every child before email eligibility or final block. Cleanup failure MUST enter bounded `cleanup_retryable` and then content-free operator-blocked state with no email or filing; encrypted custody remains subject to its independent seven-day deletion. Luna context MUST begin with a fixed ASCII non-sensitive prefix whose byte length is at least 512 before transcript content, and a fixture against the pinned Hermes 500-character kickoff preview MUST prove no raw transcript marker enters that log, including multibyte input. Luna MUST be instructed not to use tools or reproduce the raw transcript.
- **FR-036**: Before accepting `QA_PASS`, the processor MUST audit the dedicated parent and child sessions. Exactly one or two single-child `delegate_task` calls are allowed; every call MUST use the fixed Feature 035 goal, `role=leaf`, no batch `tasks`, and context beginning with the exact safe-prefix version. No other parent tool call is allowed. The QA envelope MUST be the latest non-empty parent assistant result and occur after the final audited delegation; its draft/review counts MUST match the observed delegation and QA sequence, and the verified parent Sol and child Luna routes MUST match. Before deletion the processor MUST re-enumerate descendants; afterward it MUST verify `session_not_found` for the parent and every previously persisted or newly discovered child. The processor MUST never call the Hermes approval endpoint or resolve a tool-approval request for this workflow.

### Key Entities

- **Meeting brief**: Strict, bounded, versioned structured summary derived from one screened transcript.
- **Raw custody object**: Encrypted VTT ciphertext plus non-sensitive cryptographic and expiry metadata.
- **Review decision**: One authenticated terminal approve/hold transition by Gary or Austin.
- **Project route**: Operator-managed exact alias mapping to an approved project-note path and Kanban board.
- **Filing request**: Immutable validated brief and route snapshot submitted to the deterministic filer.
- **Kanban work item**: Internal tracking card or action item with a stable idempotency key.
- **Recording verification**: Safe digest/size/status proof for a streamed and discarded MP4.

## Success Criteria

- **SC-001**: The Gary canary produces exactly one schema-valid Meeting Brief v1 and one fixed-recipient draft email to Gary and Austin.
- **SC-002**: Orchestration qualification proves one dedicated Titus session, one Luna draft, one Sol QA, no separate analyzer/model credential, no non-delegation parent tool call, and no email before an exact validated `QA_PASS`.
- **SC-003**: Fixture-marker scans of source, meeting-processor state, component logs, health, handoff, Docker metadata, email, notes, Kanban, and Hermes delegation kickoff logs find zero raw VTT marker or recording bytes; after terminal cleanup, authenticated Sessions API reads find no meeting parent or child session.
- **SC-004**: A seven-day clock-advance test deletes 100% of expired raw-custody ciphertext while retaining safe provenance and approved results.
- **SC-005**: Exact approve/hold fixtures achieve 100% expected decisions; every sender, body, replay, and conflict negative fixture causes zero filing mutation.
- **SC-006**: Known-project approval creates exactly one note and N action tasks; unknown-project approval creates exactly one inbox note, one triage card, and N action tasks, with no duplicates after restart.
- **SC-007**: Recording verification retains only a digest, byte count, timestamps, and safe status and performs zero audio/video analysis.
- **SC-008**: Disabling the feature stops new model, email, decision, and filing work without stopping metadata discovery, Titus chat, Teams chat, Matrix, email intake, or existing Kanban/project knowledge.
- **SC-009**: Restart and timeout fixtures prove unknown-attempt recovery, at most one Luna remediation and one Sol delta review, terminal `QA_BLOCKED` behavior, safe matching-session readback, no resubmission after ambiguous dispatch, verified parent/child session deletion, and no duplicate brief email.

## Assumptions

- The existing Gary transcript and recording remain available through Graph for
  the one-time Meeting Brief v1 canary; if content has expired, the user's local
  transcript can qualify the pipeline but cannot prove Graph re-retrieval.
- Gary and Austin are the only fixed recipients and decision makers for this
  slice, and the AgentMail provider recipient restriction remains in force.
- A dedicated `meeting-triage` Titus Kanban board is acceptable for meetings
  that cannot be matched to an approved project.
- Existing project aliases and board routes will be supplied as Phase-managed
  configuration; the release does not infer them from current note contents.
- Seven days means 168 hours from the first successful encrypted custody write.
- A single approval is sufficient; a hold must arrive before approval to stop
  filing because approved filing is intentionally irreversible/create-only.
- Existing Feature 034 free-form derived output is superseded by Meeting Brief
  v1 and will be replaced by a fixed safe sentinel during disabled-first
  migration; only the verified original digest is retained in Feature 035
  provenance, and the new handoff exposes no output body.
- Titus's active primary and delegation model configuration remains the runtime
  source of truth. Feature 035 verifies that the deployed primary resolves to
  Sol and delegation resolves to Luna but does not pin either model in its own
  Phase path or request body.
