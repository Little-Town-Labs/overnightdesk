# ADR-003: Screen Transcripts Before Stateless Titus Analysis

## Status

Accepted

## Date

2026-08-01

## Context

The meeting delta worker has discovered Gary's completed transcript and
recording metadata. Titus needs a derived meeting record, but raw meeting text
is confidential external input and Hermes API-server runs retain the agent's
normal toolset. Copying the transcript into project knowledge, a staging table,
an approval queue, or a reusable Hermes session would create unnecessary
retention and authority.

## Decision

Extend the existing meeting worker with a separately activated transcript-only
custody path. Retrieve the exact Graph WebVTT route into a bounded in-memory
buffer, send it through SecurityTeam with `approvalMode=block`, and submit only
the screened wrapper to Titus through authenticated stateless chat completion.
Process at most one incomplete transcript per cycle.

Persist only existing protected provider identifiers, content digests,
allowlisted lifecycle state, timestamps, and a bounded Markdown result. Reject
results containing protected identifiers, Graph routes, or credential markers.
Do not retrieve recording content, add Graph tools to Titus, write general
project knowledge, create public ingress, or create a provider subscription.

A root-owned empty mode-0444 marker controls the content projection. Without
the marker, SecurityTeam and Hermes credentials are absent and metadata
discovery remains active. Removing the marker is the content-only rollback and
does not stop Titus or the meeting worker.

## Consequences

- Raw and screened transcript input has zero worker-side durable retention.
- SecurityTeam review-required content is blocked without approval-queue
  persistence.
- Titus output is private derived operational data in the existing state
  volume and backup boundary.
- A completed artifact is idempotent across cycles and restarts; ambiguous
  transient failures remain retryable and terminal unsafe output remains
  blocked.
- Austin does not need to conduct a second meeting for the Gary canary.
- Recording content and user-facing publication remain later decisions.
