# Feature Specification: Titus Telegram-Native Guarded Email Approval

**Feature Branch**: `agent/codex/titus-telegram-email-approval`

**Created**: 2026-08-18

**Status**: In Progress

**Input**: Owner request to make Titus outbound email approval simpler and
more reliable after a Telegram approval did not reach the waiting send.

## User Scenarios & Testing

### User Story 1 - Approve one exact email from Telegram (Priority: P1)

Gary can approve or decline a Titus outbound email directly from the private
Telegram conversation where Titus presented the complete draft, without
typing a tool name, token, fingerprint, or terminal approval command.

**Independent Test**: Start a Telegram-initiated Titus turn, request one
guarded send, tap the native Approve Once button, and verify that the waiting
send resumes exactly once; repeat with Deny and verify zero provider calls.

**Acceptance Scenarios**:

1. **Given** Titus has presented a complete canonical draft in Gary's private
   Telegram DM, **When** Titus requests the guarded send, **Then** Telegram
   shows native Approve Once and Deny controls tied to that exact send call.
2. **Given** Gary taps Approve Once, **When** the approval is resolved,
   **Then** Titus proceeds with the unchanged prepared draft and the existing
   guarded service remains the only path to external delivery.
3. **Given** Gary taps Deny, **When** the approval is resolved, **Then** the
   send stops before SecurityTeam or AgentMail and Titus reports rejection.
4. **Given** the approval is stale, already resolved, or clicked by an
   unauthorized user, **When** Telegram handles the callback, **Then** it does
   not authorize delivery and reports a safe non-success state.

### User Story 2 - Preserve the guarded email boundary (Priority: P1)

The simpler approval surface does not weaken the exact-draft, short-lived
token, SecurityTeam screening, idempotency, or provider readback controls that
prevent empty, changed, duplicate, or unverified email sends.

**Independent Test**: Exercise changed-token, changed-draft, expired-token,
screening-denied, provider-ambiguous, and exact-readback cases after a Telegram
approval and confirm the existing outcomes remain unchanged.

**Acceptance Scenarios**:

1. **Given** the tool call arguments change after the draft was prepared,
   **When** the owner approves the visible request, **Then** local validation
   rejects the call before external I/O.
2. **Given** SecurityTeam rejects or cannot screen the approved content,
   **When** the send continues, **Then** AgentMail is not called.
3. **Given** AgentMail responds ambiguously or readback differs, **When**
   Titus reports the outcome, **Then** it remains unverified and does not retry
   as a new logical send.
4. **Given** operators inspect logs or approval evidence, **When** they review
   the record, **Then** no approval token, recipient, subject, body, or
   provider content is exposed.

### User Story 3 - Recover predictably (Priority: P2)

An operator can restart or roll back Titus without leaving a send authorized by
silence, a stale Telegram button, or a remembered session/permanent approval.

**Independent Test**: Restart or disable the Telegram channel during a pending
approval and verify the request fails closed; invoke the existing read-only
email rollback and verify direct hosted mutations remain absent.

**Acceptance Scenarios**:

1. **Given** no human response arrives before the gateway approval timeout,
   **When** the wait expires, **Then** Titus reports denial/expiry and sends no
   email.
2. **Given** a send call is retried, **When** a new tool call is created,
   **Then** it receives a fresh one-time approval key even if its draft bytes
   are identical to an earlier call.
3. **Given** the Telegram approval plugin is unavailable or misconfigured,
   **When** Titus handles a Telegram send request, **Then** it fails closed
   rather than falling back to an unbound or automatic send.

## Edge Cases

- The Telegram message is from an unauthorized user, group, supergroup, forum,
  channel, or senderless update.
- A callback arrives after the waiting tool has timed out or after a restart.
- The owner taps a button twice or two callbacks race.
- The exact draft contains a long body; the approval prompt must remain a safe
  review pointer and must not leak the approval token.
- The same recipient, subject, and body are sent in a later independent turn;
  it must still require a new one-time approval.
- Telegram is disabled while Matrix/Teams or read-only email remain healthy.

## Requirements

### Functional Requirements

- **FR-001**: Telegram-initiated calls to `titus_send_approved_email` MUST
  enter the existing Hermes gateway approval queue before the local MCP send
  subprocess is allowed to run.
- **FR-002**: The Telegram approval MUST use the native inline-button surface
  and MUST offer a one-time approval and denial; it MUST NOT require the owner
  to type a terminal command or internal control value.
