# ADR-004: Separate Titus meeting interpretation from filing authority

## Status

Accepted

## Date

2026-08-01

## Context

Issue 159 proved organizer-scoped Teams metadata discovery and transcript
processing, but the user needs a complete operating loop: a reviewable internal
brief, seven-day raw transcript custody, approval by Gary or Austin, permanent
project notes, internal Kanban action tracking, and recording retrieval.

The main Titus Hermes API intentionally has broad tools, memory, project
knowledge, and channel integrations. The meeting worker handles untrusted Graph
content and holds Graph credentials. Granting either component the combined
authority to interpret a transcript and mutate permanent business records would
violate the constitution's untrusted-output and human-approval boundaries.

The user has granted a narrow standing authorization to send each draft meeting
brief automatically to exactly Gary and Austin. This does not authorize any
other automatic Titus email or any external follow-up.

## Decision

1. Keep organizer-scoped Graph polling for ordinary Gary/Austin meetings.
2. Encrypt raw transcript custody for 168 hours, then delete ciphertext
   automatically. Stream, hash, and discard recording MP4 without analysis.
   Use versioned key IDs; overdue ciphertext or missing keys fail closed and
   stop new transitions while deletion sweeps continue.
3. Use a separate private Hermes analyzer configured with `no_mcp`, no durable
   memory/project/session mounts, a distinct bearer, and no public port.
4. Accept only strict Meeting Brief v1 JSON and deterministically render email,
   notes, and tasks from validated values.
5. Send the draft automatically only to the exact Gary/Austin recipient set,
   after SecurityTeam outbound screening and provider idempotency/readback.
   Ordinary Titus guarded-email approval remains unchanged.
6. Parse only exact `APPROVE <reference>` or `HOLD <reference>` replies from
   Gary/Austin after the email poller's existing SecurityTeam clean claim. The
   poller signs an HMAC sender fingerprint and exact decision body; the worker
   derives the actor after verification. The first terminal decision wins and
   bypasses general Hermes processing.
7. Use a separate authenticated deterministic filer with project-knowledge and
   Kanban mounts but no Graph, email, model, or general Titus credentials.
8. Route only exact allowlisted projects. Unknown projects use a create-only
   inbox note and the dedicated `meeting-triage` Kanban board. Every internal
   action and external commitment becomes internal Kanban work only.
9. Track channel meetings, Teams meeting-chat bot scopes, and Graph subscription
   lifecycle as a separate feature with its own identity and activation gate.
10. Keep organizer discovery state readable at version 2, replace legacy
    free-form Titus output bodies with one exact validator-compatible safe
    sentinel after preserving their verified original digests in separate
    Feature 035 provenance, and store Feature 035 lifecycle in a separate
    version-1 document so rollback requires no down-migration.
11. Bind private API idempotency to SHA-256 of exact request bytes and derive
    filing sub-operation keys from versioned NUL-delimited inputs.

## Alternatives Considered

### Use the main Titus API with a no-tools prompt

Rejected because the server still exposes tools and memory. Prompt text cannot
enforce an authority boundary against untrusted transcript content.

### Give the meeting worker direct project and Kanban mounts

Rejected because the Graph-ingestion process would hold both untrusted content
and permanent business-record write authority.

### Use the Hermes dashboard Kanban plugin route directly

Rejected because stock plugin routes are designed for a trusted local dashboard
boundary, not as the authenticated sensitive-mutation interface between
containers.

### Let Titus interpret natural-language approval

Rejected because approval must be deterministic, replay-safe, sender-bound, and
auditable without model judgment.

### Add webhooks and a channel bot now

Rejected because public ingress, subscription renewal, Teams scope, and channel
identity are independent operational risks and are unnecessary for the current
organizer-scoped workflow.

## Consequences

- Two additional private runtime surfaces must be built and monitored, but each
  has a small credential and filesystem boundary.
- The analyzer is useful only for interpretation; it cannot act.
- The filer is useful only after approval; it never sees raw transcript.
- Approved notes/tasks are create-only and are not automatically retracted.
- Unknown project work remains visible without granting project-creation
  authority to model output.
- The channel bot can evolve independently without reopening the organizer
  meeting-brief trust model.
