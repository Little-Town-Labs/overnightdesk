# Task Breakdown: Web Chat Interface (Feature 4)

**Spec version:** 1.1.0 | **Plan version:** 1.1.0 | **Created:** 2026-04-23
**Feature:** 4 — Web Chat Interface (P1)

---

## Summary

| | |
|---|---|
| **Total tasks** | 20 |
| **Total estimated effort** | 7.5h |
| **Phases** | 3 (Phase 0: Infra, Phase 1: API route, Phase 2: UI) |
| **Critical path** | 0.1 → 0.2 → 0.3 → 0.4 → 0.5 → 1.1 → 1.2 → 1.3 → 2.1 → 2.3 → 2.4 → 2.5 → QG-2 |

### Parallelization

- **Phase 0:** Tasks 0.1–0.5 must run in sequence (each depends on the previous). Tasks 0.6 and 0.7 can run in parallel with 0.3–0.5 once 0.1 is done.
- **Phase 1:** Task 1.1 (package check/install) can run in parallel with 0.6/0.7. Test scaffold (1.2) must precede implementation (1.3) — TDD enforced.
- **Phase 2:** Task 2.1 (nav test scaffold) can start once Phase 1 is done. Tasks 2.3 (page) and 2.4 (chat component) can be parallelized after 2.2 (nav impl). Task 2.5 (mobile/error polish) follows 2.4.

### Quality Gates

- **QG-0** (after Phase 0): `curl` confirms port 8642 responds 401 without key, 200 with valid key.
- **QG-1** (after Phase 1): Security review — `API_SERVER_KEY` never in any browser-bound response; session required.
- **QG-2** (final): Manual chat test — send message, receive streaming response in dashboard UI on both desktop and mobile.

---

## Phase 0 — Infra: Enable API Server

### Task 0.1: Generate API_SERVER_KEY for existing tenants (Gary + Mitchel)
**Status:** 🟡 Ready
**Effort:** 0.25h
**Dependencies:** none
**Parallel with:** nothing (first task)

On aegis-prod, generate a random 64-character hex key (`openssl rand -hex 32`) for hermes-agent (Gary) and hermes-mitchel (Mitchel). Record both keys securely — they are needed in Tasks 0.2 and 0.5.

**Acceptance Criteria:**
- [ ] Two unique API_SERVER_KEY values generated (one per tenant)
- [ ] Keys are 64 hex characters (32 bytes, openssl rand -hex 32)
- [ ] Keys are stored securely (not in any repo or plaintext file on disk beyond ephemeral shell session)

---

### Task 0.2: Write API_SERVER_ENABLED + API_SERVER_KEY to Phase.dev for existing tenants
**Status:** 🔴 Blocked by Task 0.1
**Effort:** 0.25h
**Dependencies:** Task 0.1
**Parallel with:** nothing

Using the keys from Task 0.1, write `API_SERVER_ENABLED=true` and `API_SERVER_KEY=<generated>` to Phase.dev for the `/agent-zero` path (Gary) and `/aero-fett` path (Mitchel). Both secrets must be present before container restart.

**Acceptance Criteria:**
- [ ] `API_SERVER_ENABLED=true` written to Phase.dev for `/agent-zero`
- [ ] `API_SERVER_KEY=<gary-key>` written to Phase.dev for `/agent-zero`
- [ ] `API_SERVER_ENABLED=true` written to Phase.dev for `/aero-fett`
- [ ] `API_SERVER_KEY=<mitchel-key>` written to Phase.dev for `/aero-fett`
- [ ] Phase.dev `secrets list` confirms both secrets are present for each path

---

### Task 0.3: Export Phase secrets and restart hermes containers
**Status:** 🔴 Blocked by Task 0.2
**Effort:** 0.25h
**Dependencies:** Task 0.2
**Parallel with:** nothing

Export updated Phase secrets to `.env` files and restart both containers so they pick up `API_SERVER_ENABLED` and `API_SERVER_KEY`. Verify containers come back healthy before proceeding.

