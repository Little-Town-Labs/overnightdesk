# Implementation Plan — Feature 10: Usage Metrics & Reporting

## Executive Summary

Add daily usage collection from tenant engines, customer usage display on the dashboard, and admin business metrics. The usage_metric table already exists in the schema. The main work is: a Vercel Cron route for daily collection, a usage display on the customer dashboard, and an admin metrics page.

**Estimated Effort:** 8 hours
**Risk Level:** Low — straightforward CRUD over existing schema + engine API

---

## Architecture Overview

```
Vercel Cron (daily at 02:00 UTC)
  → POST /api/cron/usage-collection (bearer secret auth)
    → For each running instance: GET /api/jobs + /api/conversations
    → Count today's jobs and conversations
    → Upsert into usage_metric table

Customer Dashboard
  → /dashboard/usage → usage chart/table (last 30 days)
  → Data from platform DB (usage_metric table)

Admin Dashboard
  → /dashboard/admin/metrics → business metrics
  → /api/admin/metrics → aggregate platform data
```

### New Files

```
src/lib/usage-collection.ts           ← Collection logic
src/app/api/cron/usage-collection/route.ts ← Vercel Cron endpoint
src/app/api/admin/metrics/route.ts    ← Admin metrics API
src/app/(protected)/dashboard/usage/
├── page.tsx                          ← Customer usage page
└── usage-table.tsx                   ← Usage data display
src/app/(protected)/dashboard/admin/
└── metrics/
    ├── page.tsx                      ← Admin metrics page
    └── metrics-cards.tsx             ← Metric display cards
```

---

## Technical Decisions

### Decision 1: Usage Data Source

**Options:** Engine /api/jobs count, engine /api/status, custom engine endpoint
**Chosen:** Engine /api/jobs with date filtering + /api/conversations count
**Rationale:** Jobs endpoint already returns all jobs with timestamps. Count jobs created today. Conversations endpoint returns conversation list. No new engine endpoint needed.

### Decision 2: Collection Frequency

**Options:** Real-time per-request, hourly, daily
**Chosen:** Daily at 02:00 UTC
**Rationale:** Usage metrics are viewed as daily aggregates. Collecting once per day minimizes engine API load. 02:00 UTC is low-traffic. Can collect for "yesterday" to get complete day data.

### Decision 3: Customer Usage Display

**Options:** Chart library (recharts), simple HTML table, ASCII-style bars
**Chosen:** Simple HTML table with inline bar visualization
**Rationale:** No new dependencies (constitution: simple over clever). A table with small inline bars (CSS width%) gives visual trends without a chart library. Can upgrade to recharts later if needed.

### Decision 4: Admin Metrics Calculation

**Options:** Pre-aggregated materialized view, on-demand calculation, background job
**Chosen:** On-demand calculation from existing tables
**Rationale:** At current scale (< 100 tenants), querying subscription/instance/usage_metric tables directly is fast enough. No pre-aggregation complexity needed.

---

## Schema Changes

None. The `usage_metric` table already exists with the right schema:
- instanceId, metricDate, claudeCalls, toolExecutions
- Unique constraint on (instanceId, metricDate)

---

## Implementation Phases

### Phase 1: Collection + Customer Display (4 hours)
1. Usage collection logic (src/lib/usage-collection.ts)
2. Cron route (POST /api/cron/usage-collection)
3. Add to vercel.json cron config
4. Customer usage page + table component
5. Add "Usage" tab to dashboard nav
6. Tests for all

### Phase 2: Admin Metrics + Quality (4 hours)
1. Admin metrics API (/api/admin/metrics)
2. Admin metrics dashboard page
3. Code review + build verification
4. Tests

---

## Security Considerations

1. **Cron route:** Same CRON_SECRET pattern as health check
2. **Customer usage:** Scoped to own instance (via session → instance → usage_metric)
3. **Admin metrics:** isAdmin() check
4. **No tenant content:** Only counts, never conversation content

---

## Constitutional Compliance

- [x] Data Sacred: Only counts collected, no conversation content
- [x] Security: Cron authenticated, customer data scoped, admin protected
- [x] Simple Over Clever: HTML table, no chart library
- [x] Test-First: TDD for all implementation
