# Data Model: Titus Guarded Outbound Email

## Approved Draft

Transient, never persisted as content.

| Field | Rule |
| --- | --- |
| inbox_id | Must equal the protected Titus inbox ID |
| to | 1-10 unique normalized bare email addresses |
| subject | Nonblank, at most 998 characters |
| text | Optional; nonblank when supplied; at most 200,000 characters |
| html | Optional; nonblank when supplied; at most 500,000 characters |
| attachments | Exactly absent in the first release |
| draft_digest | SHA-256 of versioned canonical fields |
| logical_send_nonce | Random 128-bit value created by preparation |
| issued_at | UTC timestamp used for the 30-minute approval window |
| approval_token | Purpose-derived HMAC signature over version, issued time, nonce, and digest |

At least one of `text` or `html` must be nonblank.

## Owner Approval Interaction

Transient, never persisted.

| Field | Rule |
| --- | --- |
| draft_fingerprint | Must be derived from the validated signed draft |
| surface | Hermes MCP form elicitation routed to the active human session |
| decision | Only explicit `accept` authorizes continued execution |
| failure | Decline, cancel, timeout, or unavailable routing stops before external I/O |

The interaction prompt contains only the safe fingerprint and review
instructions. It does not repeat recipients, subject, body, token, or digest
into runtime logs.

## Guarded Send Attempt

Persisted in a mode-0600 SQLite database under the Titus runtime volume.

| Field | Rule |
| --- | --- |
| logical_send_id | Stable non-secret identifier derived from the signed nonce |
| draft_digest | Integrity digest only; no draft content |
| idempotency_key | Stable AgentMail key for this logical send |
| state | State machine value below |
| safe_error_code | Optional allowlisted code; never provider content |
| provider_message_id | Stored only when returned |
| provider_thread_id | Stored only when returned |
| created_at | UTC |
| updated_at | UTC |

Unique constraints apply to `logical_send_id` and `idempotency_key`.

### State transitions

```text
new
  -> reserved
  -> screened
  -> provider_accepted
  -> verified_sent

reserved|screened
  -> failed_pre_send

screened
  -> ambiguous_unverified  # timeout, transport error, or missing IDs

provider_accepted
  -> ambiguous_unverified
  -> verified_sent

ambiguous_unverified
  -> screened               # same valid approval and idempotency key only
  -> verified_sent          # readback reconciliation
  -> retry_refused          # provider window expired
```

An expired approval is rejected before state mutation. No state transition
from an existing logical send creates a new idempotency key.

## Security Decision

Transient response from SecurityTeam.

| Field | Rule |
| --- | --- |
| HTTP status | Must be 200 |
| allowed | Must be boolean `true` |
| content | Must equal the canonical screened content |
| other fields | Ignored for allow; never logged |

Any other shape or outcome is denial.

## Provider Readback

Transient authoritative verification record.

| Field | Rule |
| --- | --- |
| inbox_id | Exact Titus inbox |
| message_id | Exact accepted message ID, nonblank |
| thread_id | Exact accepted thread ID, nonblank |
| labels | Contains `sent` |
| to | Normalized set equals approved set |
| subject | Equals approved subject |
| text | Equals approved normalized text when supplied |
| html | Equals approved normalized HTML when supplied |

The provider record is never persisted or logged as a whole.
