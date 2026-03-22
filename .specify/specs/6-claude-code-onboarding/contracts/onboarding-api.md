# API Contract — Feature 6: Claude Code Onboarding

## Routes Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/instance/auth-status` | Session | Proxy auth status check to tenant engine |
| POST | `/api/instance/terminal-ticket` | Session | Request terminal ticket from tenant engine |

---

## GET /api/instance/auth-status

Proxies auth status check from dashboard to tenant engine.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "authenticated" | "not_authenticated" | "unknown",
    "claudeAuthStatus": "connected" | "not_configured" | "expired"
  }
}
```

**Error Responses:**
- `401` — Not authenticated
- `404` — No instance found
- `502` — Engine unreachable

**Logic:**
1. Verify session
2. Find user's instance (must be running)
3. Call engine `GET /api/auth-status` via tenant subdomain with bearer auth
4. Map engine response to claudeAuthStatus:
   - `authenticated` → "connected"
   - `not_authenticated` → "not_configured" (or "expired" if was previously connected)
   - `unknown` → keep current status
5. Update instance.claudeAuthStatus in database if changed
6. Return status

---

## POST /api/instance/terminal-ticket

Requests a single-use terminal ticket from the tenant engine.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "ticket": "abc123...",
    "wsUrl": "wss://a1b2c3d4e5f6.overnightdesk.com/api/terminal/ws"
  }
}
```

**Error Responses:**
- `401` — Not authenticated
- `404` — No instance found
- `409` — Instance not running
- `502` — Engine unreachable

**Logic:**
1. Verify session
2. Find user's instance (must be running)
3. Call engine `POST /api/terminal/ticket` via tenant subdomain with bearer auth
4. Return ticket + WebSocket URL to client

---

## Environment Variables

No new env vars needed — uses existing `PROVISIONER_SECRET` relationship and instance data from database.

The platform needs the **plaintext bearer token** to call the engine API. Since we only store the hash, the platform must retrieve the token through the provisioner callback flow. **Alternative:** Store a separate platform-to-engine API key during provisioning.

**Resolution:** Add an `engineApiKey` field to the instance record (separate from `dashboardTokenHash`) — a platform-internal key for API calls to the engine. Generated during provisioning, stored encrypted or as a second hash. This avoids needing the user's bearer token.

---

## Frontend Components

### OnboardingWizard (client component)
- Props: `instanceSubdomain: string`, `authStatus: string`
- State: `step` (1-3), `terminalOpen`, `polling`
- Renders: Step indicators + terminal container + privacy notice

### TerminalEmbed (client component)
- Props: `wsUrl: string`, `ticket: string`, `onDisconnect: () => void`
- Creates xterm.js instance with AttachAddon
- Handles WebSocket lifecycle (connect, disconnect, error)
- Cleans up on unmount

### AuthStatusBadge (client component)
- Props: `status: string`
- Renders colored badge: green (connected), amber (expired), gray (not configured)
