# Feature Specification: Follow-Up Sent Logging

**Feature Branch**: `007-follow-up-sent-logging`

**Created**: 2026-06-24

**Status**: Implemented — merged in PR #14 on 2026-06-24

**Input**: User description: "Follow-up sent logging for Mitchel prospecting: record approved or manually sent follow-up messages back to trevor.interactions without sending outbound messages; support lookup of draft follow-ups awaiting send confirmation; mark drafts as manual_sent or sent only when explicitly confirmed; capture sent channel, sent timestamp, operator, and optional external message reference; preserve draft-only safety and do-not-contact boundaries."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log A Manually Sent Follow-Up (Priority: P1)

As Mitchel, I need Trevor to record that I manually sent an approved follow-up so the prospect history reflects real outreach without Trevor sending anything for me.

**Why this priority**: Feature 5 can approve drafts, but the operating loop still loses the final human action unless a sent follow-up becomes a durable interaction.

**Independent Test**: Seed an approved follow-up draft, confirm it as manually sent, and verify one `trevor.interactions` row is created, the draft status changes to `manual_sent`, and the response reports `outbound_sent=false`.

**Acceptance Scenarios**:

1. **Given** an approved follow-up draft for a prospect, **When** Mitchel confirms he manually sent it, **Then** Trevor records a follow-up interaction linked to the prospect and marks the draft `manual_sent`.
2. **Given** the manual send includes a sent timestamp, operator name, and optional external reference, **When** the confirmation is recorded, **Then** Trevor preserves those details in the draft or interaction metadata without exposing secrets.
3. **Given** the confirmation completes, **When** Trevor responds, **Then** the response includes draft ID, interaction ID, final draft status, channel, sent timestamp, and `outbound_sent=false`.

---

### User Story 2 - Review Drafts Awaiting Send Confirmation (Priority: P2)

As Mitchel, I need Trevor to list approved follow-up drafts that still need send confirmation so I can close the loop on pending follow-up work.

**Why this priority**: The cadence digest can surface drafts awaiting approval, but after approval the operator still needs a focused queue for items that are approved but not yet logged as sent.

**Independent Test**: Seed draft, approved, discarded, manual_sent, and sent follow-up rows, request the send-confirmation queue, and verify only approved unsent drafts appear with bounded details.

**Acceptance Scenarios**:

1. **Given** approved drafts exist, **When** Mitchel requests follow-ups awaiting send confirmation, **Then** Trevor lists only approved drafts that do not already have sent or manual-sent status.
2. **Given** the list includes a prospect marked do-not-contact, **When** the queue is generated, **Then** Trevor flags the item for review and does not present it as safe to send.
3. **Given** draft bodies are long, **When** the queue is returned, **Then** Trevor summarizes the draft and includes identifiers needed to request full detail elsewhere.

---

### User Story 3 - Guard Confirmation Boundaries (Priority: P3)

As the operator, I need send confirmation rules to prevent accidental outreach records for unapproved, discarded, or do-not-contact drafts.

**Why this priority**: Sent logging becomes the audit boundary for future send-capable integrations, so invalid state transitions must be rejected before direct sends are considered.

**Independent Test**: Attempt to confirm unapproved, discarded, already sent, and do-not-contact drafts and verify invalid confirmations create no new interaction rows unless an explicit override path is supplied for do-not-contact audit logging.

**Acceptance Scenarios**:

1. **Given** a draft is still in `draft` status, **When** Mitchel tries to mark it sent, **Then** Trevor rejects the confirmation and creates no interaction.
2. **Given** a draft is discarded or already sent, **When** Mitchel tries to confirm it again, **Then** Trevor rejects the duplicate or invalid confirmation without changing records.
3. **Given** a prospect is do-not-contact, **When** a send confirmation is attempted, **Then** Trevor blocks the action unless Mitchel explicitly records it as an audit-only historical note with a reason.

### Edge Cases

- The draft ID does not exist.
- The draft is not linked to a prospect.
- The draft is not approved.
- The draft is already `manual_sent`, `sent`, or `discarded`.
- The prospect is marked do-not-contact.
- The sent timestamp is missing, malformed, or in the future.
- The channel in the confirmation differs from the draft channel.
- The optional external reference contains secrets or excessive text.
- A retry occurs after a successful confirmation.
- The operator wants to log a manually sent follow-up that did not originate from a stored draft.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an approved follow-up draft to be explicitly confirmed as manually sent.
- **FR-002**: System MUST create a `trevor.interactions` record for a confirmed manually sent follow-up.
- **FR-003**: System MUST update the related follow-up draft status to `manual_sent` after the interaction is recorded.
- **FR-004**: System MUST capture sent channel, sent timestamp, confirming operator, and optional external message reference.
- **FR-005**: System MUST return `outbound_sent=false` for manual sent logging because Trevor did not send the message.
- **FR-006**: System MUST list approved follow-up drafts awaiting send confirmation with bounded prospect and draft details.
- **FR-007**: System MUST exclude discarded, already sent, manual-sent, and unapproved drafts from the send-confirmation queue.
- **FR-008**: System MUST reject send confirmation for unapproved, discarded, missing, or already completed drafts without writing interactions.
- **FR-009**: System MUST block do-not-contact confirmations unless an explicit audit-only override with a reason is provided.
- **FR-010**: System MUST make confirmation idempotent enough that a retry after success does not create duplicate sent interactions.
- **FR-011**: System MUST NOT send email, Telegram, SMS, LinkedIn, Instagram, or any outbound message.
- **FR-012**: System MUST keep secrets, full CRM payloads, database URLs, and unnecessary prospect details out of logs and list responses.
- **FR-013**: System SHOULD allow manual follow-up logging without a prior stored draft only as a separate explicit path, with the same no-send and do-not-contact rules.

### Key Entities *(include if feature involves data)*

- **Follow-Up Draft**: A reviewable message draft with a lifecycle from `draft` to `approved`, `discarded`, `manual_sent`, or future `sent`.
- **Sent Follow-Up Interaction**: A durable interaction row representing a human-confirmed follow-up message that already happened outside Trevor.
- **Send Confirmation**: The explicit operator action that links an approved draft to a sent interaction and closes pending follow-up work.
- **Send Confirmation Queue Item**: A bounded summary of an approved draft that still needs human send confirmation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seeded approved draft can be confirmed as manually sent in under 10 seconds during operator validation.
- **SC-002**: 100% of successful manual sent confirmations create exactly one new interaction and one final draft status transition.
- **SC-003**: Invalid confirmations for unapproved, discarded, missing, or already completed drafts create zero interaction rows.
- **SC-004**: The send-confirmation queue includes approved unsent drafts and excludes all other draft statuses up to the configured limit.
- **SC-005**: Every confirmation response reports `outbound_sent=false`.
- **SC-006**: Do-not-contact confirmation attempts are blocked unless recorded through the explicit audit-only override path.

## Assumptions

- Feature 1 through Feature 6 are merged and deployed on `aegis-prod/hermes-mitchel`.
- The first slice logs human/manual sending only; direct channel sends remain deferred.
- `trevor.followup_drafts` already has reserved sent-related fields from Feature 1 and status values used by Feature 5.
- Existing post-call capture and follow-up drafting tools remain the source for prospect and draft context.
- Agiled note creation for sent follow-up logging can be deferred unless the existing capture path already provides it safely.
