# Implementation Plan — Feature 6: Claude Code Onboarding

**Branch:** 6-claude-code-onboarding
**Created:** 2026-03-22

---

## Executive Summary

Feature 6 adds the Claude Code authentication flow to the dashboard. An embedded xterm.js terminal connects to the tenant's container via WebSocket, allowing the customer to authenticate with Anthropic's OAuth. Two new API routes proxy auth status checks and terminal ticket requests to the tenant engine. The dashboard updates auth status in real-time via polling.

**Schema change:** Add `engineApiKey` column to instance table (migration needed).

---

## Architecture Overview

```
Dashboard (Client)                  Vercel API                     Tenant Engine
──────────────────                  ──────────                     ─────────────

1. Load dashboard ─────────────────► GET /api/instance/auth-status
                                     │ Call engine via subdomain ──► GET /api/auth-status
                                     │◄── { status: "not_authenticated" }
                                     │ Update claudeAuthStatus ───► NeonDB
                  ◄──────────────── { claudeAuthStatus: "not_configured" }

2. Click "Connect" ───────────────► POST /api/instance/terminal-ticket
                                     │ Call engine via subdomain ──► POST /api/terminal/ticket
                                     │◄── { ticket: "abc123" }
                  ◄──────────────── { ticket, wsUrl }

3. Open WebSocket ─────────────────────────────────────────────────► WSS /api/terminal/ws?ticket=abc123
   xterm.js ◄─────────── PTY output ◄────────────────────────────── claude CLI (OAuth flow)
                          ┃
                          ┗━━ User authenticates in new browser tab

4. Poll auth status ──────────────► GET /api/instance/auth-status
                                     │ Call engine ───────────────► GET /api/auth-status
                                     │◄── { status: "authenticated" }
                                     │ Update claudeAuthStatus = "connected"
                  ◄──────────────── { claudeAuthStatus: "connected" }

5. Dashboard shows "Connected" ✓
```

### File Layout

```
src/
├── lib/
│   ├── engine-client.ts            # Proxy calls to tenant engine API
│   └── __tests__/
│       └── engine-client.test.ts   # Engine client tests
├── app/
│   ├── api/
│   │   └── instance/
│   │       ├── auth-status/
│   │       │   └── route.ts        # GET: proxy auth status
│   │       └── terminal-ticket/
│   │           └── route.ts        # POST: request terminal ticket
│   └── (protected)/
│       └── dashboard/
│           ├── onboarding-wizard.tsx  # Client: 3-step wizard
│           ├── terminal-embed.tsx     # Client: xterm.js wrapper
│           └── auth-status-badge.tsx  # Client: status indicator
```

---

## Implementation Phases

### Phase 1: Schema + Engine Client

1. Add `engineApiKey` column to instance table (migration)
2. Update `createInstance()` in `src/lib/instance.ts` to generate + store engineApiKey
3. Create `src/lib/engine-client.ts`:
   - `getAuthStatus(subdomain, apiKey)` — GET /api/auth-status
   - `getTerminalTicket(subdomain, apiKey)` — POST /api/terminal/ticket

### Phase 2: API Routes

1. `GET /api/instance/auth-status` — proxy to engine, update claudeAuthStatus
2. `POST /api/instance/terminal-ticket` — proxy to engine, return ticket + wsUrl

### Phase 3: Frontend Components

1. Install xterm.js: `@xterm/xterm`, `@xterm/addon-attach`, `@xterm/addon-fit`
2. `TerminalEmbed` — xterm.js component with WebSocket lifecycle
3. `AuthStatusBadge` — colored status indicator
4. `OnboardingWizard` — 3-step guided flow with embedded terminal
5. Update dashboard to show onboarding when instance is running + auth not configured

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Engine API key storage | Stored in Neon (same trust boundary as Stripe keys) |
| Terminal ticket TTL | 30-second single-use (enforced by engine) |
| WebSocket connection | WSS only (TLS via nginx) |
| Credential visibility | Platform never sees OAuth tokens — terminal connects directly to container |
| Session auth on API routes | Both routes check Better Auth session |

---

## Testing Strategy

### Unit Tests
- `engine-client.test.ts`: getAuthStatus (success, engine down, timeout), getTerminalTicket (success, not running)
- Auth status route: session check, proxy behavior, claudeAuthStatus update
- Terminal ticket route: session check, instance lookup, engine proxy

### Component Tests
- Not required for MVP — xterm.js integration is primarily visual/interactive
- Build verification sufficient for frontend components

---

## Constitutional Compliance

- [x] **Principle 1 (Data Sacred):** Credentials stay in container, platform never sees them
- [x] **Principle 2 (Security):** Ticket auth, WSS, no credential logging
- [x] **Principle 6 (Honesty):** Clear privacy messaging in onboarding
- [x] **Principle 8 (Platform Quality):** Guided step-by-step flow for non-technical users
- [x] **Test-First Imperative:** TDD for API routes and engine client
