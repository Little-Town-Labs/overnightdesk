# Feature 15: Platform Security Dashboard

**Branch:** 15-security-dashboard
**Status:** Implemented
**Created:** 2026-03-23
**Author:** Claude (spec-kit specify)

---

## Overview

The SecurityTeam HTTP sidecar (Feature 13) and the engine integration (Feature 14) are complete. The engine now screens all inbound and outbound content, blocks secrets/PII, and reports security status. However, **none of this is visible to the operator**.

This feature adds a Security tab to the admin dashboard so the platform operator (Agent Zero / Gary) can:
- See at a glance whether security screening is active and healthy
- View recent security blocks and their reasons
- Review and act on items in the approval queue
- Manually trigger security scans and audits
- See audit results from nightly/weekly/monthly checks

**Business Value:** Security is invisible without observability. The operator needs to trust that the system is working, investigate blocked content, and approve pending items — all from the dashboard they already use daily.

---

## User Stories

### User Story 1: Security Status Overview
**As a** platform operator
**I want** to see the current security status at a glance on my dashboard
**So that** I know whether security screening is active and healthy without checking logs

**Acceptance Criteria:**
- [ ] The Security tab shows whether the SecurityTeam sidecar is reachable
- [ ] The tab shows the circuit breaker state (closed/open/half-open)
- [ ] The tab shows the last successful health check timestamp
- [ ] The tab shows the count of pending approval items
- [ ] If SecurityTeam is unreachable, a clear warning is displayed

**Priority:** High

### User Story 2: Recent Security Events
**As a** platform operator
**I want** to see a list of recently blocked or flagged content
**So that** I can investigate false positives and understand what security is catching

**Acceptance Criteria:**
- [ ] A list of recent security events is displayed (blocks, approvals, rejections)
- [ ] Each event shows: timestamp, source, type (inbound/outbound), reason, status
- [ ] Events are sorted by most recent first
- [ ] The operator can see at least the last 50 events
- [ ] Blocked outbound content shows what was detected (findings list)

**Priority:** High

### User Story 3: Approval Queue Management
**As a** platform operator
**I want** to view and act on pending approval items from the dashboard
**So that** I can approve or reject flagged content without switching to Telegram

**Acceptance Criteria:**
- [ ] Pending approval items are listed with source, sender, subject, and content preview
- [ ] The operator can approve or reject each item directly from the dashboard
- [ ] The queue shows the count of pending items in the tab badge or header
- [ ] Resolved items show their decision (approved/rejected) and who resolved them
- [ ] Items approaching expiration (< 2 hours remaining) are visually highlighted

**Priority:** High

### User Story 4: Manual Security Triggers
**As a** platform operator
**I want** to manually trigger security scans and audits from the dashboard
**So that** I can run checks on demand without using the API directly

**Acceptance Criteria:**
- [ ] A button triggers a nightly code review scan
- [ ] A button triggers a weekly gateway check
- [ ] A button triggers a monthly memory scan
- [ ] Each trigger shows a loading state while running
- [ ] Results are displayed after the scan completes
- [ ] The operator receives confirmation of success or failure

**Priority:** Medium

### User Story 5: Audit Results Display
**As a** platform operator
**I want** to see the results of automated security audits
**So that** I can review findings without checking logs or the database directly

**Acceptance Criteria:**
- [ ] The most recent audit result for each type (nightly, weekly, monthly) is displayed
- [ ] Each result shows: audit name, timestamp, pass/fail status, findings count
- [ ] The operator can expand a result to see detailed findings
- [ ] If no audits have run, the display says so clearly

**Priority:** Medium

### User Story 6: Security Tab Access Control
**As a** platform operator
**I want** the Security tab to be visible only to admin users
**So that** regular customers cannot see or interact with security internals

**Acceptance Criteria:**
- [ ] The Security tab appears only for admin users in the dashboard navigation
- [ ] Non-admin users who navigate to the security URL see an access denied message
- [ ] API routes for security data require admin authentication
- [ ] The security page works on mobile (responsive layout)

**Priority:** High

---

## Functional Requirements

### FR-1: Security Tab in Navigation
The dashboard navigation MUST include a "Security" tab visible only to admin users. The tab MUST show a count badge when pending approval items exist.

