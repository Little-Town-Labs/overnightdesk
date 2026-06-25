# Feature Specification: Mitchel Prospecting Dashboard in OvernightDesk

**Feature Branch**: `010-mitchel-prospecting-dashboard`

**Created**: 2026-06-25

**Status**: Draft

**Input**: User description: "Mitchel logs into OvernightDesk and should get a customized tenant frontend that lets him interact with Trevor/Hermes, review prospect data that is not in Agiled yet, use the existing Hermes chat/dashboard path, and keep the workflow safe and human-in-the-loop. Feature 10 replaces the landing page work, which moves to Feature 11. The API question needs research against Hermes docs and live Aegis reality."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review Prospecting Work (Priority: P1)

Mitchel logs into OvernightDesk and sees a customized prospecting workspace for his tenant. The workspace summarizes Trevor prospects and review queues that may not exist in Agiled yet, so he can decide who needs attention without asking Trevor in chat for every status update.

**Why this priority**: This is the minimum useful dashboard slice. It gives Mitchel visibility into the work Trevor is already doing while preserving the current human review process.

**Independent Test**: Can be fully tested by signing in as a `hermes-mitchel` user with existing Trevor prospecting records and confirming the dashboard shows the correct scoped queues without exposing the workspace to another tenant.

**Acceptance Scenarios**:

1. **Given** an authenticated user whose active tenant is `hermes-mitchel`, **When** the user opens the OvernightDesk dashboard, **Then** the dashboard shows a Mitchel prospecting workspace with Trevor-only prospects, staged candidates, today's call tasks, review-needed items, and follow-up drafts.
2. **Given** an authenticated user whose active tenant is not `hermes-mitchel`, **When** the user opens the OvernightDesk dashboard, **Then** the Mitchel prospecting workspace is not shown.
3. **Given** Trevor has no records in one of the workspace queues, **When** Mitchel views the workspace, **Then** that queue shows an honest empty state and does not imply work exists.

---

### User Story 2 - Keep Trevor Conversation Available (Priority: P1)

Mitchel can use the customized workspace without losing the existing Hermes/Trevor chat entry point or the link to the full Hermes agent dashboard.

**Why this priority**: The dashboard should augment Trevor, not replace the existing agent interaction path that Mitchel already uses.

**Independent Test**: Can be tested by opening the customized dashboard and confirming both the chat surface and the Hermes dashboard launch path remain available while prospecting data is visible.

**Acceptance Scenarios**:

1. **Given** Mitchel is on the prospecting workspace, **When** he wants to ask Trevor a question, **Then** the existing Hermes chat path remains available from the same authenticated dashboard area.
2. **Given** Mitchel needs the full Hermes dashboard, **When** he selects the dashboard launch action, **Then** he is taken to the tenant's Hermes dashboard using the existing tenant instance link behavior.

---

### User Story 3 - Review Before Action (Priority: P2)

Mitchel can identify records that need a decision before any promotion, follow-up, or outbound action occurs. The workspace makes review state clear and does not perform outreach automatically.

**Why this priority**: Prospecting data can affect real business relationships, so the first dashboard actions must protect the human approval boundary.

**Independent Test**: Can be tested by using staged candidates, do-not-contact records, and follow-up drafts, then verifying the dashboard clearly separates review-needed work from callable or ready items and sends nothing.

**Acceptance Scenarios**:

1. **Given** a staged candidate marked `needs_review`, **When** Mitchel views the workspace, **Then** the candidate appears in a review-needed area with enough source context to support a decision.
2. **Given** a follow-up draft awaiting approval, **When** Mitchel views the workspace, **Then** the draft is visible as pending review and no outbound send occurs.
3. **Given** a prospect is marked do-not-contact, **When** Mitchel views dashboard queues, **Then** the prospect is clearly excluded from callable work and is not presented as ready for outreach.

---

### User Story 4 - Understand Process Progress (Priority: P3)

Mitchel can see where prospecting work sits in the process, using a simple process view or Kanban-style view only when it is safely scoped to OvernightDesk authentication and Trevor's durable records.

**Why this priority**: A process view can help Mitchel understand momentum, but it is secondary to trustworthy prospect lists and review boundaries.

**Independent Test**: Can be tested by viewing process categories and confirming they match Trevor records without exposing unauthenticated Hermes plugin routes or creating a second source of truth.

**Acceptance Scenarios**:

1. **Given** process status data is available for Trevor records, **When** Mitchel views the workspace, **Then** he can see records grouped by meaningful process status.
2. **Given** Kanban data is unavailable or not safely proxyable, **When** Mitchel views the workspace, **Then** the dashboard still shows the core Trevor queues without a broken Kanban surface.

---

### Edge Cases

