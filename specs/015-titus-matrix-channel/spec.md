# Feature Specification: Titus Matrix Communication Channel

**Feature Branch**: `015-titus-matrix-channel`

**Created**: 2026-07-17

**Status**: MVP Implemented; P2 controls and induced-failure hardening remain

**Input**: User description: "Make Matrix the primary interactive communication channel for Hermes Titus. The operator is `@frozensolo:matrix.org`, the dedicated bot is `@hermes-titus:matrix.org`, and the private room is `!LuLWlULPVgtogXtKbP:matrix.org`. Keep email as an asynchronous fallback."

## User Scenarios & Testing

### User Story 1 - Give Titus Work in Matrix (Priority: P1)

Gary sends Titus an instruction in the approved private Matrix room and receives
an acknowledgement, visible progress, and exactly one terminal response from
the full Hermes agent. Titus can use its approved tools and memory while
handling the request, subject to the same approval boundaries as every other
Hermes entry point.

**Why this priority**: The current email path can acknowledge messages but does
not submit them to the Hermes agent loop. A trusted interactive path is the
primary user value of this feature.

**Independent Test**: Send a unique text instruction from the approved operator
in the approved room that requires a harmless read-only tool. Verify Titus
acknowledges it, reports progress, uses the tool, and returns one final answer in
the same conversation context.

**Acceptance Scenarios**:

1. **Given** Gary is in the approved encrypted room, **When** he sends a plain
   text instruction, **Then** Titus processes it through the full Hermes agent
   pipeline without requiring an explicit mention.
2. **Given** an instruction requires a permitted read-only tool, **When** Titus
   handles it, **Then** tool and memory access follow the existing Titus runtime
   policy and the result is returned to the same room.
3. **Given** an instruction succeeds, fails, or is stopped, **When** processing
   reaches a terminal state, **Then** Gary receives exactly one clear terminal
   response rather than an acknowledgement with no outcome.
4. **Given** Gary sends a follow-up in the room, **When** Titus handles it,
   **Then** the follow-up retains the room's conversation context; a follow-up
   in an explicit Matrix thread retains only that thread's context.

---

### User Story 2 - Control and Approve Active Work (Priority: P2)

Gary can see that Titus is working, queue a follow-up, steer or stop active work,
inspect status, and approve or deny guarded actions without leaving Matrix.

**Why this priority**: Long-running operational work is usable only when the
operator can distinguish active, queued, failed, and completed states and can
retain control over risky actions.

**Independent Test**: Start a bounded long-running task, queue a second message,
request one guarded action, approve it with the documented reaction, and verify
the first task, approval, and queued follow-up remain correctly ordered.

**Acceptance Scenarios**:

1. **Given** Titus is already processing a request, **When** Gary sends another
   ordinary instruction, **Then** it is queued and does not silently interrupt
   the active run.
2. **Given** Titus proposes an action that requires approval, **When** the
   approval prompt appears, **Then** only the operator who requested the action
   can approve once, approve persistently where policy allows, or deny it.
3. **Given** an active run is no longer wanted, **When** Gary uses the supported
   stop or steer control, **Then** Titus applies the control to the current room
   session and reports the resulting state.
4. **Given** Gary requests status, **When** Titus is idle, active, waiting for
   approval, or holding queued work, **Then** Matrix shows the current state
   without exposing secrets or message bodies in diagnostics.

---

### User Story 3 - Operate a Private Recoverable Channel (Priority: P3)

An operator can deploy, verify, restart, disable, recover, and rotate the Matrix
channel without losing the tenant's durable Hermes data, silently weakening
encryption, replaying old messages, or exposing Titus to other users or rooms.

**Why this priority**: The channel grants access to an operations agent. It must
fail closed and remain diagnosable across Matrix, encryption, credential, and
container failures.

**Independent Test**: Qualify the configuration, start the channel, verify an
encrypted exchange, restart Titus, verify conversation continuity and no old
event replay, then exercise invalid-token and missing-encryption-store failure
paths and the documented rollback.

**Acceptance Scenarios**:

1. **Given** a sender or room is not explicitly approved, **When** a message
   reaches the bot account, **Then** it cannot trigger an agent turn.
2. **Given** encryption cannot initialize in required mode, **When** Titus
   starts, **Then** the Matrix channel fails closed and reports a diagnosable
   unhealthy state rather than accepting unencrypted work.
3. **Given** Titus restarts with its durable Matrix state intact, **When** it
   reconnects, **Then** it does not execute events that predate the restart and
   can decrypt and answer new room messages.
