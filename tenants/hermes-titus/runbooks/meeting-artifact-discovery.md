# Titus Meeting Artifact Discovery

## Purpose and boundary

`titus-meeting-processor` is a separate deterministic service that discovers
metadata references for transcripts and recordings from scheduled,
non-channel meetings organized by the two approved pilot users. A separate
host marker can activate Feature 035: encrypted seven-day transcript custody,
SecurityTeam screening, Titus-owned Sol/Luna analysis through the existing
private Hermes API, fixed Gary/Austin email, exact reply review, and bounded
stream/hash/discard recording verification. Primary Sol owns orchestration and
QA; the configured Luna child produces the bounded draft and may receive one
remediation. A separate marker activates approved-only filing. The service
does not expose Microsoft Graph as an agent tool or create a webhook or
subscription. Channel meetings remain out of scope.

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
and container inspection. Any non-exact transcript or recording-content route,
retained recording bytes, public port, cross-identity key, secret injection, unpinned
builder, or unsafe runtime setting is a release blocker.

## Production preparation

Preparation and activation are separate decisions. Source readiness does not
authorize either.

```bash
cd tenants/hermes-titus/meeting-processor
scripts/deploy-aegis.sh install-feature-035-disabled
../email-poller/scripts/deploy-aegis.sh install
scripts/deploy-aegis.sh verify-feature-035-disabled
```

The unified disabled install first runs local qualification. Before promoting
any remote processor or filer runtime, it removes only the Feature 035 brief
and filing markers, stops the retired analyzer and active filer, and reloads
the active processor and Titus intake route without Feature 035 credentials. It then
prepares immutable releases, initializes the inactive filer including the
exact `00-inbox/meetings` destination, and re-verifies the disabled surface.
The Feature 034 content marker is unchanged. The analyzer image, unit, model,
and API key are not installed or projected; any stopped legacy container and
retained volume stay untouched for rollback cooling-off. The shared poller install deploys
the reviewed interception code while the absent brief marker keeps that path
disabled. Final verification proves the retired analyzer and filer are stopped, both
Feature 035 projections are absent, metadata discovery retains its prior
enabled/disabled state, and Titus plus Titus email intake remain active. No
state or named volume is removed.

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

## Meeting Brief canary

SecurityTeam's deployed `approvalMode=block` dependency must pass its
zero-enqueue canary first. Then activate only meeting brief processing:

```bash
scripts/deploy-aegis.sh enable-brief
scripts/deploy-aegis.sh verify-brief
scripts/deploy-aegis.sh restart-verify
```

Required value-safe evidence:

1. The host marker is a root-owned, empty, non-symlink mode-0444 file.
2. The runtime projection has the fixed private origins and bounded values;
   secrets remain absent from Docker environment metadata and operator output.
3. Gary's transcript produces one dedicated parent session, one configured
   Luna child draft, one Sol QA result, one strict Meeting Brief reference, and
   one email read back with recipient set `gary+austin`.
4. Raw WebVTT exists only as mode-0600 AES-256-GCM ciphertext with an expiry
   exactly 168 hours after creation; safe state contains digests, not content.
5. Session audit proves the child `parent_session_id`, observed
   `gpt-5.6-luna` route, fixed leaf delegation arguments, source/draft digests,
   and exact one-or-two draft/review counts. Feature 035 sends no request model
   override and never resolves a Hermes tool approval. `QA_BLOCKED`, malformed
   output, route mismatch, or lineage mismatch creates no brief or email.
6. Before any email, authenticated readback returns `session_not_found` for
   the parent and every observed child. Cleanup retry keeps the brief private;
   exhausted cleanup blocks the workflow and degrades health.
7. Recording content is streamed once as bounded MP4, hashed, and discarded.
   Only digest, byte count, MIME, and verification time survive.
8. Restart makes zero duplicate transcript, run, mail, or recording calls. A
   persisted `dispatch_unknown` attempt is reconciled through authenticated
   sessions and is never resubmitted. After 20 minutes it is cleaned up and
   retried within the bounded attempt policy. Austin may remain at zero
   artifacts; that is not a failure.

After Gary or Austin sends one exact clean `APPROVE <reference>` or `HOLD
<reference>` reply, verify the first terminal decision wins. Enable filing only
for the approval canary:

```bash
cd tenants/hermes-titus/meeting-filer
scripts/deploy-aegis.sh initialize
scripts/deploy-aegis.sh enable
scripts/deploy-aegis.sh verify
```

