# Feature Specification: Titus Guarded Outbound Email

**Feature Branch**: `agent/codex/titus-guarded-email`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Titus sent five empty-body emails, including four
with empty subjects. Immediately remove direct email mutation authority, then
add one guarded send path that requires complete approved content, passes it
through SecurityTeam, sends only after screening, reads it back from AgentMail,
and fails closed on missing content, screening failure, or mismatch."

## User Scenarios & Testing

### User Story 1 - Contain unsafe sends immediately (Priority: P1)

The owner can continue asking Titus to inspect and summarize his mailbox while
all direct send, reply, forward, draft, delete, and mailbox mutation actions are
unavailable until the guarded path is qualified.

**Why this priority**: The current provider contract accepts an address without
a subject or body, so leaving direct mutation tools available permits another
misleading or empty external communication.

**Independent Test**: Start Titus with the contained capability set, enumerate
his email actions, and confirm read-only inbox and message actions remain
available while every direct mutation action is absent.

**Acceptance Scenarios**:

1. **Given** the current Titus runtime, **When** containment is activated, **Then** direct email send, reply, forward, draft, delete, label, inbox, webhook, key, domain, and list mutation actions are unavailable.
2. **Given** containment is active, **When** Titus is asked to inspect email, **Then** he can still discover his inbox and read, search, and summarize messages without changing mailbox state.
3. **Given** Titus is asked to send during containment, **When** no guarded action is available, **Then** he reports that sending is temporarily unavailable and preserves the proposed draft without claiming delivery.

---

### User Story 2 - Send exactly the approved message (Priority: P2)

After the owner reviews and explicitly approves a complete draft, Titus can
submit that exact recipient set, nonblank subject, and nonblank body through one
guarded action. The action screens the complete content before delivery and
cannot substitute chat-generated content after the provider call.

**Why this priority**: The owner needs Titus to send email, but only when the
external side effect is mechanically bound to the complete draft that was
reviewed.

**Independent Test**: Approve a harmless test draft, invoke the guarded action
with the exact approved fields, and prove that incomplete, changed, unapproved,
or security-rejected drafts produce zero provider sends.

**Acceptance Scenarios**:

1. **Given** a draft with recipients, subject, and body, **When** Titus requests approval, **Then** the owner sees the exact recipients, full subject, full body, attachment state, and a stable draft fingerprint.
2. **Given** the owner approves one exact draft, **When** Titus invokes the guarded action, **Then** the action accepts only fields whose fingerprint matches that approved draft.
3. **Given** an empty or whitespace-only subject, **When** the guarded action is invoked, **Then** it fails before screening or delivery.
4. **Given** both plain-text and HTML bodies are absent or whitespace-only, **When** the guarded action is invoked, **Then** it fails before screening or delivery.
5. **Given** complete approved content, **When** SecurityTeam is unavailable, unauthorized, times out, rejects the content, or returns an unexpected response, **Then** delivery fails closed.
6. **Given** SecurityTeam allows the exact content, **When** delivery proceeds, **Then** the exact recipients, subject, and body supplied to the guarded action are sent with a stable one-send identity.

---

### User Story 3 - Verify delivery before claiming success (Priority: P3)

Titus reports an email as delivered only after the provider record is retrieved
and its message identity, thread identity, recipient set, subject, and body
match the approved draft exactly.

**Why this priority**: A provider acceptance identifier alone did not prove that
the intended content was delivered and allowed Titus to make a false success
claim.

**Independent Test**: Exercise successful, missing-field, mismatched-field,
missing-identity, timeout, and repeated-request provider responses and confirm
only an exact readback produces a verified success result without duplicate
delivery.

**Acceptance Scenarios**:

1. **Given** the provider accepts a send, **When** readback matches the exact approved draft, **Then** Titus may report verified delivery with non-secret message and thread identifiers.
2. **Given** the provider response lacks a message or thread identifier, **When** the guarded action evaluates it, **Then** it reports failure and does not claim delivery.
3. **Given** provider readback lacks or changes recipients, subject, plain text, or HTML, **When** verification runs, **Then** the action reports ambiguous unverified delivery and Titus does not claim that the approved content was delivered.
4. **Given** an ambiguous response or interrupted readback, **When** the same approved send is retried within the provider's retry window, **Then** the same one-send identity is reused and no duplicate message is created.
5. **Given** a verified send or a failed attempt, **When** operators inspect logs and evidence, **Then** they can identify the stage and outcome without exposing recipients, subject, body, credentials, or other message content.

