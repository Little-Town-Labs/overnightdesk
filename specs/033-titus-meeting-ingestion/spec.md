# Feature Specification: Titus Meeting Artifact Discovery

**Feature Branch**: `033-titus-meeting-ingestion`

**Created**: 2026-08-01

**Status**: Draft

**Input**: GitHub issue #159: implement the smallest production-safe Microsoft Teams meeting transcript and recording discovery pipeline for the two approved Titus pilot organizers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover Approved Meeting Artifacts (Priority: P1)

As a Titus operator, I want transcripts and recordings from scheduled non-channel meetings organized by either approved pilot user to be discovered automatically so the business can confirm that meeting artifacts are available without manually searching Microsoft Teams.

**Why this priority**: Reliable, bounded discovery is the minimum useful capability and has already been proven against a real pilot meeting.

**Independent Test**: Run one discovery cycle for an approved organizer with a completed recorded and transcribed meeting, then verify that one transcript reference and one recording reference are discovered without retrieving either artifact's content.

**Acceptance Scenarios**:

1. **Given** an approved organizer has a completed scheduled non-channel meeting with transcription and recording, **When** discovery runs, **Then** both artifact references are found and the final synchronization position is retained.
2. **Given** an approved organizer has no qualifying artifacts, **When** discovery runs, **Then** the cycle succeeds with zero discoveries and retains a valid synchronization position.
3. **Given** a previously discovered artifact appears again during a later synchronization, **When** discovery runs, **Then** it is recognized as already known rather than emitted as a duplicate.

---

### User Story 2 - Operate and Recover the Worker Safely (Priority: P2)

As an Aegis operator, I want meeting discovery to expose sanitized health and progress signals and to resume from durable state after restart so that failures can be diagnosed without exposing meeting or credential data.

**Why this priority**: Production operators need proof that both organizer streams are current and must be able to restart or disable the worker without losing synchronization state.

**Independent Test**: Complete a discovery cycle, restart the component, run another cycle, and verify that it resumes from the retained positions with zero duplicate discoveries and only sanitized operational output.

**Acceptance Scenarios**:

1. **Given** completed synchronization state exists, **When** the worker restarts, **Then** it resumes independently for each organizer and artifact type.
2. **Given** a temporary identity-provider, meeting-provider, throttling, or network failure, **When** a cycle runs, **Then** the worker retries within a fixed bound, preserves the last good state, and reports only a sanitized error classification.
3. **Given** the meeting integration is disabled, **When** Titus and its interactive Teams bot continue operating, **Then** neither is disabled or reconfigured by the meeting worker state.

---

### User Story 3 - Enforce the Metadata-Only Pilot Boundary (Priority: P3)

As the accountable owner, I want the pilot to discover only artifact metadata until retention and billing decisions are approved so that no raw transcript or recording is copied into an uncontrolled destination.

**Why this priority**: Meeting content can contain confidential business data and may incur metered provider usage; discovery must not silently become content ingestion.

**Independent Test**: Run normal, retry, restart, and error-path discovery tests and verify that no content endpoint is called and no sensitive identifier or content appears in logs, source, container metadata, issue output, or general agent memory.

**Acceptance Scenarios**:

1. **Given** a discovered transcript or recording includes a content reference, **When** the pilot worker processes it, **Then** the reference is handled as metadata and content is not requested.
2. **Given** no approved retention and billing decision exists, **When** an operator enables discovery, **Then** there is no configuration option that can enable content download.
3. **Given** interactive Teams bot configuration exists, **When** meeting discovery is configured, **Then** the two identities and secret scopes remain separate.

### Edge Cases

