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

## Decision: Disabled-by-default weekly scheduler artifact

Define the weekly missing-email enrichment rerun and deep research cadence in a repo-owned template, but keep production activation disabled until migration 055, MCP deployment, and on-demand smoke tests are complete.

**Rationale**: The requested cadence is operationally useful, but the live scheduler shape and production side effects need explicit validation. A template captures the intended Saturday 23:00 America/Chicago wall-clock schedule without silently enabling automation.

**Alternatives considered**:

- Enable live production jobs immediately: rejected because the deep research runner is still a later slice and production scheduler support must be verified against the live Hermes runtime.
- Use UTC-only cron in the repository: rejected because the requested schedule is Central US local time and daylight-saving changes would make a fixed UTC offset wrong part of the year.
- Combine enrichment and research in one job: rejected because the two paths have different prerequisites, smoke tests, and rollback needs.

## Decision: Hermes cron adapter with Central wake gate

Use a disabled Hermes-compatible install plan with cron expression `0 4,5 * * 0` and pre-run script `prospect-weekly-central-gate.sh`.

**Rationale**: Live Hermes cron supports cron expressions and pre-run wake gates, but not timezone-aware schedule objects. Firing at both possible UTC hours and suppressing the non-matching Central-time run preserves the requested Saturday 23:00 America/Chicago wall-clock time across CST/CDT without modifying Hermes itself.

**Alternatives considered**:

- `0 23 * * 6`: rejected because the host and container run UTC, so this would run at 23:00 UTC, not 23:00 Central.
- Fixed `0 4 * * 0`: rejected because it is correct during CDT but one hour early during CST.
- Fixed `0 5 * * 0`: rejected because it is correct during CST but one hour late during CDT.
