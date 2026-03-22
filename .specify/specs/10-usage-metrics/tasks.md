# Task Breakdown — Feature 10: Usage Metrics & Reporting

## Summary
- **Total Tasks:** 10
- **Phases:** 2
- **Total Effort:** 8 hours

---

## Phase 1: Collection + Customer Display

### Task 1.1: Usage Collection Logic — Tests
**Status:** 🟡 Ready
**Effort:** 0.75 hours
Tests for src/lib/usage-collection.ts:
- collectInstanceUsage(instance) → queries engine API, returns counts
- runDailyCollection() → iterates running instances, upserts usage_metric
- Test: counts jobs created today
- Test: counts conversations from today
- Test: upserts (update if exists for same date)
- Test: skips non-running instances
- Test: handles engine timeout gracefully

### Task 1.2: Usage Collection Logic — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 0.75 hours
Implement usage-collection.ts. Query engine /api/jobs and /api/conversations, count entries for current UTC date, upsert into usage_metric.

### Task 1.3: Usage Cron Route — Tests
**Status:** 🟡 Ready
**Effort:** 0.25 hours
**Parallel with:** 1.1
Tests for POST /api/cron/usage-collection:
- 401 without CRON_SECRET
- 200 with valid secret, calls runDailyCollection

### Task 1.4: Usage Cron Route — Implementation
**Status:** 🔴 Blocked by 1.2, 1.3
**Effort:** 0.25 hours
Create cron route with bearer auth. Add to vercel.json cron config.

### Task 1.5: Customer Usage Page — Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 0.5 hours
Tests for usage table component:
- Renders usage data rows
- Shows empty state
- Shows "in progress" for today

### Task 1.6: Customer Usage Page — Implementation
**Status:** 🔴 Blocked by 1.5
**Effort:** 1.5 hours
Server page loads usage_metric for user's instance (last 30 days). Client table component with inline bar visualization. Add "Usage" tab to dashboard nav.

---

## Phase 2: Admin Metrics + Quality

### Task 2.1: Admin Metrics API — Tests
**Status:** 🔴 Blocked by 1.4
**Effort:** 0.5 hours
Tests for GET /api/admin/metrics:
- 403 for non-admin
- 200 with aggregate metrics (subscriber count, instance count, avg usage, at-risk tenants)

### Task 2.2: Admin Metrics API + Dashboard — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 1.5 hours
Admin API calculates metrics from subscription/instance/usage_metric tables. Dashboard page with metric cards + at-risk tenant list.

### Task 2.3: Build & Test Verification
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours

### Task 2.4: Code Review
**Status:** 🔴 Blocked by 2.3
**Effort:** 0.5 hours

---

## Critical Path
1.1 → 1.2 → 1.4 → 1.5 → 1.6 → 2.1 → 2.2 → 2.3 → 2.4
