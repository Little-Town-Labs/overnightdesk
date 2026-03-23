# Feature 15: Task Breakdown

**Branch:** 15-security-dashboard
**Plan:** plan.md

---

## Story 1: Engine Security Proxy Endpoints

### Task 1.1: Engine proxy client methods + endpoint tests (RED)
**Status:** 🟡 Ready
**Dependencies:** None
**Repo:** overnightdesk-engine

Write tests for:
- 5 new security client methods (GetPendingQueue, GetQueueItem, ResolveQueueItem, TriggerScan, GetSecurityStatus)
- 5 new API endpoint handlers
- Auth required on all endpoints
- Returns 503 when security client not configured
- JSON pass-through from SecurityTeam

### Task 1.2: Engine proxy client methods + endpoints (GREEN)
**Status:** 🔴 Blocked
**Dependencies:** Task 1.1
**Repo:** overnightdesk-engine

Implement:
- New methods on security.Client
- New types in security/types.go
- New file: api/security.go with 5 handlers
- Register routes in api/server.go

---

## Story 2: Platform Engine Client + API Routes

### Task 2.1: Platform engine-client security functions tests (RED)
**Status:** 🔴 Blocked
**Dependencies:** Task 1.2
**Repo:** overnightdesk

Write tests for:
- 5 new engine-client functions
- Contract tests matching engine response shapes

### Task 2.2: Platform engine-client security functions (GREEN)
**Status:** 🔴 Blocked
**Dependencies:** Task 2.1
**Repo:** overnightdesk

Add functions to src/lib/engine-client.ts.

### Task 2.3: Platform API routes tests (RED)
**Status:** 🔴 Blocked
**Dependencies:** Task 2.2
**Repo:** overnightdesk

Write tests for:
- 5 API routes (admin auth, happy path, error cases)
- Non-admin gets 403
- Instance not running gets 404

### Task 2.4: Platform API routes (GREEN)
**Status:** 🔴 Blocked
**Dependencies:** Task 2.3
**Repo:** overnightdesk

Create route files in src/app/api/engine/security/.

---

## Story 3: Dashboard Security Page

### Task 3.1: Security navigation tab
**Status:** 🟡 Ready
**Dependencies:** None
**Repo:** overnightdesk

Add "Security" tab to dashboard-nav.tsx with adminOnly: true, requiresRunning: true.

### Task 3.2: Security page with status card
**Status:** 🔴 Blocked
**Dependencies:** Task 2.4
**Repo:** overnightdesk

Create server component page at dashboard/security/page.tsx:
- Fetch security status from engine via /api/engine/security/status
- Display status card (reachable, circuit breaker, uptime, pending count)
- Show warning banner when SecurityTeam unreachable

### Task 3.3: Approval queue component
**Status:** 🔴 Blocked
**Dependencies:** Task 2.4
**Repo:** overnightdesk

Create client component dashboard/security/approval-queue.tsx:
- Fetch pending items from /api/engine/security/queue
- Display list with source, sender, subject, preview, signals, expiration
- Approve/reject buttons with confirmation
- Refresh after action
- Handle 409 (already resolved) gracefully

### Task 3.4: Audit trigger + results panel
**Status:** 🔴 Blocked
**Dependencies:** Task 2.4
**Repo:** overnightdesk

Create client component dashboard/security/audit-panel.tsx:
- Three trigger buttons (nightly, weekly, monthly)
- Loading state during scan
- Display results after completion
- Error handling for timeout/failure

---

## Story 4: Integration Testing

### Task 4.1: End-to-end flow verification
**Status:** 🔴 Blocked
**Dependencies:** Task 3.3, Task 3.4
**Repo:** overnightdesk-engine + overnightdesk

Verify:
- Engine proxy endpoints work with mock SecurityTeam
- Platform routes correctly proxy through engine
- Dashboard renders with mock data
- Admin access control enforced at all levels

---

## Summary

| Story | Tasks | Repo |
|-------|-------|------|
| 1. Engine proxy | 2 | overnightdesk-engine |
| 2. Platform client + routes | 4 | overnightdesk |
| 3. Dashboard UI | 4 | overnightdesk |
| 4. Integration | 1 | both |
| **Total** | **11** | |

### Critical Path
```
1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 2.4 → 3.2, 3.3, 3.4 → 4.1
                                        3.1 (parallel)
```