4. **Given** the Matrix channel must be disabled or rolled back, **When** the
   operator follows the runbook, **Then** Matrix processing stops while the
   Hermes data volume, Matrix encryption state, and existing email poller data
   remain preserved.

### Edge Cases

- A display name that resembles an approved user is not authorization; only the
  exact Matrix user ID is authoritative.
- Invitations, aliases, and events from any shared room other than the exact
  approved room cannot trigger Titus. A direct message is accepted only from
  the exact authorized operator and uses a separate room-scoped session.
- Events received before the gateway's startup boundary, duplicate event IDs,
  edits, notices, bot-authored events, and bridge ghost events do not create
  duplicate agent turns.
- If the homeserver is unreachable, rate-limited, or returns malformed data,
  Titus retries within bounded limits and exposes channel degradation without
  crashing unrelated tenant services.
- If the access token is revoked, the account is logged out, or the bot is
  removed from the room, the channel reports a terminal authentication or
  membership failure rather than appearing healthy.
- If the durable encryption store is missing or inconsistent with the bot
  device identity, required encryption fails closed and recovery follows a
  documented token/device rotation procedure.
- Reactions from users other than the requester cannot satisfy an approval.
- Room-wide mentions, room creation, invitations, redaction, and cross-room
  actions remain unavailable unless a later feature explicitly authorizes them.
- Media is bounded and treated as untrusted input; text, progress, controls, and
  approvals are the acceptance-tested MVP surface.
- Matrix failure does not promote email into a tool-executing command channel.

## Requirements

### Functional Requirements

- **FR-001**: Matrix MUST become Titus's primary interactive command and
  response channel.
- **FR-002**: Matrix messages MUST enter the full Hermes agent pipeline,
  including the existing Titus tools, memory, reasoning, and approval policy.
- **FR-003**: The channel MUST authenticate as the dedicated bot account
  `@hermes-titus:matrix.org` against the `matrix.org` homeserver.
- **FR-004**: Only the exact operator ID `@frozensolo:matrix.org` MUST be allowed
  to trigger Titus through Matrix.
- **FR-005**: Only the exact room ID `!LuLWlULPVgtogXtKbP:matrix.org` MUST be
  allowed as a shared-room trigger. The native adapter MAY accept a direct
  message from the exact authorized operator; every other user and shared room
  MUST be denied.
- **FR-006**: The approved room MUST require end-to-end encryption and the
  channel MUST fail closed when encryption dependencies or state are unavailable.
- **FR-007**: The approved room MUST accept operator instructions without an
  explicit mention while room-wide mentions sent by Titus remain disabled.
- **FR-008**: Unthreaded messages in the approved room MUST use one stable room
  conversation context, while explicit Matrix threads MUST remain isolated from
  the main room and from each other.
- **FR-009**: Every accepted instruction MUST produce visible processing state
  and exactly one success, failure, denial, cancellation, or supersession result.
- **FR-010**: Ordinary messages arriving during an active run MUST queue by
  default; interruption and steering MUST require explicit supported controls.
- **FR-011**: Guarded actions MUST use requester-bound approval controls and MUST
  preserve the existing Titus approval and authority boundaries.
- **FR-012**: Room creation, invitations, redaction, public-room actions, and
  cross-room Matrix tools MUST remain disabled.
- **FR-013**: The gateway MUST ignore its own events, duplicate events, old
  startup events, replacement edits, notices, and known bridge ghost patterns.
- **FR-014**: Matrix access tokens, recovery keys, device secrets, passwords,
  message bodies, and approval details MUST NOT appear in source control,
  process listings, Docker inspection output, health output, or logs.
- **FR-015**: Matrix secrets MUST live in Phase under the Titus tenant boundary
  and MUST be materialized only through the existing root-owned runtime secret
  flow with strict expected-key validation.
- **FR-016**: Matrix encryption and session state MUST persist on the existing
  Titus named volume and survive ordinary container and service restarts.
- **FR-017**: Media MUST be capped at 10 MiB, the connector MUST delay at least
  five seconds between failed synchronization attempts, and health MUST become
  stale after 120 seconds without a successful synchronization so indefinite
  reconnect operation cannot cause unbounded resource or model consumption.
- **FR-018**: The runtime MUST expose structured metadata-only evidence for
  channel startup, connected state, joined-room count, sync freshness, exact
  policy counts, encryption readiness, reconnects, and categorized failures.
- **FR-019**: Health verification MUST distinguish healthy, disabled,
  reconnecting/degraded, authentication-failed, encryption-failed, and
  synchronization stale for more than 120 seconds.
