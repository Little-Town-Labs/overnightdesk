# Feature Specification: Titus Transcript Custody

**Feature Branch**: `034-titus-transcript-custody`

**Created**: 2026-08-01

**Status**: Ready for implementation

**Input**: Continue issue 159 by processing the completed Gary pilot transcript through Titus using Spec Kit and Ringer while Austin is unavailable.

## Classification

- **Context**: Brownfield
- **Scale**: System
- **Risk**: Sensitive and production
- **Accountable lead**: Sol
- **Delegation**: Read-only Ringer review only; production mutation is never delegated

## User Scenarios & Testing

### User Story 1 - Process the pilot transcript with Titus (Priority: P1)

An operator enables transcript processing and the already discovered Gary
transcript is downloaded, screened as untrusted content, analyzed by Titus, and
represented by a bounded derived meeting record. Raw transcript bytes never
enter logs, Git, Docker metadata, durable worker state, or general Titus memory.

**Independent Test**: Run a fixture transcript through the complete local
pipeline, then run the production Gary canary and prove one processed output,
stable provenance, no duplicate processing, and no raw-content persistence.

**Acceptance Scenarios**:

1. **Given** a discovered transcript and content activation, **When** the worker runs, **Then** it retrieves only that transcript's VTT, screens it through SecurityTeam, submits only screened content to a stateless Titus request, and stores one bounded derived output.
2. **Given** the same artifact after restart, **When** the worker runs again, **Then** it performs no second transcript download or Titus analysis.
3. **Given** clean transcript content, **When** Titus completes, **Then** the derived output contains a summary, decisions, action items, and unresolved questions without provider identifiers.

---

### User Story 2 - Fail closed on unsafe or ambiguous content (Priority: P2)

Transcript content that is oversized, malformed, redirected, blocked by
SecurityTeam, or returned through an unexpected provider boundary is not sent
to Titus and is represented only by a safe terminal or retryable state.

**Independent Test**: Exercise malicious VTT, redirect, size, content-type,
SecurityTeam block, timeout, malformed response, and Titus timeout fixtures;
assert that raw content and credentials never appear in state, health, events,
handoff, or command output.

**Acceptance Scenarios**:

1. **Given** suspicious transcript text, **When** SecurityTeam requires review, **Then** the block-mode scan persists no approval payload and Titus is not called.
2. **Given** a transient provider or Titus error, **When** the next bounded cycle runs, **Then** the artifact can retry without advancing to processed or duplicating a completed result.
3. **Given** recording metadata, **When** content processing runs, **Then** no recording-content endpoint is called.

---

### User Story 3 - Activate and reverse the content slice independently (Priority: P3)

An operator can deploy the new code with content disabled, validate all
dependencies, enable transcript processing separately, and remove the content
gate without stopping metadata discovery, Titus, Teams, Matrix, or email.

**Independent Test**: Install disabled, verify the narrow runtime projection,
enable the root-owned marker, process one canary, restart, remove the marker,
and prove metadata discovery remains healthy with protected state retained.

**Acceptance Scenarios**:

1. **Given** no activation marker, **When** the service starts, **Then** SecurityTeam and Hermes credentials are absent from the projected runtime and content endpoints are never called.
2. **Given** the activation marker and valid Phase dependencies, **When** the service starts, **Then** the loader projects only the two additional credentials and fixed private origins.
3. **Given** content rollback, **When** the marker is removed, **Then** content processing stops while cursors, artifact states, and completed derived outputs remain intact.

### Edge Cases

- Speaker attribution is unavailable and Graph returns its documented 403.
- A transcript is empty, not UTF-8, contains NUL bytes, lacks `WEBVTT`, or exceeds the request cap.
- The artifact identifier or meeting identifier cannot be safely encoded into the exact Graph route.
- SecurityTeam returns `pending_approval`, content on a blocked response, changed source metadata, or an oversized response.
- Titus returns a tool-approval wait, malformed JSON, an empty result, an oversized result, or times out after an ambiguous submission.
- The worker crashes after Titus answers but before the state commit.
- Production starts from the deployed version-1 state document.

## Requirements

### Functional Requirements

