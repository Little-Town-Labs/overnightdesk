# Data Model: Titus Meeting Artifact Discovery

## Runtime Configuration

The root loader receives the complete canonical Phase object but projects only:

| Field | Classification | Validation |
| --- | --- | --- |
| tenant ID | Protected identifier | UUID; nonempty |
| client ID | Protected identifier | UUID; nonempty |
| client secret | Secret | 20-4096 bytes; no control characters |
| organizer user IDs | Protected identifiers | Exactly two unique UUIDs |
| polling interval | Non-secret generated config | Fixed 300 seconds in v1 |
| initial lookback | Non-secret generated config | Fixed 168 hours in v1 |

Webhook client state, webhook configuration, accepted resources, webhook port,
and the one-time test join URL are validated as known Phase keys but are not
projected into the worker container.

## State Document

### Root

| Field | Type | Rules |
| --- | --- | --- |
| `version` | integer | Exactly 1 |
| `streams` | map | Exactly four keys after first complete cycle |
| `artifacts` | map | Keyed by internal artifact reference |
| `metadata` | object | Created/updated timestamps and schema metadata only |

The document is capped at 10,000 artifacts, 32 MiB of aggregate string fields,
and 64 MiB encoded on disk. Existing state above the file bound is rejected
before allocation. Commit validation applies the aggregate artifact/string
bounds before the atomic writer streams sorted map entries to its temporary
file, so persistence does not allocate a second whole-document JSON buffer.

The state file is private and may contain provider identifiers and opaque delta
URLs. It must never be logged, emitted by health, copied to Git, or mounted into
the Titus container.

### Artifact Stream

One stream is the tuple of organizer fingerprint and artifact type.

| Field | Type | Rules |
| --- | --- | --- |
| `organizer_fingerprint` | string | SHA-256 digest; never the raw UUID |
| `organizer_slot` | enum | `organizer_1` or `organizer_2` |
| `artifact_type` | enum | `transcript` or `recording` |
| `delta_link` | string | Empty before first success; otherwise validated opaque Graph delta URL |
| `last_attempt_at` | timestamp | UTC RFC3339Nano |
| `last_success_at` | timestamp | UTC RFC3339Nano; changes only after complete round |
| `last_error_code` | safe enum | Empty on success; never provider message text |
| `artifact_count` | integer | Nonnegative cumulative unique count |

### Artifact Record

| Field | Type | Rules |
| --- | --- | --- |
| `internal_reference` | string | SHA-256 over organizer/type/provider artifact ID |
| `organizer_fingerprint` | string | Must match an approved configured organizer |
| `artifact_type` | enum | `transcript` or `recording` |
| `provider_artifact_id` | string | Private state only; 1-8192 bytes |
| `provider_meeting_id` | string | Private state only; 1-8192 bytes |
| `provider_created_at` | timestamp | Optional valid provider timestamp |
| `discovered_at` | timestamp | Local UTC observation time |

Content URLs, transcript text, recording bytes, participant data, subject,
join URL, display names, and speaker data are not state fields.

## Safe Handoff Document

The handoff is a derived mode-0600 document and contains no provider IDs or
URLs. It is not mounted into Titus in this release.

| Field | Type | Rules |
| --- | --- | --- |
| `version` | integer | Exactly 1 |
| `generated_at` | timestamp | UTC RFC3339Nano |
| `discoveries` | array | One row per unique artifact |

Each discovery contains only `internal_reference`, `organizer_slot`,
`artifact_type`, `provider_created_at` when valid, and `discovered_at`.

## Health Document

| Field | Type | Rules |
| --- | --- | --- |
| `state` | enum | `disabled`, `starting`, `healthy`, `degraded`, `failed` |
| `timestamp` / `timestamp_epoch` | timestamp/integer | Freshness check |
| `token_health` | enum | `unused`, `healthy`, `failed` |
| `streams` | array | Exactly four safe stream summaries |

Each stream summary contains organizer slot, artifact type, state, cursor
presence boolean, last-attempt/success times, new/known/cumulative counts,
retry count, and safe error code. It contains no identifiers or URLs.

## State Transitions

```text
missing state --open--> initialized
initialized --complete delta round--> healthy with cursor
healthy --new complete round--> healthy with advanced cursor
healthy --retryable failure exhausted--> degraded, prior cursor retained
healthy --nonretryable failure--> failed/degraded, prior cursor retained
any --disabled config/service--> disabled, state retained
```

An incomplete page sequence never transitions a stream's cursor or artifact
set. All four streams are staged in memory, and the private state is atomically
committed once only after the complete four-stream cycle succeeds. The safe
handoff is then regenerated with its own atomic file replacement. If handoff
generation fails, the already committed private state remains authoritative and
the next successful cycle regenerates the handoff.
