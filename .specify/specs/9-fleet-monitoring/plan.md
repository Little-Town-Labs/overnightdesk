# Implementation Plan — Feature 9: Fleet Monitoring Integration

## Executive Summary

Add automated health checking, owner notifications, fleet event dashboard, and a dead-man's switch. The fleet_event table and instance.lastHealthCheck column already exist. The main new patterns are: Vercel Cron routes for scheduling, a Telegram notification service for the owner, and admin-only dashboard pages.

**Estimated Effort:** 12 hours
**Risk Level:** Medium — new scheduling pattern (Vercel Cron), external Telegram integration

---

## Architecture Overview

```
Vercel Cron (every 30 min)
  → POST /api/cron/health-check (bearer secret auth)
    → For each running instance: GET https://{subdomain}/healthz
    → Record fleet_event (pass/fail)
    → Update instance.lastHealthCheck
    → If 3+ consecutive failures → send Telegram notification

Host-level cron (every 6 hours)
  → Shell script: check last fleet_event timestamp
    → If stale → direct Telegram API call (bypasses app)

Admin Dashboard
  → /dashboard/admin/fleet → fleet health overview + event log
  → /api/admin/fleet/health → fleet health data
  → /api/admin/fleet/events → fleet event history
```

### New Files

```
src/lib/health-check.ts              ← Core health check logic
src/lib/owner-notifications.ts       ← Telegram notification service
src/app/api/cron/health-check/route.ts  ← Vercel Cron endpoint
src/app/api/admin/fleet/health/route.ts ← Admin fleet health API
src/app/api/admin/fleet/events/route.ts ← Admin fleet events API
src/app/(protected)/dashboard/admin/
├── fleet/
│   ├── page.tsx                     ← Fleet health dashboard
│   ├── fleet-health-table.tsx       ← Instance health table
│   └── fleet-events-list.tsx        ← Event history list
```

---

## Technical Decisions

### Decision 1: Health Check Scheduling via Vercel Cron

**Options:** Vercel Cron routes, external cron service, in-app setInterval
**Chosen:** Vercel Cron
**Rationale:** Native Next.js/Vercel integration, no external dependencies, free tier supports up to 2 cron jobs. Configure in vercel.json.
**Tradeoffs:** Limited to 1-minute minimum interval (30 min is fine). Cron route needs bearer secret to prevent unauthorized triggers.

### Decision 2: Consecutive Failure Tracking

**Options:** Add column to instance table, query fleet_events, in-memory state
**Chosen:** Add `consecutiveHealthFailures` integer column to instance table
**Rationale:** Simpler than querying events, persists across serverless invocations, single UPDATE per check. Fleet events still logged for audit trail.
**Migration:** One new column, small migration.

### Decision 3: Owner Telegram Notifications

**Options:** Telegram Bot API directly, notification service library, email instead
**Chosen:** Direct Telegram Bot API calls
**Rationale:** Simple HTTP POST to `api.telegram.org/bot{token}/sendMessage`. No library needed. Owner already uses Telegram (per constitution). Two env vars: `OWNER_TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_CHAT_ID`.

### Decision 4: Dead-Man's Switch

**Options:** Host-level cron + curl, Vercel Cron (second job), external monitoring service
**Chosen:** Host-level cron on Oracle Cloud server
**Rationale:** Must be independent of the app (constitution requirement). A simple shell script that queries the latest fleet_event timestamp and alerts if stale. Runs on the same Oracle VM as the provisioner.

### Decision 5: Admin Route Protection

**Options:** Middleware, per-route check, layout-level check
**Chosen:** Per-route isAdmin() check in API routes + server component check in pages
**Rationale:** Consistent with existing pattern (billing.ts isAdmin). No middleware complexity. Clear 403 response for non-admins.

---

## Schema Changes

### New Migration: Add consecutiveHealthFailures to instance

```sql
ALTER TABLE instance ADD COLUMN consecutive_health_failures integer NOT NULL DEFAULT 0;
```

---

## Implementation Phases

### Phase 1: Health Check Core (4 hours)
1. Schema migration (add consecutiveHealthFailures)
2. Health check logic (src/lib/health-check.ts)
3. Telegram notification service (src/lib/owner-notifications.ts)
4. Cron API route (POST /api/cron/health-check)
5. Vercel cron config (vercel.json)
6. Tests for all

### Phase 2: Admin API + Dashboard (4 hours)
1. Admin fleet health API (/api/admin/fleet/health)
2. Admin fleet events API (/api/admin/fleet/events)
3. Fleet health dashboard page + components
4. Add admin nav link to dashboard
5. Tests for all

### Phase 3: Dead-Man's Switch + Quality (4 hours)
1. Dead-man's switch shell script
2. Integration tests
3. Code review + security review
4. Build verification

---

## Security Considerations

1. **Cron route auth:** Protected by `CRON_SECRET` bearer token (Vercel sets this automatically for cron jobs)
2. **Admin routes:** isAdmin(email) check, returns 403 for non-admins
3. **Telegram bot token:** Environment variable only, never in database or client code
4. **Health check data:** Only checks if engine is reachable, no tenant data accessed

---

## Environment Variables (New)

```
CRON_SECRET=            # Auto-set by Vercel for cron authentication
OWNER_TELEGRAM_BOT_TOKEN=  # Platform owner's notification bot
OWNER_TELEGRAM_CHAT_ID=    # Chat ID to send notifications to
```

---

## Constitutional Compliance

- [x] Data Sacred: Health checks only hit /healthz, no tenant data
- [x] Security: Cron route authenticated, admin routes protected
- [x] Simple Over Clever: Direct Telegram API, no notification framework
- [x] Owner's Time: Automated monitoring replaces manual checking
- [x] Test-First: TDD for all implementation