```bash
phase secrets export --path /agent-zero > /opt/hermes-data/.env && docker restart hermes-agent
phase secrets export --path /aero-fett  > /opt/hermes-mitchel/.env && docker restart hermes-mitchel
```

**Acceptance Criteria:**
- [ ] `hermes-agent` container restarts without error
- [ ] `hermes-mitchel` container restarts without error
- [ ] `docker ps` shows both containers in `Up` state
- [ ] Container logs show no startup errors related to `API_SERVER_ENABLED` or `API_SERVER_KEY`

---

### Task 0.4: Verify hermes API server is listening on port 8642
**Status:** 🔴 Blocked by Task 0.3
**Effort:** 0.25h
**Dependencies:** Task 0.3
**Parallel with:** nothing

Curl the hermes API server directly to confirm it responds correctly with and without a valid Bearer key. This is Quality Gate 0.

```bash
# Expect 401
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/v1/models
# Expect 200
curl -s -H "Authorization: Bearer $GARY_KEY" http://127.0.0.1:8642/v1/models
```

**Acceptance Criteria:**
- [ ] `curl` without Authorization header returns HTTP 401
- [ ] `curl` with valid Bearer key returns HTTP 200
- [ ] Response body with valid key contains a JSON models list (not empty)
- [ ] Same verified for hermes-mitchel on its port

---

### Task 0.5: Update nginx — remove auth_request from /v1/ block in both configs
**Status:** 🔴 Blocked by Task 0.4
**Effort:** 0.5h
**Dependencies:** Task 0.4
**Parallel with:** nothing

Edit `infra/nginx/agent-zero.conf` and `infra/nginx/aero-fett.conf` on aegis-prod. Remove `auth_request /auth-verify` and `error_page 401 = @unauthorized` from the `/v1/` location block. Replace with direct proxy pass + streaming headers. Reload nginx and verify.

The new `/v1/` block for each config:
```nginx
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

**Acceptance Criteria:**
- [ ] `auth_request` directive is absent from `/v1/` block in `agent-zero.conf`
- [ ] `auth_request` directive is absent from `/v1/` block in `aero-fett.conf`
- [ ] `nginx -t` passes with no errors
- [ ] `nginx -s reload` completes without error
- [ ] `curl https://agent-zero.overnightdesk.com/v1/models` (no auth) returns 401 from hermes (not from nginx auth)
- [ ] `curl -H "Authorization: Bearer $KEY" https://agent-zero.overnightdesk.com/v1/models` returns 200

---

### Task 0.6: Update platform DB — store API_SERVER_KEY in instance.engineApiKey
**Status:** 🔴 Blocked by Task 0.1
**Effort:** 0.25h
**Dependencies:** Task 0.1
**Parallel with:** Task 0.2, 0.3, 0.4, 0.5 (can run once keys are generated)

One-time DB update: set `instance.engineApiKey` for Gary's and Mitchel's instance records using the keys generated in Task 0.1. This is the value the platform API route will read at request time.

**Acceptance Criteria:**
- [ ] Gary's instance record has `engineApiKey` set to the correct key from Task 0.1
- [ ] Mitchel's instance record has `engineApiKey` set to the correct key from Task 0.1
- [ ] DB query confirms both values are non-null and match their Phase.dev counterparts
- [ ] `engineApiKey` is NOT returned in any existing `GET /api/instance` response (verify existing exclusion still applies)

---

### Task 0.7: Update Go provisioner — write API_SERVER_KEY at provision time
**Status:** 🔴 Blocked by Task 0.1
**Effort:** 0.5h
**Dependencies:** Task 0.1 (pattern reference)
**Parallel with:** Tasks 0.2–0.6

In `internal/hermes/provisioner.go`, update `Provision()` to:
1. Generate a random `API_SERVER_KEY` (crypto/rand hex)
2. Write `API_SERVER_ENABLED=true` to Phase.dev via the provisioner's existing Phase client
3. Write `API_SERVER_KEY=<generated>` to Phase.dev
4. Return `apiServerKey` in the provisioner callback payload alongside `phaseServiceToken`

