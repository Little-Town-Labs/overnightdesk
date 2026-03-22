# Feature 6: Claude Code Onboarding

**Branch:** 6-claude-code-onboarding
**Status:** Draft
**Created:** 2026-03-22
**Dependencies:** Feature 5 (Provisioning Pipeline) — complete (Vercel side)

---

## Overview

After a customer's instance is provisioned and running, they need to connect their own Claude Code subscription by authenticating through an embedded web terminal in the dashboard. This is the moment the product becomes real — the customer sees Claude Code running in their container and authenticates with their Anthropic account. The dashboard displays the current auth status and provides a re-auth flow when tokens expire.

**Business Value:** Without onboarding, the customer has a running container but no AI assistant. This is the bridge between "paying customer" and "active user." The onboarding experience must be simple enough for non-technical operators.

**Engine Backend:** Complete. The Go engine provides:
- `POST /api/terminal/ticket` — generates a single-use ticket (30s TTL) for WebSocket PTY access
- WebSocket PTY endpoint — scoped terminal that spawns only the `claude` process (not a general shell)
- `GET /api/auth-status` — returns `authenticated`, `not_authenticated`, or `unknown`

---

## User Stories

### User Story 1: Connect Claude Code Account

**As a** newly provisioned user
**I want** to connect my Claude Code subscription through the dashboard
**So that** my AI assistant can start running with my Anthropic credentials

**Acceptance Criteria:**
- [ ] Dashboard shows a "Connect Claude Code" button when auth status is "not configured"
- [ ] Clicking the button opens an embedded terminal in the dashboard
- [ ] The terminal launches the Claude Code CLI which triggers an OAuth flow
- [ ] The OAuth flow opens in a new browser tab for the customer to log in to Anthropic
- [ ] After successful authentication, the terminal shows a confirmation message
- [ ] The dashboard updates to show "Connected" status without full page reload
- [ ] Clear messaging throughout: "You're logging into YOUR Claude Code account. We never see your credentials."

**Priority:** High

---

### User Story 2: View Auth Status

**As a** provisioned user
**I want** to see whether my Claude Code account is connected
**So that** I know if my assistant is ready to work

**Acceptance Criteria:**
- [ ] Dashboard displays auth status: "Connected", "Expired", or "Not Configured"
- [ ] Each status has a distinct visual indicator (color/icon)
- [ ] Status is checked automatically when the dashboard loads
- [ ] Status refreshes periodically (polling) without page reload
- [ ] If status is "Connected", the user sees their assistant is operational

**Priority:** High

---

### User Story 3: Re-authenticate When Token Expires

**As a** user whose Claude Code token has expired
**I want** to re-authenticate through the dashboard
**So that** my assistant resumes operation without downtime

**Acceptance Criteria:**
- [ ] When auth status is "Expired", the dashboard shows a warning and a "Reconnect" button
- [ ] Clicking "Reconnect" opens the same terminal flow as initial connection
- [ ] After re-authentication, the status updates to "Connected"
- [ ] The re-auth flow is identical to the initial auth flow (same UI, same steps)

**Priority:** High

---

### User Story 4: Guided Onboarding Steps

**As a** non-technical user
**I want** step-by-step guidance through the connection process
**So that** I can complete setup without confusion

**Acceptance Criteria:**
- [ ] The onboarding shows numbered steps: Step 1 → Step 2 → Step 3
- [ ] Step 1: "Click Connect" — explains what will happen
- [ ] Step 2: "Log in to Anthropic" — explains the OAuth tab
- [ ] Step 3: "Done" — confirms connection successful
- [ ] Each step highlights when active and grays out when complete
- [ ] The flow is completable in under 2 minutes for a non-technical user

**Priority:** High

---

### User Story 5: Credential Privacy Assurance

**As a** privacy-conscious customer
**I want** clear assurance that OvernightDesk never sees my Claude Code credentials
**So that** I trust the platform with my business data

**Acceptance Criteria:**
- [ ] The onboarding page prominently displays a privacy notice
- [ ] The notice explains: credentials stay in the customer's container, never touch the platform
- [ ] The terminal connects directly to the customer's container (not through the platform)
- [ ] No credential data appears in platform logs, database, or API responses

