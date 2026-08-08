# Feature Specification: Titus Telegram DM Channel

**Feature Branch**: `037-titus-telegram-channel`

**Created**: 2026-08-08

**Status**: Draft

**Input**: Owner request to connect Titus to Telegram because the current
Element/Matrix client is no longer working well. The first Telegram scope is
Gary only, using the existing Titus tenant Phase path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chat with Titus from Telegram (Priority: P1)

Gary can send a private Telegram direct message to Titus and receive the same
Titus agent experience already available through the existing Hermes runtime.

**Why this priority**: Replacing the unreliable client is the primary user
value; the first release needs one dependable operator path.

**Independent Test**: With the Telegram channel enabled and the approved bot
credential present, Gary sends a harmless message in a private chat and gets one
response through the Titus runtime.

**Acceptance Scenarios**:

1. **Given** the Telegram channel is ready and Gary is the exact allowlisted
   user, **When** Gary sends a private message to the Titus bot, **Then** Titus
   processes it through the existing Hermes reasoning, tool, memory, and
   approval boundaries and returns a response in that chat.
2. **Given** Titus is processing a Telegram message, **When** Gary sends a
   follow-up, **Then** the existing Hermes session and busy-input behavior apply
   without creating a second runtime or bypassing approval.

### User Story 2 - Preserve the Titus access boundary (Priority: P1)

Only Gary can use this Telegram channel. Group chats, channels, unknown users,
wildcard access, malformed Phase data, and disabled state remain outside the
Titus interaction surface.

**Why this priority**: Telegram is an external inbound boundary to an agent
with operational tools; an accidental broadening would expose Titus or its
business context.

**Independent Test**: Exercise Gary's private DM, an unauthorized user, a group
message, an invalid Phase record, and disabled configuration, then verify only
the approved DM reaches Titus.

**Acceptance Scenarios**:

1. **Given** a sender is not Gary, **When** that sender messages the bot,
   **Then** Titus produces no agent turn, tool call, memory write, or visible
   response.
2. **Given** a message arrives from a Telegram group, supergroup, forum, or
   channel, **When** the bot receives it, **Then** the message is rejected
   before Titus processing regardless of sender.
3. **Given** the Phase record is missing, malformed, wildcarded, or contains
   more than one allowed user, **When** Titus starts, **Then** Telegram remains
   unavailable while Titus, Matrix, Teams, email, and memory remain healthy.

### User Story 3 - Operate and recover the channel safely (Priority: P2)

An operator can qualify, enable, disable, and roll back the Telegram channel
without exposing its token or changing Titus's existing Matrix, Teams, email,
memory, or action boundaries.

**Why this priority**: The channel must be a reversible production change, not
an untracked credential or ad hoc process.

**Independent Test**: Run source qualification, deploy disabled-first, enable
Telegram using the existing Phase record, verify the redacted health state and
Gary canary, then disable Telegram and verify Titus's other surfaces remain
healthy.

**Acceptance Scenarios**:

1. **Given** Telegram is disabled or its Phase record is invalid, **When** the
   Titus service starts, **Then** no Telegram polling or webhook listener is
   active, no token is projected into runtime configuration, and the shared
   Titus service remains healthy.
2. **Given** Telegram is enabled with the exact Phase contract, **When** Titus
   starts, **Then** it uses outbound polling, exposes no new public ingress, and
   reports ready only after a redacted Bot API identity check and connected
   Hermes Telegram adapter state are observed.
3. **Given** Telegram must be rolled back, **When** the operator disables it and
   restarts Titus, **Then** Telegram stops accepting new messages while Titus's
   existing data, Matrix channel, Teams preparation, email intake, and memory
   remain intact.

### Edge Cases

- A Telegram username, display name, or chat title must not substitute for
  Gary's numeric Telegram user ID.
- A group, supergroup, forum topic, channel post, forwarded message, or bot
  message must not become a Titus turn.
- The Phase record must reject wildcard access, empty values, whitespace,
  multiple users, unsupported keys, and an invalid bot-token shape.
- Replayed Telegram updates or a Titus restart must not create duplicate agent
  turns or visible duplicate replies through the existing Hermes handling.
- Telegram API failure, polling conflict, invalid credentials, or rate limiting
  must fail or degrade the Telegram channel without disabling unrelated Titus
  services.
