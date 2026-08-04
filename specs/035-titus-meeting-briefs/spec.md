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
custody, no tool/delegation operation, no duplicate work, and deletion after
the retention clock is advanced beyond seven days.

**Acceptance Scenarios**:

1. **Given** an eligible transcript without a current brief, **When** the worker runs, **Then** it downloads, screens, encrypts, sends one bounded private Titus request, locally validates the result, and emails exactly one bounded draft brief to Gary and Austin only after validation passes.
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
- Titus returns malformed, legacy, unsafe, or schema-invalid output.
- The bounded Titus request times out or returns an ambiguous response.
- Feature 035 is disabled and the Feature 034 content-only rollback path resumes.
- A retained or partially initialized brief record has no meeting reference.
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
- **FR-003**: Raw transcript ciphertext MUST expire seven days after first successful custody write and MUST be deleted by an idempotent sweep. Plaintext and screened text MUST never be written to meeting-processor state, handoff, telemetry, general Titus memory, project knowledge, notes, or Kanban. Titus receives screened text only during the bounded request.
- **FR-004**: Transcript input MUST continue through authenticated SecurityTeam block-on-review screening before any model call.
- **FR-005**: Meeting analysis MUST use one bounded request through the existing private Titus Hermes API and its existing provider credential. The request MUST be stateless, tool-free, and contain no meeting-session, delegation, approval, or filing operation. Feature 035 MUST NOT introduce a separate analyzer service, feature-specific credential, OAuth identity, public port, or model route.
- **FR-006**: The worker MUST locally validate the complete Titus response as Meeting Brief v1 for transcript faithfulness, decisions, action items, owners and explicit dates, external commitments, project identification, unsupported claims, proposed follow-up, and schema compliance. Invalid or unsafe output MUST become a content-free blocked state and MUST NOT send email or file work.
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
- **FR-023**: Feature 035 structured events, health, deployment evidence, and processor/filer/poller logs MUST expose correlation reference, stage, safe status, duration, counts, and allowlisted error codes only; raw text, participant names, email addresses, identifiers, tokens, paths, brief bodies, and model output MUST not enter those surfaces.
- **FR-024**: Deployment MUST be disabled-first with independent markers for brief processing and approval filing; rollback MUST preserve encrypted custody and safe state while stopping new email and filing.
- **FR-025**: The Feature 034 Gary artifact MAY be reprocessed exactly once into Meeting Brief v1 when no brief exists; normal completed briefs MUST never be reanalyzed.
- **FR-026**: The Gary production canary MUST be sufficient for acceptance while Austin is unavailable.
- **FR-027**: Channel-meeting discovery, meeting-chat bot behavior, Graph change-notification subscriptions/webhooks, and transcript-triggered client actions MUST remain outside this feature and be recorded as the next separately gated roadmap item.
- **FR-028**: Before Feature 035 activation, migration MUST replace legacy free-form `TitusOutput` in the version-2 discovery state with the exact fixed safe retirement sentinel and its digest, preserve the verified original digest only in separate Feature 035 provenance, omit output bodies from the new handoff, and prove with crash-boundary fixtures and a production value-safe scan that no legacy output body survives.
- **FR-029**: Feature 035 lifecycle MUST use a separate version-1 state document while the existing discovery document remains readable version 2; rollback MUST stop Feature 035 writers and allow the prior version-2 meeting worker to resume without a down-migration.
- **FR-030**: A review request MUST NOT accept a caller-selected actor; it MUST carry a versioned HMAC sender fingerprint and claim signature derived by the poller from the exact normalized allowed sender and clean-message decision fields, and the worker MUST derive `gary` or `austin` only after signature and expected-fingerprint verification.
- **FR-031**: Each private API idempotency header MUST equal lowercase SHA-256 of the exact transmitted request body; a mismatched header or a reused key with different bytes MUST fail with no mutation. Note, triage, action, and commitment keys MUST use the committed versioned length-delimited derivation.
- **FR-032**: Raw custody MUST include a non-secret key identifier. Rotation MUST retain every referenced old key until its last ciphertext expires. Any overdue ciphertext or missing active/referenced key MUST make health fail closed, stop new meeting transitions, continue deletion sweeps, and emit an actionable content-free operator signal until corrected.
- **FR-033**: Email eligibility MUST require a locally validated canonical Meeting Brief v1 object bound to the retained meeting reference and source digest. The worker MUST persist only safe attempt/output metadata; it MUST not persist model messages, session IDs, run IDs, child IDs, or QA envelopes.
- **FR-034**: A direct Titus attempt MUST be idempotent across worker restart through the existing brief digest and outbound provider idempotency key. A lost or malformed response MUST block the record without a second model request in the same attempt.
- **FR-035**: The worker MUST not create or delete Hermes meeting sessions, enumerate children, inspect delegation lineage, resolve approvals, or perform model-output retries. Encrypted custody remains subject to its independent seven-day deletion.
- **FR-036**: The local validator MUST be the sole acceptance gate for Titus output; prompt text MUST never be treated as a schema guarantee or authority grant.
- **FR-042**: Feature 034 content-only processing and Feature 035 meeting-brief processing MUST use explicit, independently testable Titus response contracts. The rollback path MUST continue requesting and accepting the established four-section Markdown output, while the meeting-brief path MUST request and accept only canonical Meeting Brief v1 JSON.
- **FR-043**: The worker MUST assign the deterministic `MB-` meeting reference before analysis or email eligibility, preserve any valid existing reference on restart, and backfill a missing reference on a retained incomplete record before invoking the fixed-recipient mailer.

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
- **SC-002**: Qualification proves one bounded Titus request, one locally validated Meeting Brief v1, no model/tool/approval operation, and no email before local validation.
- **SC-003**: Fixture-marker scans of source, meeting-processor state, component logs, health, handoff, Docker metadata, email, notes, and Kanban find zero raw VTT marker or recording bytes; no meeting session or child session is created.
- **SC-004**: A seven-day clock-advance test deletes 100% of expired raw-custody ciphertext while retaining safe provenance and approved results.
- **SC-005**: Exact approve/hold fixtures achieve 100% expected decisions; every sender, body, replay, and conflict negative fixture causes zero filing mutation.
- **SC-006**: Known-project approval creates exactly one note and N action tasks; unknown-project approval creates exactly one inbox note, one triage card, and N action tasks, with no duplicates after restart.
- **SC-007**: Recording verification retains only a digest, byte count, timestamps, and safe status and performs zero audio/video analysis.
- **SC-008**: Disabling the feature stops new model, email, decision, and filing work without stopping metadata discovery, Titus chat, Teams chat, Matrix, email intake, or existing Kanban/project knowledge.
- **SC-009**: Restart and timeout fixtures prove direct-request idempotency, malformed-output blocking, no model retry in one attempt, and no duplicate brief email.
- **SC-010**: Configuration-path tests prove disabled Feature 035 restores the Feature 034 Markdown contract, while enabled Feature 035 selects only the JSON contract.
- **SC-011**: Worker restart fixtures prove every email-eligible record has one stable valid meeting reference and that ambiguous Titus outcomes become terminal without a repeated request.

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
- Titus's active runtime configuration remains the source of truth. Feature 035
  uses the existing private Titus API and does not establish a new model,
  provider, session, or delegation route.