The platform provisioner callback route (`POST /api/provisioner`) must store the returned `apiServerKey` in `instance.engineApiKey`.

**Acceptance Criteria:**
- [ ] `Provision()` generates a cryptographically random key (crypto/rand, not math/rand)
- [ ] `API_SERVER_ENABLED=true` is written to Phase.dev during provisioning
- [ ] `API_SERVER_KEY` is written to Phase.dev during provisioning
- [ ] Callback payload includes `apiServerKey` field
- [ ] Platform callback route stores `apiServerKey` → `instance.engineApiKey`
- [ ] Unit test: provisioner output includes `apiServerKey` in callback
- [ ] New tenant provisioned after this change has `engineApiKey` populated in the DB

---

### Task 0.8: Update setup wizard defaults — add API_SERVER_ENABLED to Phase 3 writes
**Status:** 🟡 Ready
**Effort:** 0.25h
**Dependencies:** none (independent platform change)
**Parallel with:** Tasks 0.1–0.7

In the setup wizard (Feature 3, Phase 3 defaults write), add `API_SERVER_ENABLED=true` to the set of defaults written to Phase.dev during wizard completion. New tenants who go through the wizard will have this set before their first provision.

**Acceptance Criteria:**
- [ ] `API_SERVER_ENABLED=true` is included in the wizard's Phase.dev write for new tenants
- [ ] Existing wizard tests pass without modification
- [ ] No regression in wizard flow — wizard still completes successfully end-to-end

---

## Phase 1 — Platform API Route

### Task 1.1: Verify / install AI SDK packages
**Status:** 🟡 Ready
**Effort:** 0.25h
**Dependencies:** none
**Parallel with:** Tasks 0.6, 0.7, 0.8

Check whether `ai`, `@ai-sdk/openai`, and `@ai-sdk/react` are already in `package.json`. Install any that are missing. Verify TypeScript types resolve correctly.

```bash
npm ls ai @ai-sdk/openai @ai-sdk/react
# Install missing packages as needed
npm install ai @ai-sdk/openai @ai-sdk/react
```

**Acceptance Criteria:**
- [ ] `ai`, `@ai-sdk/openai`, and `@ai-sdk/react` are present in `package.json`
- [ ] `tsc --noEmit` passes after any new installs
- [ ] No peer-dependency conflicts in npm output

---

### Task 1.2: Write tests for POST /api/engine/chat (TDD — RED)
**Status:** 🔴 Blocked by Task 1.1
**Effort:** 0.75h
**Dependencies:** Task 1.1
**Parallel with:** nothing (tests must be written before implementation)

Create `src/app/api/engine/chat/route.test.ts`. Write failing unit tests covering all required cases using Jest and mocked AI SDK / DB calls. Tests must fail (RED) before implementation begins.

Test cases to cover:
- Returns 401 when no valid session (unauthenticated request)
- Returns 400 when authenticated user's instance is not a hermes tenant
- Returns 400 when instance has no `subdomain`
- Returns 503 when instance is not in `running` state, body: `{ error: "Agent not running" }`
- Returns 503 when instance has no `engineApiKey` configured
- Happy path: calls `streamText` with correct `baseURL`, `apiKey`, and `messages`; returns streaming response
- Error from hermes API: returns user-friendly error without leaking raw hermes error body

**Acceptance Criteria:**
- [ ] Test file exists at `src/app/api/engine/chat/route.test.ts`
- [ ] All 7 test cases are written and present
- [ ] Running `npm test -- route.test.ts` produces RED failures (route does not exist yet)
- [ ] Tests mock `streamText`, `createOpenAI`, session validation, and DB instance fetch
- [ ] No test reads `engineApiKey` from any client-accessible context

---

### Task 1.3: Implement POST /api/engine/chat route (TDD — GREEN)
**Status:** 🔴 Blocked by Task 1.2
**Effort:** 1h
**Dependencies:** Task 1.2 (tests must be RED first), Task 0.5 (nginx ready for prod use)
**Parallel with:** nothing