- Telegram token, private message bodies, and protected identifiers must not
  appear in source, process arguments, health output, or logs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Titus MUST support one Telegram bot identity through its existing
  Hermes runtime and no separate bridge service.
- **FR-002**: Titus MUST accept Telegram direct messages only from exactly one
  configured numeric user ID for Gary.
- **FR-003**: Titus MUST reject group, supergroup, forum, channel, bot-authored,
  and senderless Telegram updates before agent processing.
- **FR-004**: Telegram access MUST remain disabled unless the exact Phase record
  is present, valid, and explicitly eligible for activation by the runtime;
  invalid optional Telegram data MUST NOT stop the shared Titus service.
- **FR-005**: The Telegram Phase contract MUST accept only the bot token and
  one-user allowlist fields, reject unknown keys, reject wildcard access, and
  reject more than one user.
- **FR-006**: Telegram MUST use outbound polling for the MVP and MUST NOT add a
  public webhook route, host port, or ingress rule.
- **FR-007**: Accepted Telegram messages MUST use the existing Titus Hermes
  session, tool, memory, model, and human-approval boundaries.
- **FR-008**: Telegram MUST NOT change the existing Matrix channel, Teams
  preparation, AgentMail intake, meeting processing, or memory data boundary.
- **FR-009**: Disabled, invalid, unauthorized, unsupported-chat, and provider
  failure outcomes MUST fail closed without broadening access, stopping
  unrelated Titus channels, or exposing sensitive values.
- **FR-010**: Runtime and qualification evidence MUST report only bounded
  metadata such as enabled/disabled, configured policy count, connection state,
  and failure category; it MUST exclude tokens, message bodies, and protected
  identifiers.
- **FR-011**: The channel MUST have a documented disabled-first activation,
  health verification, and reversible rollback procedure.
- **FR-012**: Telegram setup MUST remain limited to Gary until a separately
  reviewed scope expansion authorizes additional users or chats.

### Key Entities

- **Telegram Phase profile**: The secret-backed bot token and exact Gary user
  allowlist under `/agents/hermes-titus/telegram`.
- **Telegram private message event**: An inbound update identified by sender,
  chat type, chat ID, and provider delivery metadata before dispatch.
- **Telegram channel state**: Disabled, ready, connected, degraded, or failed
  metadata used for safe qualification and rollback.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In qualification, 100% of valid private messages from Gary
  receive one response or explicit safe refusal, with zero authorization bypass.
- **SC-002**: In qualification, 100% of messages from unauthorized users or
  non-private Telegram chats produce zero Titus agent turns, tool calls, memory
  writes, or visible responses.
- **SC-003**: In qualification, invalid or disabled Telegram configuration
  produces zero Telegram polling activity, no secret projection, and no
  sibling-channel outage.
- **SC-004**: At least 95% of valid Gary test messages receive a response or safe
  refusal within 30 seconds under normal Telegram and Titus service health.
- **SC-005**: A disabled-first deployment and rollback preserve healthy Matrix,
  email, memory, and Titus runtime behavior with zero new public ports.
- **SC-006**: Source scans, runtime inspection, health output, and sampled logs
  contain zero Telegram bot tokens or private message bodies.
- **SC-007**: Ready-state deployment verification succeeds only when the
  Telegram Bot API returns a valid bot identity and Hermes reports the Telegram
  adapter as connected through its gateway platform health state.

## Assumptions

- Gary's numeric Telegram user ID is already stored in the existing Phase
  profile as `TELEGRAM_ALLOWED_USERS`.
- The Telegram bot token is already stored in the same Phase profile as
  `TELEGRAM_BOT_TOKEN`; it will never be copied into Git, chat, or command
  output.
- Outbound polling is appropriate for the always-on Titus runtime and avoids a
  new public ingress surface.
- The native Hermes Telegram adapter is available in the pinned Titus image;
  qualification will verify this before activation.
- Additional users, groups, channels, webhooks, attachments, proactive cron
  delivery, and client migration details are deferred scope.
- Production activation remains a separately observed, reversible change even
  though the source and Phase values are prepared.

## Deferred follow-up scope

Additional Telegram users, group or forum access, channel posts, webhook mode,
proactive Telegram delivery, Telegram-specific memory behavior, and any
Element/Matrix migration or retirement require a separate reviewed change.
