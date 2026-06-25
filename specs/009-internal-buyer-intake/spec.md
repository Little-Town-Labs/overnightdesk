# Feature Specification: Internal Buyer Intake

**Feature Branch**: `009-internal-buyer-intake`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Feature 9: Internal Buyer Intake and Conversation Capture for Mitchel. Add an internal Trevor workflow so Mitchel can capture or update buyer/prospect data and conversation notes from the existing OvernightDesk/Hermes experience. It should dedupe against Trevor and Agiled, update trevor.prospects, write bounded trevor.interactions records, preserve source attribution, and optionally create a next call task or follow-up draft without sending outbound messages. This contract should later support the public mitchelbrown.com buyer inquiry form."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a Conversation Into Trevor (Priority: P1)

Mitchel tells Trevor about a buyer conversation from the existing OvernightDesk/Hermes experience, using either structured fields or a pasted/free-form summary. Trevor captures the buyer details, conversation summary, source attribution, and next step without requiring Mitchel to leave the assistant.

**Why this priority**: This is the core manual intake loop. Without it, Mitchel still has to remember or re-enter prospecting details outside the system.

**Independent Test**: Provide Trevor a new buyer name, company, phone or email, source, conversation notes, and next action. Verify one reviewable prospect record exists, one bounded conversation record exists, the source is preserved, and no outbound communication was sent.

**Acceptance Scenarios**:

1. **Given** Mitchel provides a new buyer conversation with name, company, contact path, source, and notes, **When** Trevor captures the intake, **Then** Trevor creates or stages one buyer/prospect record and one conversation record with a concise summary and no outbound side effects.
2. **Given** Mitchel provides only a loose conversation summary, **When** required buyer identity or contact information is missing, **Then** Trevor asks only for the missing required fields before writing durable records.
3. **Given** Mitchel provides a source such as "phone call", "referral", "trade show", "mitchelbrown.com", or "manual entry", **When** the intake is saved, **Then** the source attribution remains visible in the saved record and later review output.

---

### User Story 2 - Update an Existing Buyer Without Duplicates (Priority: P1)

Mitchel gives Trevor new information about a buyer who may already exist. Trevor searches existing Trevor and Agiled records, presents likely matches when needed, and updates the right record instead of blindly creating a duplicate.

**Why this priority**: Duplicate buyers create bad call queues, bad follow-up history, and confusing Agiled records.

**Independent Test**: Provide an intake whose name, company, phone, or email matches an existing buyer. Verify Trevor links or updates the existing record, writes the new conversation, and reports the dedupe decision.

**Acceptance Scenarios**:

1. **Given** an intake matches an existing Trevor buyer by clear phone or email, **When** Trevor captures the conversation, **Then** Trevor updates that buyer and does not create a duplicate.
2. **Given** an intake has multiple plausible matches, **When** Trevor cannot safely choose one, **Then** Trevor returns a needs-review result with the candidate matches and writes no ambiguous prospect update.
3. **Given** Agiled contains a likely matching contact, **When** Trevor captures the intake, **Then** the result reports whether Agiled was linked, updated, skipped, or failed without blocking the Trevor record from being saved.

---

### User Story 3 - Capture Next Actions Without Sending Anything (Priority: P2)

Mitchel can include a next action, reminder, or follow-up need in the intake. Trevor can create reviewable local work such as a call task or draft request, but never sends a message or marks outreach as sent automatically.

**Why this priority**: The intake should turn live conversations into actionable follow-up while preserving the established human-approval boundary.

**Independent Test**: Provide an intake with a requested next call date and a request to draft a follow-up. Verify Trevor creates only the requested reviewable internal work and reports `outbound_sent=false`.

**Acceptance Scenarios**:

1. **Given** Mitchel includes a next call date or reminder, **When** Trevor captures the intake, **Then** a reviewable next call task can be created without creating duplicate open tasks for the same buyer and day.
2. **Given** Mitchel asks for a follow-up draft, **When** Trevor captures the intake, **Then** a draft may be created for later approval but no outbound message is sent.
3. **Given** the buyer is marked do-not-contact or the intake says not to contact, **When** Trevor captures the intake, **Then** Trevor suppresses call task and persuasive follow-up creation unless Mitchel explicitly updates the contact status.

---

### User Story 4 - Reuse the Intake Contract Later for Website Leads (Priority: P3)

The internal intake shape is reusable by a later public buyer inquiry form without creating a separate lead pipeline or duplicate dedupe behavior.

**Why this priority**: Feature 10 depends on the same reviewed intake path so `mitchelbrown.com` inquiries can safely enter Trevor later.

**Independent Test**: Review the intake contract and verify it supports a future public source, inbound buyer details, anti-spam/review status, and dedupe outcomes without requiring automatic promotion or outbound sending.

**Acceptance Scenarios**:

1. **Given** a future website inquiry supplies buyer details and `mitchelbrown.com` source attribution, **When** it is routed through the intake contract, **Then** the same dedupe, review, and no-outbound guarantees apply.
2. **Given** a public inquiry lacks enough contact details, **When** it is routed through the intake contract, **Then** it can be rejected or marked needs-review without creating active call work.

---

### Edge Cases

