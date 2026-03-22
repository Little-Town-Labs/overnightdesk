# Feature 10: Usage Metrics & Reporting

## Overview

Usage Metrics collects daily operational data from tenant instances (Claude calls, tool executions) and presents usage trends on the customer dashboard and platform-level metrics for the owner. This data helps customers understand their assistant's activity and helps the owner make business decisions (conversion rates, churn risk, provisioning success).

**Business Value:** Customers who see usage data feel confident their assistant is working. The owner needs business metrics to understand growth, identify at-risk accounts (low usage = churn risk), and measure platform health.

---

## User Stories

### User Story 1: Customer Usage Dashboard
**As a** subscriber
**I want** to see how much my AI assistant has been used over time
**So that** I can verify it's active and assess the value I'm getting

**Acceptance Criteria:**
- [ ] Dashboard shows daily Claude call count for the last 30 days
- [ ] Dashboard shows daily tool execution count for the last 30 days
- [ ] Data is displayed as a simple chart or table with date, calls, and executions
- [ ] Current day's data is shown as "in progress" (partial)
- [ ] Empty state is shown when no usage data exists yet

**Priority:** High

---

### User Story 2: Usage Data Collection
**As the** platform
**I want** to collect daily usage statistics from each running tenant instance
**So that** the data is available for customer dashboards and business reporting

**Acceptance Criteria:**
- [ ] Usage data is collected once per day for each running instance
- [ ] Data includes: Claude call count and tool execution count for the day
- [ ] Data is sourced from the engine's job and conversation records
- [ ] Collection runs automatically without manual intervention
- [ ] Failed collection for one instance does not block others
- [ ] Duplicate collection for the same date is prevented (upsert behavior)

**Priority:** High

---

### User Story 3: Platform Business Metrics (Owner)
**As the** platform owner
**I want** to see aggregate business metrics across all tenants
**So that** I can make informed decisions about growth, pricing, and customer health

**Acceptance Criteria:**
- [ ] Admin dashboard shows: total active subscribers, total instances running
- [ ] Admin dashboard shows: average daily Claude calls per tenant
- [ ] Admin dashboard shows: tenants with zero usage in the last 7 days (churn risk)
- [ ] Admin dashboard shows: provisioning success rate (successful / total attempts)
- [ ] Metrics are calculated on page load from existing data (no pre-aggregation needed at current scale)
- [ ] Page is admin-only (ADMIN_EMAILS)

**Priority:** Medium

---

### User Story 4: Usage History for a Tenant (Owner)
**As the** platform owner
**I want** to view usage history for any specific tenant
**So that** I can investigate issues or understand individual customer patterns

**Acceptance Criteria:**
- [ ] Admin can select a tenant and view their usage metrics over time
- [ ] Data includes daily Claude calls and tool executions
- [ ] Date range is configurable (last 7, 30, 90 days)
- [ ] This is accessible from the fleet dashboard (Feature 9)

**Priority:** Low

---

## Functional Requirements

### FR-1: Daily Usage Collection
A scheduled process runs daily and queries each running instance's engine API for job and conversation counts. The results are stored in the platform's usage_metrics table (already exists in schema). Collection handles failures gracefully — one instance failing does not affect others.

### FR-2: Customer Usage Display
The customer dashboard's overview page (or a dedicated "Usage" tab) shows the subscriber's own usage data. Data is read from the platform's usage_metrics table. Displays last 30 days by default.

### FR-3: Platform Metrics API
An admin-only API endpoint returns aggregate platform metrics: subscriber count, instance count, average usage, low-usage tenants, provisioning success rate. Calculated from existing tables (subscription, instance, usage_metric, fleet_event).

### FR-4: Platform Metrics Dashboard
An admin-only dashboard page displays the business metrics from FR-3. Simple cards with numbers, plus a list of at-risk tenants (zero usage in 7 days).

### FR-5: Tenant Usage API
An admin-only API endpoint returns usage metrics for a specific tenant, with date range filtering and pagination.

---

## Non-Functional Requirements

### Performance
- Daily collection for 100 instances completes within 10 minutes
- Customer usage dashboard loads in < 1 second
- Platform metrics page loads in < 2 seconds (aggregate queries)

### Security
- Customers can only see their own usage data
- Platform metrics are admin-only
- Usage collection does not access tenant conversation content — only counts

### Reliability
- Collection failures for individual instances are logged but do not block the batch
- Missing days in usage data are shown as gaps, not zeros (to distinguish "no data" from "zero usage")

---

## Edge Cases & Error Handling

### New Instance (No History)
- Customer sees "No usage data yet" message
- Data starts appearing after the first daily collection

### Instance Not Running
- Collection skips instances that aren't in "running" status
- Historical data is preserved even after instance is stopped

### Engine API Unreachable During Collection
- Log the failure, skip the instance, try again next collection cycle
- Do not insert a zero-usage row (that would falsely indicate "no activity")

### Duplicate Collection
- If collection runs twice on the same day for the same instance, the second run updates the existing row (upsert), not creates a duplicate

### Date Boundaries
- Usage counts are based on UTC dates to avoid timezone ambiguity
- "Today" in the customer dashboard reflects the current UTC date

---

## Success Metrics

- **Data Availability:** 95%+ of running instances have usage data within 24 hours of collection
- **Customer Engagement:** 30%+ of subscribers view their usage dashboard within the first month
- **Churn Detection:** Owner can identify at-risk accounts (zero usage for 7+ days) before they cancel
