# Contract: Titus Email Polling

## Phase configuration

Path: `/agents/hermes-titus/email`

Exactly these string keys are accepted:

| Key | Required | Default/validation |
|---|---|---|
| `AGENTMAIL_POLLING_ENABLED` | Yes | `true` or `false`; starts `false` |
| `AGENTMAIL_POLL_INTERVAL_SECONDS` | Yes | Integer 30-300; use 60 |
| `AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS` | Yes | Comma-separated exact mailbox set; must equal Gary and Austin for MVP |
| `AGENTMAIL_APPROVAL_ALLOWED_SENDERS` | Yes | Comma-separated exact mailbox set; must equal Gary and Austin for MVP |
| `AGENTMAIL_APPROVAL_SIGNING_SECRET` | Yes | Phase-held secret of at least 32 bytes; never logged or persisted by the worker |
| `AGENTMAIL_MAX_MESSAGES_PER_CYCLE` | Yes | Integer 1-20; use 20 |

Unknown keys or invalid values fail the host-side Phase export before container
start. Credentials continue to come from `/agents/hermes-titus/runtime`.

## Worker commands

```text
agentmail_poller.py initialize
agentmail_poller.py run
agentmail_poller.py run-once
agentmail_poller.py health
```

- `initialize`: list all currently visible inbound messages and insert
  `preexisting` rows. It performs no create, reply, send, or model operation.
- `run`: when enabled, poll forever; when disabled, emit/write disabled health
  and wait without calling AgentMail.
- `run-once`: process one bounded cycle, intended for tests and controlled ops.
- `health`: exit zero for explicitly disabled state or a fresh enabled
  heartbeat; otherwise nonzero. It never uses network access.

## AgentMail calls

Base URL: `https://api.agentmail.to/v0`

Authentication: `Authorization: Bearer <AGENTMAIL_API_KEY>`.

### List messages

```http
GET /inboxes/{inbox_id}/messages?limit=20&include_blocked=true&include_unauthenticated=true
```

Use the provider's newest-first order, follow at most nine `next_page_token`
values, stop after the configured 20 new messages per-cycle cap, and exclude
sent, spam, trash, and drafts from source-message classification. Inspecting
multiple pages prevents already-processed recent messages from starving older
unprocessed mail after a burst.

### Create reply draft

```http
POST /inboxes/{inbox_id}/drafts
Content-Type: application/json

{
  "in_reply_to": "<source-message-id>",
  "text": "<bounded proposed reply>",
  "client_id": "titus-approval-draft-<deterministic digest>"
}
```

Record `draft_id`, derived `to`, `in_reply_to`, and text. The worker accepts
only a single recipient matching the normalized source sender.

### Get and send draft

Before approval send:

```http
GET /inboxes/{inbox_id}/drafts/{draft_id}
POST /inboxes/{inbox_id}/drafts/{draft_id}/send
Content-Type: application/json

{}
```

The GET response must match stored recipient, source message, and draft digest.
A 409 or ambiguous timeout triggers reconciliation, not a different send.

### Trusted reply and approval notice

Trusted replies use the documented message reply endpoint with deterministic
`client_id` when supported by the endpoint contract. Approval notices are sent
to both approvers with one deterministic client ID and contain no source body,
attachment, secret, or full header set.

## OpenRouter call

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json

{
  "model": "<HERMES_DEFAULT_MODEL>",
  "messages": [
    {"role": "system", "content": "<fixed email-drafting policy>"},
    {"role": "user", "content": "<bounded subject and plain-text excerpt>"}
  ],
  "max_tokens": 300,
  "temperature": 0.2
}
```

No `tools`, attachments, URLs fetched from the message, memory, prior sessions,
or Hermes agent loop are included. Output must be non-empty plain text, at most
1,200 characters, and free of credential-like tokens before it can be used.

## Approval email

Subject:

```text
[Titus approval <QUEUE_ID>] Reply requested: <truncated original subject>
```

Body:

```text
Titus queued a reply for approval.

From: <normalized sender>
Subject: <truncated subject>
Queue: <QUEUE_ID>

Proposed reply:
---
<exact draft text>
---

Reply with exactly one of these as the first non-empty line:
APPROVE <QUEUE_ID> <ONE_TIME_TOKEN>
REJECT <QUEUE_ID> <ONE_TIME_TOKEN>
```

## Structured events

Every event is a single JSON object with `timestamp`, `event`, `status`, and
only applicable fields from: `cycle_id`, `message_id_hash`, `queue_id`,
`classification`, `attempt`, `error_code`, and `duration_ms`.

Forbidden event fields/values: sender address, subject, source body, draft body,
approval token, authorization header, API key, full request, or full response.
