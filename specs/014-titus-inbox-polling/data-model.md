# Data Model: Titus Email Inbox Polling

## `message_processing`

One row per AgentMail source message.

| Field | Type | Rules |
|---|---|---|
| `message_id` | TEXT | Primary key; AgentMail immutable identifier |
| `thread_id` | TEXT | Required |
| `sender` | TEXT | Normalized mailbox only; required |
| `subject` | TEXT | Truncated metadata; required, may be empty |
| `classification` | TEXT | `trusted`, `external`, `approval_command`, `invalid_sender`, or `preexisting` |
| `state` | TEXT | See state machine below |
| `client_id` | TEXT | Unique deterministic identifier for the primary side effect |
| `remote_id` | TEXT | Reply message or draft identifier when known |
| `attempt_count` | INTEGER | Non-negative, bounded retries |
| `last_error_code` | TEXT | Redacted error category only |
| `created_at` | TEXT | UTC RFC3339 timestamp |
| `updated_at` | TEXT | UTC RFC3339 timestamp |

The source message body, attachment content, raw headers, and full API response
are deliberately absent.

### Message states

```text
new -> generating -> sending_trusted -> replied
                 \-> creating_draft -> pending_approval
new -> approval_command -> command_processed
new -> preexisting
any nonterminal -> retryable_error -> prior nonterminal state
```

`replied`, `pending_approval`, `command_processed`, and `preexisting` are stable
processing outcomes. A pending approval has its own lifecycle below.

## `approval_request`

One row per external source message.

| Field | Type | Rules |
|---|---|---|
| `queue_id` | TEXT | Primary key; deterministic SHA-256 prefix |
| `source_message_id` | TEXT | Unique foreign key to `message_processing` |
| `draft_id` | TEXT | Unique AgentMail draft identifier |
| `draft_client_id` | TEXT | Unique deterministic remote idempotency key |
| `notification_client_id` | TEXT | Unique deterministic remote idempotency key |
| `recipient` | TEXT | Exact normalized external sender |
| `in_reply_to` | TEXT | Must equal the source message ID |
| `draft_text` | TEXT | Exact proposed response shown to approvers |
| `draft_digest` | TEXT | SHA-256 of canonical recipient, source ID, and text |
| `token_digest` | TEXT | SHA-256 of the keyed approval token; plaintext absent |
| `state` | TEXT | `pending`, `approving`, `approved`, `rejecting`, `rejected`, or `failed` |
| `decided_by` | TEXT | Normalized approver mailbox, nullable |
| `decision_message_id` | TEXT | AgentMail message carrying accepted command, nullable |
| `sent_message_id` | TEXT | Outbound AgentMail message identifier, nullable |
| `created_at` | TEXT | UTC RFC3339 timestamp |
| `decided_at` | TEXT | UTC RFC3339 timestamp, nullable |

### Approval states

```text
pending -> approving -> approved
       \-> rejecting -> rejected
```

Only a transaction that matches `state = pending`, an exact approver, queue ID,
and token digest may claim a decision. A send occurs only after the live draft
matches the stored recipient, `in_reply_to`, and digest. If a send response is
ambiguous, reconciliation checks draft/send state before another attempt.

## `poller_metadata`

Singleton key/value records:

| Key | Meaning |
|---|---|
| `schema_version` | Database schema version |
| `initialized_at` | Successful no-send mailbox watermark time |
| `last_cycle_started_at` | Most recent cycle start |
| `last_cycle_completed_at` | Most recent completed cycle |
| `last_success_at` | Most recent dependency-successful cycle |
| `last_error_code` | Redacted most recent error category |
| `enabled` | Effective configured state |

## Invariants

1. One source message has one processing row.
2. One external source message has no more than one approval request.
3. Plaintext approval tokens never enter SQLite or logs.
4. Original message bodies never enter SQLite or logs.
5. A terminal approval state never transitions to another decision.
6. A draft can be sent only when live and stored immutable fields match.
7. An operator approval message cannot also receive a model-generated reply.
