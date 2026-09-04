# Feature Specification: Eve Practice Agent

**Feature Branch**: `046-eve-practice-agent`

**Created**: 2026-09-04

**Status**: Implemented; operator-authenticated live smoke pending

**Input**: User description: "Create a new directory under OvernightDesk containing a new agent built with the Eve framework so we can practice and test a Codex subscription-backed agent."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a Safe Practice Conversation (Priority: P1)

As the repository operator, I can start an isolated practice agent, enter a text prompt, and receive a text response so I can learn the framework without changing an existing named runtime.

**Why this priority**: A successful bounded conversation is the smallest useful proof that the framework and subscription-backed model path work together.

**Independent Test**: Configure a dedicated local practice identity, start the agent, submit one harmless prompt, and verify that one readable response is returned without invoking tools or changing repository or production state.

**Acceptance Scenarios**:

1. **Given** the practice agent has valid dedicated model authentication, **When** the operator submits a non-empty prompt, **Then** the agent returns a text response and remains ready for another prompt.
2. **Given** the practice agent is running, **When** it handles a prompt, **Then** it has no authority to execute tools, modify business records, send messages, or mutate production.

---

### User Story 2 - Detect Missing Authentication Safely (Priority: P2)

As the repository operator, I receive an actionable preflight failure when dedicated authentication is unavailable so I can correct setup without exposing credentials.

**Why this priority**: Authentication failure is the most likely first-run problem and must fail closed rather than silently selecting another credential source.

**Independent Test**: Start the practice agent with no dedicated authentication available and verify that it exits unsuccessfully with setup guidance that contains no token or credential value.

**Acceptance Scenarios**:

1. **Given** no dedicated practice authentication is available, **When** the operator starts the agent, **Then** startup stops before accepting prompts and identifies the required setup action.
2. **Given** authentication fails, **When** diagnostic output is reviewed, **Then** no secret, access token, refresh token, session value, or unrelated runtime identity is disclosed.

---

### User Story 3 - Verify the Scaffold Without Model Usage (Priority: P3)

As a contributor, I can run deterministic local checks without consuming model allowance so I can safely validate changes to the practice scaffold.

**Why this priority**: Repeatable offline verification keeps routine development independent of account availability, network state, and usage limits.

**Independent Test**: Run the documented static and automated checks with no model credentials and verify that they complete without making an external model request.

**Acceptance Scenarios**:

1. **Given** a fresh repository checkout with development dependencies available, **When** a contributor runs the documented verification command, **Then** configuration, input rules, and safe defaults are checked without contacting a model provider.
2. **Given** an empty prompt, **When** input validation runs, **Then** the prompt is rejected before any external request is attempted.

### Edge Cases

- Empty or whitespace-only prompts are rejected locally.
- End-of-input ends the session cleanly without an external request.
- Authentication expiry or provider failure produces a concise, sanitized error and leaves the operator able to retry after correcting the cause.
- Unexpected model output is displayed as untrusted text and cannot trigger a tool or business action.
- The practice agent never falls back to Titus, Walter, or a shared production credential location.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST contain a clearly named, isolated directory for the practice agent.
- **FR-002**: The practice agent MUST accept a non-empty text prompt and return a text response when dedicated authentication is valid.
- **FR-003**: The practice agent MUST use a dedicated practice authentication context and MUST NOT reuse Titus, Walter, or another named runtime's credential state.
- **FR-004**: The practice agent MUST expose no tools, business actions, outbound messaging actions, database access, deployment actions, or production mutation authority.
- **FR-005**: The practice agent MUST reject empty input before contacting any external service.
- **FR-006**: Missing, expired, or rejected authentication MUST fail closed with actionable setup guidance and without exposing credential values.
- **FR-007**: The practice agent MUST provide deterministic automated verification that does not require credentials or external model usage.
- **FR-008**: Operator documentation MUST cover installation, dedicated authentication setup, one interactive practice run, offline verification, troubleshooting, and removal of local authentication state.
- **FR-009**: Dependency versions MUST be reproducible and the experimental nature of the subscription-backed integration MUST be visible to operators.
- **FR-010**: This feature MUST NOT deploy or register the practice agent on Aegis, Vercel, the OvernightDesk application, Open WebUI, or any existing runtime.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator following the documented setup can reach the first successful practice response in no more than 15 minutes, excluding account login time and dependency download time.
- **SC-002**: All offline verification checks pass with zero model-provider requests and zero credentials present.
- **SC-003**: One hundred percent of empty prompts are rejected before an external request in automated tests.
- **SC-004**: Inspection of the delivered agent finds zero configured tools, business integrations, production endpoints, or shared named-runtime credential paths.
- **SC-005**: Authentication and provider failures produce zero credential values in operator-visible output.

## Assumptions

- The first increment is a local command-line learning scaffold for the repository operator, not a replacement for Hermes, Titus, or Walter.
- The operator has legitimate access to a Codex-capable ChatGPT subscription and can complete an interactive login on the development host.
- Prompts and responses may exist only in framework-managed local development state; business databases and durable production memory are out of scope.
- A dedicated local authentication directory can be created outside version control for this practice agent.
- Production deployment, web UI, OpenRouter fallback, MCP tools, scheduled work, multi-user access, and runtime registration require separately approved follow-up scope.
