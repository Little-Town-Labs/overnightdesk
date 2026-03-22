# Task Breakdown — Feature 9: Fleet Monitoring

## Summary
- **Total Tasks:** 14
- **Phases:** 3
- **Total Effort:** 12 hours

---

## Phase 1: Health Check Core

### Task 1.1: Schema Migration — Tests
**Status:** 🟡 Ready
**Effort:** 0.25 hours
Write test verifying consecutiveHealthFailures column exists on instance table.

### Task 1.2: Schema Migration — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 0.25 hours
Add consecutiveHealthFailures integer column (default 0) to instance table. Generate and apply migration.

### Task 1.3: Health Check Logic — Tests
**Status:** 🟡 Ready
**Effort:** 1 hour
**Parallel with:** 1.1
Tests for src/lib/health-check.ts:
- checkInstanceHealth(instance) → calls engine healthz, returns pass/fail
- runFleetHealthCheck() → iterates all running instances, updates DB, triggers notifications
- Test: successful check resets failure counter and updates lastHealthCheck
- Test: failed check increments counter and logs fleet event
- Test: 3 consecutive failures triggers notification
- Test: recovery after failures triggers recovery notification
- Test: skips non-running instances

### Task 1.4: Health Check Logic — Implementation
**Status:** 🔴 Blocked by 1.2, 1.3
**Effort:** 1 hour
Implement health-check.ts with checkInstanceHealth() and runFleetHealthCheck().

### Task 1.5: Owner Notifications — Tests
**Status:** 🟡 Ready
**Effort:** 0.5 hours
**Parallel with:** 1.1, 1.3
Tests for src/lib/owner-notifications.ts:
- sendOwnerAlert(message) → POST to Telegram API
- Test: sends correct payload to Telegram
- Test: handles missing env vars gracefully
- Test: handles Telegram API failure without throwing

### Task 1.6: Owner Notifications — Implementation
**Status:** 🔴 Blocked by 1.5
**Effort:** 0.5 hours
Implement Telegram notification via direct HTTP POST to api.telegram.org.

### Task 1.7: Cron Route — Tests
**Status:** 🔴 Blocked by 1.4
**Effort:** 0.5 hours
Tests for POST /api/cron/health-check:
- 401 without CRON_SECRET
- 200 with valid secret, calls runFleetHealthCheck
- Returns summary of results

### Task 1.8: Cron Route — Implementation
**Status:** 🔴 Blocked by 1.7
**Effort:** 0.5 hours
Create cron route with bearer auth via CRON_SECRET. Add vercel.json cron config.

---

## Phase 2: Admin Dashboard

### Task 2.1: Admin Fleet API — Tests
**Status:** 🔴 Blocked by 1.4
**Effort:** 0.5 hours
**Parallel with:** 1.7
Tests for:
- GET /api/admin/fleet/health → 403 for non-admin, 200 with instance health data
- GET /api/admin/fleet/events → 403, 200 with events, pagination, filtering

### Task 2.2: Admin Fleet API — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 1 hour
Create admin API routes with isAdmin check. Fleet health returns all instances with status, lastHealthCheck, consecutiveHealthFailures. Fleet events returns paginated events with optional filters.

### Task 2.3: Fleet Dashboard Page — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours
Tests for fleet health table and events list components.

### Task 2.4: Fleet Dashboard Page — Implementation
**Status:** 🔴 Blocked by 2.3
**Effort:** 1.5 hours
Admin fleet dashboard with:
- Instance health table (color-coded: green/amber/red)
- Fleet events list with filtering
- Admin-only access via isAdmin check in server component
- Add admin link to dashboard nav (only for admins)

---

## Phase 3: Dead-Man's Switch + Quality

### Task 3.1: Dead-Man's Switch Script
**Status:** 🔴 Blocked by 1.8
**Effort:** 1 hour
Shell script for Oracle Cloud host-level cron:
- Queries platform DB for latest fleet_event timestamp
- If older than 6 hours → sends Telegram alert via direct curl
- Independent of the application

### Task 3.2: Build & Test Verification
**Status:** 🔴 Blocked by 2.4, 3.1
**Effort:** 0.5 hours

### Task 3.3: Code + Security Review
**Status:** 🔴 Blocked by 3.2
**Effort:** 0.5 hours

---

## Critical Path
1.1 → 1.2 → 1.4 → 1.7 → 1.8 → 2.1 → 2.2 → 2.3 → 2.4 → 3.2 → 3.3