- **FR-001**: The worker MUST download content only for discovered transcript artifacts belonging to the exact configured organizer slot and Graph identity.
- **FR-002**: Graph content requests MUST use the v1.0 meeting-specific `/transcripts/{id}/content` route, `Accept: text/vtt`, no redirects, bounded timeouts, and a 1,000,000-byte maximum.
- **FR-003**: Raw VTT MUST remain memory-only and MUST NOT be written to filesystem state, events, health, handoff, logs, Git, Docker metadata, Hermes sessions, or general agent memory.
- **FR-004**: Every transcript MUST pass through authenticated SecurityTeam `/scan-inbound` using high-risk `api` source and block-on-review behavior before Titus receives content.
- **FR-005**: SecurityTeam MUST provide a stateless block-on-review option that creates no approval-queue record while preserving its current queue behavior as the default.
- **FR-006**: Only a non-empty bounded `safe` SecurityTeam response MAY reach Titus; `blocked`, review-required, malformed, or unavailable responses MUST fail closed.
- **FR-007**: Titus processing MUST use the authenticated private API, a stateless request with no reusable session key, bounded input/output, deterministic instructions, and no approval endpoint.
- **FR-008**: Titus instructions MUST treat the screened transcript as data, forbid tool use and external actions, and request bounded Markdown containing summary, decisions, action items, and unresolved questions.
- **FR-009**: The worker MUST persist only provider identifiers already required for discovery, digests, safe lifecycle metadata, bounded Titus output, and timestamps; it MUST NOT persist raw or screened transcript input.
- **FR-010**: Completed transcript artifacts MUST be idempotent across cycles and restarts; retryable failures MUST never overwrite a prior completed output.
- **FR-011**: Version-1 production discovery state MUST migrate deterministically to the new schema without losing four cursors or the `1/1/0/0` artifact totals.
- **FR-012**: Health and structured events MUST expose only aggregate content counts, stage, freshness, retry count, and allowlisted error codes.
- **FR-013**: Content activation MUST be controlled by a root-owned, nonwritable host marker and remain disabled during initial installation.
- **FR-014**: When content is disabled, SecurityTeam and Hermes secrets MUST be absent from the runtime projection.
- **FR-015**: Content rollback MUST remove only the activation marker, restart only `titus-meeting-processor`, retain state, and leave metadata discovery active.
- **FR-016**: Recording metadata discovery MUST remain active, but recording content download and analysis MUST remain outside this feature.
- **FR-017**: The production canary MUST process Gary's one discovered transcript, prove restart idempotency, and avoid requiring an Austin meeting.
- **FR-018**: Before persistence or handoff, the worker MUST reject Titus output containing any exact protected organizer, meeting, transcript, tenant, or client identifier, any Graph origin/route, or an allowlisted credential-like marker.

### Key Entities

- **Transcript artifact**: Existing private discovery record extended with a content lifecycle, digests, bounded derived output, timestamps, and safe error state.
- **Security scan**: Memory-only exchange with SecurityTeam producing either screened content or a fail-closed decision.
- **Titus analysis**: Stateless authenticated request containing screened data and fixed analysis instructions; produces bounded Markdown.
- **Derived meeting record**: Private handoff representation containing only internal reference, organizer slot, provider-created timestamp, processing timestamp, output digest, and Titus output.
- **Content activation marker**: Root-owned host state that controls whether content credentials and processing are projected.

## Success Criteria

- **SC-001**: The completed Gary transcript produces exactly one processed Titus output in production.
- **SC-002**: A service restart and a subsequent cycle produce zero duplicate downloads or Titus analyses for the completed artifact.
- **SC-003**: Source, binary, state, log, health, Docker-inspect, and issue-output scans find zero raw transcript excerpts, Graph secrets, tokens, organizer IDs, meeting IDs, or artifact IDs.
- **SC-004**: Every malicious, blocked, oversized, redirected, or malformed fixture reaches zero Titus calls.
- **SC-005**: Version-1 state migrates with all four cursors and artifact counts preserved.
- **SC-006**: Content rollback completes without stopping Titus, the interactive Teams adapter, Matrix, email intake, or metadata discovery.

## Assumptions

- Gary's transcript remains available through Microsoft Graph and speaker attribution is enabled.
- The existing Titus SecurityTeam credential and authenticated Hermes API key remain active in their current Phase paths.
- SecurityTeam and Titus share only the private Docker network; no new public route is required.
- Microsoft Graph recording content is unnecessary for the transcript-to-Titus outcome and remains separately gated.
- The operator-provided local transcript is a fallback validation fixture only; production uses the already discovered Graph artifact.
