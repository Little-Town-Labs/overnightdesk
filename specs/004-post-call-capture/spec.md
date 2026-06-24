# Feature Specification: Post-Call Capture

**Feature Branch**: `004-post-call-capture`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Post-call capture for Mitchel prospecting: after a call, Trevor captures structured outcome data, asks only for missing required fields, writes a durable trevor.interactions record, updates prospect last-contact/last-outcome/next-action fields, creates an Agiled note when a contact or deal is linked, and never sends outbound follow-up automatically."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture A Completed Call (Priority: P1)

As Mitchel, I need to tell Trevor what happened after a prospecting call so the relationship history and next action are recorded without me manually updating multiple systems.

**Why this priority**: The daily queue and pre-call brief only become an operating loop when calls can be closed out into durable history and the next step.

**Independent Test**: Seed a prospect and open call task, submit a structured post-call outcome, and verify the response confirms the interaction record, prospect updates, task closure, and no outbound message.

**Acceptance Scenarios**:

1. **Given** an active prospect and open call task, **When** Mitchel reports the call outcome, summary, and next action, **Then** Trevor records the call and marks the task complete.
2. **Given** the call resulted in a follow-up due later, **When** capture completes, **Then** the prospect's last-contact, last-outcome, next-action type, and next-action due date reflect the new state.
3. **Given** capture completes successfully, **When** Trevor responds, **Then** the response names what was recorded and confirms no outbound follow-up was sent.

---

### User Story 2 - Ask Only For Missing Required Fields (Priority: P2)

As Mitchel, I need Trevor to identify only the missing information needed to save a call, instead of making me fill out a full form every time.

**Why this priority**: Post-call capture must be fast enough for real sales work. Asking for already-known data would make the workflow feel heavier than manual notes.

**Independent Test**: Submit partial call outcomes and verify Trevor returns a bounded list of missing fields without writing partial records.

**Acceptance Scenarios**:

1. **Given** a capture request without a prospect or task reference, **When** Trevor cannot identify the call target, **Then** Trevor asks only for the missing target information.
2. **Given** a capture request without an outcome, **When** Trevor has enough prospect context, **Then** Trevor asks only for the missing outcome.
3. **Given** a capture request has no required missing fields, **When** Trevor processes it, **Then** Trevor writes the durable records without extra confirmation prompts.

---

### User Story 3 - Mirror The Call Into Agiled When Linked (Priority: P3)

As the operator, I need call outcomes to appear in Agiled when a prospect is linked to an Agiled contact or deal, while preserving a clear local record if Agiled is unavailable.

**Why this priority**: Agiled remains the commercial CRM, but Trevor Postgres must remain reliable even when CRM context is missing or temporarily unavailable.

**Independent Test**: Capture calls for linked and unlinked prospects, verify linked captures report an Agiled note result, and verify unlinked captures clearly state that no Agiled note was attempted.

**Acceptance Scenarios**:

1. **Given** a prospect has an Agiled contact or deal link, **When** a call is captured, **Then** Trevor attempts to create a CRM note and reports the result.
2. **Given** a prospect has no Agiled link, **When** a call is captured, **Then** Trevor records the local interaction and reports that Agiled note creation was skipped.
3. **Given** Agiled note creation fails after the local record is saved, **When** Trevor responds, **Then** the response identifies the local record and the CRM sync failure without retrying indefinitely.

### Edge Cases

- The referenced call task does not exist or is not open.
- The referenced prospect does not exist.
- A prospect is marked do-not-contact and the outcome is not an opt-out or administrative correction.
- The outcome implies follow-up but no next-action date is provided.
- The outcome is "do not contact" and must suppress future call readiness.
- The operator supplies a long free-text summary that must be bounded before storage or display.
- Agiled is linked but unavailable or returns an error.
- Capture is submitted twice for the same task.
- Capture succeeds locally but CRM note creation fails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST capture a post-call outcome for a selected prospect or call task.
- **FR-002**: System MUST support the outcomes no answer, left voicemail, interested, quoted, follow up later, not interested, sold, wrong number, and do not contact.
- **FR-003**: System MUST ask only for missing required fields before writing records.
- **FR-004**: System MUST avoid writing partial call records when required fields are missing.
- **FR-005**: System MUST write one durable interaction record for a valid captured call.
- **FR-006**: System MUST update the prospect's last-contact, last-outcome, next-action type, and next-action due date when those values are provided or implied by the outcome.
- **FR-007**: System MUST close or update the associated call task after successful capture.
- **FR-008**: System MUST mark do-not-contact outcomes so the prospect is suppressed from future call-ready recommendations.
- **FR-009**: System MUST attempt an Agiled note only when the prospect has a linked Agiled contact or deal.
- **FR-010**: System MUST report local write status and Agiled note status separately.
- **FR-011**: System MUST NOT send email, Telegram, SMS, social messages, or any other outbound follow-up.
- **FR-012**: System MUST NOT create a follow-up draft unless the user explicitly asks for a separate follow-up drafting workflow.
- **FR-013**: System MUST keep secrets, full CRM payloads, and unnecessary prospect details out of logs.
- **FR-014**: System MUST prevent accidental duplicate capture for the same call task.

### Key Entities *(include if feature involves data)*

- **Post-Call Capture**: A user-submitted outcome, summary, next action, and optional CRM note intent for a completed prospecting call.
- **Prospect**: The buyer profile whose relationship state is updated after the call.
- **Call Task**: The queue item that may anchor the capture and should be completed or updated once the call is recorded.
- **Interaction**: The durable chronological record of the call outcome.
- **Agiled Note Result**: The outcome of attempting to mirror the call summary into Agiled when linked.
- **Missing Field Prompt**: A bounded response listing only the fields required before capture can proceed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seeded open call task can be captured and completed in under 10 seconds during operator validation.
- **SC-002**: 100% of valid captures create exactly one local interaction record.
- **SC-003**: 100% of valid captures update prospect relationship state according to the submitted outcome and next action.
- **SC-004**: Partial capture requests return a missing-field prompt and create zero new records.
- **SC-005**: Duplicate submissions for the same completed task do not create duplicate interactions.
- **SC-006**: Verification confirms capture sends zero outbound messages and creates zero send-capable follow-up actions.
- **SC-007**: Agiled note status is visible in every capture response as created, skipped, or failed.

## Assumptions

- Feature 1, Feature 2, and Feature 3 are deployed on `aegis-prod`.
- Mitchel remains the human caller and final decision-maker.
- Trevor may prepare structured records and CRM notes, but may not send follow-up messages in this feature.
- Agiled note creation is useful when linked, but local capture must still succeed when Agiled is unavailable.
- Follow-up drafting remains Feature 5 and should be triggered only after capture is reliable.
