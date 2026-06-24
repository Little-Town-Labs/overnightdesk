# Research: Follow-Up Drafting

## Decision: Keep follow-up drafts in `trevor-db`

**Rationale**: The workflow reads prospects and interactions and writes `trevor.followup_drafts`. Keeping it in the existing MCP server reuses the current DB connection, validation boundary, deployment path, and test harness.

**Alternatives considered**:

- New MCP server: rejected because draft generation does not introduce a new service boundary.
- Generic `db_execute`: rejected because drafts need duplicate handling, channel validation, approval state rules, and no-send guarantees.

## Decision: Deterministic template drafts first

**Rationale**: Deterministic drafts are easier to test, review, and operate. They can still include buyer context and call summary, but avoid unbounded model-generated claims in the first deployable slice.

**Alternatives considered**:

- LLM-generated drafts: deferred until prompt safety, tone controls, and evaluation examples exist.
- Hand-written free text only: rejected because the value is Trevor preparing useful copy from structured context.

## Decision: One active draft per interaction/channel

**Rationale**: Duplicate active drafts create approval ambiguity. Returning the existing active draft for the same interaction and channel is safer than creating multiple competing drafts. Regeneration can be explicit later.

**Alternatives considered**:

- Always create a new draft: rejected because approval state becomes confusing.
- Global duplicate detection by text: rejected because similar content can be valid across different interactions.

## Decision: Approval state only, no send metadata

**Rationale**: Sending is out of scope. Feature 5 should make approval explicit without implying an external message was sent or creating `sent` rows.

**Alternatives considered**:

- Mark approved drafts as sent: rejected because it would falsify delivery.
- Store external message IDs manually: deferred until direct/manual send logging is designed.

## Decision: DNC-safe draft behavior

**Rationale**: Do-not-contact prospects must not receive persuasive follow-up language. The tool should warn and produce only an internal/admin note style draft or refuse channel-specific sales copy.

**Alternatives considered**:

- Block all DNC draft creation: stricter, but prevents recording opt-out/admin wording. The first slice allows a non-sendable warning response and keeps `outbound_sent=false`.
