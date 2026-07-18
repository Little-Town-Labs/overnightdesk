# Feature Specification: Routed Hermes Email Intake

**Feature Branch**: `016-hermes-email-intake`

**Created**: 2026-07-17

**Status**: Deployed and production-verified

**Input**: Route each dedicated AgentMail inbox through the existing dirty
staging and SecurityTeam cleaning pipeline before its assigned Hermes agent can
read or act on the message. Preserve exact sender allowlists and existing
Matrix or Telegram approval channels.

## User Scenarios & Testing

### User Story 1 - Land New Email as Untrusted Content (Priority: P1)

An authorized operator sends an instruction to a dedicated agent inbox and the
message is durably recorded as untrusted content before any agent can read it.

**Why this priority**: No email instruction may bypass the established dirty
content boundary or reach an agent directly.

**Independent Test**: Send one new message to a configured inbox and verify one
dirty record is created with immutable provider, inbox, message, thread, sender,
and assigned-agent metadata while no Hermes session is created yet.

**Acceptance Scenarios**:

1. **Given** a new message in a configured inbox, **When** intake observes it,
   **Then** exactly one dirty record is created and the original content is not
   passed to any agent.
2. **Given** the same provider message is observed again, **When** intake runs,
   **Then** no duplicate dirty record or agent work is created.
3. **Given** a message belongs to a different inbox, **When** one intake
   instance runs, **Then** that instance cannot land or claim the other inbox's
   message as its own.

---

### User Story 2 - Deliver Only Cleared Content to the Assigned Agent (Priority: P1)

After SecurityTeam processes a dirty message, only the cleared content is made
available to the single Hermes agent assigned to that inbox.

**Why this priority**: Cleaning and cross-agent isolation are the core security
properties of the channel.

**Independent Test**: Prepare cleared rows for all three inboxes, run one agent
consumer, and verify it claims only its exact inbox and assigned-agent row and
submits only the cleared content.

**Acceptance Scenarios**:

1. **Given** an automatically approved clean record, **When** the matching
   consumer runs, **Then** the mapped Hermes agent receives only the cleaned
   content plus bounded message context.
2. **Given** a clean record targets another agent or has no trusted route,
   **When** a consumer runs, **Then** it remains unclaimed by that consumer.
3. **Given** a message is rejected, quarantined, awaiting approval, or still
   dirty, **When** consumers run, **Then** no Hermes agent receives it.
4. **Given** email content claims a different inbox or agent identity, **When**
   it is cleaned and consumed, **Then** the trusted route remains unchanged.

---

### User Story 3 - Complete Instructions and Reply in the Source Thread (Priority: P1)

An allowed sender receives the mapped Hermes agent's terminal response in the
same email thread after the full agent reasoning and tool workflow completes.

**Why this priority**: Acknowledgement without executing the instruction is the
failure this feature must correct.

**Independent Test**: Send a harmless authenticated read request, verify the
mapped Hermes agent performs the work, and verify exactly one terminal response
is returned in the original thread.

**Acceptance Scenarios**:

1. **Given** Gary or Austin emails Titus, **When** the clean message is
   processed, **Then** Titus completes the permitted work and replies once in
   the source thread.
2. **Given** `netgleb@gmail.com` emails Hermes Agent, **When** the clean message is processed,
   **Then** only Hermes Agent handles it and replies once.
3. **Given** `mitchelcbrown88@gmail.com` emails Hermes Mitchel, **When** the clean message is
   processed, **Then** only Hermes Mitchel handles it and replies once.
4. **Given** an instruction requires approval, **When** Hermes reaches the
   approval boundary, **Then** approval remains with Titus's Matrix channel or
   the applicable agent's Telegram channel and is never granted by intake.

---

### User Story 4 - Operate and Recover the Shared Go Intake (Priority: P2)

An operator can deploy, initialize, observe, restart, disable, and recover one
shared intake implementation configured independently for the three agents.

**Why this priority**: The channel must survive restarts and dependency failures
without duplicate work or cross-agent leakage.

**Independent Test**: Initialize three disabled instances, inject failures and
restarts across landing, cleaning, agent submission, and reply delivery, and
verify every message reaches at most one terminal result.

**Acceptance Scenarios**:

1. **Given** intake is disabled, **When** an instance starts, **Then** it makes
   no mailbox, database, agent, or outbound-email mutation and reports disabled.
2. **Given** a process restarts after claiming clean work, **When** it resumes,
   **Then** durable state and idempotency prevent duplicate agent runs or replies.
3. **Given** a dependency fails, **When** retry limits are reached, **Then** the
   record remains recoverable and metadata-only evidence identifies the failed
   stage without exposing message content or credentials.

### Edge Cases

- Messages from invalid, ambiguous, automated, bulk, bounce, or self senders
  are suppressed before agent delivery.
- Sender authorization uses one normalized mailbox address; display names and
  substrings are never authorization evidence.
- Existing dirty or clean rows without a trusted AgentMail route are never
  claimed by these consumers.
- Attachments, remote content, links, quoted history, and encoded content remain
  untrusted; attachment execution is excluded from this release.
- Duplicate polling, concurrent consumers, expired claims, process crashes, and
  reply retries cannot produce multiple agent runs or multiple replies.
