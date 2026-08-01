# Titus Meeting Artifact Discovery

## Purpose and boundary

`titus-meeting-processor` is a separate deterministic service that discovers
metadata references for transcripts and recordings from scheduled,
non-channel meetings organized by the two approved pilot users. It does not run
inside Hermes, expose Microsoft Graph as an agent tool, create a webhook or
subscription, retrieve content, or mount its handoff into Titus.

The worker uses `/agents/hermes-titus/teamsmeetings`. Keep `MSGRAPH_*` meeting
credentials separate from the interactive Teams bot's `TEAMS_*` identity. The
root loader receives the Phase service token, validates the exact source
object, and writes only the six-field worker runtime file. Neither the Phase
token nor webhook/test values enter the container.

## Source qualification

From `tenants/hermes-titus/meeting-processor`:

```bash
scripts/qualify.sh
```

The gate runs Go unit/race/vet/build checks, Python projection and security
contracts, shell parsing, source leak checks, an ARM64 image build, and image
and container inspection. Any content route, public port, cross-identity key,
secret environment injection, unpinned builder, or unsafe runtime setting is a
release blocker.

## Production preparation

Preparation and activation are separate decisions. Source readiness does not
authorize either.

```bash
scripts/deploy-aegis.sh prepare
scripts/deploy-aegis.sh install-disabled
scripts/deploy-aegis.sh initialize
scripts/deploy-aegis.sh verify-disabled
```

The disabled install must leave the systemd unit inactive, create no running
container, expose no port, and preserve any existing private state volume.

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
6. No content endpoint is called and no provider identifier or URL appears in
   health, logs, operator output, or the safe handoff.
7. Titus, the interactive Teams bot, and unrelated services remain healthy and
   unchanged.

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

Never reset a cursor, remove an artifact record, edit the state JSON, or delete
the volume to clear an incident. Restore from reviewed evidence or ship a
versioned migration instead.

## Disable and rollback

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

## Deferred handoff and content gates

The safe handoff is not consumed in this release. A later change may connect it
to Hermes only after its prompt-injection boundary, authorization, replay,
provenance, and operator-approval behavior are specified and reviewed.

Content retrieval remains prohibited until retention duration, controlled
destination, encryption, deletion, operator access, customer boundary, and
current Microsoft commercial terms are approved and recorded. That decision
requires a new specification and cannot be enabled with a flag in this worker.