---

### User Story 4 - Deploy, observe, and recover safely (Priority: P4)

An operator can introduce the guarded sender, validate it privately, activate
it for Titus only, observe its outcomes, and roll back to read-only email
without affecting Titus memory, chats, dashboard, inbound email, Walter,
Mitchel, or another mailbox.

**Why this priority**: The fix changes external action authority and must remain
isolated, observable, reversible, and compatible with the production runtime.

**Independent Test**: Qualify the contained runtime, privately qualify the
guarded tool and its failure matrix, activate it for one owner-approved test
message, then restore read-only mode while proving retained data and unrelated
services are unchanged.

**Acceptance Scenarios**:

1. **Given** an unqualified guarded sender, **When** production source is staged, **Then** Titus remains read-only until private tool, credential, screening, and failure-path checks pass.
2. **Given** the guarded sender is active, **When** Titus restarts, **Then** the guarded capability and required protected bindings persist while direct mutation tools remain absent.
3. **Given** rollback is invoked, **When** Titus returns healthy, **Then** email is read-only and no runtime volume, chat, memory, dashboard, inbound route, or unrelated agent service is removed or changed.
4. **Given** a production attempt, **When** qualification completes, **Then** value-free evidence records containment, screening, provider verification, isolation, rollback readiness, and owner acceptance.

### Edge Cases

- Recipient lists contain duplicates, display-name variants, invalid addresses,
  mixed case, or only whitespace.
- One body representation is blank while the other is nonblank.
- HTML differs from text intentionally, or the provider normalizes an address,
  line ending, or HTML representation during delivery.
- Subject or body changes by one character after approval.
- The owner approves a draft, then Titus attempts to add a recipient, CC, BCC,
  attachment, label, reply-to address, or header.
- SecurityTeam returns HTTP success without an explicit allow decision.
- SecurityTeam returns redacted content rather than the exact approved content.
- AgentMail accepts the send but times out before returning identifiers.
- AgentMail returns identifiers but readback is delayed, unavailable, belongs
  to another inbox, lacks the sent label, or contains different content.
- The same logical send is invoked twice within or after the provider's
  idempotency window.
- Titus is restarted between owner approval and tool invocation.
- Direct hosted mutation tools reappear after a provider schema or Hermes
  runtime update.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST remove every direct AgentMail mutation action
  from Titus before the guarded sender is activated.
- **FR-002**: Containment MUST preserve the minimum read-only inbox, thread,
  message, search, and attachment capabilities required for normal triage.
- **FR-003**: During containment, Titus MUST state that sending is unavailable,
  preserve the proposed content only in the conversation, and MUST NOT claim
  delivery.
- **FR-004**: The guarded sender MUST expose exactly one outbound send action
  and MUST NOT expose direct reply, forward, draft, delete, label, inbox,
  webhook, key, domain, list, or arbitrary mailbox mutation actions.
- **FR-005**: The guarded action MUST require at least one valid recipient, a
  nonblank subject, and at least one nonblank plain-text or HTML body.
- **FR-006**: The guarded action MUST reject recipients, subject, body, inbox,
  or approval fields that exceed explicit size or count bounds.
- **FR-007**: Titus MUST present the exact recipients, subject, complete body,
  attachment state, and stable draft fingerprint immediately before requesting
  explicit human approval.
- **FR-008**: Approval MUST authorize exactly one immutable draft fingerprint;
  any field change requires a new presentation and approval.
- **FR-009**: The first guarded release MUST reject attachments, CC, BCC,
  custom reply-to addresses, labels, and custom headers rather than silently
  omitting or accepting unreviewed fields.
- **FR-010**: The guarded action MUST verify that the requested inbox is the
  exact protected Titus inbox and MUST fail closed on missing or mismatched
  inbox ownership.
- **FR-011**: The complete approved subject and body MUST pass through
  SecurityTeam before any provider send.
- **FR-012**: SecurityTeam unavailability, authentication failure, timeout,
  denial, redaction, malformed response, or any response without an explicit
  allow decision MUST prevent provider delivery.
- **FR-013**: The provider request MUST contain the complete approved recipient
  set, subject, and every approved body representation.
- **FR-014**: Each logical send MUST have a stable one-send identity so a retry
  cannot produce a duplicate message during the provider retry window.
