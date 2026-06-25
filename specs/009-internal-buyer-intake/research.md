# Research: Internal Buyer Intake

## Decision: Extend `trevor-db` with one purpose-built intake tool

**Rationale**: The existing `trevor-db` MCP server already owns the safe write
boundary for Mitchel prospecting. It contains purpose-built tools for post-call
capture, follow-up drafts, call queue tasks, candidate sourcing, dedupe, and
promotion. A single intake tool can reuse those repository patterns while
keeping writes reviewable and testable.

**Alternatives considered**:

- Raw `db_execute` instructions: rejected because intake touches prospects,
  interactions, call tasks, follow-up drafts, source attribution, and dedupe.
  Prompt-only SQL would be easy to misuse.
- New standalone service: rejected because this is tenant-specific and would
  duplicate deployment, auth, and repository patterns already present in
  `trevor-db`.
- Public website form first: rejected because the roadmap explicitly sequences
  internal intake before public landing page work.

## Decision: Local Trevor write succeeds independently from Agiled sync

**Rationale**: Trevor is the durable local operating system for Mitchel's call
queue and conversation history. Agiled is an external CRM integration and may be
unavailable, incomplete, or stale. Intake should preserve the conversation in
Trevor even when Agiled matching or update is skipped or fails, while reporting
the Agiled result clearly.

**Alternatives considered**:

- Require Agiled success before local writes: rejected because a CRM outage
  would lose live conversation notes.
- Ignore Agiled in v1: rejected because duplicate prevention and CRM drift are
  explicit roadmap concerns. The v1 contract can report not-attempted, skipped,
  linked, updated, created, or failed without forcing every branch to perform a
  CRM write.

## Decision: Dedupe must be conservative and reviewable

**Rationale**: Duplicate prospects degrade call queues and follow-up history,
but over-aggressive automatic merging risks corrupting buyer records. Clear
phone/email matches can update directly; multiple name/company matches should
return needs-review with bounded candidates and avoid ambiguous writes.

**Alternatives considered**:

- Always create a new prospect: rejected because existing sourcing and call
  queue work depends on deduped active prospects.
- Always merge the closest textual match: rejected because business names and
  personal names are often ambiguous.

## Decision: Intake writes a bounded interaction, not full transcripts

**Rationale**: Long pasted notes may contain irrelevant data, secrets, or
instruction-like text. Trevor needs a concise business summary and structured
next-action facts, not raw transcripts. This follows the existing post-call
capture and sourcing safety rules.

**Alternatives considered**:

- Store full notes in `trevor.interactions`: rejected because it increases
  privacy, prompt-injection, and log/output risks.
- Store only structured fields: rejected because Mitchel often captures live
  conversations quickly and needs free-form context preserved in summary form.

## Decision: Next actions are internal work only

**Rationale**: The established safety boundary is draft-first and approval
first. Intake may create a call task or follow-up draft request when Mitchel
asks, but it must not send emails, texts, social messages, Telegram messages, or
any other outbound communication.

**Alternatives considered**:

- Send follow-ups directly from intake: rejected until a separate approved
  channel-send feature handles approval, audit, opt-out, and channel policy.
- Never create next actions: rejected because turning conversations into
  follow-up work is a core value of Feature 9.

## Decision: Feature 10 reuses the same contract later

**Rationale**: The future `mitchelbrown.com` inquiry form should not create a
second lead pipeline. Designing the internal contract now with source
attribution, dedupe outcomes, needs-review status, and no automatic sends lets
the public form submit into the same reviewed path later.

**Alternatives considered**:

- Build website-specific fields now: rejected because hosting, spam controls,
  and public UX are explicitly Feature 10.
