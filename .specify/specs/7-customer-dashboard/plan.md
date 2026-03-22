# Implementation Plan — Feature 7: Customer Dashboard

## Executive Summary

Extend the existing minimal dashboard into a full customer management console. The dashboard already displays instance status, subscription info, and Claude Code onboarding. Feature 7 adds: heartbeat configuration, job management, activity log, engine logs, account settings, and instance restart — all by proxying to the Go engine's REST API.

**No database schema changes required.** All tenant data lives in the engine's per-tenant SQLite and is accessed via REST API. Platform tables (user, subscription, instance) already exist.

**Estimated Effort:** 16 hours
**Risk Level:** Low — mostly CRUD UI over a well-documented API

---

## Architecture Overview

```
Browser → Next.js App Router
  ├── Server Components (reads) → engine-client.ts → Engine REST API
  ├── API Routes (mutations) → engine-client.ts → Engine REST API
  ├── API Routes (account) → Better Auth + Drizzle → NeonDB
  └── API Routes (restart) → provisioner-client.ts → Oracle Cloud
```

### Route Structure

```
/dashboard                    → Overview (existing, enhanced)
/dashboard/heartbeat          → Heartbeat configuration
/dashboard/jobs               → Job management
/dashboard/activity           → Activity log
/dashboard/logs               → Engine log viewer
/dashboard/settings           → Account settings
```

### Component Architecture