Create `src/app/api/engine/chat/route.ts`. Implement the server-side streaming proxy:

1. Validate Better Auth session from `request.headers`; return 401 if invalid
2. Fetch instance for authenticated user
3. Validate: hermes tenant, has `subdomain`, has `engineApiKey`; return 400/503 as appropriate
4. If `instance.status !== 'running'`: return 503 `{ error: "Agent not running" }`
5. Parse `messages` from request body; validate format
6. Call `streamText({ model: createOpenAI({ baseURL: \`https://\${subdomain}/v1\`, apiKey: inst.engineApiKey })('default'), messages })`
7. Return `result.toTextStreamResponse()`
8. Catch errors from hermes: return user-friendly 503 without leaking raw error

**Acceptance Criteria:**
- [ ] All 7 tests from Task 1.2 pass (GREEN)
- [ ] `engineApiKey` is NEVER present in any response body, header, or log output
- [ ] Route validates session before any DB or hermes call
- [ ] Empty or malformed `messages` array returns 400 with clear error
- [ ] `tsc --noEmit` passes on the new file
- [ ] `npm test -- route.test.ts` shows all tests passing

---

### Task 1.4: Security review — POST /api/engine/chat
**Status:** 🔴 Blocked by Task 1.3
**Effort:** 0.25h
**Dependencies:** Task 1.3
**Parallel with:** Task 2.1

Perform focused security review on `src/app/api/engine/chat/route.ts`. Verify Quality Gate 1: API key never leaked, session always required, tenant isolation enforced.

Checklist:
- `engineApiKey` absent from all response paths (including error responses)
- Session check is the first operation (no early-exit paths that skip auth)
- Tenant isolation: user can only proxy to their own instance
- Input validation present on `messages` payload
- Error messages are user-friendly, no stack traces, no hermes container details
- Rate limiting consideration documented (or implemented if easily added)

**Acceptance Criteria:**
- [ ] Security checklist above is fully verified
- [ ] No `engineApiKey` leakage found in any code path
- [ ] Session validation is unconditional (no bypass path exists)
- [ ] Tenant isolation verified: user A cannot reach user B's agent
- [ ] Any findings are resolved before Phase 2 begins

---

## Phase 2 — Dashboard Nav + Chat UI

### Task 2.1: Write tests for Chat tab in dashboard-nav (TDD — RED)
**Status:** 🔴 Blocked by Task 1.4
**Effort:** 0.5h
**Dependencies:** Task 1.4 (Phase 1 complete)
**Parallel with:** Task 1.4 (can start simultaneously)

Write failing tests for the dashboard navigation changes in `src/app/(protected)/dashboard/dashboard-nav.test.tsx` (or the existing nav test file if one exists). Tests must fail (RED) before nav implementation.

Test cases:
- Chat tab appears in rendered nav for a hermes tenant user
- Chat tab href is `/dashboard/chat`
- Chat tab is marked active when current pathname is `/dashboard/chat`
- Chat tab does NOT appear for non-hermes tenant users
- `/dashboard/chat` is included in `HERMES_ALLOWED_TABS` constant

**Acceptance Criteria:**
- [ ] Test file exists (new or extended)
- [ ] All 5 test cases written and present
- [ ] Tests fail (RED) — Chat tab not yet in nav implementation
- [ ] Tests use mocked tenant/user context to differentiate hermes vs non-hermes

---

### Task 2.2: Implement Chat tab in dashboard-nav (TDD — GREEN)
**Status:** 🔴 Blocked by Task 2.1
**Effort:** 0.25h
**Dependencies:** Task 2.1
**Parallel with:** nothing

Edit `src/app/(protected)/dashboard/dashboard-nav.tsx`:
1. Add `/dashboard/chat` to `HERMES_ALLOWED_TABS` array
2. Add `{ label: "Chat", href: "/dashboard/chat", requiresRunning: false }` to the `tabs` array for hermes tenants