## Architecture simplification (refactor approved 2026-08-03)

The nested Sol/Luna session workflow is superseded by a single bounded Titus
analysis request. The current canary proved that prompt-only child and QA JSON
contracts are not a reliable production boundary and introduced unnecessary
session, retry, lineage, and cleanup state.

- **FR-037**: Meeting analysis MUST use one authenticated Titus
  `/v1/chat/completions` request with the existing Titus API credential. The
  request MUST be stateless, tool-free, and bounded; it MUST NOT create a
  persisted meeting session, delegate a child, or invoke the Hermes approval
  endpoint.
- **FR-038**: The Titus request MUST ask for one Meeting Brief v1 JSON object;
  local code MUST parse and validate the complete object with the existing
  strict validator. Prompt wording is advisory; only local validation makes a
  result eligible for email.
- **FR-039**: Feature 035 MUST remove the Sol/Luna QA envelope, child-session
  lineage audit, deterministic session IDs, run dispatch state, session
  deletion, and orchestration retry state. A Titus response that fails local
  validation MUST become a content-free blocked state with no email or filing.
- **FR-040**: The worker MUST persist only the bounded attempt status, brief
  digest, safe error code, and existing custody/recording metadata. A successful
  brief MUST transition directly to `email_pending`; restart MUST not re-run a
  record with a stored brief digest or provider idempotency result.
- **FR-041**: Existing encrypted seven-day custody, SecurityTeam screening,
  fixed-recipient email, human approval, deterministic filing, recording
  stream/discard, disabled-first activation, and rollback boundaries remain
  unchanged.
