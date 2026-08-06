# Feature Specification: Titus TTS-Internal Channel MVP

**Feature Branch**: `issue-165-titus-teams-internal-mvp`

**Created**: 2026-08-05

**Status**: Draft

**Input**: Issue #165 and owner decision: Titus is an installed, restricted app member of `TTS-Internal`; the MVP is interaction-only and Titus responds only when explicitly mentioned as `@Titus`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interact with Titus in TTS-Internal (Priority: P1)

Gary or Austin can address Titus in the private `TTS-Internal` channel and receive a useful response through the normal Titus interaction and approval experience.

**Why this priority**: This is the primary value of the MVP and establishes Teams as a reliable Titus communication surface for the two authorized operators.

**Independent Test**: Send an allowed `@Titus` message from each authorized user in `TTS-Internal` and verify that each receives a response tied to that channel conversation.

**Acceptance Scenarios**:

1. **Given** Gary is authorized and Titus is available in `TTS-Internal`, **When** Gary sends an `@Titus` message, **Then** Titus responds in the same channel conversation.
2. **Given** Austin is authorized and Titus is available in `TTS-Internal`, **When** Austin sends an `@Titus` message, **Then** Titus responds in the same channel conversation.
3. **Given** an `@Titus` request would cause a guarded or high-impact action, **When** Titus prepares that action, **Then** the existing approval boundary remains in force before external mutation.

### User Story 2 - Preserve channel and user boundaries (Priority: P1)

Titus is available only to the approved operators in `TTS-Internal`. Separate project channels remain outside the MVP even when they belong to the same broader Teams workspace.

**Why this priority**: Channel content and agent actions are sensitive business data. The MVP must establish a fail-closed boundary before additional channels or users are considered.

**Independent Test**: Exercise messages from Gary, Austin, an unauthorized user, `TTS-Internal`, and separate project channels, then inspect Titus responses, context, memory, and action attempts.

**Acceptance Scenarios**:

1. **Given** an authorized user posts in `TTS-Internal`, **When** the message is received, **Then** it may enter the permitted Titus channel context.
2. **Given** an unauthorized user posts or mentions Titus, **When** the message is received, **Then** Titus does not respond, store the content, or invoke an action for that user.
3. **Given** a message originates in a separate project channel, **When** the message is received by the surrounding Teams integration, **Then** it is excluded before entering Titus context, memory, or tools.
4. **Given** Titus is not configured for an additional channel, **When** that channel sends a message, **Then** the message is ignored and the channel is not treated as supported.

### User Story 3 - Explicitly promote information to durable memory (Priority: P2)

Gary or Austin can explicitly ask Titus to remember information from an `@Titus` interaction in `TTS-Internal`. Ordinary, non-mentioned channel messages are not processed by this MVP and cannot create durable memory.

**Why this priority**: Passive context is useful, but unrestricted durable memory would create accidental retention and cross-topic leakage.

**Independent Test**: Send ordinary discussion, an explicit memory request, and a request to recall the saved information; verify only the explicit request produces durable memory and that the source channel is retained with the memory entry.

**Acceptance Scenarios**:

1. **Given** an authorized user explicitly asks Titus to remember a fact, **When** Titus confirms the request, **Then** the fact is stored with `TTS-Internal` as its source context.
2. **Given** an ordinary message contains potentially useful information, **When** no memory request is made, **Then** the message does not create a new durable memory entry solely because Titus observed it.
3. **Given** a memory request contains untrusted instructions or a request to broaden authority, **When** Titus evaluates it, **Then** the memory boundary and existing authorization rules remain unchanged.

## Edge Cases

