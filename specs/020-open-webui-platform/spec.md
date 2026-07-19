# Feature Specification: Embedded Open WebUI Workspace

**Feature Branch**: `020-open-webui-platform`

**Created**: 2026-07-19

**Status**: Planned

**Input**: Replace the custom chat inside the Vercel-hosted OvernightDesk
dashboard with an authenticated Open WebUI workspace connected to each use
case's Hermes runtime. Keep Better Auth as the platform entry point, preserve
runtime-local memory and tool boundaries, and retain the native Hermes
dashboard as an advanced and rollback surface during rollout.

## User Scenarios & Testing

### User Story 1 - Chat from the OvernightDesk Platform (Priority: P1)

An authorized user can enter the OvernightDesk dashboard and use a polished,
full-height chat workspace without separately managing an Open WebUI password.

**Why this priority**: Chat is the primary interaction surface for Mitchel and
a likely secondary surface for other use cases. The current custom chat is a
thin proxy with incomplete history and duplicates a mature upstream UI.

**Independent Test**: An authorized Mitchel user signs into OvernightDesk,
opens the chat workspace, sends a text prompt, sees streamed Hermes tool
progress and a final response, reloads the page, and sees the conversation in
the same Open WebUI account.

**Acceptance Scenarios**:

1. **Given** an authenticated user owns a running Hermes instance, **when**
   they open Chat, **then** the platform loads only the Open WebUI deployment
   assigned to that instance.
2. **Given** the user already has a valid Better Auth session, **when** the
   Open WebUI session is bootstrapped, **then** no separate local password is
   required.
3. **Given** Hermes executes tools, **when** a response streams, **then** the
   tools execute in that Hermes runtime and not in Vercel or the user's device.

---

### User Story 2 - Preserve Use-Case and Memory Isolation (Priority: P1)

The platform owner can prove that Open WebUI does not combine Walter, Mitchel,
Titus, or future Rex conversations, secrets, model connections, or user access.

**Why this priority**: Open WebUI stores accounts, chats, and connection
configuration. A single shared administrative database would create a new
cross-use-case blast radius inconsistent with the runtime identity model.

**Independent Test**: Inspect two configured deployments and verify distinct
containers, volumes, hostnames, OIDC client registrations, Phase paths, Hermes
API credentials, and exact owner authorization.

**Acceptance Scenarios**:

1. **Given** two Hermes runtimes have separate primary memory, **when** Open
   WebUI is provisioned, **then** each receives a separate Open WebUI data and
   authentication boundary.
2. **Given** a browser requests another runtime's workspace, **when** the
   Better Auth owner gate runs, **then** access is denied before Open WebUI.
3. **Given** Open WebUI calls Hermes, **when** it authenticates, **then** the
   bearer credential remains server-side and never reaches browser JavaScript,
   Vercel logs, or the platform database.

---

### User Story 3 - Redesign the Dashboard Around Workspaces (Priority: P2)

An authenticated user sees a dashboard shell that can support a wide chat
workspace alongside concise status, business, settings, and advanced-runtime
surfaces.

**Why this priority**: The current `max-w-4xl` layout was designed for cards,
not a full-height application. Embedding Open WebUI without revisiting the
shell would produce a cramped and confusing experience.

**Independent Test**: Verify desktop and mobile layouts for Overview, Chat,
Mitchel's Trevor workspace, Settings, and the native Hermes dashboard link.

**Acceptance Scenarios**:

1. **Given** a desktop viewport, **when** Chat is selected, **then** the
   workspace uses the available width and height without nesting card-sized
   scroll regions.
2. **Given** a mobile viewport, **when** Chat is selected, **then** navigation
   remains usable and the chat surface has a supported mobile fallback.
3. **Given** the canary is active, **when** Open WebUI is unavailable, **then**
   the user sees an honest error and can still launch the native Hermes
   dashboard.

---

### User Story 4 - Cut Over Reversibly (Priority: P3)

The operator can canary Open WebUI, observe authentication and chat behavior,
and roll back without deleting conversations or changing the Hermes runtime.

**Why this priority**: The new surface adds a stateful service, a browser
embedding boundary, and an authentication integration. Removal of the current
chat and `/sessions` client must follow proof, not precede it.

**Independent Test**: Disable the canary flag or route, verify the native
Hermes dashboard remains reachable, and confirm both the Hermes volume and the
Open WebUI volume remain intact.

**Acceptance Scenarios**:

1. **Given** the Mitchel canary fails a gate, **when** rollback is invoked,
   **then** the platform hides the embedded workspace without deleting data.
