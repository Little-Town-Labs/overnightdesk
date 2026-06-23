# Feature Specification: Trevor Prospecting Data Model

**Feature Branch**: `001-trevor-prospecting-data-model`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "Make the live trevor Postgres schema reproducible and cadence-ready for Mitchel prospecting by adding next-action prospect fields, call task storage, follow-up draft storage, backup and rollback documentation, grants verification, and platform database documentation updates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deployable Prospecting Schema (Priority: P1)

As the platform operator, I need the existing Trevor prospecting data model to be captured in repo-controlled deployment artifacts so future changes to Mitchel's sales support system are repeatable, reviewable, and recoverable.

**Why this priority**: The current live schema exists on production, but the next prospecting features depend on a durable schema baseline and safe deployment process.

**Independent Test**: Can be tested by reviewing the migration/runbook artifacts and applying the migration to a fresh or staging database that starts with the current Trevor schema; the resulting schema contains the required cadence fields and tables.

**Acceptance Scenarios**:

1. **Given** the current Trevor schema exists with prospects, interactions, and memory, **When** the data-model migration is applied, **Then** the schema contains all required prospect cadence fields plus call-task and follow-up-draft storage.
2. **Given** an operator needs to review the change before production deployment, **When** they inspect the repo, **Then** they can find the schema change, backup command, rollback approach, and verification checklist without relying on chat history.

---

### User Story 2 - Safe Prospect Cadence Tracking (Priority: P2)

As Trevor, the sales support agent, I need prospect records to carry next-action and contact-permission state so later call queue and follow-up workflows can prioritize the right buyers without contacting blocked prospects.

**Why this priority**: Daily call queue generation cannot be trusted until the source records expose due dates, priority, preferred channel, last outcome, and do-not-contact state.

**Independent Test**: Can be tested by adding representative prospect records with different next-action and contact-permission states and confirming those states can be stored, updated, and queried independently of any call queue implementation.

**Acceptance Scenarios**:

1. **Given** a prospect should not be contacted, **When** the record is updated, **Then** the system can store both the do-not-contact flag and the reason.
2. **Given** a prospect needs a follow-up call next week, **When** the record is updated, **Then** the system can store the next action type, due date, priority, preferred channel, and last outcome.

---

### User Story 3 - Approval-Ready Follow-Up Storage (Priority: P3)

As Mitchel, I need Trevor's follow-up drafts to be stored separately from sent interactions so I can review, approve, discard, or mark them sent without losing the relationship history.

**Why this priority**: Later outbound messaging workflows must remain human-approved. Storing drafts as first-class records creates the control point before any external send integration exists.

**Independent Test**: Can be tested by creating a draft linked to a prospect and optional interaction, moving it through draft and approved states, and confirming the original interaction history remains unchanged.

**Acceptance Scenarios**:

1. **Given** Trevor drafts an email after a call, **When** the draft is saved, **Then** it is linked to the prospect and remains in draft status until explicitly approved or discarded.
2. **Given** a follow-up was manually sent outside the system, **When** Mitchel marks the draft as sent, **Then** the draft stores sent metadata without pretending the system sent it automatically.

---

### User Story 4 - Production Verification and Documentation (Priority: P4)

As the platform operator, I need clear post-deployment verification and documentation updates so the platform standard reflects the final deployed Trevor schema.

**Why this priority**: The schema supports a live business tenant. Operators need to know what changed, how to verify grants, and where the authoritative database inventory lives.

**Independent Test**: Can be tested by following the verification checklist after deployment and confirming platform documentation describes the new tables, fields, ownership, and safety constraints.

**Acceptance Scenarios**:

1. **Given** the migration has been deployed, **When** the operator runs the verification steps, **Then** the expected tables, fields, indexes, triggers, and application-role grants are confirmed.
2. **Given** future operators inspect the platform database inventory, **When** they read the platform standard docs, **Then** they can see the updated Trevor schema and understand that it supports Mitchel's prospecting workflow.

---

### Edge Cases