- **FR-015**: The guarded action MUST require nonblank provider message and
  thread identifiers, then retrieve the exact provider message before
  returning verified success.
- **FR-016**: Provider readback MUST match the Titus inbox, message identity,
  thread identity, normalized recipient set, subject, plain-text body when
  supplied, HTML body when supplied, and sent state.
- **FR-017**: Missing or mismatched readback MUST return an explicit ambiguous
  unverified outcome, MUST NOT claim the approved content was delivered, and
  MUST NOT automatically create a new logical send.
- **FR-018**: Titus MUST report success only from the guarded action's verified
  result and MUST NOT infer delivery from a provider acceptance response or
  chat-generated draft.
- **FR-019**: Logs, health output, tests, deployment evidence, and failure
  messages MUST exclude recipients, subject, body, credentials, approval
  values, and provider response content.
- **FR-020**: AgentMail and SecurityTeam credentials MUST remain in protected
  runtime secret paths, MUST be least-privilege where supported, and MUST never
  enter source control or tool arguments.
- **FR-021**: Activation and rollback MUST restart only Titus when a restart is
  required and MUST preserve Titus runtime data, dashboard state, chats,
  memory, inbound email, and all unrelated agent services and volumes.
- **FR-022**: Production acceptance MUST include one owner-approved harmless
  test message whose provider record is read back and matched exactly.
- **FR-023**: Qualification MUST continuously assert that direct hosted
  mutation tools are absent so a dependency or configuration change fails
  closed rather than silently restoring them.
- **FR-024**: Feature 024 T037 MUST remain paused until containment is active
  and the guarded sender has either completed production acceptance or is
  explicitly left in read-only rollback state.

### Key Entities

- **Approved Draft**: The exact immutable recipients, subject, body
  representations, attachment state, and stable fingerprint reviewed by the
  owner.
- **Guarded Send Attempt**: One logical outbound request bound to an approved
  draft, security decision, stable one-send identity, provider identifiers,
  and final verification state.
- **Security Decision**: The explicit allow or deny result for the complete
  approved draft, with no sensitive content retained in feature evidence.
- **Provider Readback**: The authoritative sent-message record used to compare
  identity, recipients, subject, body, and sent state.
- **Containment State**: Titus email authority with hosted read-only actions
  available and every direct mutation action absent.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Containment exposes zero direct AgentMail mutation actions while
  retaining all eight currently available approved read-only triage actions.
- **SC-002**: Every empty, whitespace-only, changed, unapproved, oversized, or
  unsupported draft case produces zero provider send requests.
- **SC-003**: SecurityTeam denial, authentication failure, timeout, unavailable,
  malformed, and unexpected-response cases produce zero provider send
  requests.
- **SC-004**: A verified test message has 100% equality across approved and
  provider-read recipients, subject, plain-text body, and HTML body fields that
  were supplied.
- **SC-005**: Repeating the same logical send within the provider retry window
  produces one provider message and returns the same message and thread
  identifiers.
- **SC-006**: Zero successful tool results are returned for missing provider
  identities, unreadable provider records, content mismatches, inbox
  mismatches, or missing sent state.
- **SC-007**: Automated qualification and production evidence contain zero
  email addresses, subjects, bodies, API keys, security tokens, or approval
  values.
- **SC-008**: Containment, activation, restart, and rollback cause zero
  unintended restarts or data loss across Walter, Mitchel, Open WebUI, Titus
  dashboard, Titus memory, chats, and inbound-email volumes.
- **SC-009**: The owner can approve and send a complete harmless test message
  in one review-and-confirm cycle, and Titus reports delivery only after exact
  provider verification.

## Assumptions

- The existing Titus AgentMail inbox and credentials remain the owned outbound
  identity; this feature does not create or repurpose an inbox.
- The existing SecurityTeam outbound check remains the required screening
  authority for the first release; its separate approval queue is not a
  substitute for the owner's explicit in-conversation approval of the exact
  draft.
- The first guarded release sends new messages only. Replies, forwards, drafts,
  attachments, CC, BCC, custom headers, labels, and mailbox administration are
  out of scope until independently specified and qualified.
- Plain-text-only or HTML-only messages are allowed when the supplied body is
  nonblank, although supplying both is preferred for deliverability.
- Provider-preserved exact body fields and normalized mailbox addresses are
  sufficient for verification; preview and extracted fields are not
  substitutes for the approved body.
- Feature 024 retains its current production state and task evidence while this
  incident is resolved as a separate feature.
