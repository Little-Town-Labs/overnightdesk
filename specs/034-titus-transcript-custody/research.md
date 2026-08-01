# Research: Titus Transcript Custody

## Microsoft Graph transcript content

**Decision**: Use the meeting-specific v1.0 content route with the organizer,
meeting, and transcript IDs already held in private discovery state. Request
`text/vtt`, reject redirects, require an allowed content type, and cap the body
at 1,000,000 bytes.

Microsoft documents the route as
`/users/{userId}/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content`.
The default/attributed representation is WebVTT. Transcript access and speaker
attribution have independent tenant controls and distinct 403 errors.

Source: https://learn.microsoft.com/en-us/graph/api/calltranscript-get?view=graph-rest-1.0

## Raw-content custody

**Decision**: Do not create raw files, raw database rows, or a transcript
volume. Read the bounded response into memory, calculate a digest, submit it to
SecurityTeam, and release the buffer. Only digests and Titus output survive.

**Rejected alternatives**:

- Titus project knowledge: too broad and expressly excludes private source
  records.
- Existing `content_staging`: durable raw storage would require a new deletion
  policy and cleanup implementation.
- New transcript volume: adds access, backup, retention, and deletion machinery
  without helping the pilot outcome.

## SecurityTeam screening

**Decision**: Reuse `/scan-inbound` with source `api`, which is treated as high
risk by the frontier scanner. Add optional `approvalMode: "block"`; when review
would be required, return blocked without writing the approval queue. The
default remains the current queue behavior for all existing clients.

This produces a screened external-content wrapper, performs secret redaction,
and avoids long-lived transcript payloads in approval storage.

## Titus API surface

**Decision**: Use authenticated `POST /v1/chat/completions`, not `/v1/runs`.
The chat endpoint is documented as stateless: the client supplies the complete
conversation, and no reusable transcript session or session key is required.
The request asks for one bounded Markdown meeting record.

Official Hermes documentation also states that the API-server platform retains
the agent's toolset and additive system instructions do not remove tools. This
means prompt wording alone is not the safety boundary. SecurityTeam screening,
stateless isolation, fixed input boundaries, no approval endpoint, and Titus's
existing command-approval policy are all required.

Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/

## Output destination

**Decision**: Store Titus's bounded Markdown output in the existing private
meeting-processor state and expose it only through the protected derived
handoff. Do not write the result into general project knowledge automatically.

The record includes internal reference, organizer slot, provider-created time,
processing time, output digest, and output. Provider IDs and URLs remain private
state only. A later user-facing knowledge or delivery integration can consume
the derived handoff after its own authorization decision.

## Recording content

**Decision**: Continue recording metadata discovery but do not retrieve the
binary recording. The available transcript satisfies the meeting-analysis
outcome with substantially lower custody, cost, media, and retention risk.
Recording content remains a separate later decision.

## Activation

**Decision**: Use a root-owned host marker. With the marker absent, the Phase
loader does not fetch or project the SecurityTeam and Hermes credentials. With
it present, the loader merges only `SECURITY_SERVICE_TOKEN`, `HERMES_API_KEY`,
and the fixed private service origins. This enables a disabled-first deploy and
an independent content-only rollback without changing Phase's established key
sets.
