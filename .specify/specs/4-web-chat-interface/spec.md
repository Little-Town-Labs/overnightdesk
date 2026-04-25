# Feature 4: Web Chat Interface

**Spec version:** 1.1.0
**Status:** Draft
**Author:** Gary Brown / LittleTownLabs
**Date:** 2026-04-23
**Roadmap reference:** roadmap-v2.md — Feature 4, Phase 2
**Constitution alignment:** v2.0.0

---

## Overview

OvernightDesk tenants running hermes-agent currently access their agent exclusively by clicking "Launch Dashboard," which opens the hermes sidecar UI in a new browser tab outside the platform. This feature brings chat directly inside the OvernightDesk dashboard — no external tab, no separate interface to learn.

A customer visits `/dashboard/chat`, types a message, and receives a streaming response from their hermes agent. The conversation is displayed inline, within the familiar OvernightDesk zinc/dark theme. The Chat tab appears alongside Overview and Settings in the hermes dashboard navigation.

The security model is explicit: the credential required to talk to the hermes API never reaches the browser. All communication with the tenant's hermes instance is brokered server-side, after the customer's OvernightDesk session is verified. From the customer's perspective, they simply chat with their agent. The credential handling is invisible and silent.

This feature is available exclusively to hermes tenants. The Chat tab is visible to all hermes tenants regardless of instance state. When the instance is not running, the chat area shows an inline status banner ("Your agent is not running. Check the Overview tab.") rather than hiding the tab. Customers on other plans do not see the Chat tab.

---

## User Stories

### US-1: Customer sends a message and receives a streaming response

**As** a hermes tenant,
**I want** to type a message in the chat interface and receive my agent's response as it streams in,
**so that** I can interact with my agent without leaving the OvernightDesk dashboard.

**Acceptance criteria:**
- AC-1.1: The customer can type a message in an input field and submit it by pressing Enter or clicking a Send button.
- AC-1.2: The agent's response begins appearing on screen within 3 seconds of message submission, and characters continue to arrive incrementally until the response is complete.
- AC-1.3: The input field is disabled while a response is streaming and re-enables once the response is complete.
- AC-1.4: Both the customer's message and the agent's response are displayed in the conversation history in the order they were sent and received.
- AC-1.5: The credential used to authenticate the request to the hermes agent is never present in the browser's network requests, local storage, or JavaScript context.

---

### US-2: Customer sees the Chat tab in the dashboard navigation

**As** a hermes tenant,
**I want** to see a "Chat" tab in my hermes dashboard navigation,
**so that** I can find and access the chat interface naturally alongside my other dashboard views.

**Acceptance criteria:**
- AC-2.1: The Chat tab appears in the hermes dashboard navigation alongside Overview and Settings.
- AC-2.2: The Chat tab is visible to all authenticated users whose plan is identified as a hermes tenant, regardless of instance running state.
- AC-2.3: Clicking the Chat tab navigates to `/dashboard/chat` without a full page reload.
- AC-2.4: The Chat tab is visually indicated as active when the customer is on `/dashboard/chat`.
- AC-2.5: Non-hermes tenants do not see the Chat tab.
- AC-2.6: When the customer's hermes instance is not in a `running` state, the chat area displays an inline status banner — "Your agent is not running. Check the Overview tab." — instead of the message input.

---

### US-3: Customer on mobile can use the chat interface

**As** a hermes tenant accessing the dashboard from a mobile device,
**I want** the chat interface to be usable on a small screen,
**so that** I can check in with my agent from my phone without needing a laptop.

**Acceptance criteria:**
- AC-3.1: The chat interface renders correctly on viewport widths from 375px upward without horizontal scrolling.
- AC-3.2: The message input field and Send button are reachable and tappable without zooming.
- AC-3.3: The conversation history is scrollable and individual messages are fully readable on mobile.
- AC-3.4: The keyboard appearing on mobile does not obscure the message input field.

---

### US-4: Agent is unreachable — customer sees an actionable error

**As** a hermes tenant whose agent container is temporarily unavailable,
**I want** to see a clear, honest error message when my agent cannot be reached,
**so that** I know what happened and what I can do next rather than waiting indefinitely.