**Acceptance Criteria:**
- [ ] All 5 tests from Task 2.1 pass (GREEN)
- [ ] `HERMES_ALLOWED_TABS` includes `/dashboard/chat`
- [ ] Chat tab has `requiresRunning: false` (visible even when agent is stopped)
- [ ] Non-hermes tenants do not see the Chat tab (confirmed by test)
- [ ] No existing nav tests broken

---

### Task 2.3: Implement /dashboard/chat page.tsx (server component)
**Status:** 🔴 Blocked by Task 2.2
**Effort:** 0.5h
**Dependencies:** Task 2.2
**Parallel with:** nothing (2.4 depends on this component's prop interface)

Create `src/app/(protected)/dashboard/chat/page.tsx` as a server component:
1. Authenticate request (redirects to login if not authenticated — inherits from layout)
2. Fetch instance for authenticated user
3. If not a hermes tenant: `redirect('/dashboard')`
4. Pass `{ instance }` props to `<ChatInterface>` client component

**Acceptance Criteria:**
- [ ] File exists at `src/app/(protected)/dashboard/chat/page.tsx`
- [ ] Non-hermes tenants are redirected to `/dashboard` (not 404, not crash)
- [ ] Unauthenticated requests redirect to login (via existing middleware/layout)
- [ ] Page renders without TypeScript errors (`tsc --noEmit` clean)
- [ ] Instance props passed to `ChatInterface` include: `status`, `subdomain`, and a boolean flag indicating whether `engineApiKey` is configured (key itself NOT passed to client)

---

### Task 2.4: Implement ChatInterface client component
**Status:** 🔴 Blocked by Task 2.3
**Effort:** 1.5h
**Dependencies:** Task 2.3
**Parallel with:** nothing (requires page props interface from 2.3)

Create `src/app/(protected)/dashboard/chat/chat-interface.tsx` as a `'use client'` component.

Layout and behavior:
- `useChat` hook with `transport: new DefaultChatTransport({ api: '/api/engine/chat' })`
- Full-height scrollable message area (80vh desktop, fill mobile)
- User messages: right-aligned, blue tint (`bg-blue-600 text-white`)
- Assistant messages: left-aligned, zinc (`bg-zinc-800 text-zinc-100`)
- Render `part.type === 'text' ? part.text : null` for each message part
- Spinner/typing indicator when `status === 'streaming' || status === 'submitted'`
- "Stop" button visible during streaming (calls `stop()` from useChat)
- Sticky bottom input bar: `<textarea>` with auto-resize, Send button
- Submit on Enter key; Shift+Enter inserts newline
- Input and Send button disabled while streaming (FR-9)
- Empty message: Send button and Enter key inactive (FR-8)
- Auto-scroll to bottom as response streams (FR-13)
- Error display: inline in conversation area, user-friendly text (US-4)
- Banner when `instance.status !== 'running'`: "Your agent is not running. Check the Overview tab." — replaces input area (AC-2.6)
- Banner when `engineApiKey` not configured: "Setup not complete. Visit the Settings tab to finish configuring your agent."
- Session expired (401 from API): redirect to login or show "Session expired. Please log in again."
- Mobile: single-column, full-width, touch targets ≥ 44px (NFR-9)

**Acceptance Criteria:**
- [ ] `'use client'` directive at top of file
- [ ] `useChat` and `DefaultChatTransport` imported from correct packages (`@ai-sdk/react`, `ai`)
- [ ] `engineApiKey` value is NOT passed as a prop or present anywhere in client component
- [ ] Not-running banner renders when `instance.status !== 'running'`
- [ ] No-key banner renders when `engineApiKey` is not configured
- [ ] Input disabled while streaming
- [ ] Enter submits, Shift+Enter inserts newline
- [ ] Stop button visible during streaming
- [ ] Auto-scroll to bottom on new message content
- [ ] Component renders without TypeScript errors
- [ ] `tsc --noEmit` clean

---

### Task 2.5: Mobile responsiveness + error state polish
**Status:** 🔴 Blocked by Task 2.4
**Effort:** 0.5h
**Dependencies:** Task 2.4
**Parallel with:** nothing

Review `chat-interface.tsx` on a 375px viewport (using browser dev tools or Playwright). Verify all mobile acceptance criteria from US-3. Verify all error state acceptance criteria from US-4 and EC-1–EC-8.

Fix any issues found:
- Horizontal overflow on small viewports
- Input/Send button not thumb-reachable
- Keyboard obscuring input field (use `env(safe-area-inset-bottom)` or equivalent)
- Any edge case from EC-1 to EC-8 not handled

**Acceptance Criteria:**
- [ ] No horizontal scrolling on 375px wide viewport
- [ ] Input field and Send button both ≥ 44px tap target
- [ ] Keyboard on mobile does not permanently obscure the input
- [ ] Message history scrollable and readable on mobile
- [ ] EC-1 (unreachable): user-friendly error, input remains active for retry
- [ ] EC-3 (non-streaming hermes response): graceful error, not blank screen
- [ ] EC-4 (long response): no layout break, scrollable throughout
- [ ] EC-5 (concurrent submit): blocked while streaming
- [ ] EC-6 (session expiry): redirects to login or shows session-expired message
- [ ] EC-7 (network interruption): partial response visible, error shown, retry available

---

### Task 2.6: Final manual quality gate (QG-2)
**Status:** 🔴 Blocked by Task 2.5
**Effort:** 0.25h
**Dependencies:** Task 2.5 (all implementation complete), Task 0.5 (nginx ready)
**Parallel with:** nothing

Perform the final manual quality gate against a running hermes tenant (Gary's instance on aegis-prod via production Vercel deployment).

Steps:
1. Log in as Gary → navigate to `/dashboard/chat`
2. Verify Chat tab is visible and active
3. Type a message, press Enter
4. Confirm streaming response arrives within 3 seconds and tokens render progressively
5. Open browser DevTools → Network tab → confirm no response contains `API_SERVER_KEY` or any `engineApiKey` value
6. Open DevTools → Application tab → confirm nothing in localStorage, sessionStorage, or cookies contains the key
7. Test on mobile (iPhone/Android or 375px DevTools emulation)
8. Stop hermes-agent container → navigate to `/dashboard/chat` → confirm "not running" banner appears

**Acceptance Criteria:**
- [ ] Streaming response visible within 3 seconds
- [ ] `API_SERVER_KEY` absent from all network responses (verified in DevTools)
- [ ] `API_SERVER_KEY` absent from all browser storage mechanisms
- [ ] Chat tab visible and navigable
- [ ] Mobile layout functional at 375px
- [ ] Not-running banner appears when agent is stopped
- [ ] All 8 success criteria from spec.md confirmed

---

## Task Dependency Graph

```
0.1 (generate keys)
 ├── 0.2 (Phase.dev write) → 0.3 (restart) → 0.4 (verify) → 0.5 (nginx)
 ├── 0.6 (DB update)                          ↑ parallel until nginx needed
 └── 0.7 (provisioner update)
0.8 (wizard defaults)  ← independent, parallel with all Phase 0

1.1 (install SDK)
 └── 1.2 (write tests RED) → 1.3 (implement GREEN) → 1.4 (security review)

2.1 (nav tests RED)    ← can start parallel with 1.4
 └── 2.2 (nav impl GREEN)
      └── 2.3 (page.tsx)
           └── 2.4 (ChatInterface)
                └── 2.5 (mobile polish)
                     └── 2.6 (QG-2 manual)
```

---

## Effort Summary

| Phase | Tasks | Effort |
|---|---|---|
| Phase 0: Infra (aegis-prod + provisioner) | 0.1–0.8 (8 tasks) | 2.5h |
| Phase 1: Platform API route | 1.1–1.4 (4 tasks) | 2.25h |
| Phase 2: Nav + chat UI | 2.1–2.6 (6 tasks + QG-2) | 3.5h |
| **Total** | **20 tasks** | **~7.5h** |
