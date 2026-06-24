# Feature Specification: Daily Call Queue

**Feature Branch**: `002-daily-call-queue`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Daily call queue for Trevor/Mitchel prospecting: generate a ranked list of prospects Mitchel should call today, including reason, objective, buyer context, and suggested opener; suppress do-not-contact records; promote overdue next actions, stale deals, and inventory matches when available; run on demand through hermes-mitchel; write stable recommendations into trevor.call_tasks without autonomous outbound outreach."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask Who To Call Today (Priority: P1)

As Mitchel, I need to ask Trevor who I should call today and receive a short ranked list of call recommendations with enough context to start working immediately.

**Why this priority**: The first useful daily loop is a trusted on-demand queue that turns the existing prospect data into action.

**Independent Test**: Can be tested by seeding representative prospects and asking for today's queue; the result is ranked, excludes suppressed prospects, and gives a clear reason and objective for every recommendation.

**Acceptance Scenarios**:

1. **Given** prospects with overdue next actions and different priorities, **When** Mitchel asks who to call today, **Then** Trevor returns a ranked queue where overdue high-priority prospects appear before lower-priority or non-due prospects.
2. **Given** a recommended prospect has buyer preferences, status, and relationship notes, **When** the queue is returned, **Then** the recommendation includes a reason for calling, a call objective, relevant buyer context, and a suggested opener.
3. **Given** no prospect is due for a call, **When** Mitchel asks for today's queue, **Then** Trevor says no calls are currently due and suggests the next best review action without inventing prospects.

---

### User Story 2 - Suppress Unsafe Or Inappropriate Calls (Priority: P2)

As the platform operator, I need the queue to reliably suppress prospects that should not be contacted so Trevor does not recommend outreach that Mitchel has already blocked.

**Why this priority**: Trust in the queue depends on respecting contact-permission state before any ranking or convenience behavior.

**Independent Test**: Can be tested by marking prospects do-not-contact, incomplete, stale, and due; suppressed prospects never appear as recommended call targets.

**Acceptance Scenarios**:

1. **Given** a prospect is marked do-not-contact with a reason, **When** the queue is generated, **Then** the prospect is excluded from call recommendations and the suppression can be verified.
2. **Given** a prospect has incomplete contact information, **When** the queue is generated, **Then** Trevor either omits the prospect or labels the missing information clearly instead of presenting the call as ready.
3. **Given** a prospect was contacted recently and has no due next action, **When** the queue is generated, **Then** that prospect is deprioritized below due or stale prospects.

---

### User Story 3 - Persist Stable Call Tasks (Priority: P3)

As Trevor, I need stable queue recommendations to be written into call-task records so Mitchel can revisit the same working list instead of receiving a different answer each time.

**Why this priority**: A durable queue creates continuity across a sales day and gives later pre-call brief and post-call capture workflows a concrete task to reference.

**Independent Test**: Can be tested by generating a queue, reviewing the stored tasks, then regenerating the queue; existing open tasks remain stable unless the prospect state changes.

**Acceptance Scenarios**:

1. **Given** the queue generator recommends a prospect, **When** the recommendation is accepted as part of today's queue, **Then** an open call task exists with the reason, objective, priority, due time, and prospect link.
2. **Given** an open call task already exists for a prospect today, **When** the queue is generated again, **Then** Trevor updates or reuses the existing task rather than creating duplicate open work.
3. **Given** a prospect becomes do-not-contact after a task was created, **When** the queue is refreshed, **Then** the open task is not presented as callable and is marked or surfaced for operator review.

---

### User Story 4 - Explain Queue Inputs And Limits (Priority: P4)

As Mitchel, I need Trevor to explain why a prospect was recommended and what information was missing so I can trust the queue without assuming it has perfect CRM or inventory context.

**Why this priority**: The queue must be useful even while Agiled and inventory context are incomplete, and it must not overstate confidence.

**Independent Test**: Can be tested with prospects that have no Agiled link, no recent interaction, or no inventory match; the output names the missing context plainly.

**Acceptance Scenarios**:

1. **Given** a prospect has no Agiled contact or deal link, **When** the prospect appears in the queue, **Then** the recommendation states that CRM context is missing.
2. **Given** inventory input is unavailable, **When** the queue is generated, **Then** Trevor ranks by cadence and relationship state without claiming inventory-driven matches.
3. **Given** a recommendation uses stale-deal or inventory context, **When** the queue is shown, **Then** the source of that reason is visible enough for Mitchel to judge whether to act.

### Edge Cases

