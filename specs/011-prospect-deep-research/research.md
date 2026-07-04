# Research: Prospect Deep Research

## Decision: Evidence-first storage

Store every public finding in `trevor.prospect_research_evidence` before any prospect mutation.

**Rationale**: Research quality varies by source. Evidence-first storage preserves provenance and supports human review without corrupting core prospect records.

**Alternatives considered**:

- Append notes directly to `trevor.prospects.notes`: rejected because it mixes raw findings with canonical sales notes.
- Reuse `prospect_email_enrichment` only: rejected because this feature also captures business context, closure signals, city/chamber evidence, and source quality.

## Decision: Prioritize missing-email prospects

Claim order should prefer missing-email prospects, then prospects with weaker business context, then refresh candidates.

**Rationale**: Missing-email prospects are most blocked operationally, but all prospects benefit from broader context.

**Alternatives considered**:

- Research only missing-email prospects: rejected by user requirement.
- Research newest prospects first: rejected because it does not target the largest current gap.

## Decision: RDAP/WHOIS as domain-verification only

RDAP/WHOIS evidence may support whether a website plausibly belongs to a business, but it must not create an email-promotable finding.

**Rationale**: RDAP/WHOIS is often privacy-proxied, stale, registrar-oriented, or personal. Registrar abuse and privacy proxy emails are not business outreach contacts.

**Alternatives considered**:

- Use RDAP contact emails as candidate emails: rejected for privacy, quality, and deliverability reasons.
- Exclude RDAP entirely: rejected because domain age/status and organization hints can still be useful context.

## Decision: Review-gated promotion

Approved evidence can later be promoted to email enrichment or a concise prospect note through explicit review actions.

**Rationale**: The same evidence table can support both email discovery and broader business intelligence while keeping review/audit state explicit.
