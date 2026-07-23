# Contract: Titus Guarded Email MCP

## Hosted `agentmail` server

The hosted connection is read-only and exposes exactly:

```text
list_inboxes
get_inbox
list_threads
search_threads
get_thread
list_messages
search_messages
get_message
get_attachment
```

No hosted mutation tool is available to Titus.

## Tool: `titus_prepare_email_approval`

Read-only, non-destructive, open-world false.

### Input

```json
{
  "inbox_id": "string, exact protected Titus inbox",
  "to": ["1-10 bare email addresses"],
  "subject": "nonblank string, max 998",
  "text": "optional nonblank string, max 200000",
  "html": "optional nonblank string, max 500000"
}
```

Unknown fields are rejected. At least one of `text` or `html` is required.
Attachments, CC, BCC, labels, reply-to values, and custom headers are absent by
schema.

### Success

```json
{
  "status": "ready_for_owner_approval",
  "approval_token": "opaque short-lived value",
  "draft_fingerprint": "safe display fingerprint",
  "expires_at": "UTC timestamp",
  "draft": {
    "inbox_id": "exact inbox",
    "to": ["normalized addresses"],
    "subject": "exact subject",
    "text": "exact text or null",
    "html": "exact html or null",
    "attachments": []
  },
  "next_action": "Show the exact draft and obtain explicit owner approval before calling titus_send_approved_email."
}
```

This response does not authorize a send by itself.

## Tool: `titus_send_approved_email`

Mutating, destructive, idempotent for one approval token, open-world true.

### Input

The exact same draft fields as preparation plus:

```json
{
  "approval_token": "exact opaque token returned by preparation"
}
```

The tool rejects expired, malformed, incorrectly signed, or draft-mismatched
tokens before network I/O.

### Verified success

```json
{
  "status": "verified_sent",
  "message_id": "provider message ID",
  "thread_id": "provider thread ID",
  "verification": {
    "inbox": "matched",
    "recipients": "matched",
    "subject": "matched",
    "text": "matched_or_not_supplied",
    "html": "matched_or_not_supplied",
    "sent_state": "matched"
  }
}
```

### Safe failures

```json
{
  "status": "rejected_before_send | ambiguous_unverified | retry_refused",
  "error_code": "allowlisted_safe_code",
  "next_action": "safe operator guidance"
}
```

No failure includes recipients, subject, body, token, digest, credentials, or
raw provider/SecurityTeam response.

## SecurityTeam request

`POST http://overnightdesk-securityteam:4700/check-outbound`

- `Authorization: Bearer <protected runtime value>`
- 15-second timeout
- exact canonical draft in `content`
- exact recipient target in `targetId`
- `kind: send_email`
- `channel: dm`

Only HTTP 200, explicit `allowed: true`, and byte-equal returned `content` pass.

## AgentMail requests

### Send

`POST https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/send`

- bearer-authenticated from the protected runtime value;
- 15-second timeout;
- stable `Idempotency-Key`;
- exact `to`, `subject`, and supplied `text`/`html` fields.

### Readback

`GET https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/{message_id}`

The exact comparison in [data-model.md](../data-model.md) is mandatory before
verified success.
