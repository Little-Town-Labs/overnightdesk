# Feature 7: Customer Dashboard

## Overview

The Customer Dashboard is the primary interface through which customers manage their AI assistant. It extends the existing minimal dashboard (which shows instance status, subscription info, and Claude Code onboarding) into a full management console. Customers can configure their assistant's heartbeat schedule, create and manage jobs, view activity logs, adjust account settings, and restart their instance — all without technical knowledge.

**Business Value:** The dashboard is the product surface that drives retention. Customers who actively configure heartbeats, create jobs, and monitor activity are engaged customers who renew subscriptions. Self-service account management reduces support load on the owner.

---

## User Stories

### User Story 1: View Instance Overview
**As a** subscriber
**I want** to see a comprehensive overview of my instance on the dashboard home
**So that** I can quickly assess whether my AI assistant is healthy and working

**Acceptance Criteria:**
- [ ] Dashboard displays instance status (running, stopped, error, etc.) with color-coded indicator
- [ ] Dashboard shows Claude Code auth status (connected, expired, not configured)
- [ ] Dashboard shows uptime, queue status, and last heartbeat time from engine status endpoint
- [ ] Dashboard shows subscription plan, status, and next billing date
- [ ] All status data refreshes when user navigates to the dashboard (server-rendered)
- [ ] If instance is not running, management sections are hidden with a clear message

**Priority:** High

---

### User Story 2: Configure Heartbeat Schedule
**As a** subscriber
**I want** to configure when and how often my AI assistant checks in
**So that** it runs on my preferred schedule and stays quiet during off-hours

**Acceptance Criteria:**
- [ ] User can enable or disable the heartbeat toggle
- [ ] User can set the heartbeat interval (minimum 1 minute, maximum 24 hours)
- [ ] User can edit the heartbeat prompt (what the assistant does on each check-in)
- [ ] User can view quiet hours configuration (read-only — engine manages quiet hours via environment variables)
- [ ] Changes are saved immediately and confirmed with a success message
- [ ] Current heartbeat status (last run, next run, consecutive failures) is displayed
- [ ] Form shows current configuration loaded from the engine

**Priority:** High

---

### User Story 3: Manage Jobs
**As a** subscriber
**I want** to create, view, and delete jobs for my AI assistant
**So that** I can assign tasks and track their completion

**Acceptance Criteria:**
- [ ] User can view a list of recent jobs with status, source, name, and timestamps
- [ ] User can create a new job by entering a prompt (and optional name)
- [ ] User can view job details including the result when completed
- [ ] User can delete a pending job
- [ ] Job list supports pagination (20 items per page)
- [ ] Jobs display their source (dashboard, heartbeat, cron, telegram, discord)
- [ ] Running jobs show a visual indicator distinguishing them from completed/failed jobs

**Priority:** High

---

### User Story 4: View Activity Log
**As a** subscriber
**I want** to see recent activity from my AI assistant
**So that** I can verify it's working correctly and review what it has done

**Acceptance Criteria:**
- [ ] User can view a list of recent conversations with timestamps
- [ ] User can expand a conversation to see message summaries
- [ ] Activity log shows the channel/source of each conversation
- [ ] Activity log supports pagination (20 items per page)
- [ ] Empty state is shown when no activity exists yet

**Priority:** Medium

---

### User Story 5: Account Settings
**As a** subscriber
**I want** to manage my account settings (email, password, account deletion)
**So that** I can keep my account secure and up to date

**Acceptance Criteria:**
- [ ] User can change their email address (requires re-verification of new email)
- [ ] User can change their password (requires current password confirmation)
- [ ] User can delete their account (requires password confirmation and explicit "DELETE" text)
- [ ] Account deletion warns about data loss and subscription cancellation
- [ ] Account deletion cancels the active subscription before deleting
- [ ] Success and error messages are displayed for each action
- [ ] Settings page is accessible from the dashboard navigation

**Priority:** Medium

---

### User Story 6: Restart Instance
**As a** subscriber
**I want** to restart my AI assistant instance
**So that** I can recover from issues without contacting support

**Acceptance Criteria:**
- [ ] Restart button is visible when instance is in "running" status
- [ ] Clicking restart shows a confirmation dialog explaining what will happen
- [ ] After confirmation, the instance status updates to reflect the restart process
- [ ] Restart is rate-limited (no more than once per 5 minutes)
- [ ] Success or failure is communicated clearly to the user
- [ ] Restart button is disabled during the restart process

**Priority:** Medium

---