- A clean record whose route metadata does not exactly match the running
  instance fails closed.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST maintain exactly one trusted inbox-to-agent
  assignment for each configured email channel.
- **FR-002**: The active assignments MUST be Titus operations to Hermes Titus,
  Acerockstar to Hermes Agent, and The Diamond Guy to Hermes Mitchel.
- **FR-003**: Titus MUST accept only `garyb@timelesstechs.com` and
  `austin@timelesstechs.com`; Hermes Agent MUST accept only
  `netgleb@gmail.com`; Hermes Mitchel MUST accept only
  `mitchelcbrown88@gmail.com`. Authorization MUST use exact normalized mailbox
  addresses supplied by protected configuration.
- **FR-004**: Every newly observed email MUST first be persisted as raw,
  untrusted content in the existing dirty staging boundary.
- **FR-005**: Raw email content MUST NOT be passed directly to a model, Hermes
  agent, tool, memory system, or approval mechanism.
- **FR-006**: Duplicate observations of the same provider inbox and message MUST
  produce one dirty record.
- **FR-007**: Inbox and assigned-agent routing MUST come only from protected
  runtime configuration and MUST NOT be inferred from email-controlled fields.
- **FR-008**: SecurityTeam MUST remain the sole component that transitions raw
  staged content into cleared content.
- **FR-009**: Only cleared records whose approval state permits consumption MAY
  be submitted to Hermes.
- **FR-010**: Each consumer MUST claim only records whose trusted inbox and
  assigned-agent values exactly match its protected configuration.
- **FR-011**: Agent submission MUST contain cleaned content rather than the raw
  body and MUST include only the bounded context needed to preserve sender,
  subject, thread, and reply behavior.
- **FR-012**: A permitted email MUST enter the mapped Hermes reasoning loop with
  its normal tools, memory, model routing, and Control Tower policy.
- **FR-013**: Intake MUST NOT approve dangerous or externally consequential
  actions. Existing Matrix or Telegram approval channels remain authoritative.
- **FR-014**: A successful agent result MUST be returned at most once in the
  original AgentMail thread.
- **FR-015**: Processing and reply delivery MUST be idempotent across duplicate
  events, concurrent polling, retries, and process restarts.
- **FR-016**: Disabled operation MUST be the default for new instances and MUST
  produce no external reads, submissions, or sends.
- **FR-017**: Work per cycle, body size, database claims, agent duration, API
  responses, and retry attempts MUST be bounded.
- **FR-018**: Runtime evidence MUST identify the agent, inbox route, stage,
  outcome, attempt, and correlation identifier without logging message bodies,
  sender addresses, subjects, credentials, tokens, or full provider payloads.
- **FR-019**: Existing unrouted staging and clean-table records MUST remain
  unmodified and unclaimable by the new consumers.
- **FR-020**: The implementation MUST preserve existing Matrix and Telegram
  communication channels and their session boundaries.

### Key Entities

- **Inbox Assignment**: Protected binding among provider inbox, public address,
  assigned Hermes agent, allowed senders, and enabled state.
- **Dirty Email Record**: Raw email persisted before security processing with
  provider identity, immutable message and thread identifiers, trusted route,
  and untrusted content.
- **Clean Email Record**: SecurityTeam output containing cleared content,
  approval state, findings metadata, and a reference to its dirty record.
- **Delivery Claim**: Durable ownership and progress state for submitting one
  clean record to its assigned agent and returning one reply.
- **Email Session**: Stable conversation identity derived from assigned agent,
  provider inbox, and source thread.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In isolation tests covering all three inboxes, 100% of messages
  are handled by exactly their assigned agent and zero are handled by another.
- **SC-002**: In end-to-end tests, 100% of agent submissions contain the clean
  content and zero contain the original raw body.
- **SC-003**: Replaying the same provider event 100 times produces one dirty
  record, one agent turn, and no more than one email reply.
- **SC-004**: Rejected, pending, unrouted, or unclean records produce zero agent
  turns and zero replies.
- **SC-005**: Across injected crashes at every processing stage, each message
  either completes once or remains visibly recoverable without cross-agent
  delivery.
- **SC-006**: Under healthy dependencies, a newly received message reaches its
  mapped agent within two security-polling intervals.
- **SC-007**: Qualification and production logs contain no raw body, sender
  address, subject, credential, token, or full provider payload.
- **SC-008**: The mandatory five-axis quality review reports no Critical or
  Required findings before the change is considered ready to merge or deploy.

## Assumptions

- The three existing AgentMail inboxes and Hermes runtimes remain available.
- All exact sender allowlists are stored in protected Phase route configuration
  and are not inferred from display names or email content.
- SecurityTeam's existing dirty-to-clean poller remains the canonical content
  security boundary and is operated independently of email intake.
- Existing Matrix and Telegram channels remain the interactive approval paths.
- The first release processes text content only and does not execute attachments
  or fetch links.

## Out of Scope

- Replacing SecurityTeam or changing its content-cleaning policy.
- Replacing Hermes gateway, reasoning, tools, memory, model routing, Matrix, or
  Telegram implementations.
- Reading personal or shared mailboxes outside the three assigned AgentMail
  inboxes.
- Attachment execution, link crawling, calendar actions, or contact changes.
- Automatically authorizing any dangerous or externally consequential action.
