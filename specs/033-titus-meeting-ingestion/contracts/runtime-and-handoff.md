# Contract: Titus Meeting Processor Runtime and Handoff

## Scope

This contract defines the internal CLI, projected runtime file, provider request
boundary, state files, safe output, and lifecycle of the metadata-only worker.
It exposes no network server or agent tool.

## Commands

```text
titus-meeting-processor run
  --config /run/secrets/runtime.json
  --state /data/state.json
  --health /data/health.json
  --handoff /data/handoff.json

titus-meeting-processor run-once [same file flags]

titus-meeting-processor health
  --health /data/health.json
  --max-age 10m

titus-meeting-processor init-volume
  --path /data --uid 10003 --gid 10003
```

- Unknown commands, flags, trailing arguments, or unreadable files fail closed.
- `run` executes one cycle immediately and then every 300 seconds.
- `run-once` is subject to the same nonblocking process lock as `run`.
- `health` prints exactly one safe line:
  `titus_meeting_processor=<disabled|healthy|degraded|failed|missing|invalid|stale>`.
- `init-volume` is the only command intended to run as root in the image.

## Projected Runtime JSON

The container accepts exactly these fields and rejects unknown/trailing JSON:

```json
{
  "MSGRAPH_TENANT_ID": "protected UUID",
  "MSGRAPH_CLIENT_ID": "protected UUID",
  "MSGRAPH_CLIENT_SECRET": "secret",
  "MSGRAPH_ORGANIZER_USER_IDS": "two comma-separated protected UUIDs",
  "MSGRAPH_POLL_INTERVAL_SECONDS": "300",
  "MSGRAPH_INITIAL_LOOKBACK_HOURS": "168"
}
```

The root Phase loader accepts the canonical meeting path only when:

- the source object contains the documented exact Phase key set;
- `MSGRAPH_WEBHOOK_ENABLED` is exactly `false`;
- all identity and organizer values are valid;
- the organizer list contains exactly two unique UUIDs;
- the join URL, webhook state, resources, and port are never copied into the
  projected JSON.

## Provider Request Boundary

- Token URL is fixed to the configured tenant under
  `https://login.microsoftonline.com/.../oauth2/v2.0/token`.
- Graph host is exactly `graph.microsoft.com`, scheme is HTTPS, redirects are
  rejected, and request method is GET.
- Initial transcript and recording routes use their documented organizer delta
  function with a UTC lookback timestamp.
- Continuation URLs must match the same organizer, artifact type, delta route,
  and allowed state-token query shape.
- Maximum response body is 4 MiB and maximum pages per stream per cycle is 100.
- Decoded new artifact metadata is capped at 8 MiB and 2,500 artifacts per
  stream. The retained state is capped at 10,000 artifacts, 32 MiB of protected
  provider fields, and a 64 MiB encoded file. State encoding streams directly
  to the atomic temporary file rather than allocating a second whole document.
- Provider JSON is decoded into narrow typed fields; content URL fields and all
  unrecognized response fields are ignored and never retained.

## Retry Classification

| Condition | Classification | Behavior |
| --- | --- | --- |
| Network timeout/temporary failure | `provider_unavailable` | Exponential retry, max 3 attempts |
| HTTP 429 | `throttled` | Honor numeric `Retry-After` up to 60s, max 3 attempts |
| HTTP 500-599 | `provider_unavailable` | Exponential retry, max 3 attempts |
| HTTP 401 | `token_rejected` | Invalidate token and retry once with fresh token |
| HTTP 402 | `payment_required` | No retry; preserve state |
| HTTP 403 + transcript inner code | `transcripts_disabled` | No retry; preserve state |
| Other HTTP 403 | `forbidden` | No retry; preserve state |
| HTTP 400/404/other 4xx | `provider_rejected` | No retry; preserve state |
| Invalid response/link/state | `provider_response_invalid` / `state_invalid` | No retry; preserve state |
| Lock held | `state_lock_busy` | No provider call |

Provider message text, raw response bodies, request IDs, and inner-error objects
are not output. Only the allowlisted safe classification is observable.

## Structured Event Contract

Every stderr line is one JSON object with an allowlisted `event` and `cycle_id`.
Allowed event-specific fields are limited to:

- `organizer_slot`
- `artifact_type`
- `state`
- `safe_error_code`
- `http_status_class`
- `page_count`
- `new_count`
- `known_count`
- `total_count`
- `retry_count`
- `duration_ms`
- `cursor_present`

Raw URLs, provider IDs, organizer IDs, tenant/client IDs, tokens, secrets,
response bodies, messages, meeting metadata, and content are forbidden fields.

## Lifecycle Contract

- Image: `overnightdesk/titus-meeting-processor:<reviewed-version>`.
- Container: `titus-meeting-processor` with user `10003:10003`.
- Unit: `titus-meeting-processor.service`.
- Volume: `titus-meeting-processor-data`, mounted only at `/data`.
- Runtime config: `/run/titus-meeting-processor/runtime.json`, mounted read-only.
- Network: existing private OvernightDesk network; no published ports.
- Root filesystem read-only, temporary filesystem bounded, all capabilities
  dropped, no-new-privileges, PID/CPU/memory limits applied.
- Install leaves the unit disabled. Enablement is a separate approved action.
- Disable and rollback stop only this unit/container and preserve the volume and
  root runtime source for evidence.