- All due prospects are marked do-not-contact.
- A prospect is due today but has no phone number or preferred calling channel.
- Multiple open call tasks already exist for the same prospect.
- The available prospect data includes contradictory status, priority, and next-action fields.
- Agiled context is unavailable or a linked contact cannot be found.
- Optional inventory input is unavailable, empty, or too vague to match confidently.
- Queue generation is run multiple times in one day.
- A prospect state changes after the queue is generated but before Mitchel calls.
- The queue would be empty after applying suppression and readiness rules.
- Generated recommendation text contains unsupported claims or outbound-send language.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate an on-demand daily call queue for Mitchel from the existing prospecting records.
- **FR-002**: System MUST rank recommendations using due next actions, prospect priority, stale relationship state, and available inventory relevance when inventory context is present.
- **FR-003**: System MUST exclude prospects marked do-not-contact from callable recommendations.
- **FR-004**: System MUST identify prospects that are due but not call-ready because required contact information is missing.
- **FR-005**: Each call recommendation MUST include a prospect identity, rank, reason for calling, call objective, relevant buyer context, and suggested opener.
- **FR-006**: Each recommendation MUST distinguish known facts from missing or unavailable context.
- **FR-007**: System MUST persist stable accepted or generated queue items as call tasks linked to prospects.
- **FR-008**: System MUST avoid duplicate open call tasks for the same prospect and same sales-day purpose.
- **FR-009**: System MUST preserve existing prospect, interaction, memory, call-task, and follow-up-draft records while generating or refreshing the queue.
- **FR-010**: System MUST provide a verification path that proves suppressed prospects are excluded, due prospects are ranked, and persisted tasks match the visible queue.
- **FR-011**: System MUST never send messages, place calls, update external outreach channels, or imply that contact was made as part of queue generation.
- **FR-012**: System MUST avoid storing credentials, channel tokens, or secret values in queue records, explanations, logs, or operator documentation.
- **FR-013**: System MUST make failures diagnosable without logging full prospect notes, private contact details beyond what operators already need, secrets, or generated message bodies.
- **FR-014**: System MUST document operator steps for validating the queue on production data before enabling any scheduled digest or downstream automation.
- **FR-015**: System MUST treat Agiled and inventory context as optional enrichment for this feature; lack of either MUST NOT block cadence-based queue generation.
- **FR-016**: System MUST make queue output stable enough that repeating the same request against unchanged data returns the same recommended order and task references.

### Key Entities *(include if feature involves data)*

- **Prospect**: A buyer or buyer organization in Mitchel's diamond sales pipeline. Queue generation uses contact-permission state, next-action state, priority, status, buyer preferences, and available contact readiness.
- **Call Recommendation**: A ranked queue item shown to Mitchel before it is acted on. It includes why the call matters, what the call should accomplish, and what context is known or missing.
- **Call Task**: A durable work item linked to a prospect. It records stable queue recommendations and later supports pre-call briefs and post-call capture.
- **Interaction**: A completed touchpoint history record. This feature may read interaction history to determine staleness but does not create completed interactions.
- **Agiled Context**: Optional CRM contact, account, deal, note, invoice, or pipeline information used to enrich a recommendation when a reliable link exists.
- **Inventory Context**: Optional diamond availability or buyer-match input used to promote relevant prospects when the source is available and confidence is clear.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A representative dataset with at least 10 prospects can produce a ranked daily call queue in under 10 seconds during operator validation.
- **SC-002**: 100% of do-not-contact prospects in the validation dataset are excluded from callable recommendations.
- **SC-003**: Every returned recommendation includes a reason, objective, buyer context summary, and suggested opener.
- **SC-004**: Re-running queue generation against unchanged data returns the same prospect order and does not create duplicate open call tasks.
- **SC-005**: At least three ranking drivers are demonstrable during validation: overdue next action, stale relationship state, and explicit priority.
- **SC-006**: The queue remains usable when Agiled or inventory context is unavailable by clearly stating missing context and ranking from prospect cadence data.
- **SC-007**: Operator verification can confirm visible queue output, persisted call tasks, and suppression behavior in under 15 minutes.
- **SC-008**: No outbound communication or external send-capable action occurs during queue generation.

## Assumptions

- Feature 1 has been deployed and the Trevor prospecting schema includes prospect cadence fields plus call-task storage.
- The first version is on-demand through `hermes-mitchel`; scheduled morning digest behavior belongs to a later feature unless explicitly added during planning.
- Agiled is the CRM of record, but a missing Agiled link should degrade explanation quality rather than block queue generation.
- Inventory matching is opportunistic in this feature. A durable inventory source is deferred unless planning discovers one already available and safe to use.
- Mitchel remains the human caller. Trevor recommends and records queue work but does not place calls or send outreach.
- The queue should optimize for practical daily sales action, not perfect scoring transparency or long-form analytics.
