# Technology Research — Feature 6: Claude Code Onboarding

## Decision 1: Terminal Emulator

**Chosen:** xterm.js
**Rationale:** PRD-mandated. Industry standard web terminal emulator. 13k+ GitHub stars, active maintenance. Engine's WebSocket PTY is designed for xterm.js protocol. Supports addons (fit, web-links).
**Package:** `@xterm/xterm` (v5+, renamed from `xterm`)

## Decision 2: WebSocket Client

**Chosen:** Browser-native WebSocket API
**Rationale:** No library needed. The browser's built-in WebSocket API connects to the engine's WSS endpoint. xterm.js has an `AttachAddon` that wires stdin/stdout to a WebSocket.
**Package:** `@xterm/addon-attach` for xterm.js integration

## Decision 3: Auth Status Proxy

**Options Considered:**
1. **Client-side direct call to tenant subdomain** — CORS issues, exposes tenant URL
2. **Platform API proxy** — `/api/instance/auth-status` proxies to tenant engine
3. **Server component fetch** — SSR fetch on page load only

**Chosen:** Platform API proxy
**Rationale:** Avoids CORS issues. The platform backend has the instance's subdomain and bearer token (hashed, but we can use the provisioner's stored relationship). The proxy calls the engine's `/api/auth-status` with the bearer token and returns the result. Also allows the platform to update `claudeAuthStatus` in the database.
**Tradeoffs:** Extra hop through Vercel. Acceptable — auth status is a lightweight GET.

## Decision 4: Terminal Ticket Flow

**Chosen:** Two-step: Platform requests ticket → Client connects WebSocket
**Rationale:** The engine's ticket system requires bearer token auth to create tickets. The platform backend creates the ticket (it has the bearer token relationship), then returns the ticket to the client. The client connects directly to the tenant's WebSocket endpoint with the ticket.

**Flow:**
1. Client clicks "Connect" → calls `POST /api/instance/terminal-ticket`
2. Platform backend calls engine `POST /api/terminal/ticket` with bearer auth
3. Engine returns `{ ticket: "abc123" }` (single-use, 30s TTL)
4. Platform returns ticket to client
5. Client opens WebSocket: `wss://{subdomain}/api/terminal/ws?ticket=abc123`
6. Engine validates ticket, spawns Claude CLI in PTY
7. xterm.js renders terminal output

## Decision 5: Onboarding Component Architecture

**Chosen:** Client component with 3-step wizard + embedded xterm.js terminal
**Rationale:** The onboarding flow is inherently interactive (terminal, polling, button clicks). A single client component manages the wizard state, terminal lifecycle, and auth status polling. Mounted conditionally based on instance status from the server component dashboard.