```
(protected)/dashboard/
├── layout.tsx                ← Dashboard layout with tab navigation
├── page.tsx                  ← Overview (existing, refactored)
├── dashboard-nav.tsx         ← Tab navigation component (client)
├── heartbeat/
│   ├── page.tsx              ← Server component: loads heartbeat config
│   └── heartbeat-form.tsx    ← Client component: edit form
├── jobs/
│   ├── page.tsx              ← Server component: loads job list
│   ├── job-list.tsx          ← Client component: list with pagination
│   ├── job-detail.tsx        ← Client component: expandable job detail
│   └── create-job-form.tsx   ← Client component: new job form
├── activity/
│   ├── page.tsx              ← Server component: loads conversations
│   └── activity-list.tsx     ← Client component: expandable list
├── logs/
│   ├── page.tsx              ← Server component: loads logs
│   └── log-viewer.tsx        ← Client component: monospace display
├── settings/
│   ├── page.tsx              ← Server component: loads user data
│   ├── change-password.tsx   ← Client component: password form
│   └── delete-account.tsx    ← Client component: deletion flow
├── sign-out-button.tsx       ← Existing
├── manage-billing-button.tsx ← Existing
├── auth-status-badge.tsx     ← Existing
├── onboarding-wizard.tsx     ← Existing
└── terminal-embed.tsx        ← Existing
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Routing | Next.js App Router nested routes | Each section gets its own URL, server component for data loading |
| Data fetching (reads) | Server components + engine-client.ts | No client-side fetching library needed (constitution: no SWR/React Query) |
| Data fetching (mutations) | API routes + fetch from client | Bearer tokens stay server-side, follows existing auth-status/terminal-ticket pattern |
| Forms | React state + fetch | Simple forms, no form library needed |
| Validation | Zod | Already used throughout the project |
| Navigation | Client component with usePathname | Highlights active tab, no router dependency |
| Account management | Better Auth client API + custom deletion | Battle-tested auth methods, custom logic only for deletion |

---

## Technical Decisions

### Decision 1: Engine Client Extension

Extend `src/lib/engine-client.ts` with new functions for each engine endpoint. Pattern follows existing `getAuthStatus()` and `getTerminalTicket()`:

```
getEngineStatus(subdomain, apiKey) → engine status
getHeartbeatConfig(subdomain, apiKey) → heartbeat settings
updateHeartbeatConfig(subdomain, apiKey, config) → updated settings
getJobs(subdomain, apiKey, params) → job list
createJob(subdomain, apiKey, data) → created job
getJob(subdomain, apiKey, id) → job detail
deleteJob(subdomain, apiKey, id) → void
getConversations(subdomain, apiKey, params) → conversation list
getConversationMessages(subdomain, apiKey, id, params) → messages
getEngineLogs(subdomain, apiKey, lines) → log lines
```

All functions follow the same pattern: fetch with Bearer auth, 10s timeout, graceful error handling.

### Decision 2: Shared Instance Resolution

Every engine-proxy API route needs to: verify session → find user's instance → get subdomain + apiKey. Extract this into a helper:

```
resolveInstance(session) → { subdomain, engineApiKey } | null
```

Uses existing `getInstanceForUser()` from instance.ts, validates instance is running.

### Decision 3: Dashboard Layout

Create a layout.tsx for `/dashboard` that includes:
- Tab navigation (Overview, Heartbeat, Jobs, Activity, Logs, Settings)
- Common session/instance checks
- The layout wraps all dashboard sub-routes

The existing page.tsx content moves under the layout as the overview tab.

---

## Implementation Phases

### Phase 1: Engine Client & API Routes (4 hours)
1. Extend engine-client.ts with all engine API functions
2. Create shared `resolveInstance()` helper
3. Create API proxy routes: `/api/engine/status`, `/api/engine/heartbeat`, `/api/engine/jobs`, `/api/engine/conversations`, `/api/engine/logs`, `/api/engine/restart`
4. Create account routes: `/api/account/delete`
5. Unit tests for engine-client functions and API routes

### Phase 2: Dashboard Layout & Navigation (2 hours)
1. Create dashboard layout.tsx with tab navigation
2. Create dashboard-nav.tsx client component
3. Refactor existing page.tsx to work under new layout
4. Enhance overview with engine status data

### Phase 3: Heartbeat & Jobs UI (4 hours)
1. Heartbeat configuration page + form
2. Job list page with pagination
3. Create job form
4. Job detail view
5. Delete job action

### Phase 4: Activity, Logs & Settings (4 hours)
1. Activity log page with expandable conversations
2. Engine log viewer
3. Account settings page (password change, account deletion)
4. Instance restart button with confirmation

### Phase 5: Testing & Polish (2 hours)
1. Integration tests for all API routes
2. Edge case handling (engine unreachable, empty states)
3. Mobile responsive verification
4. Loading states and error boundaries

---

## Security Considerations

1. **Bearer token isolation:** Engine API keys never leave the server. All engine calls go through API proxy routes or server components.
2. **Session verification:** Every API route and server component verifies the session before proceeding.
3. **Instance ownership:** `resolveInstance()` verifies the instance belongs to the authenticated user.
4. **Account deletion:** Requires current password + typing "DELETE" — two-factor confirmation.
5. **Input validation:** All mutation endpoints validate with Zod schemas.
6. **No tenant data caching:** Conversation content and job results are proxied, never stored in platform DB.
7. **Rate limiting:** Restart (5 min cooldown) and job creation (10/min) rate-limited server-side.

---

## Performance Strategy

1. **Server components for reads:** Dashboard pages are server-rendered — no client-side waterfall.
2. **Parallel fetches:** Overview page uses Promise.all for independent queries (instance, subscription, engine status).
3. **Pagination:** Job list and activity log paginated at 20 items. No "load all" option.
4. **No polling on management pages:** Data loads once on navigation. User can refresh manually. (Exception: overview may poll instance status if needed, but not in v1.)
5. **Lazy log loading:** Logs fetched on demand, not preloaded.

---

## Testing Strategy

- **Unit tests:** engine-client.ts functions (mock fetch), Zod validation schemas
- **Integration tests:** API route handlers (mock session + engine responses)
- **Component tests:** Not required for server components (tested via API + E2E)
- **E2E tests (future):** Critical flows — create job, configure heartbeat, delete account

---

## Constitutional Compliance

- [x] **Data Sacred:** No tenant data stored in platform DB. Engine API proxied, never cached.
- [x] **Security:** All routes authenticated. Bearer tokens server-side only. Destructive actions confirmed.
- [x] **Simple Over Clever:** No state management libraries. Server components + fetch. No real-time.
- [x] **Platform Quality:** Loading states, error states, empty states, mobile responsive.
- [x] **Test-First:** TDD workflow for all implementation.
- [x] **Files < 800 lines, functions < 50 lines:** Route structure keeps each file focused.

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Engine API timeout on slow network | Medium | Low | 10s timeout, clear error message, retry guidance |
| Better Auth changePassword API issues | Low | Medium | Test thoroughly, fallback to manual password hash update |
| Provisioner restart endpoint not ready | Medium | Medium | Build the UI now, mock the provisioner call, wire up when provisioner supports restart |
| Dashboard layout refactor breaks existing pages | Low | High | Keep existing page.tsx logic intact, just wrap with layout |
