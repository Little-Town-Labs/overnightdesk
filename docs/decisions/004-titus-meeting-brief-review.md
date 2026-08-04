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

## Current decision: single-pass Titus analysis

Feature 035 now uses one bounded private Titus chat request followed by local
strict Meeting Brief v1 validation. It does not create meeting sessions,
delegate children, emit a QA envelope, or perform Hermes session cleanup. The
existing custody, SecurityTeam, fixed-recipient email, human approval, private
filer, and recording stream/discard boundaries remain unchanged.

## Decision (historical session design; superseded 2026-08-03)

1. Keep organizer-scoped Graph polling for ordinary Gary/Austin meetings.
2. Encrypt raw transcript custody for 168 hours, then delete ciphertext
   automatically. Stream, hash, and discard recording MP4 without analysis.
   Use versioned key IDs; overdue ciphertext or missing keys fail closed and
   stop new transitions while deletion sweeps continue.
3. Use the existing private Titus Hermes API in a dedicated meeting session.
   Primary Sol delegates a bounded first draft to the configured Luna child,
   then performs the accountable QA review using Titus's existing project
   knowledge. Feature 035 adds no model, provider, OAuth, or analyzer identity.
4. Permit at most one Luna remediation and one Sol delta review. Accept email
   eligibility only from an exact `meeting-qa/v1` `QA_PASS` envelope bound to
   the local meeting reference, attempt, and source digest. Discover the child
   sessions by parent lineage, verify their observed configured Luna route, and
   require the latest child's strict Meeting Brief canonical digest to equal
   the envelope brief before deterministically rendering email,
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
12. Use Hermes Runs and Sessions rather than stateless chat completion. Persist
    deterministic session, run-body, and child correlation; record network
    ambiguity before the sole run submission; and never resubmit an ambiguous
    attempt. Treat a Titus restart during child execution as unknown/retryable.
    Enumerate children, delete the parent, and verify authenticated not-found
    reads for parent and children before email or final block.
13. Audit parent tool calls before `QA_PASS`: only one or two exact single-leaf
    `delegate_task` calls with the fixed goal and safe-prefix context are
    allowed, and Feature 035 never resolves tool approval requests. Prefix Luna
    context with a fixed ASCII block of at least 512 bytes, longer than Hermes's
    delegation-log kickoff preview, so raw transcript text does not enter that
    cache artifact.

## Alternatives Considered

### Use a separate no-tool meeting analyzer

Rejected after initial implementation because it bypassed Titus's existing
knowledge, introduced a second model/provider/OAuth lifecycle, and did not meet
the owner's expectation that Titus owns interpretation. The retained controls
are code-enforced output validation, session/tool-call auditing, non-resolution
of tool approvals, fixed-recipient email, and human approval before filing.

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

- Only the deterministic filer remains an additional private runtime surface;
  the analyzer service and its model credential are retired.
- Titus retains its existing knowledge and authority boundary. Analysis is
  isolated by a dedicated session and cannot make Feature 035 email or filing
  decisions without code validation and the existing human approval gate.
- Interactive Titus is not occupied by Luna's draft because delegation runs in
  the background, although both paths share the Titus process and provider quota.
- The filer is useful only after approval; it never sees raw transcript.
- Approved notes/tasks are create-only and are not automatically retracted.
- Unknown project work remains visible without granting project-creation
  authority to model output.
- The channel bot can evolve independently without reopening the organizer
  meeting-brief trust model.

## Superseding simplification (2026-08-03)

The nested Sol/Luna session decision above is superseded for the basic meeting
brief path. Feature 035 now uses one bounded stateless Titus request and local
strict JSON validation. The worker no longer creates meeting sessions,
delegates children, audits Hermes tool calls, or performs session cleanup. This
removes the failure-prone model-contract orchestration while preserving the
important boundaries: encrypted custody, SecurityTeam screening, fixed
recipient email, deterministic human approval, private filing, and recording
stream/discard. Future background delegation requires a separate measured
feature decision.
