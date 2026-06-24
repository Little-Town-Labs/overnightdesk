# Feature Specification: Follow-Up Drafting

**Feature Branch**: `005-follow-up-drafting`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Follow-up drafting for Mitchel prospecting: generate channel-specific follow-up drafts from captured call outcomes and buyer profiles; store drafts in trevor.followup_drafts for explicit approval before any external sending; support email, Telegram, SMS-copy, and social-copy drafts; track draft status; never send directly; allow approved or manually sent follow-up to be logged back to trevor.interactions in a later explicit step."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draft From A Captured Call (Priority: P1)

As Mitchel, I need Trevor to draft a follow-up from a recently captured call so I can quickly review useful wording without giving Trevor permission to send it.

**Why this priority**: Feature 4 records call outcomes. The next useful step is turning those outcomes into approval-controlled copy that Mitchel can review.

**Independent Test**: Seed a prospect and captured interaction, request a follow-up draft by interaction ID and channel, and verify one draft is stored with status `draft` and no outbound send.

**Acceptance Scenarios**:

1. **Given** a captured phone interaction for a prospect, **When** Mitchel asks for an email follow-up draft, **Then** Trevor stores a draft linked to the prospect and interaction.
2. **Given** the interaction summary includes a quote request or next step, **When** the draft is generated, **Then** the draft body references the call context and buyer profile without inventing details.
3. **Given** the draft is stored, **When** Trevor responds, **Then** the response includes draft ID, channel, status, subject when applicable, body, and `outbound_sent=false`.

---

### User Story 2 - Support Copy-Ready Channels (Priority: P2)

As Mitchel, I need draft wording for email, Telegram, SMS-copy, LinkedIn, and Instagram so I can choose the channel manually.

**Why this priority**: Sales follow-up happens across multiple channels, but send-capable integrations should remain deferred until approval and audit behavior is proven.

**Independent Test**: Request drafts for each supported channel and verify channel-specific body shape, status, and stored row fields.

**Acceptance Scenarios**:

1. **Given** a captured interaction, **When** Mitchel requests an email draft, **Then** the draft includes a subject and body.
2. **Given** a captured interaction, **When** Mitchel requests Telegram, SMS-copy, LinkedIn, or Instagram, **Then** the draft includes copy-ready body text and no send metadata.
3. **Given** an unsupported channel is requested, **When** Trevor validates the request, **Then** Trevor rejects it without storing a draft.

---

### User Story 3 - Manage Draft Approval State (Priority: P3)

As the operator, I need follow-up drafts to have explicit approval and discard states so future send-capable integrations cannot treat unreviewed drafts as approved.

**Why this priority**: Approval state is the safety boundary between copy generation and future outbound integrations.

**Independent Test**: Seed a draft, mark it approved or discarded, and verify state transitions are explicit and do not send or log outbound messages.

**Acceptance Scenarios**:

1. **Given** a stored draft, **When** Mitchel approves it, **Then** the draft status changes to `approved` with approval metadata and no outbound send.
2. **Given** a stored draft, **When** Mitchel discards it, **Then** the draft status changes to `discarded` and cannot be approved afterward.
3. **Given** a draft is approved, **When** the workflow completes, **Then** no external message is sent by this feature.

### Edge Cases

- The interaction ID does not exist.
- The interaction is not linked to a prospect.
- The prospect is marked do-not-contact.
- The requested channel is unsupported.
- A draft already exists for the same interaction and channel.
- The captured call summary is empty or too vague.
- Prospect notes are long and must be summarized, not dumped.
- Approval is requested for a missing or discarded draft.
- Send metadata is supplied before a future send-capable workflow exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a follow-up draft from a selected captured interaction.
- **FR-002**: System MUST support channels `email`, `telegram`, `sms`, `linkedin`, and `instagram`.
- **FR-003**: System MUST store each draft in `trevor.followup_drafts` with status `draft`.
- **FR-004**: System MUST link the draft to the prospect and interaction when available.
- **FR-005**: System MUST include a subject for email drafts and no subject requirement for copy-only channels.
- **FR-006**: System MUST use captured call summary, buyer profile, and known next action context without inventing facts.
- **FR-007**: System MUST warn and avoid call-to-action language when the prospect is do-not-contact.
- **FR-008**: System MUST avoid duplicate active drafts for the same interaction and channel unless the user explicitly requests regeneration.
- **FR-009**: System MUST support marking a draft approved or discarded.
- **FR-010**: System MUST record approval metadata when a draft is approved.
- **FR-011**: System MUST NOT send email, Telegram, SMS, LinkedIn, Instagram, or any other outbound message.
- **FR-012**: System MUST NOT mark a draft sent or create send metadata in this feature.
- **FR-013**: System MUST keep secrets, full CRM payloads, and unnecessary prospect details out of logs.
- **FR-014**: System MUST return a bounded response containing draft ID, channel, status, subject, body, warnings, and `outbound_sent=false`.

### Key Entities *(include if feature involves data)*

- **Follow-Up Draft**: A reviewable message draft linked to a prospect and optional interaction. Tracks channel, subject, body, status, approval metadata, and send metadata reserved for future workflows.
- **Interaction**: The captured call outcome that drives the draft.
- **Prospect**: The buyer profile used for context and compliance state.
- **Draft Approval**: The explicit state transition from draft to approved or discarded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seeded captured interaction can produce a stored draft in under 10 seconds during operator validation.
- **SC-002**: 100% of valid draft requests create or return exactly one active draft for the interaction/channel pair.
- **SC-003**: Draft responses for all supported channels include `outbound_sent=false`.
- **SC-004**: Unsupported channels create zero draft rows.
- **SC-005**: Draft approval and discard transitions update status without sending external messages.
- **SC-006**: Verification confirms no new `trevor.interactions` rows are created by draft generation.

## Assumptions

- Feature 1 through Feature 4 are deployed on `aegis-prod`.
- Mitchel remains the human reviewer and sender for copy-ready follow-up.
- This feature stores drafts and approval state only. External sending and post-send interaction logging remain future explicit work.
- The first implementation uses deterministic draft templates based on known Trevor data rather than model-generated free text.