**Acceptance criteria:**
- AC-4.1: If the agent is unreachable, the error is surfaced within the chat interface — not as a silent failure or an indefinitely spinning indicator.
- AC-4.2: The error message uses plain language describing what went wrong (e.g., "Your agent could not be reached") without exposing internal error codes, stack traces, or infrastructure details.
- AC-4.3: The error message includes a next step for the customer — for example, directing them to the Overview tab to check instance status, or suggesting they contact support.
- AC-4.4: After an error, the input field remains accessible so the customer can try sending another message once the agent recovers.
- AC-4.5: The conversation history up to the point of the error is preserved and visible.

---

### US-5: Customer's conversation persists within the session

**As** a hermes tenant using the chat interface,
**I want** my conversation history to remain visible if I navigate away and return to the Chat tab within the same session,
**so that** I do not lose context mid-conversation.

**Acceptance criteria:**
- AC-5.1: If the customer navigates from `/dashboard/chat` to another dashboard tab and returns, the conversation history they had before leaving is still displayed.
- AC-5.2: Conversation history is maintained for the duration of the browser session.
- AC-5.3: Refreshing the page or opening `/dashboard/chat` in a new tab starts a new conversation — cross-session persistence is explicitly out of scope.
- AC-5.4: The conversation state is not written to the platform database — no customer message content is stored server-side by the platform.

---

## Functional Requirements

### Navigation and Access

**FR-1:** The Chat tab SHALL appear in the hermes dashboard navigation (`HERMES_ALLOWED_TABS`) for all authenticated users with a hermes-tenant plan, regardless of whether their instance is currently running.

**FR-2:** The chat interface SHALL be accessible at the route `/dashboard/chat`.

**FR-3:** Unauthenticated requests to `/dashboard/chat` SHALL be redirected to the login page.

**FR-4:** Authenticated users whose instance is not a hermes tenant SHALL receive a 404 or redirect — the chat route SHALL NOT be reachable by non-hermes tenants.

### Message Input and Submission

**FR-5:** The chat interface SHALL provide a text input field for composing messages.

**FR-6:** The customer SHALL be able to submit a message via keyboard (Enter key) or a visible Send button.

**FR-7:** The input field SHALL be cleared after a message is submitted.

**FR-8:** Empty messages SHALL NOT be submitted. The Send button and Enter key SHALL be inactive when the input field is empty.

**FR-9:** While a response is streaming, the input field and Send button SHALL be in a disabled state so the customer cannot submit a concurrent message.

### Streaming Responses

**FR-10:** The agent's response SHALL be displayed incrementally as it streams — characters or tokens SHALL appear progressively, not all at once after completion.

**FR-11:** The streaming display SHALL update smoothly without layout shifts or flicker.

**FR-12:** A visual indicator SHALL be shown while a response is being generated (e.g., a typing indicator or streaming cursor), distinguishing "in-progress" from "complete."

**FR-13:** The chat view SHALL automatically scroll to keep the latest content visible as the response streams in.

### Conversation History

**FR-14:** The conversation history SHALL display messages in chronological order, distinguishing customer messages from agent responses visually (e.g., alignment, color, or label).

**FR-15:** The full conversation history for the current browser session SHALL be displayed, up to a maximum of 100 message pairs. No pagination is required. Messages beyond the 100-pair limit are not displayed.

**FR-16:** Conversation history SHALL persist across same-session tab navigation within the dashboard.

**FR-17:** The platform SHALL NOT store any message content in the platform database. Conversation state is ephemeral to the browser session.

### Unified Agent Channel

**FR-26:** The web chat interface SHALL connect to the same hermes agent model, memory, and personality configuration used by all other messaging channels (Telegram, Discord, etc.) for the tenant. Web chat is another channel into the tenant's hermes agent — not a separate agent or a separate model instance.

**FR-27:** The agent model used for web chat SHALL be the tenant's default hermes agent model (the model configured as the main model in hermes — currently `xiaomi/mimo-v2-pro` via OpenRouter for most tenants). No model selector SHALL be exposed in the chat UI.