Known projects create one project note; unknown
projects create one inbox note and `meeting-triage` task. Every internal action
or external commitment becomes an internal Kanban task. No external action is
performed.

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
| `orchestrator_unavailable` / `orchestrator_session_unavailable` | Preserve encrypted custody and persisted correlation state. Reconcile the existing session; never submit the same ambiguous run again. |
| `orchestrator_attempt_unknown` | Allow bounded session discovery until the 20-minute deadline, then clean up the known parent/children before starting the next attempt. |
| `orchestrator_tool_audit_failed` / `orchestrator_child_mismatch` | Treat the attempt as terminal, retain no accepted brief, delete and verify the meeting sessions, and do not email. |
| `qa_output_rejected` | Inspect only the safe code; do not persist, email, or publish rejected output. |
| `faithfulness_failed` / `schema_failed` / `unsupported_claims` / `ownership_or_date_failed` / `project_identification_failed` / `remediation_exhausted` | This is a bounded `QA_BLOCKED` result. Delete and verify sessions, block the artifact, and send no email. |
| `orchestrator_cleanup_failed` | Keep any candidate brief private and retry deletion only. If cleanup exhausts eight attempts, stop new transitions and repair Hermes session deletion before proceeding. |
| `custody_key_missing` / `custody_referenced_key_missing` | Stop new meeting transitions, restore the referenced key without displaying it, and rerun retention. |
| `custody_retention_overdue` | Stop new meeting transitions, repair deletion, and sweep until no object is overdue. |
| `meeting_email_*` | Preserve deterministic idempotency state; do not bypass SecurityTeam or resend manually. |
| `filer_*` | Keep the approved brief retryable; verify note/task readback before retry. |

Never reset a cursor, remove an artifact record, edit the state JSON, or delete
the volume to clear an incident. Restore from reviewed evidence or ship a
versioned migration instead.

## Disable and rollback

Feature 035 rollback keeps metadata discovery active. Remove the filing marker
first, then the brief marker. Preserve separate brief state and encrypted
custody, and continue the retention-only command:

```bash
cd tenants/hermes-titus/meeting-filer
scripts/deploy-aegis.sh disable
scripts/deploy-aegis.sh rollback

cd ../meeting-processor
scripts/deploy-aegis.sh disable-brief
scripts/deploy-aegis.sh retention-sweep
scripts/deploy-aegis.sh verify-feature-035-disabled
```

The prior worker remains able to read version-2 discovery state containing the
exact safe sentinel. Rollback never retracts an already-created note or task.

`disable-brief` stops the private filer and any retired analyzer unit, removes
both Feature 035 markers, reloads the meeting processor, restarts Titus email
intake without meeting review credentials, and preserves Feature 034
metadata/content state. It does not stop the shared Titus Hermes runtime. The
retention-only sweep continues against the retained custody volume.

The earlier content-only controls remain available only for Feature 034 rollback:

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

Whole-worker rollback additionally stops `titus-meeting-processor.service`.
The coordinated order above already stopped the retired analyzer and filer and removed
their authority from the worker and intake projections. It retains processor,
custody, filer, project-knowledge, and Kanban volumes plus immutable releases
for reconciliation. It does not restart Titus, alter the Teams bot, revoke
Graph permissions, or delete evidence. Record any authorized production action
and verification result in the suite deployment ledger.

## Content-free session troubleshooting

Inspect only the aggregate meeting fields in the private health record:
`analysis_pending`, `luna_running`, `sol_qa_pending`, `cleanup_retryable`, and
`cleanup_blocked`. These counters contain no transcript, brief, participant,
session ID, email address, or provider identifier. `qa_remediation` contributes
to `sol_qa_pending`; it means the one permitted second Luna draft is being
reviewed. `cleanup_retryable` means only deletion may be retried. Any
`cleanup_blocked` value makes a healthy record invalid and requires operator
repair before email or filing can continue.

Titus and meeting analysis share the existing provider subscription and model
routes. A backlog in `luna_running` or `sol_qa_pending` can therefore reflect
shared capacity; do not add a feature-specific provider key or model override.
Confirm the main `hermes-titus` container remains healthy, its primary route is
Sol, its child route is Luna with `max_spawn_depth: 1`, and the analyzer unit
and container remain inactive. Never print the Sessions API response, message
content, IDs, runtime secret files, or custody data while troubleshooting.

## Deferred channel-meeting gates

Channel discovery, a separate channel bot, meeting-chat installation, and Graph
webhook/subscription renewal remain a separate feature. Do not widen the
organizer-scoped application or Feature 035 deployment to cover them.
