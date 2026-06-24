# Feature Specification: Prospect Sourcing Pipeline

**Feature Branch**: `008-prospect-sourcing-pipeline`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Prospect sourcing pipeline for Mitchel: capture the existing Aegis BrowserAct and CamoFox web-scraping workflows for finding independent jewelry-store prospects. Start with BrowserAct for bulk discovery and template contact finding, then use CamoFox to enrich or verify information from BrowserAct when more website detail is needed. Keep secrets out of source control, stage scraped candidates for review, dedupe against Trevor prospects and Agiled, preserve lead source attribution, and promote approved prospects into the daily call queue without sending outbound messages."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Source Prospect Candidates (Priority: P1)

As Mitchel, I need Trevor to find likely diamond-buyer prospects from public
business listings so my daily work can focus on calling qualified independent
jewelers instead of manually searching the web.

**Why this priority**: New buyer pipeline is the highest-leverage next step now
that the call queue, briefing, capture, follow-up drafting, digest, and sent
logging loops are deployed.

**Independent Test**: Run a bounded sourcing workflow for a named area and
verify that Trevor returns a staged list of independent jewelry-store candidates
with source, contact readiness, and quality signals without creating active
prospects or sending messages.

**Acceptance Scenarios**:

1. **Given** Mitchel requests prospects for a specific area, **When** Trevor
   runs the sourcing workflow, **Then** the result contains staged candidate
   businesses with names, area, source, rating/review signals when available,
   and contact readiness.
2. **Given** BrowserAct returns bulk discovery results with incomplete contact
   detail, **When** Trevor continues sourcing, **Then** CamoFox can enrich or
   verify candidate websites and contact fields without exposing credentials.
3. **Given** a scraped page or third-party result includes irrelevant or
   instruction-like text, **When** Trevor summarizes candidates, **Then** the
   result treats the content as untrusted data and does not execute or follow
   page-provided instructions.

---

### User Story 2 - Review and Approve Candidates (Priority: P2)

As Mitchel, I need to review sourced candidates before they become active
prospects so low-quality, duplicate, chain-store, or non-buyer records do not
pollute Trevor's call queue.

**Why this priority**: Scraping creates noisy data. A review gate protects the
quality of the prospect list and keeps contact decisions human-controlled.

**Independent Test**: Seed staged candidates with duplicates, chain stores, and
qualified independent stores; verify the review output separates recommended,
duplicate, rejected, and needs-review candidates without writing call tasks.

**Acceptance Scenarios**:

1. **Given** candidate businesses include known chain jewelers, **When** Trevor
   prepares the review list, **Then** chain stores are excluded or marked
   rejected with a clear reason.
2. **Given** a candidate matches an existing Trevor prospect by name, company,
   phone, website, or area, **When** Trevor reviews candidates, **Then** the
   candidate is marked duplicate and not proposed as a new active prospect.
3. **Given** a candidate lacks phone, email, website, or enough confidence,
   **When** Trevor reviews candidates, **Then** it is marked needs-review
   rather than call-ready.

---

### User Story 3 - Promote Approved Prospects Into Cadence (Priority: P3)

As Mitchel, I need approved sourced candidates to become Trevor prospects with
source attribution and an initial call task so they enter the existing daily
prospecting loop.

**Why this priority**: Sourcing only creates value when approved prospects flow
into the deployed call queue without bypassing safety or dedupe rules.

**Independent Test**: Approve a reviewed candidate and verify the resulting
prospect has source attribution, buyer type, status, contact fields, and a
bounded initial next action while no outbound message is sent.

**Acceptance Scenarios**:

1. **Given** Mitchel approves a staged candidate, **When** Trevor promotes it,
   **Then** `trevor.prospects` receives a durable prospect record with
   `lead_source`, buyer type, notes, and contact fields where available.
2. **Given** the approved candidate is call-ready, **When** it is promoted,
   **Then** Trevor can create or update a single open call task for initial
   outreach without creating duplicate tasks.
3. **Given** Mitchel does not explicitly approve a candidate, **When** sourcing
   completes, **Then** the candidate remains staged and does not enter the call
   queue.

### Edge Cases

- BrowserAct returns only business names, ratings, or partial contact data.
- CamoFox is used for enrichment but a target site presents a CAPTCHA, login
  wall, or blocks extraction.