- **FR-003**: Each approval MUST be bound to the complete tool-call draft and
  a unique tool-call approval key; a later call MUST NOT inherit an earlier
  once/session/permanent decision.
- **FR-004**: Only the existing authorized private Telegram user MAY resolve
  the approval. Non-private chats, unknown users, stale callbacks, and replayed
  callbacks MUST fail closed.
- **FR-005**: The local guarded sender MUST retain exact draft validation,
  short-lived token verification, SecurityTeam screening, stable provider
  idempotency, exact readback, and current safe result codes.
- **FR-006**: Telegram approval MUST be the only owner gate for a Telegram
  gateway send call; the same call MUST NOT block on a second terminal-oriented
  MCP elicitation prompt.
- **FR-006a**: The child MCP server MUST require a fresh, content-free,
  session-and-fingerprint-bound handoff from the repo-owned approval hook before
  suppressing its normal elicitation; a missing or stale handoff MUST fail
  closed.
- **FR-006b**: A denied or timed-out gateway approval MUST remove its pending
  handoff marker; an approved marker MUST be single-use and consumed before
  the MCP server proceeds.
- **FR-007**: Non-Telegram callers MUST retain the existing fail-closed owner
  approval behavior unless a separately approved channel contract changes it.
- **FR-008**: A denied, timed-out, unavailable, malformed, or failed approval
  MUST prevent SecurityTeam and AgentMail I/O and MUST NOT be reported as sent.
- **FR-008a**: Hermes yolo, off, cron, or other approval-bypass modes MUST NOT
  authorize this outbound mutation; the plugin MUST fail closed when the
  native human gate cannot be enforced.
- **FR-009**: Approval prompts, logs, health output, and tests MUST exclude
  approval tokens, credentials, provider content, and unredacted email content;
  prompts MAY identify a short draft fingerprint and instruct the owner to
  review the already-present exact draft.
- **FR-009a**: The handoff MUST contain no email body, recipient, subject,
  token, credential, or provider response and MUST expire without authorizing a
  later call; its marker name MAY use one-way digests of the session,
  fingerprint, and prepared token for exact matching.
- **FR-010**: Runtime projection MUST install and enable the repo-owned approval
  hook atomically with the Titus tenant source, while preserving disabled-first
  Telegram activation and the existing read-only email rollback. The rollback
  and restore controls MUST be explicit, confirmation-gated, independently
  verified, and fail closed if the guarded restart cannot be proven healthy.
- **FR-011**: The feature MUST NOT add a Telegram bridge service, public
  webhook, group access, attachments, automatic sending, new owner roles, or
  changes to SecurityTeam/AgentMail provider contracts.
- **FR-012**: Qualification MUST prove native-button success, denial, expiry,
  unauthorized callback rejection, one-time-key behavior, no-token logging,
  and preservation of the existing guarded-email failure matrix.

## Key Entities

- **Telegram approval request**: A gateway-queued request containing a safe
  review description, session identity, one-time key, and expiry state.
- **Approved email tool call**: The immutable arguments passed only after the
  Telegram request resolves positively; local guarded validation remains
  authoritative.
- **Approval receipt**: A safe success, denial, expiry, or failure outcome with
  no sensitive email or approval values.

## Success Criteria

- **SC-001**: In the Telegram qualification matrix, every approved guarded
  send resumes from the inline button without a terminal prompt, and every
  denied/expired/unauthorized case produces zero provider send calls.
- **SC-002**: 100% of approved sends with changed draft/token, screening
  failure, or provider mismatch retain the existing fail-closed outcome.
- **SC-003**: Repeating an identical email in a later tool call requires a new
  explicit approval; no session or permanent choice authorizes it implicitly.
- **SC-004**: Qualification and sampled logs contain zero approval tokens,
  credentials, provider content, or unredacted email bodies.
- **SC-005**: Telegram rollback or disabled state leaves Titus's read-only
  email tools and unrelated channels healthy, with no new public ingress.

## Assumptions and Non-Goals

- Gary's exact numeric Telegram allowlist and private-DM boundary from Feature
  037 remain authoritative.
- The pinned Hermes image already supplies the native Telegram callback queue;
  this feature integrates with that contract and does not modify the image.
- Telegram is the canonical approval surface only for Telegram-initiated Titus
  turns in this MVP. Matrix, Teams, CLI, API, and cron behavior are not
  redesigned here.
- Durable provider attempt state remains the existing content-free SQLite
  ledger; a new email-content database or bridge is out of scope.
