# Implementation Plan: Web Chat Interface

**Spec version:** 1.1.0 | **Constitution:** v2.0.0 | **Feature:** 4 (P1)
**Created:** 2026-04-25

---

## Executive Summary

The web chat interface lets hermes tenants talk to their agent from the OvernightDesk dashboard. Two blockers discovered during research must be resolved before the chat UI can work:

1. **`API_SERVER_ENABLED` not set** — the hermes OpenAI-compatible API server (port 8642) is disabled on all current tenants. Must be enabled via Phase.dev and container restart.
2. **nginx auth_request blocks server-side calls** — the current `/v1/` nginx location requires an OvernightDesk session cookie, which Vercel's server-side API route cannot provide. The `/v1/` block must be changed to use `API_SERVER_KEY` (hermes-native auth) instead of the session-cookie auth_request.

Once those are resolved: the platform API route (`POST /api/engine/chat`) uses Vercel AI SDK `streamText` to proxy to `https://{subdomain}/v1/chat/completions`. The `/dashboard/chat` page uses `useChat` to stream responses.

**No database schema changes required.**

---

## Architecture Decisions

### AD-1: `API_SERVER_KEY` stored in `instance.engineApiKey`, generated at provision time

**Decision:** When the hermes provisioner creates a new tenant, it generates a random `API_SERVER_KEY`, writes it to Phase.dev, and returns it in the provisioner callback. The platform stores it in `instance.engineApiKey` (currently unused for hermes tenants). The chat API route reads it from the DB — no Phase call per request.

- **Rationale:** `instance.engineApiKey` already exists, is already excluded from API responses, and is the natural field for "the API credential this tenant's engine uses." Zero schema change. Fast read path (DB, not external service).
- **Alternative rejected:** Read from Phase.dev on every chat request — adds 200–400ms latency per message and creates a dependency on the Phase CLI at runtime.
- **Migration for existing tenants:** Gary and Mitchel need manual key generation + Phase.dev write + DB update (one-time, before feature ships).

### AD-2: Remove `auth_request` from nginx `/v1/` block; use `API_SERVER_KEY` for hermes-native auth

**Decision:** The `/v1/` nginx location block is changed to NOT use `auth_request`. Instead, hermes itself validates `API_SERVER_KEY` as a Bearer token. The OvernightDesk platform passes the key server-side from the DB.

- **Rationale:** Vercel API routes cannot carry OvernightDesk session cookies to aegis-prod. The `auth_request` pattern only works for browser requests. Hermes-native auth (`API_SERVER_KEY`) provides equivalent protection: without the key, the API returns 401.
- **Security equivalence:** Browser → OvernightDesk platform (session auth) → hermes API (API_SERVER_KEY). The key never reaches the browser; it's stored in the platform DB.
- **Files to update:** `infra/nginx/agent-zero.conf`, `infra/nginx/aero-fett.conf`, deployed to aegis-prod.

### AD-3: Vercel AI SDK v6 — `streamText` + `createOpenAI` + `useChat`

**Decision:** Use the current AI SDK v6 API:

Server route:
```typescript
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const hermes = createOpenAI({
  baseURL: `https://${subdomain}/v1`,
  apiKey: engineApiKey,        // API_SERVER_KEY from instance.engineApiKey
});

const result = streamText({
  model: hermes('default'),    // hermes uses its configured main model
  messages,
});

return result.toTextStreamResponse();
```

Client:
```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: '/api/engine/chat' }),
});
```

- **SDK packages needed:** `ai`, `@ai-sdk/openai`, `@ai-sdk/react` — check if already installed; install if not.

### AD-4: Chat tab requires `running` status; shows banner if not running

**Decision:** "Chat" tab added to `HERMES_ALLOWED_TABS`. The tab is always visible (per spec NC-3) but the chat page shows an inline banner when `inst.status !== 'running'`. The `requiresRunning: false` flag ensures the tab appears in navigation even when the agent is down.

---

## Implementation Phases

### Phase 0 — Enable API server (infra + existing tenants)

**0.1 Generate API_SERVER_KEY for existing tenants**

On aegis-prod, for each running hermes container:
```bash
# Generate key
KEY=$(openssl rand -hex 32)
# Write to Phase.dev
echo "$KEY" | phase secrets create API_SERVER_KEY --app overnightdesk --env production --path /agent-zero
echo "$KEY" | phase secrets create API_SERVER_ENABLED --path /agent-zero  # value: "true"
# Also write API_SERVER_ENABLED=true
```

Repeat for Mitchel (`/aero-fett`).

**0.2 Export updated secrets and restart containers**

```bash
phase secrets export --path /agent-zero > /opt/hermes-data/.env
docker restart hermes-agent

phase secrets export --path /aero-fett > /opt/hermes-mitchel/.env
docker restart hermes-mitchel
```

**0.3 Verify API server is listening**

```bash
curl -s http://127.0.0.1:8642/v1/models   # expect 401 (auth required)
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:8642/v1/models  # expect 200
```

**0.4 Update nginx: remove auth_request from `/v1/` in both configs**

`infra/nginx/agent-zero.conf` and `infra/nginx/aero-fett.conf` — change the `/v1/` location block:

```nginx
# BEFORE (with auth_request — blocks server-side calls):
location /v1/ {
    auth_request /auth-verify;
    error_page 401 = @unauthorized;
    ...
}