**FR-28:** A customer who messages their agent via web chat and then via Telegram (or any other channel) SHALL be communicating with the same agent with the same context and personality. Channel selection does not alter agent behavior.

### Security and Proxying

**FR-18:** All communication with the tenant's hermes API SHALL be brokered through a server-side platform endpoint. The browser SHALL NOT communicate with the hermes API directly.

**FR-19:** The server-side endpoint SHALL verify the customer's OvernightDesk session is valid and active before forwarding any request.

**FR-20:** The server-side endpoint SHALL verify that the authenticated customer's instance is a hermes tenant before forwarding any request.

**FR-21:** The credential used to authenticate with the hermes API (`API_SERVER_KEY`) SHALL be read from the platform's secrets store (Phase.dev) at request time and SHALL NOT appear in any client-side context (JavaScript, cookies, headers, localStorage, or network responses to the browser).

**FR-22:** The server-side endpoint SHALL return appropriate error responses without leaking internal infrastructure details, error messages from the hermes container, or stack traces.

### Error States

**FR-23:** If the hermes agent is unreachable (connection refused, timeout, or unhealthy response), the chat interface SHALL display a user-friendly error message within the conversation area.

**FR-24:** If the `API_SERVER_KEY` is not configured for the tenant, the chat interface SHALL display an actionable error directing the customer to complete setup (e.g., via the Settings tab).

**FR-25:** Error messages SHALL include a suggested next action. They SHALL NOT expose raw HTTP status codes, container hostnames, or internal service names.

---

## Non-Functional Requirements

### Streaming Latency

**NFR-1:** The first token of the agent's response SHALL begin rendering in the browser within 3 seconds of message submission under normal network conditions (excluding agent processing time for long or complex queries).

**NFR-2:** Streaming throughput SHALL feel continuous and natural to the customer — visible token-by-token rendering with no perceivable gaps during generation.

### Security

**NFR-3:** The `API_SERVER_KEY` credential SHALL NEVER appear in any HTTP response to the browser, any client-side JavaScript variable, any cookie, or any client-readable storage mechanism.

**NFR-4:** Every request to the server-side chat endpoint SHALL be authenticated against the customer's OvernightDesk session (Better Auth) before any action is taken.

**NFR-5:** The server-side endpoint SHALL enforce that the requesting user's tenant matches the hermes instance being proxied — a customer SHALL NOT be able to proxy requests to another customer's agent.

**NFR-6:** Input to the chat endpoint SHALL be validated (message content, format) before being forwarded to the hermes API.

### Mobile Responsiveness

**NFR-7:** The chat interface SHALL be fully functional on mobile viewports (minimum 375px width).

**NFR-8:** The interface SHALL use the platform's existing zinc/dark theme and SHALL NOT introduce new design tokens or component libraries without approval.

**NFR-9:** Touch targets (Send button, input field) SHALL meet minimum accessibility size guidelines (44x44px).

### Availability and Scope

**NFR-10:** The Chat tab SHALL always be visible to hermes tenants. When the instance is not running, the chat area SHALL display an inline status banner rather than the message input (AC-2.6). The banner state is expected behavior, not a platform bug.

---

## Edge Cases

**EC-1: Agent unreachable**
The hermes container is stopped, crashed, or in the process of restarting. The server-side proxy receives no response or a connection error. The customer sees a user-friendly error in the chat area, not a blank screen or spinner. The input field remains active for retry.

**EC-2: API key not configured**
The customer's instance was provisioned but the setup wizard was not completed — `API_SERVER_KEY` is absent from Phase.dev for this tenant. The chat interface surfaces an actionable error directing the customer to complete setup in the Settings tab.

**EC-3: hermes returns a non-streaming or error response**
The hermes API returns an HTTP error (4xx, 5xx) or a non-streaming response body. The platform endpoint handles this gracefully and returns a user-friendly error message. The raw hermes error body is NOT forwarded to the browser.

