---
name: transcript-processing-status
description: Read-only Aegis status checks for Titus meeting transcript processing. Use when the user asks how Hermes or Titus is processing a Teams meeting transcript, requests current meeting-brief or recording-custody status, or wants a fresh production update. Report only safe aggregate health, polling freshness, lifecycle states, and redacted error codes; never retrieve transcript content or perform a processing/deployment mutation.
---

# Transcript Processing Status

Use the bundled checker to obtain a fresh, content-free production snapshot of
the Titus meeting processor. The checker uses the documented Aegis SSH key and
preserves host-key verification.

## Workflow

1. Announce that the check is read-only.
2. Run from the repository root:

   ```bash
   bash .agents/skills/transcript-processing-status/scripts/check-status.sh
   ```

   Use `--key`, `--host`, `--user`, or `--since` only when the operator's
   environment requires a different documented connection or observation
   window. Never add `StrictHostKeyChecking=no`, print runtime files, or use a
   command that runs a processing cycle.
3. Treat a connection failure, missing key, missing health record, stale health,
   unhealthy service, retryable error, custody blocker, or blocked brief as an
   operational condition to report—not as permission to restart, retry, reset,
   or mutate production.
4. Summarize the result with the observed UTC time, processor/Titus service
   health, latest health timestamp, stream freshness and retry counts, safe
   meeting counters, and the latest lifecycle events.

## Interpretation

- **Healthy and awaiting artifact**: processor and streams are healthy, cursors
  are present, retries and safe errors are zero, and the latest transcript poll
  reports no new artifact. The meeting may still be waiting for Teams/Graph
  transcript availability or the next poll.
- **Processing**: a recent `meeting_analysis_state` is `dispatching` or the
  aggregate shows `analysis_pending`.
- **Awaiting review**: `meeting_brief_created` and `meeting_email_sent` have
  completed, with `pending_review` greater than zero.
- **Blocked or degraded**: any `cycle_failed`, non-healthy service/stream,
  `blocked` or `cleanup_blocked` record, custody overdue/missing-key count, or
  non-empty safe error code.
- **Stale**: the health timestamp or latest successful poll is older than the
  check's expected operating window. Report the age explicitly.

The supported meeting path is the separate `titus-meeting-processor`: eligible
scheduled, non-channel meetings are discovered, screened, encrypted into
seven-day custody, sent through one bounded tool-free Titus request, locally
validated, and emailed to the fixed recipients before review. Channel meetings
are outside this pipeline. See
`tenants/hermes-titus/runbooks/meeting-artifact-discovery.md` for the boundary.

## Safety and output rules

- Keep output content-free. Use only the checker output: aggregate counters,
  stream states, timestamps, event names, lifecycle states, and safe error
  codes.
- Do not print or inspect transcript text, brief bodies, Graph responses,
  provider identifiers, meeting references, participant data, `state.json`,
  `meeting-brief-state.json`, `runtime.json`, custody files, or secret values.
- Do not run `run-once`, restart services, enable/disable markers, reset a
  brief, send email, approve/hold a brief, or deploy anything as part of a
  status check.
- If the user needs a fresh check after a meeting, run the checker again after
  the next normal poll rather than forcing a cycle.

## Completion criterion

Finish with either a fresh safe status update or a precise connection/health
blocker. State clearly whether the meeting is processing, awaiting artifact
availability, awaiting review, or blocked. Do not claim that a new transcript
was processed unless the live aggregate or lifecycle events prove it.