# AFTER (hermes-native auth via API_SERVER_KEY):
location /v1/ {
    proxy_pass http://hermes-agent:8642/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
    chunked_transfer_encoding on;
}
```

Reload nginx.

**0.5 Update platform DB: store API_SERVER_KEY in `instance.engineApiKey`**

One-time DB update for Gary and Mitchel using the generated keys.

**0.6 Update provisioner: add API_SERVER_KEY + API_SERVER_ENABLED to provision flow**

`internal/hermes/provisioner.go` — in `Provision()`, after Phase path creation, write:
- `API_SERVER_ENABLED=true`
- `API_SERVER_KEY=<generated random hex>`

Return `API_SERVER_KEY` in the provisioner callback payload (alongside `phaseServiceToken`).
Platform callback route stores it in `instance.engineApiKey`.

**0.7 Update setup wizard defaults**

Add `API_SERVER_ENABLED=true` to the defaults written in Feature 3's wizard Step 3 (personality/defaults). New tenants get it automatically.

---

### Phase 1 — Platform API route

**New file:** `src/app/api/engine/chat/route.ts`

```typescript
POST /api/engine/chat
```

- Validates Better Auth session (`request.headers`)
- Fetches instance: must be hermes tenant, must have `subdomain` and `engineApiKey`
- If instance not running: return `{ error: "Agent not running" }` with 503
- Uses `streamText` from AI SDK v6 with `createOpenAI({ baseURL: https://{subdomain}/v1, apiKey: inst.engineApiKey })`
- Passes `messages` array from request body
- Returns `result.toTextStreamResponse()`

**Packages to install if not present:**
- `ai` (Vercel AI SDK core)
- `@ai-sdk/openai` (OpenAI provider adapter)
- `@ai-sdk/react` (useChat hook)

---

### Phase 2 — Dashboard nav + Chat page

**2.1 Update `src/app/(protected)/dashboard/dashboard-nav.tsx`**

Add to `tabs` array:
```typescript
{ label: "Chat", href: "/dashboard/chat", requiresRunning: false },
```

Add `/dashboard/chat` to `HERMES_ALLOWED_TABS`.

**2.2 New page: `src/app/(protected)/dashboard/chat/page.tsx`**

Server component. Fetches instance for current user. If not hermes tenant: redirect to `/dashboard`. Renders `<ChatInterface>` with instance props.

**2.3 New client component: `src/app/(protected)/dashboard/chat/chat-interface.tsx`**

`'use client'` component using `useChat` hook.

Layout:
- Full-height scrollable message area (80vh on desktop, fill on mobile)
- User messages: right-aligned, blue tint
- Assistant messages: left-aligned, zinc
- Message parts: `part.type === 'text' ? part.text : null`
- Status indicator: spinner when `status === 'streaming' || status === 'submitted'`
- Input: sticky bottom bar, textarea (auto-resize), send button
- Send on Enter (Shift+Enter for newline)
- "Stop" button visible when streaming
- Banner when agent not running

Mobile: single-column, full-width, thumb-friendly input area.

---

## Data Model Changes

**None.** `instance.engineApiKey` already exists and is repurposed for `API_SERVER_KEY`. No migration needed beyond the one-time DB update for existing tenants.

---

## Security Considerations

| Concern | How addressed |
|---|---|
| `API_SERVER_KEY` never in browser | Stored in `instance.engineApiKey` (DB), read server-side only in the API route |
| Chat API route auth | Better Auth session required (same as all dashboard routes) |
| `/v1/` nginx endpoint | Hermes validates `API_SERVER_KEY` Bearer — 401 without valid key |
| Key rotation | Update Phase.dev + `instance.engineApiKey` + restart container |
| Messages never logged | Vercel API route does not log message content |

---

## Testing Strategy

**Unit tests:**
- `POST /api/engine/chat`: auth check (401 without session), non-hermes tenant (400), agent not running (503), successful stream mock
- Dashboard nav: Chat tab appears in `HERMES_ALLOWED_TABS` for hermes tenants

**Manual tests (QG):**
- Send a message, receive streaming response
- Agent not running: banner shown
- Mobile layout: input accessible, messages scroll

---

## Constitutional Compliance

| Requirement | Satisfied by |
|---|---|
| P1 Data Sacred | Messages never stored in platform DB; stay in browser state |
| P2 Secrets never plaintext | `API_SERVER_KEY` in `instance.engineApiKey` — same treatment as `engineApiKey` already was |
| P4 Simple | AI SDK v6 handles streaming complexity; no custom stream parsing |
| P6 Honesty | Error banner when agent not running; not a spinner |
| P8 Platform quality | Mobile-responsive; streaming UX |
| Pillar B API security | Session required on `/api/engine/chat` |

---

## Estimated Effort

| Component | Hours |
|---|---|
| Phase 0: Enable API server (aegis-prod + provisioner update) | 2h |
| Phase 1: Platform API route + tests | 2h |
| Phase 2: Nav + chat page + chat component | 3h |
| **Total** | **~7h** |