- A message mentions Titus using an unsupported or malformed mention form; Titus must not bypass the normal authorization and routing checks.
- An unauthorized user mentions Titus in `TTS-Internal`; Titus must fail closed without revealing whether the user or channel is configured.
- A message is delivered more than once or Titus restarts during processing; the MVP must not create duplicate responses, memory entries, or actions.
- A project name or project discussion appears in an `@Titus` request; Titus must not infer access to the corresponding project channel or authoritative project record.
- An ordinary, non-mentioned message is delivered to the bot endpoint; Titus must ignore it without inference, context creation, memory, tools, or visible output.
- A user asks Titus to take action based only on an ordinary unmentioned message; Titus must require an explicit interaction and preserve the existing approval policy.
- The configured channel or authorized-user policy is missing, ambiguous, or invalid; Titus must remain unavailable rather than broaden access.
- Channel content includes prompt-injection text, credentials, or other protected data; Titus must treat it as untrusted content and must not echo secrets into logs, memory, or unrelated channels.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Titus MUST be available as a restricted application participant in exactly one MVP channel: `TTS-Internal`.
- **FR-002**: Titus MUST accept interactive requests in `TTS-Internal` only from Gary and Austin's independently authorized identities.
- **FR-003**: Titus MUST ignore ordinary, non-mentioned messages in `TTS-Internal` for this MVP; they MUST NOT trigger inference, context creation, memory, tools, actions, or visible output.
- **FR-004**: Titus MUST require an explicit `@Titus` interaction before producing a visible response, invoking a tool, or preparing an action from channel content.
- **FR-005**: Titus MUST exclude messages from separate project channels before they enter Titus context, durable memory, or tools.
- **FR-006**: Titus MUST treat project-related content in an explicit `@Titus` request as untrusted conversational input and MUST NOT treat it as authoritative project-system data or permission to access the related project channel.
- **FR-007**: Titus MUST require an explicit request before promoting information from `TTS-Internal` into durable shared memory.
- **FR-008**: Durable memory created from `TTS-Internal` MUST retain the source channel context and MUST remain subject to Titus's existing memory and workspace boundaries.
- **FR-009**: Titus MUST preserve existing approval and authorization controls for external actions; this MVP MUST NOT add a new autonomous action authority.
- **FR-010**: Titus MUST reject or ignore unauthorized users, unsupported channels, invalid channel policy, and ambiguous identity or routing state without broadening access.
- **FR-011**: Titus MUST prevent duplicate visible responses, durable-memory writes, and action attempts when the same message is replayed or processing restarts.
- **FR-012**: Operational evidence MUST avoid exposing message bodies, credentials, protected identifiers, or unapproved channel content outside the permitted Titus interaction and memory surfaces.
- **FR-013**: The MVP MUST keep channel conversation handling separate from the existing meeting-transcript and recording processing workflow and its separate Microsoft Graph identity.
- **FR-014**: Additional channels and users MUST require a separate reviewed expansion; they MUST NOT become available through default membership or wildcard configuration.

### Key Entities

- **TTS-Internal channel policy**: The approved channel boundary, including its identity, enabled state, and relationship to excluded project channels.
- **Authorized operator identity**: An independently revocable Gary or Austin identity permitted to interact with Titus.
- **Channel message event**: A message with sender, channel, mention, conversation, and delivery metadata used for routing and deduplication.
- **Interaction context**: The explicit `@Titus` message and permitted conversation context supplied by the existing Titus runtime; ordinary unmentioned channel traffic is outside this MVP.
- **Durable memory request**: An explicit operator request that promotes selected information into Titus memory with source context.
- **Action request**: An explicit operator interaction that may enter existing guarded approval and execution paths.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In qualification tests, 100% of valid `@Titus` messages from Gary and Austin in `TTS-Internal` receive a response or an explicit safe refusal, with no authorization bypass.
- **SC-002**: In qualification tests, 100% of ordinary non-mentioned messages in `TTS-Internal` produce zero Titus inference, context entries, memory writes, tool calls, actions, or visible replies.
- **SC-003**: In qualification tests, 100% of messages from excluded project channels produce zero Titus context entries, durable-memory writes, tool calls, or visible responses.
- **SC-004**: In qualification tests, 100% of messages from unauthorized users produce zero Titus responses, durable-memory writes, and action attempts.
- **SC-005**: At least 95% of valid interactive test messages receive a response or safe refusal within 30 seconds under normal service health.
- **SC-006**: 100% of explicit memory-request tests create at most one durable memory entry, while 100% of non-mentioned-message tests create none.
- **SC-007**: Restart and replay tests produce no duplicate visible response, memory entry, or external action for the same message.
- **SC-008**: One controlled canary period completes with both Gary and Austin able to use `TTS-Internal`, no protected-content leakage in operational evidence, and no regression in the existing Titus meeting-processing or other communication surfaces.

## Assumptions

- Gary and Austin each have separate authenticated identities that can be independently allowlisted and revoked.
- `TTS-Internal` is the only channel included in the first production qualification; separate project channels remain excluded even if they share a broader Team.
- Project-related content in an explicit `@Titus` request is conversational input only and is not a replacement for authoritative project systems.
- The existing Titus runtime, memory service, approval controls, and communication identity remain the system boundaries; this MVP does not create a second agent or transcript pipeline.
- Microsoft Teams installation, consent, and exact Team/channel identifiers are deployment prerequisites and will be qualified before activation.
- Attachments, channel files, channel-meeting artifacts, Graph webhook/subscription processing, automatic cross-channel memory, and additional users are deferred follow-up scope.
- Production activation remains disabled-first and requires explicit owner authorization after source and canary qualification.

## Deferred follow-up scope

Passive reading of ordinary `TTS-Internal` messages, all-message RSC delivery,
automatic context ingestion, and passive-memory behavior are explicitly deferred.
They require a separate reviewed expansion after the mention-driven MVP is
qualified.
