# Feature 1: Platform Database Schema

**Feature:** 1-platform-schema
**Priority:** P0 (Critical)
**Source:** PRD v2.1, Section 6 (Data Model)
**Constitution:** v1.0.0

---

## Overview

The platform database needs tables to support user accounts, subscriptions, tenant instances, fleet operations, usage tracking, and audit logging. These tables are the foundation for every subsequent feature — authentication, billing, provisioning, and the customer dashboard all depend on this schema existing.

**Current state:** The Neon database already contains:
- `waitlist` table (managed by this repo via Drizzle ORM)
- 6 security team tables (managed by overnightdesk-securityteam via raw SQL migrations): `security_approval_queue`, `content_staging`, `ingested_messages`, `security_governor_log`, `email_fetch_state`, `security_audit_results`

This feature adds the platform operational tables. It does NOT modify or migrate existing tables.

---

## User Stories

### User Story 1: Account Data Storage
**As a** platform operator
**I want** a structured place to store user account information
**So that** the authentication system (Feature 2) has a reliable data layer

**Acceptance Criteria:**
- [ ] Each user has a unique identifier
- [ ] Email addresses are unique across all accounts
- [ ] User records track email verification status
- [ ] Timestamps record when accounts were created and last modified
- [ ] User records can be queried by email address efficiently

**Priority:** High

---

### User Story 2: Subscription Tracking
**As a** platform operator
**I want** subscription state stored alongside user accounts
**So that** billing status can gate access to provisioning and the dashboard

**Acceptance Criteria:**
- [ ] Each subscription is linked to exactly one user
- [ ] Subscription records store external payment provider identifiers (customer ID, subscription ID)
- [ ] Subscription plan tier is recorded (e.g., starter, pro)
- [ ] Subscription status reflects the payment provider's reported state (active, past_due, canceled, trialing)
- [ ] Current billing period end date is stored for display and grace period logic
- [ ] A user can have at most one active subscription

**Priority:** High

---

### User Story 3: Instance Registry
**As a** platform operator
**I want** a registry of all tenant instances and their current state
**So that** provisioning, health checks, and the dashboard can track instance lifecycle

**Acceptance Criteria:**
- [ ] Each instance is linked to exactly one user
- [ ] Instance records track a unique tenant identifier (slug)
- [ ] Instance status reflects the full lifecycle: queued, provisioning, awaiting_auth, running, stopped, error, deprovisioned
- [ ] Instance records store infrastructure details: container ID, gateway port, subdomain
- [ ] Claude Code authentication status is tracked per instance (not_configured, connected, expired)
- [ ] Dashboard access credentials are stored securely (hashed, not plaintext)
- [ ] Provisioning and deprovisioning timestamps are recorded
- [ ] Last health check timestamp is recorded
- [ ] Subdomains are unique across all instances

**Priority:** High

---

### User Story 4: Fleet Event Log
**As a** platform operator
**I want** a log of all operational events across the fleet
**So that** I can investigate incidents, track patterns, and understand system behavior

**Acceptance Criteria:**
- [ ] Events can be associated with a specific instance or be system-wide (instance reference is optional)
- [ ] Event types include: provisioned, started, stopped, health_check, error, restart (extensible)
- [ ] Events carry structured detail data for context
- [ ] Events are append-only — no updates or deletes
- [ ] Events are ordered by creation time

**Priority:** Medium

---

### User Story 5: Usage Metrics Collection
**As a** platform operator
**I want** daily usage metrics per tenant instance
**So that** I can understand product usage patterns and make business decisions

**Acceptance Criteria:**
- [ ] Metrics are recorded per instance per day (one row per instance per calendar date)
- [ ] Tracked metrics include: number of AI calls, number of tool executions
- [ ] Duplicate entries for the same instance and date are prevented
- [ ] Metrics can be queried by date range and instance

**Priority:** Medium

---

### User Story 6: Platform Audit Log
**As a** platform operator
**I want** an immutable record of all significant platform actions
**So that** I can answer "who did what and when" for any platform operation

**Acceptance Criteria:**
- [ ] Audit entries record the actor (system component or user), action taken, target of the action, and contextual details
- [ ] Actor types include: provisioner, agent-zero, owner, and user-specific identifiers
- [ ] Audit log is append-only — no updates or deletes
- [ ] Entries carry structured detail data
- [ ] Entries are ordered by creation time

