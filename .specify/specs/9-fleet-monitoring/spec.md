# Feature 9: Fleet Monitoring Integration

## Overview

Fleet Monitoring connects the platform to the health state of every tenant instance. The owner needs automated health checks that detect when instances are unhealthy, a dead-man's switch that catches when the monitoring system itself fails, and Telegram notifications for incidents — all without manual intervention.

**Business Value:** Customers are paying for 24/7 uptime. If an instance goes down overnight and nobody notices until the customer complains, trust is destroyed. Proactive monitoring lets the owner fix problems before customers notice, and fleet events provide an audit trail for incident response.

---

## User Stories

### User Story 1: Automated Health Checks
**As the** platform owner
**I want** every running instance to be health-checked on a regular interval
**So that** I am alerted when an instance becomes unhealthy before the customer notices

**Acceptance Criteria:**
- [ ] Each running instance is health-checked at a configurable interval (default: 30 minutes)
- [ ] Health check calls the engine's health endpoint and records the result
- [ ] Successful checks update the instance's last health check timestamp
- [ ] Failed checks are logged as fleet events with the failure reason
- [ ] Three consecutive failures trigger an alert to the owner
- [ ] Health check results are visible in the admin/owner view

**Priority:** High

---

### User Story 2: Owner Incident Notifications
**As the** platform owner
**I want** to receive Telegram notifications when instances have problems
**So that** I can respond quickly to incidents without constantly watching a dashboard

**Acceptance Criteria:**
- [ ] Owner receives a Telegram message when an instance fails 3 consecutive health checks
- [ ] Notification includes: tenant ID, instance status, failure reason, and timestamp
- [ ] Owner receives a recovery notification when a previously failing instance passes a health check
- [ ] Notifications are sent to a configurable Telegram chat (bot token + chat ID via environment variables)
- [ ] Notification failures are logged but do not block health check processing

**Priority:** High

---

### User Story 3: Dead-Man's Switch
**As the** platform owner
**I want** an independent watchdog that alerts me if the health check system itself stops running
**So that** I know if monitoring has silently failed

**Acceptance Criteria:**
- [ ] A host-level scheduled task runs independently of the application
- [ ] If no health check has been recorded for any instance in the last 6 hours, the watchdog fires an alert
- [ ] The alert is sent via a separate notification channel (direct API call, not through the application)
- [ ] The watchdog check is simple and has minimal dependencies

**Priority:** Medium

---

### User Story 4: Fleet Event Dashboard
**As the** platform owner
**I want** to view fleet health status and event history on the dashboard
**So that** I can assess overall platform health at a glance

**Acceptance Criteria:**
- [ ] An admin-only page shows all running instances with their health status
- [ ] Each instance shows: status, last health check time, consecutive failures count
- [ ] Fleet events are listed in reverse chronological order with filtering by event type
- [ ] Color-coded health indicators: green (healthy), amber (1-2 failures), red (3+ failures)
- [ ] The page is only accessible to admin users (ADMIN_EMAILS)

**Priority:** Medium

---

### User Story 5: Fleet Event Ingestion
**As the** platform
**I want** health check results and operational events to be stored in the fleet_events table
**So that** there is an audit trail of instance health over time

**Acceptance Criteria:**
- [ ] Health check results (success and failure) are recorded as fleet events
- [ ] Events include: instance ID, event type, details (JSON), timestamp
- [ ] Event types include: health_check_pass, health_check_fail, instance_unhealthy, instance_recovered
- [ ] Events are queryable by instance, event type, and time range
- [ ] Old events are not automatically purged (retained for operational history)

**Priority:** High

---

## Functional Requirements

### FR-1: Health Check Endpoint
A scheduled process calls each running instance's health endpoint at the configured interval. The health check verifies the engine is responding and records the result. If the engine is unreachable or returns an error, the check is recorded as a failure.

### FR-2: Consecutive Failure Tracking
The system tracks consecutive health check failures per instance. After 3 consecutive failures, the instance is considered "unhealthy" and an alert is triggered. The counter resets when a health check succeeds.

### FR-3: Owner Notification Service
A notification service sends Telegram messages to the owner for incidents (instance unhealthy) and recoveries (instance healthy again). The service uses a platform-owned Telegram bot (separate from customer bots). Configuration via environment variables.

### FR-4: Dead-Man's Switch
A host-level scheduled task (independent of the application) checks whether any health check has been recorded in the last 6 hours. If not, it sends an alert via a direct API call to Telegram, bypassing the application entirely.

### FR-5: Fleet Health API
An admin-only API endpoint returns fleet health data: all instances with their current health status, consecutive failure counts, and last health check times.

### FR-6: Fleet Events API
An admin-only API endpoint returns fleet events with filtering (by instance, event type, time range) and pagination.

### FR-7: Fleet Dashboard Page
An admin-only dashboard page displays fleet health overview and event history. Only accessible to users whose email is in the ADMIN_EMAILS list.

### FR-8: Health Check Scheduling
Health checks run on a configurable interval. The scheduler must handle instances being added or removed between runs. Checks for different instances should not block each other.

---

## Non-Functional Requirements

### Performance
- Health checks for all instances complete within 5 minutes (even with 100 instances)
- Health checks run concurrently, not sequentially
- Fleet dashboard loads in < 2 seconds

### Reliability
- Health check scheduler must be resilient to individual instance failures
- Notification failures must not prevent health check processing
- Dead-man's switch must be independent of the application (survives app crashes)

### Security
- Fleet dashboard is admin-only (ADMIN_EMAILS check)
- Fleet API endpoints are admin-only
- Owner Telegram bot token stored in environment variables, never in database

---

## Edge Cases & Error Handling

### No Running Instances
- Health check scheduler runs but finds no instances to check — logs and exits cleanly

### All Instances Unhealthy
- Each instance generates its own alert — no "flood protection" needed at current scale
- If all instances fail simultaneously, it likely indicates a host-level issue — the alerts make this obvious

### Notification Service Down
- If Telegram API is unreachable, log the notification failure as a fleet event
- Health checks continue regardless of notification status
- Dead-man's switch uses a separate Telegram call, so it alerts even if the app's notification service is broken

### Instance Removed During Health Check
- If an instance is deprovisioned between scheduling and execution, skip it gracefully

### Health Check Timeout
- Each health check has a 10-second timeout — matches existing engine-client timeout
- Timeout counts as a failure

---

## Success Metrics

- **Detection:** 95%+ of instance failures detected within 1 health check interval (30 minutes)
- **Notification:** Owner alerted within 5 minutes of an instance becoming unhealthy
- **Reliability:** Dead-man's switch has fired 0 false positives and caught 100% of monitoring outages
- **Coverage:** 100% of running instances are health-checked