- Migration is run against a database where one or more proposed columns already exist from a manual change.
- Migration is run against a database missing the expected baseline tables.
- Existing prospects have no next-action state yet.
- Existing prospects include missing email, phone, company, or Agiled contact IDs.
- Existing follow-up drafts are not present because the feature introduces the table for future workflows.
- A prospect is marked do-not-contact but already has open call tasks or drafts.
- The backup succeeds but verification fails after migration.
- Application-role grants differ from the documented production expectation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST preserve the existing prospect, interaction, and memory records during the data-model change.
- **FR-002**: System MUST provide a repo-controlled schema change that adds prospect cadence state: lead source, preferred channel, do-not-contact flag, do-not-contact reason, last outcome, next action type, next action due date, and priority.
- **FR-003**: System MUST provide storage for call tasks linked to prospects, including task type, priority, reason, call objective, status, due time, completion time, and timestamps.
- **FR-004**: System MUST provide storage for follow-up drafts linked to prospects and optionally interactions, including channel, subject, body, status, approval metadata, sent metadata, external message reference, and timestamps.
- **FR-005**: System MUST define allowed lifecycle states for call tasks and follow-up drafts clearly enough that future workflows can distinguish open work from completed, discarded, approved, or sent work.
- **FR-006**: System MUST define how do-not-contact prospects are represented so later queue and follow-up workflows can reliably suppress outreach.
- **FR-007**: System MUST include a production backup procedure for the Trevor schema before any production deployment.
- **FR-008**: System MUST include a rollback or recovery procedure that explains how to return to the prior state or restore from backup if deployment fails.
- **FR-009**: System MUST include post-deployment verification steps for table existence, required fields, indexes or lookup support, timestamp update behavior, foreign key relationships, and application-role grants.
- **FR-010**: System MUST document ownership and safety constraints for all new prospecting records in the platform database inventory after deployment.
- **FR-011**: System MUST avoid storing outbound-message send credentials, channel tokens, or other secrets in prospecting records.
- **FR-012**: System MUST keep follow-up drafts separate from completed interaction history until a human-approved send or manual-send confirmation is recorded.
- **FR-013**: System MUST allow existing prospects with incomplete contact data to remain valid records after the migration.
- **FR-014**: System MUST allow future workflows to query prospects by next action due date, priority, contact permission, and status.
- **FR-015**: System MUST allow future workflows to query call tasks by status, due time, priority, and prospect.
- **FR-016**: System MUST allow future workflows to query follow-up drafts by status, channel, prospect, and approval or sent time.

### Key Entities *(include if feature involves data)*

- **Prospect**: A buyer or buyer organization in Mitchel's diamond sales pipeline. Existing attributes include identity, contact details, buyer type, preferred cuts, budget range, certification preference, Agiled contact ID, status, notes, and contact timestamps. This feature adds cadence and contact-permission state.
- **Interaction**: A recorded touchpoint with a prospect. Existing attributes include prospect link, channel, direction, summary, Agiled references, occurrence time, and creation time. This feature preserves it as completed relationship history.
- **Call Task**: A pending or completed sales action for a prospect. It represents work Trevor recommends or tracks for Mitchel, such as calling, checking in, or reactivating a buyer.
- **Follow-Up Draft**: A human-reviewable outbound message draft. It may be based on a prospect and interaction, but it is not a completed interaction until approved and sent or manually confirmed.
- **Application Role**: The restricted database identity used by the Mitchel tenant to access Trevor business data. It must have enough access for prospecting workflows and no unnecessary ownership or superuser power.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh database with the current Trevor baseline can be migrated to the cadence-ready schema without losing existing prospect, interaction, or memory records.
- **SC-002**: Verification can confirm all required prospect cadence fields, call-task storage, follow-up-draft storage, and application-role grants in under 10 minutes using documented steps.
- **SC-003**: At least three representative prospect states can be stored and queried: contact allowed with due action, do-not-contact with reason, and no action currently due.
- **SC-004**: At least three representative follow-up draft states can be stored and queried: draft, approved, and sent or manually sent.
- **SC-005**: Platform documentation identifies the new Trevor schema components, their owner, their purpose, and their safe-delete posture.
- **SC-006**: The deployment runbook includes enough backup and rollback detail for an operator who was not present during design to safely prepare a production deployment.

## Assumptions

- The existing production schema remains `trevor` inside the shared `tenet0-postgres` database.
- The existing baseline tables are `prospects`, `interactions`, and `memory`.
- Agiled remains the commercial CRM of record; the Trevor schema is the agent-optimized working store.
- This feature does not implement call queue generation, pre-call briefs, post-call capture, follow-up drafting logic, scheduler jobs, or inventory matching.
- Direct outbound sending is out of scope; this feature only prepares draft storage and approval metadata.
- Existing prospect records may have incomplete contact or CRM linkage data and must not be rejected by the migration.
- Production deployment requires an explicit backup before changes are applied.