- BrowserAct returns a task failure, partial CSV, JSON string instead of a
  file, or a long-running task that exceeds the workflow budget.
- Scraped data contains a real business with no phone/email/website.
- A candidate is a chain store, mall directory entry, duplicate location, or
  unrelated repair-only business.
- A candidate has the same company name as an existing prospect in another
  city.
- A candidate appears in Agiled but not Trevor, or Trevor but not Agiled.
- A live credential exists in production skill text but must not be copied into
  source control.
- Sourcing finds more candidates than Mitchel can realistically call.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST document a BrowserAct-first prospect sourcing
  workflow for bulk public business discovery and known template contact
  finding.
- **FR-002**: System MUST document CamoFox as the enrichment and verification
  workflow for candidate websites, contact details, and anti-bot pages after
  BrowserAct discovery.
- **FR-003**: System MUST NOT store BrowserAct, CamoFox, Agiled, database, or
  other production credentials in repository files.
- **FR-004**: System MUST stage scraped candidate businesses for review before
  they become active Trevor prospects.
- **FR-005**: System MUST preserve source attribution for every staged and
  promoted candidate.
- **FR-006**: System MUST classify candidate review status as recommended,
  needs-review, duplicate, rejected, or approved.
- **FR-007**: System MUST filter or flag known chain jewelers and other
  non-target businesses before promotion.
- **FR-008**: System MUST dedupe candidates against existing Trevor prospects
  before inserting new prospect records.
- **FR-009**: System MUST check Agiled for likely existing contacts before
  creating or linking CRM records.
- **FR-010**: System MUST require explicit Mitchel approval before promoting a
  staged candidate to active prospect status or queueing a call task.
- **FR-011**: System MUST create at most one open initial outreach call task
  per approved prospect.
- **FR-012**: System MUST never send outbound email, SMS, Telegram, social, or
  Agiled messages as part of sourcing or promotion.
- **FR-013**: System MUST treat scraped pages, third-party API responses, and
  model summaries as untrusted input and validate them before writes.
- **FR-014**: System MUST keep logs and review output bounded so they do not
  expose full scraped pages, secrets, or unnecessary prospect notes.

### Key Entities *(include if feature involves data)*

- **Sourcing Run**: A bounded request to find prospects for a target area,
  keyword set, or source. Tracks BrowserAct discovery status, optional CamoFox
  enrichment status, counts, and warnings.
- **Prospect Candidate**: A staged business found through scraping or research.
  Includes business name, area, phone, website, source, quality signals,
  review status, dedupe status, and reviewer notes.
- **Candidate Review**: Mitchel/operator decision that approves, rejects, or
  requests more review for a staged candidate.
- **Trevor Prospect**: Existing durable buyer profile in `trevor.prospects`.
  Receives approved candidate data and source attribution.
- **Call Task**: Existing queue item in `trevor.call_tasks` used for initial
  outreach after approval.
- **External Source**: Public web pages, CamoFox browser sessions, BrowserAct
  task results, and Agiled search results used as untrusted input.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Mitchel can request prospect sourcing for a named area and receive
  a reviewable candidate list in one workflow.
- **SC-002**: 100% of promoted prospects include non-empty source attribution.
- **SC-003**: 100% of candidate promotions require an explicit approval action.
- **SC-004**: Duplicate or rejected candidates create zero new active prospects
  and zero call tasks.
- **SC-005**: The workflow can process at least 30 discovered businesses in a
  sourcing run while presenting no more than 15 recommended candidates for
  immediate review.
- **SC-006**: No repository-controlled file contains live BrowserAct, CamoFox,
  Agiled, Postgres, or other production credentials.

## Assumptions

- Mitchel's best near-term prospect source is independent jewelry stores,
  diamond dealers, and similar retail or wholesale buyers, not inventory lists.
- BrowserAct is the preferred first pass for bulk discovery and template
  contact finding; CamoFox enriches or verifies records after BrowserAct when
  deeper website scraping or stealth browsing is needed.
- Existing `trevor.prospects`, `trevor.call_tasks`, and Agiled tools remain the
  persistence and CRM surfaces.
- Staged candidate storage may be introduced in Trevor Postgres if existing
  tables cannot safely represent review-only data.
- Direct outbound sends remain out of scope.
