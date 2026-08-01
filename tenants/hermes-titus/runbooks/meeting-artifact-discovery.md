# Titus Meeting Artifact Discovery

## Purpose and boundary

`titus-meeting-processor` is a separate deterministic service that discovers
metadata references for transcripts and recordings from scheduled,
non-channel meetings organized by the two approved pilot users. A separate
host marker can activate bounded transcript retrieval, SecurityTeam screening,
and stateless Titus analysis. The service does not run inside Hermes, expose
Microsoft Graph as an agent tool, create a webhook or subscription, retrieve
recording content, or mount raw transcript input into Titus.

The worker uses `/agents/hermes-titus/teamsmeetings`. Keep `MSGRAPH_*` meeting
credentials separate from the interactive Teams bot's `TEAMS_*` identity. The
root loader receives the Phase service token, validates the exact source
object, and writes only the six-field worker runtime file while content is
disabled. With the valid root-owned activation marker present, it additionally
selects only the existing SecurityTeam token and private Titus API key/origin.
Neither the Phase token nor webhook/test values enter the container.

## Source qualification

From `tenants/hermes-titus/meeting-processor`:

```bash
scripts/qualify.sh
```

The gate runs Go unit/race/vet/build checks, Python projection and security
contracts, shell parsing, source leak checks, an ARM64 image build, and image
and container inspection. Any recording-content route, non-exact transcript
route, public port, cross-identity key, secret environment injection, unpinned
builder, or unsafe runtime setting is a release blocker.

## Production preparation

Preparation and activation are separate decisions. Source readiness does not
authorize either.

```bash
scripts/deploy-aegis.sh prepare
scripts/deploy-aegis.sh install-disabled
scripts/deploy-aegis.sh initialize
scripts/deploy-aegis.sh verify-disabled
```

On a new host, the disabled install leaves the systemd unit inactive. On the
active production discovery service, it preserves metadata operation, removes
no state, keeps the content marker absent, and restarts only the meeting worker
onto the new code. In both cases, no content credential is projected.

## Metadata-only canary

After explicit production authorization, enable the service and verify:

```bash
scripts/deploy-aegis.sh enable
scripts/deploy-aegis.sh verify
scripts/deploy-aegis.sh restart-verify
```

Required evidence contains status and counts only:

1. The container is unprivileged, read-only, capability-free, resource-bound,
   attached only to the private OvernightDesk network, and has no published
   ports or secret environment variables.
2. All four organizer/type streams have fresh success and cursor presence.
3. The completed Gary pilot yields one transcript and one recording reference.
4. Austin's two streams succeed with zero artifacts until he conducts his own
   pilot meeting.
5. Restart advances from retained cursors and emits zero duplicate discoveries.
6. With content disabled, no content endpoint is called and no provider identifier or URL appears in
   health, logs, operator output, or the safe handoff.
7. Titus, the interactive Teams bot, and unrelated services remain healthy and
   unchanged.

## Transcript-to-Titus canary

SecurityTeam's deployed `approvalMode=block` dependency must pass its
zero-enqueue canary first. Then activate only transcript content:

```bash
scripts/deploy-aegis.sh enable-content
scripts/deploy-aegis.sh verify-content
scripts/deploy-aegis.sh restart-verify
```

Required value-safe evidence:

1. The host marker is a root-owned, empty, non-symlink mode-0444 file.
2. The runtime projection has the fixed private origins and bounded values;
   secrets remain absent from Docker environment metadata and operator output.
3. Gary's previously discovered transcript moves from `pending` to `processed`
   exactly once. The safe content-status command reports aggregate counts only.
4. The state and handoff contain a bounded derived Markdown record and digests,
   but not raw WebVTT, screened input, provider routes, or credential markers.
5. A meeting-worker-only restart and another cycle make zero transcript
   downloads and zero Titus analyses for the completed artifact.
6. Recording content is never requested. Austin may remain at zero artifacts;
   his absence is not a canary failure.

Do not print or copy `runtime.json`, `state.json`, Phase output, Graph responses,
or Docker mount-source contents into chat, issues, logs, or general agent
memory. Inspect only modes, ownership, booleans, safe status, and counts.

## Failure response

| Safe code | Operator action |
| --- | --- |
| `state_lock_busy` | Confirm only one service/container owns the volume; do not delete lock or state files. |
| `token_unavailable` / `token_rejected` | Stop activation, verify credential presence and consent without displaying values, then use a controlled restart. |
| `throttled` / `provider_unavailable` | Allow bounded retries; if exhausted, preserve state and recheck provider health before restart. |
| `forbidden` | Recheck the application access policy for the affected organizer scope; do not infer policy state from another organizer's meeting URL. |
| `transcripts_disabled` | Confirm the tenant meeting/transcription policy; do not broaden Graph permissions. |
| `payment_required` | Stop and review the current Microsoft commercial contract before any content work. |
| `provider_response_invalid` / `state_invalid` | Disable the worker, preserve the volume and logs, and investigate before another request. |
| `handoff_unavailable` / `health_unavailable` | Preserve the committed private state, repair only the file boundary, and verify idempotency on restart. |
| `transcript_content_invalid` | Keep the artifact blocked; confirm MIME, WebVTT, UTF-8, and size policy without copying content into diagnostics. |
| `securityteam_unavailable` / `securityteam_response_invalid` | Keep content enabled only if bounded retries are appropriate; verify the private service contract without bypassing screening. |
| `securityteam_blocked` | Treat as terminal for the pilot. Do not move content to the approval queue or submit it to Titus. |
| `titus_unavailable` / `titus_response_invalid` | Preserve digests and retry later; never reconstruct a reusable session. |
| `titus_output_rejected` | Treat as terminal and inspect only the safe code; do not persist or publish the rejected output. |

Never reset a cursor, remove an artifact record, edit the state JSON, or delete
the volume to clear an incident. Restore from reviewed evidence or ship a
versioned migration instead.

## Disable and rollback

Content-only rollback keeps metadata discovery active:

```bash
scripts/deploy-aegis.sh disable-content
scripts/deploy-aegis.sh verify-content-disabled
```

Whole-worker rollback remains:

```bash
scripts/deploy-aegis.sh disable
scripts/deploy-aegis.sh verify-disabled
scripts/deploy-aegis.sh rollback
```

Rollback stops and disables only `titus-meeting-processor.service`. It retains
`titus-meeting-processor-data`, the root-owned projected runtime source, and the
deployed source for reconciliation. It does not restart Titus, alter the Teams
bot, revoke Graph permissions, or delete evidence. Record any authorized
production action and verification result in the suite deployment ledger.

## Deferred publication and recording gates

The private derived handoff is not automatically published into Titus project
knowledge or another user-facing system. That destination still requires an
approved access, retention, deletion, and delivery contract. Recording content
also remains prohibited and has no route or activation flag in this worker.
