# Feature Specification: Pre-Call Brief

**Feature Branch**: `003-pre-call-brief`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Pre-call brief for Trevor/Mitchel prospecting: given a prospect, company, or call task from the daily call queue, produce a compact call brief with identity, company, last touch, current status, buyer preferences, known objections, Agiled context when linked, recommended ask, inventory-context caveat, suggested opener, and follow-up fallback. The workflow must be on demand through hermes-mitchel, must not create interactions or send outreach, must label missing Postgres or Agiled data honestly, and must keep prospect details out of logs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Brief A Queue Task (Priority: P1)

As Mitchel, I need to ask Trevor for a brief on a call-task from today's queue so I can start the call with the buyer identity, context, and recommended ask already organized.

**Why this priority**: Feature 2 creates durable call tasks. The fastest useful next step is turning a selected task into a ready-to-use call brief.

**Independent Test**: Seed a prospect and open call task, request a brief by task ID, and verify the response includes the prospect identity, call objective, buyer context, recommended ask, opener, and no outbound side effects.

**Acceptance Scenarios**:

1. **Given** an open call task linked to a prospect, **When** Mitchel requests a pre-call brief by task ID, **Then** Trevor returns a concise brief tied to the task and prospect.
2. **Given** the prospect has recent interaction history and cadence fields, **When** the brief is generated, **Then** the brief names the last touch and recommended ask without dumping full private notes.
3. **Given** the request is made for a do-not-contact prospect, **When** Trevor generates the brief, **Then** the response clearly warns that the prospect must not be called.

---

### User Story 2 - Brief A Prospect Directly (Priority: P2)

As Mitchel, I need to ask for a brief by prospect ID, name, or company when I am not starting from a queue task.

**Why this priority**: Real sales work often starts from a conversation, search, or memory rather than a queue item.

**Independent Test**: Seed prospects with distinct names and companies, request a brief by ID and by query text, and verify the selected prospect is returned or ambiguity is surfaced.

**Acceptance Scenarios**:

1. **Given** a known prospect ID, **When** Mitchel requests a brief by ID, **Then** Trevor returns the brief for that prospect.
2. **Given** a name or company query matches exactly one prospect, **When** Mitchel requests a brief, **Then** Trevor returns that prospect's brief.
3. **Given** a query matches multiple prospects, **When** Mitchel requests a brief, **Then** Trevor returns a bounded disambiguation list instead of guessing.

---

### User Story 3 - Explain Missing Context (Priority: P3)

As the operator, I need every brief to distinguish known facts from missing Agiled, inventory, or interaction context so Trevor does not overstate confidence.

**Why this priority**: The workflow is only trustworthy if missing CRM and inventory data is visible at decision time.

**Independent Test**: Generate briefs with missing Agiled links, missing recent interactions, and optional inventory context, and verify warnings and missing-context fields are accurate.

**Acceptance Scenarios**:

1. **Given** a prospect lacks an Agiled contact link, **When** the brief is generated, **Then** the brief states that Agiled context is missing.
2. **Given** inventory context is not supplied, **When** the brief is generated, **Then** the brief does not claim an inventory match.
3. **Given** inventory context is supplied, **When** the brief is generated, **Then** Trevor may mention it only as operator-provided context and does not store it.

### Edge Cases

- The task ID does not exist or is not a call task.
- The prospect ID does not exist.
- A search query has no matches.
- A search query has more than one plausible match.
- The prospect is marked do-not-contact.
- The prospect has no phone number, preferred channel, or Agiled link.
- There are no prior interactions.
- Notes contain long private context that should be summarized, not dumped.
- Optional inventory text is empty, vague, or too long.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate an on-demand pre-call brief for a selected Trevor prospect or call task.
- **FR-002**: System MUST allow lookup by task ID, prospect ID, or bounded name/company query.
- **FR-003**: System MUST include prospect identity, company, status, contact readiness, last touch summary, buyer context, recommended ask, suggested opener, and follow-up fallback when available.
- **FR-004**: System MUST warn when a prospect is do-not-contact and must not present the call as ready.
- **FR-005**: System MUST distinguish known facts from missing context including Agiled link, recent interaction, phone, preferred channel, and inventory context.
- **FR-006**: System MUST avoid creating interactions, follow-up drafts, Agiled notes, outbound messages, or external channel updates.
- **FR-007**: System MUST avoid logging full notes, secrets, credentials, generated message bodies, or unnecessary prospect details.
- **FR-008**: System MUST return a bounded disambiguation list when a query matches multiple prospects.
- **FR-009**: System MUST use existing Trevor schema and daily-call-queue task records without adding a new table.
- **FR-010**: System MUST preserve daily-call-queue MCP tools and generic Trevor DB tools while adding the brief workflow.

### Key Entities *(include if feature involves data)*

- **Prospect**: A buyer or buyer organization in Trevor Postgres. The brief uses contact identity, status, preferences, notes, DNC state, cadence fields, and optional Agiled linkage.
- **Call Task**: A durable queue item linked to a prospect. A task can anchor the brief and provide the current reason/objective.
- **Interaction**: Historical touchpoint data. The brief reads the most recent interaction but does not create one.
- **Pre-Call Brief**: A transient response object containing a concise call plan, known facts, missing context, warnings, and disambiguation when needed.
- **Inventory Context**: Optional operator-provided text that may shape brief wording but is not stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seeded task ID can produce a pre-call brief in under 10 seconds during operator validation.
- **SC-002**: 100% of DNC prospects in validation return a warning and are not described as call-ready.
- **SC-003**: Every returned brief includes a recommended ask, suggested opener, follow-up fallback, missing-context list, and warnings list.
- **SC-004**: Ambiguous prospect queries return a bounded set of candidates instead of selecting one silently.
- **SC-005**: Verification confirms brief generation creates zero interactions, zero follow-up drafts, and no outbound send-capable actions.

## Assumptions

- Feature 1 and Feature 2 are deployed on `aegis-prod`.
- Agiled is useful enrichment but not required for the first deployable brief.
- The first slice reads Trevor Postgres only and reports missing Agiled context honestly.
- Mitchel remains the human caller. Trevor prepares information but does not place calls or send messages.
- Durable post-call capture belongs to Feature 4.
