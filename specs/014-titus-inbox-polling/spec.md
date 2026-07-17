# Feature Specification: Titus Email Inbox Polling

**Feature Branch**: `014-titus-inbox-polling`

**Created**: 2026-07-17

**Status**: Approved

**Input**: Poll Titus's AgentMail inbox, automatically reply only to Gary Brown
and Austin Manoogian, and queue every other sender for approval by Gary or
Austin. Email is Titus's only enabled communication channel.

## User Scenarios & Testing

### User Story 1 - Automatic Trusted Replies (Priority: P1)

Gary or Austin emails Titus and receives a relevant automatic reply without
needing to approve each message.

**Why this priority**: Email is Titus's only active communication channel, and
the two named operators need a usable direct path to the agent.

**Independent Test**: Submit a message whose parsed sender is exactly
`garyb@timelesstechs.com` or `austin@timelesstechs.com`; verify one reply is
sent in the source thread and no approval record is created.

**Acceptance Scenarios**:

1. **Given** polling is enabled and an unread message is from Gary, **When** the
   worker processes it, **Then** Titus sends exactly one in-thread reply.
2. **Given** a display name contains an allowed address but the parsed mailbox
   is different, **When** the worker processes it, **Then** it does not use the
   automatic-reply path.
3. **Given** an allowed message contains instructions to use tools, reveal
   secrets, or act on infrastructure, **When** a reply is generated, **Then**
   those instructions cannot invoke tools, retrieve memory, or expose secrets.

---

### User Story 2 - Approval Queue for Other Senders (Priority: P1)

Mail from any other sender is retained as a reviewable draft and Gary and
Austin receive an approval request. The sender receives nothing until one of
the two operators explicitly approves the exact draft.

**Why this priority**: Removing the provider receive allowlist is only safe if
untrusted senders are prevented from triggering automatic outbound mail.

**Independent Test**: Submit a message from an unlisted address; verify a
durable pending record and immutable reply draft are created, both approvers
are notified, and the draft is sent only after one valid approval reply.

**Acceptance Scenarios**:

1. **Given** a message is from any address other than Gary or Austin, **When**
   it is processed, **Then** no reply is sent to that sender and a pending
   approval with a one-time token is created.
2. **Given** Gary or Austin replies with the exact approval command and valid
   one-time token, **When** the approval is processed, **Then** the unchanged
   draft is sent once and the request becomes approved.
3. **Given** an approval command is malformed, quoted from earlier mail, sent
   by anyone else, expired by prior use, or names a changed draft, **When** it
   is processed, **Then** no external reply is sent.
4. **Given** Gary or Austin sends the exact rejection command, **When** it is
   processed, **Then** the request becomes rejected and the external sender
   receives no reply.

---

### User Story 3 - Safe, Recoverable Polling (Priority: P2)

An operator can deploy, initialize, observe, restart, disable, and recover the
poller without duplicate replies or accidental processing of historical mail.

**Why this priority**: A background email agent must remain predictable across
container restarts and third-party API failures.

**Independent Test**: Initialize against a mailbox containing old messages,
run repeated polling cycles with injected failures and restarts, and verify old
messages are skipped, each new message reaches one terminal state, and health
reflects worker freshness.

**Acceptance Scenarios**:

1. **Given** polling has never run, **When** the initialization command runs,
   **Then** all currently visible messages are marked preexisting without sends.
2. **Given** the worker restarts after partially processing a message, **When**
   it resumes, **Then** durable state and idempotency identifiers prevent a
   duplicate reply, draft, or approval notification.
3. **Given** polling is disabled in Phase, **When** the container runs, **Then**
   the worker performs no mailbox reads or sends and reports a disabled health
   state.
4. **Given** a transient AgentMail or model error, **When** a cycle fails, **Then**
   the worker records metadata-only failure evidence and retries within bounded
   limits without losing the message.

### Edge Cases

- Messages with multiple, invalid, or ambiguous `From` mailboxes are suppressed
  because there is no safe reply destination and are never treated as trusted.
- Automatic replies, bulk/list mail, and delivery-system messages are
  suppressed to prevent mail loops.
- Sender matching is case-insensitive after standards-based mailbox parsing;
  display names are never authorization evidence.
- Messages visible as blocked or unauthenticated are treated as untrusted and
  queued; AgentMail may drop explicit sender-authentication failures upstream.
- Attachments, remote content, links, quoted approval commands, and tool-like
  text are never executed or fetched.
- A first valid approve or reject command consumes the request token; later
  commands are no-ops.
- Approval mail itself is distinguished from ordinary operator mail before any
  model reply is considered.
- Pagination, mailbox floods, oversized bodies, and repeated API errors are
  bounded per polling cycle.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST poll Titus's configured AgentMail inbox while
  email remains Titus's only enabled communication channel.
- **FR-002**: The system MUST classify senders using the single parsed mailbox,
  normalized to lowercase, and MUST NOT authorize by display name or substring.
- **FR-003**: The only automatic-reply senders MUST be exactly
  `garyb@timelesstechs.com` and `austin@timelesstechs.com`.