**Priority:** Medium

---

## Functional Requirements

**FR-1:** The dashboard MUST display the current Claude Code auth status for the user's instance.

**FR-2:** The system MUST provide an API endpoint that proxies auth status checks from the dashboard to the tenant's engine (via the tenant's subdomain).

**FR-3:** The dashboard MUST embed a web terminal component that connects to the tenant's container via WebSocket.

**FR-4:** The terminal connection MUST use a ticket-based authentication flow: the platform requests a single-use ticket from the engine, then the client connects to the WebSocket with that ticket.

**FR-5:** The terminal MUST be scoped — it only spawns the Claude Code CLI for authentication, not a general shell.

**FR-6:** The dashboard MUST display a guided onboarding UI with clear steps (Connect → Log in → Done).

**FR-7:** After successful authentication, the dashboard MUST update the instance's `claudeAuthStatus` column to "connected".

**FR-8:** When auth status changes to "expired", the dashboard MUST show a warning with a "Reconnect" button.

**FR-9:** The auth status MUST be polled periodically (every 30 seconds) while the dashboard is open.

**FR-10:** The onboarding UI MUST display a privacy notice about credential ownership.

**FR-11:** The terminal component MUST handle connection failures gracefully with user-friendly error messages.

---

## Non-Functional Requirements

**NFR-1 (Performance):** Auth status polling MUST NOT impact dashboard responsiveness.

**NFR-2 (Security):** Terminal tickets MUST be single-use with a 30-second TTL (enforced by engine).

**NFR-3 (Security):** The platform backend MUST NOT log or store any data from the terminal session.

**NFR-4 (Security):** WebSocket connections MUST use WSS (TLS).

**NFR-5 (Usability):** The onboarding flow MUST be completable by a non-technical user in under 2 minutes.

**NFR-6 (Usability):** The terminal MUST be readable on mobile devices (responsive sizing).

**NFR-7 (Reliability):** If the terminal disconnects, the user MUST see a clear message and a "Retry" button.

---

## Edge Cases & Error Handling

### Terminal Connection
- **Instance not running:** Show "Your instance is still setting up" instead of terminal. Disable Connect button.
- **Engine unreachable:** Show "Cannot reach your instance. Please try again in a minute."
- **Ticket expired (30s):** Request a new ticket automatically on WebSocket connection failure.
- **WebSocket disconnects mid-auth:** Show "Connection lost" with a Retry button. Don't lose the user's progress indication.

### Auth Status
- **Engine returns "unknown":** Display "Checking..." with a spinner. Retry in 10 seconds.
- **Polling fails repeatedly:** After 3 failures, show "Unable to check status" and stop polling. Show manual refresh button.
- **Status changes while terminal is open:** Auth status poll detects "authenticated" → close terminal, update UI to "Connected".

### Browser Compatibility
- **WebSocket not supported:** Show fallback message with browser upgrade suggestion.
- **Pop-up blocker prevents OAuth tab:** Show message explaining how to allow pop-ups for the OAuth flow.

---

## Resolved Clarifications

### Terminal Library — RESOLVED: xterm.js
The PRD specifies xterm.js. It is the standard web terminal emulator, well-maintained, and the engine's WebSocket PTY is designed to work with it.

### Auth Status Polling Interval — RESOLVED: 30 seconds
Polling every 30 seconds balances responsiveness with server load. The engine's health check runs at 30-minute intervals, so more frequent polling from the dashboard is fine.

### Re-auth vs Initial Auth — RESOLVED: Same Flow
Re-authentication uses the exact same terminal flow as initial auth. No separate "re-auth" UI needed — the Connect/Reconnect button triggers the same flow.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Onboarding completion rate | > 90% (of users who open the onboarding flow) |
| Time to complete auth | < 2 minutes |
| Auth status polling accuracy | 100% (matches engine-reported status) |
| Terminal connection success rate | > 95% |

---

## Out of Scope

- General shell access (terminal is scoped to Claude Code auth only)
- Terminal customization (themes, fonts, key bindings)
- Multiple Claude Code accounts per instance
- Automatic re-authentication without user action
- Terminal session recording or logging