- **FR-020**: Deployment MUST verify the exact bot identity, operator allowlist,
  room allowlist, encrypted-room behavior, tool execution, approval controls,
  restart continuity, old-event suppression, and secret redaction before the
  channel is considered ready.
- **FR-021**: Rollback MUST disable Matrix processing without deleting the
  `hermes-titus-data` volume or the separate email-poller volume.
- **FR-022**: The existing AgentMail poller MUST continue as an asynchronous
  acknowledgement, drafting, and approval workflow and MUST NOT execute email
  instructions through Hermes as part of this feature.
- **FR-023**: Microsoft Teams and all communication channels other than Matrix
  and the existing AgentMail workflow MUST remain disabled.
- **FR-024**: Runtime documentation, the platform standard, production evidence,
  and the deployment log MUST be updated when implementation changes the live
  channel state.
- **FR-025**: The feature MUST be implemented test-first and all channel,
  configuration, security, restart, and rollback tests MUST fail before the
  corresponding production behavior is added.

### Key Entities

- **Matrix Bot Identity**: The dedicated Titus account, its homeserver, device
  identity, and secret credentials; credentials are referenced but never stored
  in repository artifacts.
- **Authorized Operator**: The exact Matrix user permitted to initiate work and
  requester-bound approvals.
- **Authorized Room**: The exact private encrypted Matrix room that forms the
  communication and session boundary.
- **Matrix Event**: A uniquely identified inbound message, control, thread, edit,
  notice, or reaction with sender, room, timestamp, and processing disposition.
- **Room Session**: The durable Hermes conversation lane for unthreaded room
  messages or an isolated explicit Matrix thread.
- **Channel Health**: Metadata describing configured state, authentication,
  encryption readiness, sync freshness, reconnect attempts, and last failure
  category without message or secret content.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In qualification, 100% of new text instructions from the approved
  operator in the approved encrypted room enter Hermes and receive one terminal
  response; acknowledgements without outcomes are zero.
- **SC-002**: In qualification, 100% of events from any other user, unapproved
  shared room, unauthorized direct message, or unencrypted room produce zero
  agent turns and zero tool calls.
- **SC-003**: Timestamped qualification evidence shows a healthy new instruction
  becoming visibly active within 10 seconds and a terminal outcome appearing
  within 10 seconds of the underlying agent run completing.
- **SC-004**: Across restart, reconnect, duplicate-event, and edit tests, each
  source event creates at most one agent turn and no pre-start event is executed.
- **SC-005**: In guarded-action tests, only the requesting operator can approve
  or deny the action, and every unauthorized reaction produces zero action.
- **SC-006**: A normal Titus restart preserves encrypted communication and room
  context, and new messages can be processed within two minutes after service
  recovery.
- **SC-007**: Missing encryption support, inconsistent encryption state, an
  invalid access token, or 120 seconds without a successful synchronization
  produces a failed or degraded health result and never silently downgrades
  encryption.
- **SC-008**: Repository scans, runtime inspection, health output, and sampled
  production logs contain zero Matrix access tokens, recovery keys, passwords,
  message bodies, or approval contents.
- **SC-009**: Disabling or rolling back Matrix stops new Matrix agent turns while
  preserving both Titus and email-poller durable volumes and leaving email's
  existing non-tool workflow available.

## Assumptions

- Gary controls `@frozensolo:matrix.org`, the bot account
  `@hermes-titus:matrix.org`, and the private room
  `!LuLWlULPVgtogXtKbP:matrix.org`.
- The room is private and will be configured as encrypted before production
  activation; no additional users are approved for this slice.
- The bot access token and recovery key will be entered directly into Phase and
  will never be supplied through chat, repository files, or command history.
- Native Hermes Matrix support is preferred over a custom bridge because it
  already enters the Hermes agent loop and provides sessions, progress,
  controls, approvals, and encryption behavior.
- Text instructions, progress, controls, and reaction approvals define the MVP;
  attachment-specific behavior may work natively but is not a release gate.
- Email remains useful for asynchronous acknowledgements and external-sender
  approval flow but is not a trusted agent command transport in this feature.

## Out of Scope

- Making email instructions execute through Hermes.
- Adding more Matrix users, rooms, direct messages, or federated public rooms.
- Matrix room administration, public-room creation, invitations, redaction,
  bridges, or cross-room automation.
- Microsoft Teams activation.
- Custom Matrix clients, homeservers, identity servers, or application services.
- Attachment extraction, link crawling, voice processing, and media-specific
  agent workflows.
- Changing Titus's model routing, Control Tower authority, or tool inventory.
