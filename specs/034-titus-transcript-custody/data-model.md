# Data Model: Titus Transcript Custody

## State document version 2

Version 2 preserves the existing four `streams`, protected discovery
`artifacts`, and metadata. Opening a valid version-1 document migrates it in
memory and commits version 2 atomically before processing.

## Transcript artifact additions

| Field | Type | Constraint |
|---|---|---|
| `content_status` | enum | `pending`, `processed`, `blocked`, `retryable_error`, or `not_applicable` |
| `raw_content_digest` | SHA-256 | Present only after a content attempt reached SecurityTeam |
| `safe_content_digest` | SHA-256 | Present only when SecurityTeam returned safe content |
| `titus_output_digest` | SHA-256 | Present only with completed output |
| `titus_output` | string | Markdown, 1-65536 bytes, valid UTF-8, no NUL |
| `last_content_attempt_at` | timestamp | Canonical UTC RFC3339Nano |
| `content_processed_at` | timestamp | Required only for `processed` |
| `content_retry_count` | integer | 0-1000 |
| `content_error_code` | enum | Empty on success; allowlisted safe code otherwise |

Recording artifacts migrate to `not_applicable`. Transcript artifacts migrate
to `pending`.

## State transitions

```text
pending -----------> processed
   |                     ^
   +--> blocked          |
   |                     |
   +--> retryable_error -+

recording ----------> not_applicable
```

`processed` and `not_applicable` are terminal. `blocked` is terminal for the
pilot. `retryable_error` may return to processing on a later cycle. A failed
attempt never clears prior digests or a completed output.

## Derived handoff version 2

Discovery entries remain metadata-only. Processed transcript entries add:

| Field | Classification |
|---|---|
| `internal_reference` | Safe opaque reference |
| `organizer_slot` | Safe configured slot |
| `provider_created_at` | Safe timestamp |
| `content_processed_at` | Safe timestamp |
| `titus_output_digest` | Safe digest |
| `titus_output` | Private derived meeting record |

The handoff contains no organizer ID, meeting ID, transcript ID, Graph URL,
raw VTT, screened input, token, credential, or recording content.

## Retention

- Raw VTT: memory-only for one bounded request chain; zero durable retention.
- Screened input: memory-only; SecurityTeam block mode creates no queue record.
- Titus request: stateless chat request without session or long-term-memory key.
- Titus output: retained with private discovery state until an operator-approved
  deletion or later destination policy replaces it.
- Recording content: never retrieved.