**EC-4: Very long responses**
The agent generates an unusually long response (e.g., a detailed plan, a long code block). The streaming display handles this without freezing the browser, truncating content, or breaking layout. The conversation area remains scrollable throughout.

**EC-5: Concurrent message submission attempt**
While a response is streaming, the customer attempts to submit another message (e.g., via keyboard shortcut). The interface ignores or blocks the submission until the current response completes (FR-9).

**EC-6: Session expiry mid-conversation**
The customer's OvernightDesk session expires while they are in the chat interface. Their next message submission returns an authentication error. The interface redirects them to the login page or surfaces an appropriate "session expired" message.

**EC-7: Network interruption mid-stream**
The browser loses network connectivity while a response is streaming. The partial response already rendered remains visible. An error message is shown indicating the stream was interrupted. The input field becomes active for retry.

**EC-8: Instance is provisioned but not yet running**
The instance record exists in the platform database but the container is in `provisioning`, `queued`, or `stopped` state. The Chat tab is visible (all hermes tenants see it). The chat area displays the inline status banner — "Your agent is not running. Check the Overview tab." — instead of the message input (AC-2.6). This is expected behavior, not a platform error.

---

## Out of Scope

The following are explicitly excluded from this feature. They may be considered for future roadmap items.

- **Cross-session conversation persistence** — Conversation history is ephemeral to the browser session. Server-side storage of message content is not implemented.
- **File uploads and attachments** — The chat interface accepts text input only.
- **Voice input or text-to-speech output** — No audio interfaces.
- **Model selector or agent switcher** — The chat interface connects to the customer's single hermes instance using the tenant's default model. No model selector or agent switcher is exposed in this feature.
- **Conversation export** — Customers cannot download or export their conversation history.
- **Admin visibility into tenant conversations** — The platform owner (Gary) does not have access to tenant conversations through this interface or any platform mechanism (Principle 1: The Customer's Data is Sacred).
- **Real-time typing indicators from the customer to the agent** — The agent does not receive "is typing" signals.
- **Message editing or deletion** — Sent messages cannot be edited or retracted.
- **System prompt configuration from the chat UI** — Agent personality and instructions are managed in the Settings tab (Feature 3), not inline during chat.

---

## Clarification Log

The following clarifications were resolved before planning began (spec v1.1.0). No open items remain.

**NC-1 (resolved): Conversation history scope within a session**
Display the full session history without pagination, up to a maximum of 100 message pairs. This is sufficient for typical session lengths and avoids DOM performance concerns with very long conversations. See FR-15.

**NC-2 (resolved): Model selection per chat session**
No model selector. Web chat uses the tenant's default hermes agent model — the same model configured as the main model in hermes (`xiaomi/mimo-v2-pro` via OpenRouter for most tenants). See FR-27. A model selector may be considered as a future enhancement once multi-model support is validated in hermes-agent.

**NC-3 (resolved): Chat tab visibility when instance is in non-running state**
The Chat tab is visible for all hermes tenants regardless of instance state. When the instance is not running, the chat area shows an inline status banner — "Your agent is not running. Check the Overview tab." — rather than hiding the tab or showing an error mid-conversation. See AC-2.6, NFR-10, EC-8.

---

## Success Criteria

The Web Chat Interface feature is complete when all of the following are true:

1. An authenticated hermes tenant can navigate to `/dashboard/chat` via the Chat tab in the dashboard navigation.
2. The customer can type a message and receive a streaming response from their hermes agent without leaving the OvernightDesk platform.
3. The `API_SERVER_KEY` is demonstrably absent from all browser network requests, JavaScript context, and client-accessible storage — verified via browser developer tools.
4. Agent unreachability produces a user-friendly, actionable error message in the chat area — not a crash, blank screen, or raw error code.
5. The interface is functional and readable on a 375px-wide mobile viewport.
6. Conversation history persists across same-session navigation between dashboard tabs.
7. Non-hermes tenants cannot access `/dashboard/chat`.
8. Platform test coverage for the server-side chat proxy endpoint meets the 80% minimum required by the constitution (authentication, validation, happy path, error cases all tested).
9. No conversation content is written to the platform database.