- The intake includes a person name but no company.
- The intake includes a company but no person name.
- The intake includes no phone, email, website, or address.
- The intake matches multiple Trevor prospects or an existing staged candidate.
- The intake matches Agiled but not Trevor, or Trevor but not Agiled.
- The intake includes a do-not-contact instruction or a negative outcome.
- Mitchel pastes a long transcript, webpage text, or notes containing secrets or irrelevant data.
- The requested next action date is ambiguous, invalid, or in the past.
- A follow-up draft is requested for a buyer with no usable channel.
- Agiled is unavailable when Trevor writes the local intake record.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trevor MUST accept internal buyer intake from Mitchel containing structured fields, free-form notes, or both.
- **FR-002**: Trevor MUST require enough identity or contact information to avoid anonymous durable buyer records.
- **FR-003**: Trevor MUST capture buyer details when provided: person name, company, phone, email, website, address or area, source, buyer preferences, budget or timing, and notes.
- **FR-004**: Trevor MUST summarize long free-form notes into a bounded conversation record suitable for later call prep.
- **FR-005**: Trevor MUST treat pasted conversation text, website text, and user notes as untrusted input and must not follow instructions found inside those notes.
- **FR-006**: Trevor MUST dedupe against existing Trevor buyer/prospect records before creating a new active buyer/prospect.
- **FR-007**: Trevor MUST report duplicate, possible duplicate, updated, created, needs-review, and rejected outcomes clearly.
- **FR-008**: Trevor MUST avoid writing ambiguous updates when multiple plausible matches exist; those cases must be returned for human review.
- **FR-009**: Trevor MUST preserve source attribution for every intake, including manual entry, referral, phone call, trade show, BrowserAct/CamoFox sourcing, and future `mitchelbrown.com` inquiries.
- **FR-010**: Trevor MUST write exactly one bounded conversation record for a successfully captured intake unless the request is explicitly a dry run or validation-only check.
- **FR-011**: Trevor MUST update buyer/prospect status, last outcome, last-contacted timing, and next action fields when those facts are provided or safely inferred from Mitchel's direct input.
- **FR-012**: Trevor MUST optionally create a next call task when Mitchel provides a valid next action and the buyer is contactable.
- **FR-013**: Trevor MUST optionally create or request a follow-up draft when Mitchel asks for one and enough context exists.
- **FR-014**: Trevor MUST NOT send emails, texts, social messages, Telegram messages, or any other outbound communication as part of intake.
- **FR-015**: Trevor MUST report `outbound_sent=false` for intake operations unless a future, separately approved sending feature changes that contract.
- **FR-016**: Trevor MUST suppress persuasive follow-up drafts and call tasks for do-not-contact buyers unless Mitchel explicitly changes the contact status.
- **FR-017**: Trevor MUST attempt Agiled matching or sync only as an explicit, reported sub-step and must report created, updated, linked, skipped, or failed status.
- **FR-018**: Trevor local records MUST remain usable when Agiled matching or sync fails.
- **FR-019**: Trevor MUST redact or avoid storing secret-like tokens, API keys, database URLs, auth headers, cookies, and unrelated scraped content in buyer notes or review output.
- **FR-020**: The intake contract MUST be reusable by a future public website form without requiring public users to know internal Trevor or Agiled identifiers.

### Key Entities *(include if feature involves data)*

- **Buyer Intake**: A request to create or update buyer/prospect data from internal conversation capture or later website inquiry. Includes identity, contact path, source, preferences, notes, and optional next action.
- **Buyer/Prospect**: A durable person or business Mitchel may contact for diamond or jewelry sales. Includes contact details, company, status, source attribution, preferences, and follow-up state.
- **Conversation Record**: A bounded summary of a call, meeting, message, referral, or intake note. Linked to one buyer/prospect when safely resolved.
- **Dedupe Review**: A result describing whether an intake is unique, a possible duplicate, a confirmed duplicate, or needs human choice among candidates.
- **Next Action**: Optional internal work created from intake, such as a call task or draft follow-up request. It is not outbound communication.
- **Agiled Sync Result**: A reported status for CRM matching or update activity: linked, created, updated, skipped, failed, or not attempted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Mitchel can capture a complete new buyer conversation into Trevor in under 2 minutes from the existing assistant experience.
- **SC-002**: Clear phone or email matches update existing Trevor records with zero duplicate active prospects in validation tests.
- **SC-003**: Ambiguous matches return a needs-review result with candidate matches and do not write an uncertain prospect update.
- **SC-004**: Every successful intake writes one bounded conversation record and preserves source attribution.
- **SC-005**: Intake operations create no outbound messages and report `outbound_sent=false` in all acceptance tests.
- **SC-006**: Agiled unavailable or failed sync cases still leave a usable local Trevor record and a visible sync status.
- **SC-007**: The same intake contract can represent a later `mitchelbrown.com` inquiry without adding a separate duplicate lead model.

## Assumptions

- Mitchel will start with internal assistant-driven entry, not a public website form in this feature.
- The existing Trevor prospecting database remains the durable local system of record.
- Agiled is an external CRM sync target and may be unavailable or incomplete.
- Follow-up sending remains outside this feature; drafts and call tasks are internal reviewable work only.
- Public landing page and `/books` routing remain Feature 10 work.