- One organizer is authorized but has no meetings or artifacts in the pilot window.
- One organizer succeeds while another returns an authorization, tenant-policy, throttling, payment, or service error.
- A synchronization round spans multiple pages or returns older artifacts again after unrelated meeting changes.
- The provider returns a continuation link before the final synchronization link.
- A saved synchronization link is malformed, belongs to another organizer or artifact type, or is rejected by the provider.
- The process exits after artifact references are observed but before the final synchronization position is durably recorded.
- Multiple process instances attempt to update the same organizer stream concurrently.
- Configuration contains duplicate, malformed, empty, or unexpected organizer identifiers.
- Logs or diagnostic payloads contain a field that could reveal a token, organizer identifier, meeting identifier, join URL, artifact identifier, content URL, or raw content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST discover transcript and recording references separately for each explicitly approved pilot organizer.
- **FR-002**: The system MUST reject missing, malformed, duplicate, or unapproved organizer configuration before any meeting-provider request is made.
- **FR-003**: The system MUST use a meeting-processor identity and secret boundary that is separate from the interactive Teams bot identity.
- **FR-004**: The system MUST complete every continuation page in a synchronization round and retain only the final opaque synchronization position for that organizer and artifact type.
- **FR-005**: The system MUST retain four independent synchronization streams: transcript and recording state for each of the two approved organizers.
- **FR-006**: The system MUST recognize already-known artifacts by their provider artifact identity and MUST NOT emit duplicate discoveries across retries, restarts, pagination, or repeated provider results.
- **FR-007**: The system MUST persist synchronization and deduplication state before reporting a discovery cycle as successful.
- **FR-008**: The system MUST preserve the last known-good state when a cycle fails or returns an incomplete synchronization round.
- **FR-009**: The system MUST apply bounded retries and delay for retryable identity-provider, meeting-provider, throttling, and network failures while failing closed for authorization, tenant-policy, payment, or invalid-state errors.
- **FR-010**: The system MUST report enabled state, token health classification, last successful synchronization time, per-stream status, discovered counts, retry exhaustion, and sanitized error classifications without exposing sensitive values.
- **FR-011**: The system MUST NOT request, store, log, summarize, or hand off transcript or recording content in this release.
- **FR-012**: The system MUST NOT emit tokens, credentials, organizer identifiers, meeting identifiers, join URLs, artifact identifiers, content URLs, synchronization URLs, transcript text, or recording bytes to logs, source control, container metadata, issue output, or general agent memory.
- **FR-013**: The system MUST expose no public webhook route, create no change-notification subscription, and require no subscription-renewal process.
- **FR-014**: The system MUST exclude channel meetings and unrestricted tenant-wide discovery from the pilot.
- **FR-015**: The system MUST be independently disableable without disabling Titus, changing the interactive Teams bot, deleting retained state, or removing rollback evidence.
- **FR-016**: The system MUST keep the Phase service credential outside the meeting worker runtime and MUST receive only the strictly validated meeting configuration it requires.
- **FR-017**: The system MUST reject synchronization links that are not secure meeting-provider URLs or that do not match the expected tenant-independent host, organizer, artifact type, and synchronization route.
- **FR-018**: The system MUST prevent concurrent cycles from advancing the same synchronization stream at the same time.
- **FR-019**: The system MUST support a metadata-only handoff record that identifies the artifact type, discovery time, provenance class, and stable internal deduplication status without exposing protected provider identifiers.
- **FR-020**: The system MUST provide deterministic qualification and rollback procedures for operators before production activation.
- **FR-021**: The system MUST bound the complete four-stream cycle, retained state document, and atomic state serialization with sufficient headroom under the 256 MiB runtime memory limit, failing closed without changing prior state when the bound is exceeded.

### Key Entities

- **Approved Organizer**: One of the two pilot users authorized by the meeting provider and the Phase allowlist; represented operationally without exposing its provider identifier.
- **Artifact Stream**: One organizer-and-artifact-type synchronization boundary with independent health, last-success time, and opaque synchronization position.
- **Artifact Reference**: Metadata indicating that a transcript or recording exists, including a protected provider identity used only for idempotency and provenance.
- **Discovery Record**: A durable metadata-only record that an artifact reference was observed and whether it has already been emitted.
- **Synchronization Position**: The final opaque provider link that resumes one artifact stream after a complete round.
- **Worker Health**: Sanitized operational state covering enablement, token acquisition, per-stream progress, retries, and last error classification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Both approved organizers complete transcript and recording discovery cycles successfully; an organizer with no artifacts completes with zero results rather than an error.
- **SC-002**: A completed scheduled non-channel pilot meeting is represented by exactly one transcript discovery and exactly one recording discovery without retrieving content.
- **SC-003**: After a restart and a repeated provider result, the number of duplicate discovery records remains zero.
- **SC-004**: Every successful synchronization round retains a final resumable position for each of the four organizer-and-artifact streams.
- **SC-005**: Retryable failures stop after the configured bound, preserve the previous successful position, and become visible to operators within one polling interval.
- **SC-006**: Security verification finds zero credentials, tokens, protected identifiers, provider URLs, transcript text, or recording bytes in source control, logs, container metadata, issue output, and general agent memory.
- **SC-007**: Disabling and re-enabling meeting discovery preserves all synchronization state and leaves Titus and the interactive Teams bot healthy.
- **SC-008**: The pilot introduces zero public ingress routes, provider subscriptions, renewal jobs, content downloads, channel-meeting support, or tenant-global authorization grants.
- **SC-009**: A four-stream cycle that would exceed the reviewed cycle or retained-state envelope fails with the prior state byte-for-byte unchanged, while the maximum accepted envelope remains below the 256 MiB runtime limit during atomic persistence.

## Assumptions

- The two pilot organizer identifiers and meeting-processor credentials are stored only in the canonical Phase meeting namespace.
- Provider application permissions, tenant transcript access, speaker attribution, and per-organizer application access policies remain approved and operational.
- The pilot covers scheduled non-channel meetings only.
- Artifact discovery is metadata-only until separate retention, controlled-destination, deletion, operator-access, and billing decisions are approved and recorded.
- The provider's synchronization positions are opaque and may return older artifacts again; deduplication is therefore required even when cursors are valid.
- The first organizer has one qualified transcript and one qualified recording; the second organizer currently has no pilot artifacts.
- Production activation and deployment remain separate owner-approved actions after source review and qualification.