### User Story 7: View Engine Logs
**As a** subscriber
**I want** to view recent engine logs
**So that** I can troubleshoot issues or see what my assistant is doing in real time

**Acceptance Criteria:**
- [ ] User can view the last 100 lines of engine logs
- [ ] Logs are displayed in a monospace, scrollable container
- [ ] User can refresh logs manually
- [ ] Sensitive information (tokens, keys) is not present in logs (engine strips these)
- [ ] Log viewer is accessible from the dashboard

**Priority:** Low

---

## Functional Requirements

### FR-1: Dashboard Home
The dashboard home page displays a summary of instance health, subscription status, and quick links to management sections. All data is fetched server-side on page load. Management sections (heartbeat, jobs, activity, logs) are only shown when the instance status is "running."

### FR-2: Heartbeat Configuration
The heartbeat configuration form loads current settings from the engine, allows the user to modify them, and saves changes. Interval is specified in human-readable units (minutes/hours) and converted to seconds for the engine. Quiet hours use 24-hour time format.

### FR-3: Job Management
The job management section lists jobs with filtering by status and pagination. Creating a job requires a prompt (max 100,000 characters). Jobs can only be deleted when in "pending" status. Job details show the result text when the job is completed or the error when failed.

### FR-4: Activity Log
The activity log displays recent conversations from the engine, ordered by most recent first. Each entry shows the channel, start time, last activity time, and message count. Expanding an entry shows message content in chronological order.

### FR-5: Account Settings
Account settings are on a separate page (/dashboard/settings). Email changes require re-verification. Password changes require the current password. Account deletion is a destructive action requiring password confirmation and typing "DELETE" to confirm. Account deletion triggers subscription cancellation via Stripe before removing the user record.

### FR-6: Instance Restart
Instance restart sends a restart command to the provisioner service. The dashboard shows a loading state during restart. Restart is rate-limited to prevent abuse. The button is only shown for running instances.

### FR-7: Engine Logs
Engine logs are fetched on demand (not streamed). The log viewer shows the last 100 lines by default. Logs are read-only.

### FR-8: Navigation
Dashboard sections are organized with a tab or sidebar navigation allowing users to switch between: Overview, Heartbeat, Jobs, Activity, Logs, and Settings.

---

## Non-Functional Requirements

### Performance
- Dashboard page load (server-rendered) completes in < 1 second (TTFB)
- Engine API proxy calls complete in < 2 seconds (including network to Oracle Cloud)
- Job list pagination responds in < 500ms

### Security
- All dashboard pages require authenticated session
- All engine API proxy routes verify session and instance ownership
- Account deletion requires password confirmation
- Engine API calls use the instance's bearer token (never exposed to client)
- No tenant data (conversation content, job prompts/results) is cached in the platform database

### Reliability
- If the engine is unreachable, the dashboard shows a clear "Instance unreachable" message rather than crashing
- Failed engine API calls show user-friendly error messages
- Form submissions handle network failures gracefully with retry guidance

### Usability
- All management sections work on mobile (responsive layout)
- Forms show validation errors inline before submission
- Destructive actions (delete job, delete account, restart) require confirmation
- Loading states are shown during async operations

---

## Edge Cases & Error Handling

### Instance Not Running
- If instance status is not "running," management sections (heartbeat, jobs, activity, logs) are hidden
- A message explains that the instance must be running to access these features
- The overview section still shows instance status and subscription info

### Engine Unreachable
- If the engine API times out or returns an error, each section shows an error state
- Error message: "Unable to reach your instance. It may be restarting. Try again in a few moments."
- The dashboard does not crash — other sections remain functional

### Empty States
- Jobs list with no jobs: "No jobs yet. Create your first job to get started."
- Activity log with no conversations: "No activity yet. Your assistant will show activity here once it runs."
- Logs with no output: "No logs available."

### Account Deletion with Active Subscription
- System cancels the Stripe subscription before deleting the account
- If subscription cancellation fails, account deletion is blocked with an error message
- User is informed that their instance will be deprovisioned

### Concurrent Modifications
- If two browser tabs modify heartbeat config simultaneously, the last write wins
- No optimistic locking is required at this scale

### Rate Limiting
- Instance restart is limited to once per 5 minutes per user
- Job creation is limited to 10 per minute per user
- These limits are enforced server-side

---

## Success Metrics

- **Engagement:** 60%+ of active subscribers use at least one management feature (heartbeat, jobs, or activity) within their first week
- **Self-Service:** < 5% of account changes require owner intervention
- **Reliability:** Dashboard error rate < 1% of page loads
- **Performance:** 95th percentile page load < 2 seconds
