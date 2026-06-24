# Research: Post-Call Capture

## Decision: Keep capture in `trevor-db`

**Rationale**: The workflow writes to the same Trevor prospecting tables that power queue and brief generation. Keeping it in the existing MCP server avoids another tenant service, reuses the existing DB connection and test harness, and keeps Mitchel's prospecting tools discoverable in one place.

**Alternatives considered**:

- New MCP server: rejected because it adds deployment and config surface without a separate ownership boundary.
- Generic `db_execute`: rejected for repeated workflow use because it lacks validation, duplicate protection, and operator-friendly response shape.

## Decision: Local write first, Agiled note second

**Rationale**: Trevor Postgres is the agent-optimized working record. A local interaction and prospect state update should succeed even if Agiled is unavailable or unlinked. Reporting Agiled status separately lets the operator reconcile CRM sync failures without losing the call outcome.

**Alternatives considered**:

- Agiled-first transaction: rejected because CRM failures would prevent local capture.
- Single all-or-nothing transaction across Postgres and Agiled: rejected because there is no shared transaction boundary across systems.

## Decision: No follow-up drafts in Feature 4

**Rationale**: Feature 5 owns follow-up drafting and approval. Feature 4 should stop after structured capture and explicit status reporting, preserving the no-outbound boundary and keeping the implementation reviewable.

**Alternatives considered**:

- Create draft automatically for interested outcomes: rejected because it couples capture to approval workflow before draft storage and approval state are implemented.

## Decision: Missing-field response before writes

**Rationale**: Post-call capture must be fast but safe. If the tool cannot identify a prospect/task or lacks a required outcome, it should return a bounded missing-field list and perform no partial writes.

**Alternatives considered**:

- Store incomplete capture drafts: rejected for the first slice because it needs a new lifecycle and cleanup rules.

## Decision: Idempotency tied to completed task

**Rationale**: Feature 2 already creates durable call tasks. Preventing duplicate capture for a completed task is the simplest operator-facing duplicate guard for the common queue-driven path.

**Alternatives considered**:

- Global summary/date duplicate detection: rejected because it risks suppressing legitimate repeated calls to the same prospect.
