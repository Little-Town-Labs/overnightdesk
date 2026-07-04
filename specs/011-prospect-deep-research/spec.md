# Feature Specification: Prospect Deep Research

**Feature Branch**: `011-prospect-deep-research`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "Deep research pass for all Trevor prospects, prioritizing prospects missing email; store public web research evidence in a new foreign-keyed table; include official sites, city/town/chamber directories, news, business context, and RDAP/WHOIS only for domain verification; high-confidence notes are reviewable and can be promoted; no outbound messaging or guessed/private emails."

## User Scenarios & Testing

### User Story 1 - Store Reviewable Public Evidence (Priority: P1)

Mitchel and the operator can run or review a deep research pass that records public evidence for every Trevor prospect without changing the core prospect record automatically.

**Why this priority**: The evidence table is the durable foundation for broader business context, email discovery, review, and future promotion workflows.

**Independent Test**: Can be tested by storing evidence for one prospect and verifying the row is linked to `trevor.prospects`, carries source attribution, confidence, review status, and does not update `trevor.prospects.email`.

**Acceptance Scenarios**:

1. **Given** an existing prospect, **When** a public chamber directory finding is stored, **Then** the evidence row is linked to that prospect and marked reviewable.
2. **Given** an existing prospect with no email, **When** a candidate email is found on an official contact page, **Then** it is stored as evidence and not written directly to the prospect email field.
3. **Given** a prospect is deleted, **When** related evidence exists, **Then** evidence rows are deleted through the foreign-key relationship.

---

### User Story 2 - Prioritize Missing-Email Research (Priority: P2)

Mitchel can process the full prospect table while automatically prioritizing missing-email prospects before lower-value refresh candidates.

**Why this priority**: Missing-email prospects have the highest operational value, but all prospects need broader context over time.

**Independent Test**: Can be tested by seeding prospects with and without email and verifying the claim order returns missing-email records first.

**Acceptance Scenarios**:

1. **Given** prospects with and without email, **When** a deep research batch is claimed, **Then** missing-email prospects are returned before prospects that already have email.
2. **Given** a missing-email prospect has a website or contact clue, **When** a batch is claimed, **Then** it is prioritized ahead of missing-email prospects without website clues.
3. **Given** all missing-email prospects have been researched, **When** another batch is claimed, **Then** prospects with existing email can be selected for business-context refresh.

---

### User Story 3 - Review and Promote High-Confidence Findings (Priority: P3)

Mitchel or the operator can review high-confidence findings and promote approved notes or email evidence through controlled paths.

**Why this priority**: Research should improve sales context without allowing weak web evidence, RDAP privacy data, or ambiguous emails to overwrite business records.

**Independent Test**: Can be tested by approving one high-confidence official-site finding and rejecting one RDAP/private contact finding, then verifying only the approved finding becomes promotable.

**Acceptance Scenarios**:

1. **Given** evidence with `official` confidence from a public contact page, **When** it is approved, **Then** it becomes eligible for controlled promotion to email enrichment or a prospect note.
2. **Given** evidence from RDAP/WHOIS, **When** it contains contact-like data, **Then** the system treats it as domain verification only and does not mark it as email-promotable.
3. **Given** multiple conflicting candidate emails exist, **When** evidence is reviewed, **Then** the prospect remains in review until a human chooses or rejects the candidates.

### Edge Cases

- RDAP/WHOIS results may be redacted, privacy-proxied, stale, or registrar abuse contacts; these must never be sufficient email evidence.
- City, town, chamber, or news pages may mention old locations, closures, or ownership changes; evidence must include dated notes where available.
- Scraped pages and search snippets are untrusted text; notes must be bounded and stored as summaries, not raw pages.
- Duplicate evidence for the same prospect/source/value should be suppressed or updated rather than repeatedly inserted.
- Do-not-contact prospects may still receive internal research context, but no outreach task or outbound action may be created.

## Requirements

### Functional Requirements

- **FR-001**: System MUST store deep research findings in a table with a foreign key to `trevor.prospects`.
- **FR-002**: System MUST support research for all prospects while prioritizing prospects missing email.
- **FR-003**: System MUST classify public sources by type, including official site, contact page, city/town directory, chamber directory, news story, business listing, RDAP/WHOIS, and other public source.
- **FR-004**: System MUST store source URL, source title when known, search-location note, evidence note, confidence, review status, and optional found email/phone/business context.
- **FR-005**: System MUST treat RDAP/WHOIS as domain-verification evidence only and MUST NOT use registrar abuse, privacy proxy, or personal registrant contacts as outreach email evidence.
- **FR-006**: System MUST prevent direct writes to `trevor.prospects.email` from unreviewed deep research evidence.
- **FR-007**: System MUST support review states for evidence: pending review, approved, rejected, and superseded.
- **FR-008**: System MUST make approved high-confidence notes available for controlled promotion to the prospect record or email enrichment workflow.
- **FR-009**: System MUST retain public provenance for every promoted finding.
- **FR-010**: System MUST expose bounded MCP tools for storing, listing, and reviewing research evidence without sending outbound messages.

### Key Entities

- **Prospect Research Evidence**: A public evidence row linked to one Trevor prospect, containing source attribution, findings, confidence, review status, and promotion metadata.
- **Research Run**: A bounded run or batch that records who requested research, how many prospects were considered, and status/counts.
- **Trevor Prospect**: Existing durable prospect record that research evidence references.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A 5-prospect smoke can store evidence for missing-email and existing-email prospects with zero direct email writes.
- **SC-002**: Missing-email prospects appear first in claim order in all tested mixed batches.
- **SC-003**: 100% of stored evidence rows include a prospect link, source type, source URL or explicit source-location note, confidence, and review status.
- **SC-004**: RDAP/WHOIS evidence cannot produce an email-promotable result in validation tests.
- **SC-005**: Duplicate evidence inserts for the same prospect/source/value are suppressed or updated.

## Assumptions

- Trevor Postgres remains the source of truth for prospects and research evidence.
- First implementation is evidence-first and review-first; web search automation and promotion can ship in later slices.
- Existing CamoFox and web research helpers can be reused where appropriate but must not send outbound messages.
- The production rollout will follow the existing Aegis backup, migration, smoke, and deploy-log process.
