# Feature 15: Platform Security Dashboard — Implementation Plan

**Branch:** 15-security-dashboard
**Created:** 2026-03-23
**Spec:** spec.md (Clarified)

---

## Architecture Decision: Engine as Proxy

The platform (Vercel) cannot reach the SecurityTeam service directly (it runs on Oracle VM localhost). The data flow is:

```
Browser → Platform API route → Engine proxy endpoint → SecurityTeam HTTP
```

This requires:
1. **Engine**: New proxy endpoints that forward SecurityTeam requests
2. **Platform**: New engine-client functions + API routes + dashboard page

---

## Phase 0: Engine Security Proxy Endpoints

The engine's security client (Feature 14) already has `CheckOutbound`, `ScanInbound`, `HealthCheck`, `ListApprovedMessages`, `ConsumeMessage`. It needs new methods and endpoints for dashboard use:

### New Engine Endpoints

| Method | Path | Forwards To | Purpose |
|--------|------|-------------|---------|
| `GET` | `/api/security/queue/pending` | SecurityTeam `GET /queue/pending` | List pending approval items |
| `GET` | `/api/security/queue/:id` | SecurityTeam `GET /queue/:id` | Get item by ID |
| `POST` | `/api/security/queue/:id/resolve` | SecurityTeam `POST /queue/:id/resolve` | Approve/reject |
| `POST` | `/api/security/trigger-scan` | SecurityTeam `POST /trigger-scan` | Manual audit trigger |
| `GET` | `/api/security/status` | SecurityTeam `GET /status` | SecurityTeam service status |

These are thin proxies — the engine receives the request, forwards to SecurityTeam via its existing HTTP client, and returns the response.

### New Security Client Methods

- `GetPendingQueue(ctx) → PendingQueueResponse`
- `GetQueueItem(ctx, id) → QueueItemResponse`
- `ResolveQueueItem(ctx, id, decision, reviewedBy) → ResolveResponse`
- `TriggerScan(ctx, scanType, auditName) → TriggerResponse`
- `GetSecurityStatus(ctx) → StatusResponse`

---

## Phase 1: Platform Engine Client Functions

Add to `src/lib/engine-client.ts`:

- `getSecurityQueuePending(subdomain, apiKey) → items[]`
- `getSecurityQueueItem(subdomain, apiKey, id) → item`
- `resolveSecurityQueueItem(subdomain, apiKey, id, decision, reviewedBy) → result`
- `triggerSecurityScan(subdomain, apiKey, type, auditName?) → result`
- `getSecurityServiceStatus(subdomain, apiKey) → status`

These follow the existing engine-client pattern: fetch with bearer auth, 10s timeout, return null on error.

---

## Phase 2: Platform API Routes

New routes in `src/app/api/engine/security/`:

| Route | Method | Handler |
|-------|--------|---------|
| `/api/engine/security/queue` | GET | List pending queue |
| `/api/engine/security/queue/[id]` | GET | Get queue item |
| `/api/engine/security/queue/[id]/resolve` | POST | Approve/reject |
| `/api/engine/security/trigger-scan` | POST | Trigger audit |
| `/api/engine/security/status` | GET | SecurityTeam status |

All routes use `requireAdmin()` instead of `resolveInstance()` — security is admin-only. But they still need the instance to get the engine subdomain/apiKey.

---

## Phase 3: Dashboard UI

### 3.1: Navigation Tab
Add "Security" tab to `dashboard-nav.tsx`:
```
{ label: "Security", href: "/dashboard/security", requiresRunning: true, adminOnly: true }
```

### 3.2: Security Page
New page at `src/app/(protected)/dashboard/security/page.tsx` (server component):

**Layout (4 sections):**
1. **Status Card** — SecurityTeam health, circuit breaker, last check
2. **Approval Queue** — Pending items with approve/reject actions (client component)
3. **Audit Triggers & Results** — Buttons + latest results (client component)
4. **Recent Events Feed** — List of recent blocks/approvals (from queue resolved items)

### 3.3: Client Components
- `security-status.tsx` — Status card (server component, no interactivity needed)
- `approval-queue.tsx` — Queue list with approve/reject buttons (client component)
- `audit-panel.tsx` — Trigger buttons + results display (client component)

---

## Phase -1: Constitutional Compliance

| Principle | Assessment |
|-----------|-----------|
| Data Sacred | **Compliant** — security data is operational metadata, not tenant data |
| Security | **Compliant** — admin-only access, no SecurityTeam credentials in browser |
| Simple Over Clever | **Compliant** — server components by default, client only for interactive elements |
| Owner's Time | **Compliant** — dashboard replaces manual API/log checking |
| Test-First | **Enforced** — TDD per constitution |

---

## File Inventory

### Engine (overnightdesk-engine) — New/Modified
- `internal/security/client.go` — Add 5 new proxy methods
- `internal/security/types.go` — Add response types for pending/resolve/trigger/status
- `internal/api/security.go` — New file: 5 proxy endpoint handlers
- `internal/api/server.go` — Register new `/api/security/*` routes
- `internal/security/client_test.go` — Tests for new methods

### Platform (overnightdesk) — New/Modified
- `src/lib/engine-client.ts` — Add 5 security functions
- `src/app/api/engine/security/queue/route.ts` — GET pending queue
- `src/app/api/engine/security/queue/[id]/route.ts` — GET queue item
- `src/app/api/engine/security/queue/[id]/resolve/route.ts` — POST resolve
- `src/app/api/engine/security/trigger-scan/route.ts` — POST trigger
- `src/app/api/engine/security/status/route.ts` — GET status
- `src/app/(protected)/dashboard/security/page.tsx` — Main security page
- `src/app/(protected)/dashboard/security/approval-queue.tsx` — Queue client component
- `src/app/(protected)/dashboard/security/audit-panel.tsx` — Audit trigger client component
- `src/app/(protected)/dashboard/dashboard-nav.tsx` — Add Security tab
