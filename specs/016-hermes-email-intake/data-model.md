# Data Model: Routed Hermes Email Intake

No schema migration is required. The feature uses existing rows and a strict
metadata contract.

## Inbox Assignment

Protected runtime configuration for one worker instance.

| Field | Rule |
| --- | --- |
| route_id | Stable bounded identifier: `titus`, `agent`, or `mitchel` |
| provider | Constant `agentmail` |
| inbox_id | Exact immutable AgentMail inbox identifier |
| inbox_address | Exact normalized public inbox address |
| target_agent | Exact container/runtime identifier |
| allowed_senders | Exact normalized mailbox set; `NOT_CONFIGURED` is legal only while disabled |
| hermes_base_url | Fixed private-network HTTPS/HTTP origin from protected config |
| enabled | Defaults false |

The three route tuples are unique by `(provider, inbox_id)` and by
`target_agent`. Phase is the source of truth for sender allowlists; email fields
cannot modify an assignment.

## Dirty Email Record

Existing `content_staging` row.

| Column | Value |
| --- | --- |
| source | `agentmail` |
| content_type | `text` |
| message_id | `<inbox_id>:<provider_message_id>` |
| body | Untrusted extracted message text |
| sender | Parsed provider sender, still untrusted |
| subject | Provider subject, still untrusted |
| received_at | Provider timestamp after validation |
| metadata | Trusted route plus bounded provider context |

Required metadata keys: `schema_version`, `route_id`, `provider`, `inbox_id`,
`target_agent`, `provider_message_id`, `thread_id`, `in_reply_to`. The producer
constructs route keys from protected configuration after verifying the message's
provider inbox matches the configured inbox.

Lifecycle: `pending → processing → done | error`, owned by SecurityTeam.

## Clean Email Record

Existing `ingested_messages` row joined to `content_staging` through
`staging_id`.

Eligibility requires:

- staging source is `agentmail`;
- staging provider metadata is `agentmail` and provider message identity is present;
- `approval_status` is `approved` or `auto_approved`;
- `agent_zero_status` is `queued` or a deliberately recovered error;
- `safe_content` is non-empty and bounded;
- `sender_authorized` is true;
- staging metadata exactly matches the running route and target agent.

Lifecycle: `queued → processing → done | error`. The email worker owns this
consumer state only for rows matching its route.

## Delivery Claim

The claimed clean row plus source context returned atomically to the worker.

| Field | Source |
| --- | --- |
| clean_id | `ingested_messages.id` |
| staging_id | clean row reference |
| safe_content | `ingested_messages.safe_content` only |
| provider_message_id | trusted staging metadata |
| thread_id | trusted staging metadata |
| redaction_count | clean row |
| injection_signal_count | clean row metadata count |
| claimed_at | `agent_zero_run_at` |

## Recovery Record

Existing atomic JSON state stores metadata necessary to reconcile an in-flight
Hermes run and AgentMail reply. It must not store raw or clean message bodies,
sender addresses, subjects, API tokens, or approval material.

State transitions:

`claimed → run_submitted → waiting | approval_waiting → run_completed → replied`

Failure transitions:

`claimed|run_submitted|waiting|run_completed → retryable_error | terminal_error`

Database state becomes `done` only after reply reconciliation succeeds. A
recoverable failure becomes `error` with a bounded code; operators can explicitly
requeue it after correcting the dependency.

A repeated completion acknowledgement is idempotent for the same exact route.
This lets the worker clear local `replied` recovery state after a crash or lost
database response without sending a second logical reply.