- The logged-in user has no active tenant instance.
- The active tenant instance exists but is not `hermes-mitchel`.
- The `hermes-mitchel` tenant exists but Trevor prospecting data is temporarily unavailable.
- Hermes chat is available but the full Hermes dashboard link is unreachable.
- A record appears in multiple queues, such as staged and review-needed.
- A record contains source notes from web scraping or pasted conversation content.
- A do-not-contact prospect, rejected candidate, or duplicate candidate appears in source data.
- Data changes between page load and review.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show the Mitchel prospecting workspace only to authenticated users whose active tenant is explicitly identified as `hermes-mitchel`.
- **FR-002**: System MUST preserve the existing authenticated OvernightDesk dashboard access pattern for all tenants that are not `hermes-mitchel`.
- **FR-003**: Mitchel MUST be able to see Trevor-only prospects that may not exist in Agiled yet.
- **FR-004**: Mitchel MUST be able to see staged candidates grouped by review state, including recommended, needs review, duplicate, rejected, and approved where those states exist.
- **FR-005**: Mitchel MUST be able to see today's call tasks with enough context to understand who to call and why.
- **FR-006**: Mitchel MUST be able to see records that require human review before promotion, follow-up, or outreach.
- **FR-007**: Mitchel MUST be able to see follow-up drafts awaiting approval without triggering outbound delivery.
- **FR-008**: System MUST keep the existing Hermes/Trevor chat entry point available from the customized dashboard.
- **FR-009**: System MUST keep the existing link to the tenant's full Hermes dashboard available from the customized dashboard.
- **FR-010**: System MUST display honest loading, empty, partial failure, and unavailable states for each prospecting queue.
- **FR-011**: System MUST clearly mark source attribution for staged candidates and review records when source attribution is available.
- **FR-012**: System MUST treat scraped content, pasted notes, candidate notes, and draft text as untrusted display data.
- **FR-013**: System MUST NOT automatically send outbound messages, promote candidates, create call tasks, or mutate prospect status as a side effect of viewing the workspace.
- **FR-014**: System MUST NOT expose unauthenticated Hermes dashboard plugin routes directly through the public OvernightDesk frontend.
- **FR-015**: System MUST NOT require the platform frontend to receive or store Trevor database credentials to render the workspace.
- **FR-016**: If a process or Kanban view is included, system MUST make Trevor's durable prospecting records the source of truth and avoid presenting Hermes Kanban as a separate canonical sales record.
- **FR-017**: If a write action is included in the first release, system MUST present the action as a reviewed human decision and MUST provide a visible result state that confirms no outbound message was sent.
- **FR-018**: System MUST avoid exposing prospecting data across tenants, users, or unauthenticated sessions.
- **FR-019**: System SHOULD prefer documented, plain-vanilla Hermes Agent features and extension points over custom Hermes patches or private internals.
- **FR-020**: When OvernightDesk needs behavior around Hermes, system SHOULD adapt the platform or tenant-local Trevor boundary first, keeping future Hermes upgrades smooth.

### Key Entities *(include if feature involves data)*

- **Mitchel Tenant User**: An authenticated OvernightDesk user whose active tenant is `hermes-mitchel` and who is allowed to view the customized workspace.
- **Trevor Prospect**: A durable prospecting record owned by Trevor, potentially linked to Agiled but still visible when not yet present in Agiled.
- **Staged Candidate**: A discovered prospect candidate awaiting review, with recommendation state, source attribution, and enrichment status.
- **Call Task**: A task representing a human call opportunity, including due date, priority, readiness, and reason.
- **Review Item**: Any prospect, candidate, draft, or task requiring human review before the next action.
- **Follow-Up Draft**: A draft message prepared for review that must not be sent automatically.
- **Process Status**: A human-readable grouping that helps explain where a record sits in the prospecting workflow without becoming a separate source of truth.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Mitchel can identify the next prospecting item needing attention from the dashboard in under 30 seconds during validation.
- **SC-002**: A non-`hermes-mitchel` authenticated user cannot see Mitchel prospecting data or workspace controls during access testing.
- **SC-003**: The workspace renders all required queues with either data, an empty state, or a specific unavailable state; no queue fails silently.
- **SC-004**: Viewing the workspace creates zero outbound messages and zero unintended prospecting mutations in validation.
- **SC-005**: The existing Hermes chat and dashboard launch paths remain available for `hermes-mitchel` after the workspace is added.
- **SC-006**: Review-needed records include enough source context for an operator to decide whether to continue, reject, or defer the record.

## Assumptions

- The first release prioritizes visibility and review over new write actions.
- Mitchel already has a working OvernightDesk login and an active `hermes-mitchel` tenant instance.
- Trevor prospecting data remains the business source of truth for pre-Agiled prospect workflow.
- Agiled remains the CRM, but not every Trevor prospecting record will be in Agiled yet.
- Hermes chat and Hermes dashboard access already exist in the OvernightDesk dashboard and should be reused.
- Any use of Hermes Kanban must be researched and validated against live `aegis-prod` before being exposed through OvernightDesk.
- Plain-vanilla Hermes Agent features are preferred wherever they satisfy the need; custom Hermes changes are a last resort and should be avoided unless upstream-compatible.
- Public landing page and buyer inquiry form work is deferred to Feature 11.