2. **Given** the canary passes, **when** the custom chat is retired, **then**
   its API route, session bridge client, tests, and UI dependencies are removed
   together.
3. **Given** Titus Teams integration is not part of this slice, **when** the
   feature ships, **then** no Teams routing or Titus authorization is changed.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST treat Open WebUI as a stateful Aegis workload,
  not as a Vercel Function or a client-only library.
- **FR-002**: The Vercel application MUST remain the authenticated platform
  shell and MUST select the workspace from the authenticated user's exact
  running instance record.
- **FR-003**: Each Hermes use-case and primary-memory boundary MUST receive a
  separate Open WebUI container, persistent volume, public hostname, OIDC
  client, Hermes connection, and secret path.
- **FR-004**: Nginx MUST remain the only public Aegis ingress and MUST enforce
  the Better Auth exact-owner gate before forwarding Open WebUI traffic.
- **FR-005**: Open WebUI MUST authenticate users through the OvernightDesk
  identity provider; local signup and password authentication MUST be disabled
  after OIDC has passed a rollback-tested canary.
- **FR-006**: The Open WebUI OIDC registration MUST be separate from the native
  Hermes dashboard client and use the exact `/oauth/oidc/callback` redirect.
- **FR-007**: Open WebUI MUST call Hermes server-to-server through the private
  Docker network and use the Chat Completions API for the first release.
- **FR-008**: Hermes API keys, Open WebUI secret keys, and OIDC client secrets
  MUST live in the `overnightdesk` Phase app and MUST NOT be exposed to the
  browser or stored in the OvernightDesk application database.
- **FR-009**: Open WebUI chat/account data MUST persist in a dedicated volume
  belonging to the same use-case boundary as its Hermes runtime.
- **FR-010**: The embedding policy MUST allow framing only from approved
  OvernightDesk origins and MUST preserve restrictive defaults for all other
  origins.
- **FR-011**: The first release MUST be text-chat only. Microphone, camera,
  file upload, web search, code execution, and model visibility require
  explicit capability review rather than inheriting broad Open WebUI defaults.
- **FR-012**: The platform MUST keep the native Hermes dashboard available as
  an advanced and rollback surface through the observation window.
- **FR-013**: The existing custom chat and provisioner `/sessions` client MUST
  remain compatibility code until the canary passes and MUST then be removed
  as one reviewed cleanup slice.
- **FR-014**: The feature MUST begin with one Mitchel canary and MUST NOT
  change Titus Teams integration, Walter's native dashboard, or Rex.
- **FR-015**: Authentication failures, cross-instance denials, canary changes,
  and administrative configuration changes MUST produce metadata-only audit
  events without prompts, responses, cookies, tokens, or secret values.
- **FR-016**: Request size, upload state, tool availability, model visibility,
  concurrent work, and model-cost consumption MUST use explicit bounded
  defaults before the canary is considered production-ready.

### Key Entities

- **Open WebUI Deployment**: One stateful chat UI assigned to one Hermes
  runtime/use-case, with its own storage and authentication configuration.
- **Workspace Assignment**: The server-side mapping from an authenticated
  OvernightDesk instance to its approved Open WebUI origin.
- **Open WebUI Identity Client**: A separate Better Auth OIDC client with an
  exact callback and instance-owner authorization.
- **Hermes Connection**: A server-side OpenAI-compatible connection from Open
  WebUI to one Hermes API server and one stable API credential.
- **Canary Flag**: A reversible platform/route selector that exposes the new
  workspace only to explicitly approved instance IDs.

## Success Criteria

- **SC-001**: The Mitchel owner completes login, first chat, streamed response,
  reload, logout, and re-login without a second password.
- **SC-002**: Cross-instance and unauthenticated browser checks are denied
  before reaching Open WebUI.
- **SC-003**: Browser/network inspection shows no Hermes API key, Open WebUI
  secret, Phase token, or OIDC client secret.
- **SC-004**: A conversation survives Open WebUI container recreation using
  the retained dedicated volume.
- **SC-005**: Desktop and mobile browser checks pass with no unexpected nested
  scrolling and with an honest unavailable state.
- **SC-006**: Rollback to the native Hermes dashboard takes less than 15
  minutes and preserves both Hermes and Open WebUI state.

## Non-Goals

- Microsoft Teams integration for Titus.
- A shared cross-tenant Open WebUI database or administrator plane.
- Hosting Open WebUI inside Vercel Functions.
- Replacing Hermes runtime memory with Open WebUI chat history.
- Enabling arbitrary Open WebUI tools, uploads, search, or local model backends.
- Removing the native Hermes dashboard during the canary.