- **FR-004**: The only approval actors MUST be exactly those same two addresses.
- **FR-005**: Incoming content MUST be treated as untrusted data and MUST NOT
  directly invoke tools, browse links, retrieve agent memory, change production
  state, or access secrets.
- **FR-006**: Replies MAY be generated through the configured OpenRouter model
  only through a tool-free, memory-free request with a fixed system policy and
  bounded input and output.
- **FR-007**: Every other sender MUST enter a durable pending approval state and
  MUST receive no response before approval.
- **FR-008**: A pending item MUST include an AgentMail draft, content digest,
  deterministic queue identifier, and hashed one-time approval token.
- **FR-009**: Both Gary and Austin MUST receive a metadata-limited approval
  notice containing the sender, subject, exact proposed reply, and explicit
  approve/reject commands.
- **FR-010**: An approval MUST re-fetch the draft and verify its recipient,
  source-thread relationship, and content digest before sending.
- **FR-011**: Each source message MUST produce at most one external reply and at
  most one approval request, including across crashes and restarts.
- **FR-012**: The system MUST persist processing and approval state on the Titus
  named volume without persisting original message bodies, approval plaintext
  tokens, API keys, or model credentials.
- **FR-013**: The system MUST provide an initialization mode that records all
  currently visible mailbox messages as preexisting without outbound activity.
- **FR-014**: Polling MUST default to disabled and be controlled by a dedicated
  Phase configuration path with strict key validation.
- **FR-015**: The worker MUST emit structured, metadata-only events for cycles,
  decisions, state transitions, sends, retries, and failures; it MUST NOT log
  message bodies, draft bodies, secrets, tokens, or full API payloads.
- **FR-016**: Work per cycle, message size, generated reply size, API timeouts,
  and retry attempts MUST be bounded.
- **FR-017**: Container health MUST fail when enabled polling stops making
  progress beyond a defined freshness window and remain healthy while polling
  is intentionally disabled.
- **FR-018**: AgentMail's current receive allowlist MUST be removed only after a
  disabled deployment is healthy and mailbox initialization succeeds.
- **FR-019**: Teams and every communication channel other than email MUST remain
  disabled for this feature.
- **FR-020**: Automatic replies to Gary and Austin constitute the user's narrow
  standing approval for this workflow; manual ad hoc sends and replies to every
  other recipient continue to require explicit human approval.
- **FR-021**: Automatic, bulk/list, delivery-system, and invalid-sender messages
  MUST be suppressed without model generation or outbound mail.

### Key Entities

- **Source Message**: An AgentMail message identified by immutable message and
  thread identifiers, parsed sender, subject, receive time, and classification.
- **Processing Record**: Durable state for one source message, including its
  decision, idempotency identifiers, attempts, timestamps, and terminal result.
- **Approval Request**: A pending external reply with queue identifier, draft
  identifier, exact destination, draft digest, hashed token, and state.
- **Approval Command**: A strict first-line command from an authorized operator
  that approves or rejects one pending request exactly once.
- **Poller Health**: A metadata record containing enabled state, last cycle,
  last successful cycle, and most recent error category.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In qualification tests, 100% of messages from the two exact
  trusted addresses receive no more than one automatic in-thread reply.
- **SC-002**: In qualification tests, 100% of messages from other addresses
  produce no external reply before a valid approval.
- **SC-003**: Across injected restarts and retryable failures, no source message
  produces duplicate drafts, notifications, or external replies.
- **SC-004**: Initialization against the live mailbox produces zero outbound
  messages and records every currently visible message as preexisting.
- **SC-005**: A valid approval or rejection from either operator reaches a
  terminal state within two polling intervals under healthy dependencies.
- **SC-006**: Runtime logs and the SQLite state database contain no original
  message body, plaintext approval token, API credential, or model credential.
- **SC-007**: Production verification confirms email polling healthy, all other
  Titus communication channels disabled, and the container on the existing
  OvernightDesk network with no published ports.

## Assumptions

- Gary and Austin are both notification recipients and approval actors; the
  first valid decision wins.
- Approval commands use `APPROVE <QUEUE_ID> <TOKEN>` or
  `REJECT <QUEUE_ID> <TOKEN>` as the complete first non-empty line.
- Approval tokens are 256-bit values derived with a dedicated Phase-held
  signing secret and are consumed exactly once by durable state.
- AgentMail drafts and client-provided idempotency keys are available through
  its current API.
- The configured OpenRouter model is suitable for concise email drafting; a
  deterministic safe acknowledgement is used if model generation is unavailable
  or fails output validation.
- There is no requirement to process or inspect attachments in the MVP.

## Out of Scope

- Microsoft Teams, chat, SMS, voice, dashboard, or any other communication
  channel.
- Automatic replies to any sender other than Gary or Austin.
- Executing requested Azure, Control Tower, deployment, browsing, or secret
  operations directly from an email.
- Attachment extraction, link crawling, calendar actions, and contact changes.