### FR-2: Security Status Card
The security page MUST display a status card showing:
- SecurityTeam reachability (from engine's `/api/status` → `security` field)
- Circuit breaker state
- Last health check timestamp
- Service uptime

### FR-3: Approval Queue Display
The security page MUST display all pending approval items from the SecurityTeam's `/queue/pending` endpoint. Each item MUST show source, sender, subject, content preview (truncated to 300 chars), injection signals, redaction count, and time until expiration.

### FR-4: Approve/Reject from Dashboard
The operator MUST be able to approve or reject pending items directly from the dashboard. The decision MUST be sent to SecurityTeam's `/queue/:id/resolve` endpoint with the operator's identity as `reviewedBy`.

### FR-5: Security Event Feed
The security page MUST display a feed of recent security events. Events include:
- Outbound blocks (with findings)
- Inbound blocks (with injection signals)
- Approval resolutions (with decision and reviewer)
- Audit completions (with result summary)

### FR-6: Manual Audit Triggers
The security page MUST provide buttons to trigger each audit type via the SecurityTeam's `/trigger-scan` endpoint. Each trigger MUST show loading state and display results when complete.

### FR-7: Audit Results Display
The security page MUST display the most recent result for each audit type (nightly code review, weekly gateway, monthly memory). Results MUST include timestamp, status, and expandable findings.

### FR-8: Proxy Routes (via Engine)
The platform MUST proxy security-related requests through the engine, which forwards to SecurityTeam. The chain is: browser → platform API route → engine proxy endpoint → SecurityTeam. The platform MUST NOT have direct access to SecurityTeam — the engine is the only gateway. This requires new engine proxy endpoints for queue and audit data.

### FR-9: Admin-Only Access
All security dashboard pages and API routes MUST verify admin status. Non-admin requests MUST receive a 403 Forbidden response.

### FR-10: Real-Time Pending Count
The Security tab badge MUST update the pending count when the page is active. Polling at a reasonable interval is acceptable.

---

## Non-Functional Requirements

### NFR-1: Performance
- Security status page MUST load within 2 seconds
- Approval queue MUST render within 1 second for up to 100 items
- Manual audit triggers MUST show results within 30 seconds (audits may take time)

### NFR-2: Reliability
- If SecurityTeam is unreachable, the dashboard MUST show a clear error state — not a blank page
- Failed API calls MUST show user-friendly error messages
- The dashboard MUST remain functional even if security data is unavailable

### NFR-3: Security
- SecurityTeam bearer token MUST never be sent to the browser
- All security API routes MUST go through server-side proxy
- Admin check MUST happen on the server, not the client

### NFR-4: Usability
- The security page MUST be responsive (mobile-friendly)
- Approval actions MUST have confirmation to prevent accidental clicks
- Color coding: green for healthy/approved, red for blocked/rejected, yellow for pending/warning

---

## Edge Cases & Error Handling

### EC-1: SecurityTeam Not Configured
Engine has no `SECURITY_URL` set. The security status field will show `configured: false`. Dashboard should display "Security screening not configured" with a helpful message rather than an error.

### EC-2: SecurityTeam Down
Engine reports `reachable: false` and `circuit_breaker: open`. Dashboard should show a warning banner: "Security service is temporarily unavailable. Outbound messages are being held."

### EC-3: Empty Approval Queue
No pending items. Dashboard should show "No pending approvals" with a check mark — not an empty table.

### EC-4: Expired Approval Items
Items that expire before the operator reviews them. The queue should filter these out (SecurityTeam handles expiration). If an item expires between page load and the operator clicking approve, the API returns 409 — handle gracefully.

### EC-5: Large Content in Queue Items
Queue items with very long content (up to 1MB). Dashboard should show a truncated preview (300 chars) with an expand option.

### EC-6: Concurrent Approvals
Operator approves via dashboard while someone else approves via Telegram. The second approval gets a 409 (already resolved). Dashboard should handle this gracefully and refresh the queue.

### EC-7: Audit Takes Long
Monthly memory scan may take 10+ seconds. The trigger button should show a spinner and not time out. If the request takes more than 30 seconds, show a message that the audit is still running.

---

## Success Metrics

- **100%** of security blocks visible in the dashboard within 1 page refresh
- **< 2s** page load time for the security tab
- **0** SecurityTeam credentials exposed to the browser
- Operator can resolve approval items **without leaving the dashboard**
- Admin-only access enforced at both navigation and API level

---

## Out of Scope

- Customer-facing security features (Feature 16)
- Custom security rules or configuration
- Real-time WebSocket updates (polling is sufficient at current scale)
- Historical analytics or charts (simple event list is sufficient)
- Email notifications for security events (Telegram handles this)
