# Research: Titus Email Inbox Polling

## AgentMail transport

**Decision**: Use the documented REST endpoints for listing messages, immediate
idempotent replies to trusted senders, plain review drafts for external senders,
reading/sending drafts, and inbox list management. Authenticate with the
Phase-injected AgentMail key.

**Rationale**: The polling worker needs deterministic request construction,
timeouts, status handling, and client identifiers. The hosted AgentMail MCP
remains available to interactive Titus, but it is not the right supervision and
idempotency boundary for a daemon.

**Contract facts**:

- Message listing supports pagination and inclusion of blocked and
  unauthenticated messages.
- Trusted replies use the message-reply endpoint with both text and HTML bodies.
- External approval items use plain drafts with explicit recipient and subject;
  this keeps the reviewed remote object immutable without depending on the
  inbox's unavailable reply-draft route.
- Draft creation accepts `client_id`; AgentMail documents client IDs as the
  idempotency mechanism for create operations.
- Sending a draft changes the existing draft into a message and returns its
  message and thread identifiers.
- Reply and draft-send operations use a deterministic `Idempotency-Key`; a 409
  fails closed because it can indicate key reuse with a different request.
- Receive and reply list policies are separate. The existing receive allowlist
  must be removed for arbitrary senders to reach the application queue.
- Explicit sender-authentication failures may be dropped by AgentMail before
  delivery; messages with missing authentication evidence can remain visible as
  unauthenticated and are treated as untrusted.

**Alternatives considered**:

- Hermes AgentMail MCP from a one-shot agent prompt: rejected because one-shot
  mode can load tools and memory and automatically bypass tool approvals.
- Direct reply for untrusted messages after approval: rejected because the
  approved text could drift between review and send. A draft freezes the text.

## Reply generation

**Decision**: Use OpenRouter's OpenAI-compatible chat-completions endpoint with
the configured `HERMES_DEFAULT_MODEL`, a fixed system policy, no tools, one
bounded email excerpt, and a bounded output.

**Rationale**: This preserves Titus's configured model while preventing an
email from entering Hermes's agent loop, tools, plugins, or long-term memory.
The completion is treated only as candidate text and passes output validation
before any draft or reply is created.

**Fallback**: If the model fails or produces unsafe/oversized output, use a
short deterministic acknowledgement for trusted mail and a clearly labeled
safe draft for approval-queued mail.

## Authorization and approval protocol

**Decision**: Parse exactly one sender mailbox with Go's standards-aware email
parser and lowercase it. Trust only exact equality with the two configured
addresses. Use a 256-bit HMAC token derived with a dedicated Phase-held signing
secret and store only its SHA-256 digest in the atomic state document.

**Rationale**: Display names and substring checks are spoofable. A high-entropy
one-time secret prevents queue identifiers alone from authorizing sends. Email
sender identity is not strong cryptographic identity, but it matches the user's
MVP requirement and is narrowed by the AgentMail account boundary.

**Approval syntax**: The first non-empty line must be exactly:

```text
APPROVE <QUEUE_ID> <TOKEN>
```

or:

```text
REJECT <QUEUE_ID> <TOKEN>
```

Quoted or embedded commands are not accepted. The first committed decision is
terminal.

## Persistence and idempotency

**Decision**: Store processing records, approval records, and poller metadata in
a versioned atomic JSON document on a dedicated Go-service volume. Never store
the source email body or plaintext approval token. Use deterministic client IDs
derived from source message ID and side-effect type.

**Rationale**: A single Go worker owns a small state set, so atomic replace and
explicit state validation provide sufficient MVP durability without CGO or a
database dependency. Deterministic remote identifiers allow recovery after
ambiguous request timeouts.

## Supervision and health

**Decision**: Run the poller in a separate scratch-based container supervised by
`titus-email-poller.service`. When enabled, write an atomic JSON heartbeat after
every completed cycle. The container health check requires a fresh heartbeat;
when disabled it verifies the worker's explicit disabled state.

**Rationale**: A dead poller must make its dedicated container unhealthy rather
than silently leaving email unprocessed. It must not affect Hermes health or
make a deliberately disabled deployment unhealthy.

## Polling rather than webhooks

**Decision**: Poll every 60 seconds for the MVP.

**Rationale**: Titus has no published ports and is intentionally private on the
OvernightDesk container network. Polling avoids a new public ingress path while
meeting the required response latency. AgentMail webhooks can be reconsidered
when a hardened ingress and signature-validation design exists.