**Priority:** Medium

---

### User Story 7: Waitlist Preservation
**As a** platform operator
**I want** the existing waitlist table to remain unchanged
**So that** current waitlist signups are preserved and the live waitlist endpoint continues to work

**Acceptance Criteria:**
- [ ] The waitlist table structure is not modified
- [ ] Existing waitlist data is not affected by new migrations
- [ ] The waitlist API endpoint continues to function
- [ ] Waitlist emails can be cross-referenced with user accounts for priority conversion (Feature 2)

**Priority:** High

---

## Functional Requirements

### FR-1: Table Definitions
The schema must define all platform tables with appropriate column types, constraints, primary keys, foreign keys, and defaults. Tables to create: users, subscriptions, instances, fleet_events, usage_metrics, platform_audit_log.

### FR-2: Referential Integrity
Foreign key relationships must be enforced:
- Subscriptions reference users
- Instances reference users
- Fleet events optionally reference instances
- Usage metrics reference instances

### FR-3: Uniqueness Constraints
The following must be unique across the database:
- User email addresses
- Instance tenant IDs (slugs)
- Instance subdomains
- Instance gateway ports
- Usage metric entries per instance per date

### FR-4: Migration Safety
Schema changes must be applied via migration files that:
- Can run against a database containing existing tables (waitlist, security team tables)
- Are idempotent or safely ordered
- Do not drop, alter, or reference existing tables owned by other repos
- Can be rolled back without data loss (for the initial creation)

### FR-5: Type Safety
The schema definition must produce type-safe query interfaces that downstream features (auth, billing, provisioning, dashboard) can import and use without additional type casting.

### FR-6: Enum-Like Constraints
Status fields (subscription status, instance status, Claude auth status) must constrain values to documented sets. Invalid values must be rejected at the database level.

---

## Non-Functional Requirements

### NFR-1: Performance
- Queries by user ID, email, tenant ID, and subdomain must be efficient (indexed)
- Fleet events and audit log must support time-range queries efficiently
- Usage metrics must support date-range aggregation queries

### NFR-2: Security
- Dashboard token hash column must never store plaintext — only hashed values
- Password hash column must never store plaintext — only hashed values
- No column should contain raw secrets, API keys, or credentials

### NFR-3: Compatibility
- Schema must coexist with security team tables in the same Neon database
- Schema must work with Neon's serverless driver and connection pooling
- Migrations must not require superuser privileges

---

## Edge Cases

### EC-1: Existing Data
Migrations run against a database that already has data in the waitlist table and security team tables. Migrations must not reference, modify, or conflict with those tables.

### EC-2: Concurrent Migrations
If both this repo and overnightdesk-securityteam run migrations against the same Neon database, they must not conflict. Each repo owns its own tables and migration tracking.

### EC-3: Re-running Migrations
Migrations should be safe to re-run or at minimum fail gracefully if tables already exist (e.g., `CREATE TABLE IF NOT EXISTS` or migration tool tracking).

### EC-4: User Deletion Cascade
When a user account is deleted (future feature), the schema must support or enable cascading cleanup of subscriptions, instances, fleet events, usage metrics, and audit log entries. The cascade policy (hard delete vs. soft delete vs. orphan) is deferred to the auth and account management features, but the schema should not prevent either approach.

### EC-5: Subscription Without Instance
A user may have an active subscription but no instance yet (between payment and provisioning). The schema must support this state — instances are not required to exist for a subscription to be valid.

### EC-6: Instance Without Active Subscription
A deprovisioned instance record may exist after subscription cancellation (30-day data retention). The schema must support instances that reference users whose subscriptions are canceled.

---

## Out of Scope

- Authentication logic (Feature 2)
- Stripe integration or webhook handling (Feature 4)
- Provisioning logic (Feature 5)
- Data seeding or test fixtures
- Admin queries or reporting views
- Modifications to security team tables (owned by overnightdesk-securityteam)
- Tenant-side SQLite schema (owned by overnightdesk-engine)

---

## Success Metrics

- All 6 new tables created successfully via migration
- Existing waitlist table and data unaffected
- Existing security team tables unaffected
- Type-safe query interfaces importable by downstream features
- Migration runs cleanly on a fresh Neon database and on the existing production database
