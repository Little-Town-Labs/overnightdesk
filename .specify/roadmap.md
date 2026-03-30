# OvernightDesk — Implementation Roadmap

**Source:** PRD v2.1 (2026-03-21)
**Constitution:** v1.0.0 (2026-03-21)
**Generated:** 2026-03-21

---

## Executive Summary

OvernightDesk is a managed Claude Code hosting platform. The Go engine is complete (81.2% test coverage). The security team pipeline has its schema and migrations built. This roadmap covers the remaining work: the Next.js platform frontend, billing, provisioning orchestration, and customer-facing dashboard.

**Total Features:** 10
**Phases:** 5
**Critical Path:** Auth → Stripe → Provisioning → Dashboard → Onboarding

---

## What Already Exists

| Component | Repo | Status |
|-----------|------|--------|
| Landing page + waitlist | overnightdesk | Shipped |
| Waitlist API + Neon schema | overnightdesk | Shipped |
| Go daemon (engine) | overnightdesk-engine | Complete, 81.2% coverage |
| Security pipeline schema (6 migrations) | overnightdesk-securityteam | Schema complete |

---

## Feature Inventory

### Feature 1: Platform Database Schema
**Source:** PRD Section 6 (Data Model)
**Description:** Extend Neon schema with users, subscriptions, instances, fleet_events, usage_metrics, and platform_audit_log tables using Drizzle ORM migrations.
**Complexity:** Small
**Priority:** P0 (Critical)
**Notes:** Foundation for everything. Waitlist table already exists. Security team tables already exist in separate migrations.

### Feature 2: User Authentication
**Source:** PRD Section 5, Phase 1
**Description:** Email + password registration, email verification, sign in/out, password reset, session management (cookie-based via Better Auth), protected routes, waitlist-to-account conversion.
**Complexity:** Medium
**Priority:** P0 (Critical)
**Notes:** Better Auth on existing Neon database. Waitlist emails get priority conversion.

### Feature 3: Transactional Email
**Source:** PRD Section 5, Phase 8
**Description:** Resend integration for email verification, password reset, welcome email, payment notifications, provisioning confirmation, auth reminders. CAN-SPAM compliant unsubscribe.
**Complexity:** Small
**Priority:** P0 (Critical)
**Notes:** Pulled forward — auth needs email verification, payment needs failure notifications. These are not optional polish; they are required by the auth and billing flows.

### Feature 4: Stripe Payments
**Source:** PRD Section 5, Phase 2
**Description:** Pricing page with plan tiers, Stripe Checkout (redirect flow), webhook handler for subscription lifecycle events, Stripe Customer Portal link, grace period (3 days) for failed payments, subscription status in NeonDB, gate dashboard behind active subscription.
**Complexity:** Large
**Priority:** P0 (Critical)
**Notes:** Webhook events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted. Must be idempotent.

### Feature 5: Provisioning Pipeline
**Source:** PRD Section 5, Phase 5
**Description:** Stripe webhook triggers provisioning request to Oracle Cloud provisioner service. Container creation with full security hardening. Per-tenant subdomain ({tenant}.overnightdesk.com). Nginx server block generation. Network isolation. Bearer token generation. Status tracking (queued → provisioning → awaiting_auth → running → error). Health check polling. Deprovisioning on cancellation (30-day data retention). Welcome email with dashboard URL and bearer token.
**Complexity:** Extra Large
**Priority:** P0 (Critical)
**Notes:** This is the most complex feature. Spans Vercel (orchestration) + Oracle Cloud (execution). Provisioner service may live in this repo or a dedicated infra directory.

### Feature 6: Claude Code Onboarding
**Source:** PRD Section 5, Phase 4
**Description:** xterm.js terminal component in dashboard. Guided onboarding UI (Step 1: Click Connect → Step 2: Log in → Step 3: Done). Auth status display (connected/expired/not configured) polling /api/auth-status. Re-auth flow for expired tokens. Clear messaging about credential ownership.
**Complexity:** Medium
**Priority:** P0 (Critical)
**Notes:** Engine backend complete (WebSocket PTY, ticket auth, auth-status endpoint). This is frontend-only work, but it is the moment the product becomes real for the customer.

### Feature 7: Customer Dashboard
**Source:** PRD Section 5, Phase 6
**Description:** Dashboard home showing instance status. Claude Code auth status. Heartbeat configuration (enable/disable, interval, prompt, quiet hours). Job management (create/view/delete cron jobs). Activity log (recent Claude runs). Subscription status summary. Account settings (email, password change, delete account). Instance restart control.
**Complexity:** Large
**Priority:** P1 (High)
**Notes:** Consumes engine REST API for tenant-specific data. Platform API for billing/account data.

### Feature 8: Messaging Bridge Setup
**Source:** PRD Section 5, Phase 7
**Description:** Telegram setup wizard (BotFather instructions, token input, user ID input). Discord setup wizard (Developer Portal instructions, token input, user ID input). Bridge status display (connected/disconnected, last message). Calls engine API: PUT/GET /api/telegram, PUT/GET /api/discord.
**Complexity:** Small
**Priority:** P1 (High)
**Notes:** Engine backend complete. This is wizard UI + API calls. Bot tokens stored in engine DB, never exposed in GET responses.

### Feature 9: Fleet Monitoring Integration
**Source:** PRD Section 3 (Architecture), Section 8 (Non-Functional)
**Description:** Agent Zero integration for fleet health monitoring. Health check polling (30m interval). Dead-man's switch (6h host-level cron). Fleet event ingestion into platform database. Owner notifications via Telegram for incidents. Dashboard display of fleet health.
**Complexity:** Medium
**Priority:** P2 (Medium)
**Notes:** Agent Zero runs on OpenRouter (platform key). This connects the monitoring layer to the platform database and dashboard.

### Feature 10: Usage Metrics & Reporting
**Source:** PRD Section 6 (usage_metrics table), Section 10 (Success Metrics)
**Description:** Collect usage data from tenant instances (claude_calls, tool_executions per day). Dashboard display of usage trends. Platform-level metrics for business decisions (conversion rates, churn, provisioning success rate).
**Complexity:** Small
**Priority:** P2 (Medium)
**Notes:** Table already defined in schema. Engine exposes job/conversation data via API. This aggregates it for the platform view.

---

## Dependency Graph

```
Feature 1 (Schema) → Blocks: 2, 4, 5, 7, 9, 10
Feature 2 (Auth) → Blocks: 4, 7, 8
Feature 3 (Email) → Blocks: nothing (consumed by 2, 4, 5)
Feature 4 (Stripe) → Blocks: 5, 7
Feature 5 (Provisioning) → Blocks: 6, 7, 8, 9
Feature 6 (Onboarding) → Blocks: 7 (full dashboard needs auth status)
Feature 7 (Dashboard) → Blocks: 8
Feature 8 (Bridges) → Independent after 7
Feature 9 (Fleet) → Independent after 5
Feature 10 (Metrics) → Independent after 5
```

**Critical Path:** Schema → Auth + Email → Stripe → Provisioning → Onboarding → Dashboard

---

## Implementation Phases

### Phase 1: Foundation
**Goal:** Users can create accounts and sign in. Email infrastructure works.

**Features:**
- Feature 1: Platform Database Schema (P0, Small)
- Feature 2: User Authentication (P0, Medium)
- Feature 3: Transactional Email (P0, Small)

**Dependencies:** None
**Parallel Work:** Feature 3 can be built alongside Feature 2 — email verification needs both to integrate, but they can be developed concurrently and wired together.

**Phase 1 Completion Gate:**
- [ ] Users can register, verify email, sign in, sign out, reset password
- [ ] Protected routes redirect to login
- [ ] Waitlist emails can convert to accounts
- [ ] Email verification and password reset emails send via Resend
- [ ] All platform tables exist and migrate cleanly

---

### Phase 2: Billing
**Goal:** Authenticated users can subscribe and pay.

**Features:**
- Feature 4: Stripe Payments (P0, Large)

**Dependencies:** Phase 1 complete (auth required)

**Phase 2 Completion Gate:**
- [ ] Pricing page displays plans
- [ ] Stripe Checkout creates subscription
- [ ] Webhooks handle full lifecycle (paid, failed, updated, canceled)
- [ ] Failed payment notification emails send
- [ ] Dashboard/provisioning gated behind active subscription
- [ ] Stripe Customer Portal accessible for self-service

---

### Phase 3: Infrastructure
**Goal:** Paying users get a running container automatically.

**Features:**
- Feature 5: Provisioning Pipeline (P0, Extra Large)
- Feature 6: Claude Code Onboarding (P0, Medium)

**Dependencies:** Phase 2 complete (Stripe triggers provisioning)
**Parallel Work:** Feature 6 frontend can be built in parallel with Feature 5 provisioner backend — they integrate when a container exists to connect to.

**Phase 3 Completion Gate:**
- [ ] Stripe checkout.session.completed triggers container provisioning
- [ ] Container created with full security hardening (seccomp, AppArmor, read-only rootfs)
- [ ] Per-tenant subdomain routed via nginx
- [ ] Bearer token generated and sent in welcome email
- [ ] Customer can open xterm.js terminal and authenticate Claude Code via OAuth
- [ ] Dashboard shows auth status (connected/expired/not configured)
- [ ] Subscription cancellation schedules deprovisioning
- [ ] Provisioning status visible to customer (queued → provisioning → awaiting_auth → running)

---

### Phase 4: Product
**Goal:** Customers can manage their AI assistant through the dashboard.

**Features:**
- Feature 7: Customer Dashboard (P1, Large)
- Feature 8: Messaging Bridge Setup (P1, Small)

**Dependencies:** Phase 3 complete (need running instance to manage)
**Parallel Work:** Feature 8 is a subset of the dashboard but can be built as a standalone page/component in parallel.

**Phase 4 Completion Gate:**
- [ ] Dashboard shows instance status, activity log, subscription summary
- [ ] Heartbeat configuration works (enable/disable, interval, prompt, quiet hours)
- [ ] Job management works (create/view/delete cron jobs)
- [ ] Telegram setup wizard configures bridge via engine API
- [ ] Discord setup wizard configures bridge via engine API
- [ ] Bridge status displays correctly
- [ ] Account settings (email change, password change, delete account)

---

### Phase 5: Operations
**Goal:** Platform has monitoring and usage visibility.

**Features:**
- Feature 9: Fleet Monitoring Integration (P2, Medium)
- Feature 10: Usage Metrics & Reporting (P2, Small)

**Dependencies:** Phase 3 complete (need running instances to monitor)
**Can Start Early:** These can begin development after Phase 3, running in parallel with Phase 4.

**Phase 5 Completion Gate:**
- [ ] Agent Zero health checks feed into platform database
- [ ] Dead-man's switch cron active at host level
- [ ] Owner receives Telegram alerts for fleet incidents
- [ ] Usage metrics collected daily per tenant
- [ ] Dashboard shows usage trends (if dashboard exists from Phase 4)

---

## Risk Assessment

### Feature 2: User Authentication
**Technical:** Better Auth integration with existing Neon database — medium risk, well-documented library.
**Mitigation:** Follow Better Auth docs precisely. Test waitlist conversion edge cases.

### Feature 4: Stripe Payments
**Technical:** Webhook reliability and idempotency — medium risk.
**Business:** Payment failures directly impact revenue — high risk.
**Mitigation:** Idempotent webhook handlers (check event ID before processing). Grace period for failed payments. Stripe test mode for all development.

### Feature 5: Provisioning Pipeline
**Technical:** Cross-system orchestration (Vercel → Oracle Cloud) — high risk. Network configuration, DNS propagation, container security — many moving parts.
**Mitigation:** Start with manual provisioning script, automate incrementally. Test security hardening thoroughly before any customer container runs. Feature 5 is the riskiest feature in the roadmap — allocate extra time.

### Feature 6: Claude Code Onboarding
**Technical:** WebSocket proxy through nginx to container PTY — medium risk. OAuth flow opens in new tab, terminal must detect completion.
**Mitigation:** Engine already handles this (ticket auth, scoped PTY). Frontend polls /api/auth-status for completion. Test across browsers.

---

## Constitutional Compliance

### Principle 1: Data Sacred
- [x] No features access tenant data directly — all go through engine API
- [x] Claude Code credentials never touch platform frontend
- [x] Platform database stores only operational metadata

### Principle 2: Security
- [x] Auth feature includes rate limiting, CSRF, secure cookies
- [x] Stripe webhooks verify signatures
- [x] All API routes check authentication
- [x] Provisioning applies full container hardening

### Principle 4: Simple Over Clever
- [x] Stack limited to approved technologies (Next.js, Drizzle, Better Auth, Stripe, Resend)
- [x] No state management libraries, no GraphQL, no real-time frameworks
- [x] Single Next.js app, no microservice decomposition

### Principle 5: Business Pays for Itself
- [x] All services start on free tiers
- [x] Upgrade triggers documented in constitution

### Principle 8: Platform Quality Drives Retention
- [x] Onboarding flow designed for non-technical users
- [x] Error states required for every user-facing flow
- [x] Mobile-responsive dashboard required
- [x] Status indicators must reflect real-time truth

### Test-First Imperative
- [x] Every feature will follow TDD (RED → GREEN → IMPROVE)
- [x] 80%+ coverage required
- [x] E2E tests for critical flows (signup, payment, dashboard)

---

## Execution Checklist

### Pre-Implementation
- [x] PRD reviewed (v2.1)
- [x] Constitution established (v1.0.0)
- [x] Features identified and numbered (10)
- [x] Dependencies mapped
- [x] Priorities assigned
- [x] Phases defined (5)
- [x] Risks assessed

### Phase 1: Foundation — COMPLETE (2026-03-21)
- [x] `/speckit-specify 1-platform-schema` — committed 35dc58d
- [x] `/speckit-specify 2-user-authentication` — committed 3d141e0
- [x] `/speckit-specify 3-transactional-email` — committed 9183817
- [x] Implement all Phase 1 features
- [x] **Gate:** Users can register, verify, sign in, reset password

### Phase 2: Billing — COMPLETE (2026-03-22)
- [x] `/speckit-specify 4-stripe-payments` — committed 70dfb54
- [x] Implement Feature 4
- [x] **Gate:** Users can subscribe, pay, manage billing

### Phase 3: Infrastructure — COMPLETE (2026-03-22, Vercel side)
- [x] `/speckit-specify 5-provisioning-pipeline` — committed e91bf04 (Vercel side)
- [x] `/speckit-specify 6-claude-code-onboarding` — committed 5e12925
- [x] Implement Features 5 and 6 (Vercel side)
- [ ] **Gate:** Payment → container → Claude auth works end-to-end
- [ ] **Remaining:** Oracle Cloud provisioner shell scripts (adapted from ironclaw-saas)

### Phase 4: Product — COMPLETE (2026-03-22)
- [x] `/speckit-specify 7-customer-dashboard` — 409 tests, 20 suites
- [x] `/speckit-specify 8-messaging-bridge-setup` — included in test count
- [x] Implement Features 7 and 8
- [x] **Gate:** Dashboard with heartbeat, jobs, activity, logs, bridges, settings, restart

### Phase 5: Operations — COMPLETE (2026-03-22)
- [x] `/speckit-specify 9-fleet-monitoring` — health checks, owner Telegram alerts, admin fleet dashboard
- [x] `/speckit-specify 10-usage-metrics` — daily collection, customer usage, admin business metrics
- [x] Implement Features 9 and 10
- [x] **Gate:** Vercel Cron health checks (30min) + usage collection (daily), admin dashboards, Telegram notifications

---

### Phase 6: Hardening — COMPLETE (2026-03-22)
**Goal:** Fix integration bugs, add contract tests, prepare for invite-only launch.

**Features:**
- Feature 11: Invite-Only Launch Hardening (P0, Medium) — COMPLETE (`10ebadf`)
- Feature 12: Platform↔Engine Contract Tests & Integration Fixes (P0, Medium) — COMPLETE (`f65a59d`, engine `f8bbac2`)

**Feature 11 delivered:** Middleware whitelist fix, timing-safe provisioner auth, security headers, invite-only registration gate, landing page copy fix, engine-client envelope unwrapping.

**Feature 12 delivered:** Fixed 7 integration bugs (WebSocket URL, heartbeat camel↔snake mapping, Message JSON tags, job timestamps, status nested fields, bridge reconfig detection). Added 28 contract tests validating all 16 engine-client functions against real engine response shapes. Created engine-contracts.ts as single source of truth for wire format.

**Phase 6 Completion Gate:**
- [x] Feature 11: Invite-only launch hardening (501 tests, build clean)
- [x] Feature 12: All 7 integration bugs fixed
- [x] Feature 12: Contract test suite covering all engine response shapes (28 tests)
- [x] Feature 12: Engine Message struct JSON tags (engine repo)

---

### Phase 7: Security Pipeline Integration
**Goal:** Wire SecurityTeam into the platform for email security, outbound checking, and reporting.

**Architecture Decisions (confirmed 2026-03-23):**
- SecurityTeam runs as standalone process on Oracle VM (same host as engine containers)
- Engine↔SecurityTeam communication via HTTP sidecar API on localhost
- Platform reads security tables in shared Neon DB for reporting
- Customer add-on model: Pro plan ($59) includes security, Starter ($29) does not

**Features:**

#### Feature 13: SecurityTeam Standalone Service (P0, Medium)
**Repos:** `overnightdesk-securityteam`
**Description:** Get SecurityTeam running as a standalone HTTP service on Oracle VM. Fix missing migration 006, add `.env.example`, export all modules, wrap pipeline in HTTP API endpoints (`POST /check-outbound`, `POST /scan-inbound`, `GET /status`). Wire email fetcher to support/sales IMAP mailboxes. Deploy Telegram approval bot.
**Dependencies:** Oracle VM access

#### Feature 14: Engine↔SecurityTeam Integration (P0, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk-securityteam`
**Description:** Engine calls SecurityTeam HTTP API for outbound email/action checks before sending. Engine reads `ingested_messages` table for approved inbound content that Agent Zero should act on. Add `SECURITY_SERVICE_URL` config to engine.
**Dependencies:** Feature 13

#### Feature 15: Platform Security Dashboard (P1, Medium)
**Repos:** `overnightdesk`
**Description:** New Security tab in admin dashboard showing pipeline activity (items processed, flagged, approved, rejected), approval queue status, audit results. API routes reading from `security_approval_queue`, `security_governor_log`, `security_audit_results` tables. Manual "Scan now" trigger button. Telegram/Discord notification integration for security findings (separate channel from existing owner fleet alerts).
**Dependencies:** Feature 13 (tables must be populated)

#### Feature 16: Customer Security Add-On (P2, Large)
**Repos:** `overnightdesk-securityteam`, `overnightdesk-engine`, `overnightdesk`
**Description:** Multi-tenant security pipeline. Add `tenant_id` to all security tables. Per-tenant security pipeline configuration. Each customer's engine calls the security sidecar before outbound actions. Plan tier gating — Pro plan includes security, Starter does not. Dashboard security tab visible to customers on Pro plan.
**Dependencies:** Features 13-15

**Phase 7 Completion Gate:**
- [ ] Feature 13: SecurityTeam HTTP service running on Oracle VM
- [ ] Feature 13: Email fetcher polling support/sales mailboxes
- [ ] Feature 13: Telegram approval bot operational
- [ ] Feature 14: Engine calls SecurityTeam for outbound checks
- [ ] Feature 14: Agent Zero reads approved inbound messages
- [ ] Feature 15: Security tab in admin dashboard
- [ ] Feature 15: Manual scan trigger working
- [ ] Feature 16: Multi-tenant security tables
- [ ] Feature 16: Pro plan security gating

---

### Phase 8: Multi-Agent Evolution
**Goal:** Transform OvernightDesk from single-agent job execution to multi-agent orchestration platform. Inspired by Paperclip's architecture but built our way — in Go, with our container isolation model.

**Vision:** A customer's container runs Agent Zero as the manager agent, with specialist agents created as needed. Issues replace flat jobs. Projects group work. Cost governance prevents runaway spending. The dashboard evolves from "status panel" to "business operations center."

**Architectural Approach:**
- Build back-to-front: engine data model → engine API → dashboard proxy → dashboard UI
- Agent model lives in Go engine (SQLite), not platform DB
- Dashboard proxies to engine API (same pattern as today)
- Agent Zero pre-seeded on first container boot
- Serial queue evolves to per-agent serial execution (N agents, each serial)
- Bridges (Telegram/Discord) route messages to Agent Zero, who delegates

**Features:**

#### Feature 17: Agent Data Model (P0, Medium)
**Repos:** `overnightdesk-engine`
**Description:** Introduce agents as first-class entities in the engine. Agents table with identity (name, role, status, icon), configuration (adapter config, runtime config, heartbeat policy), budget (monthly limit, spent), and hierarchy (reportsTo). Agent Zero pre-seeded on first boot. Agent runtime state table for session persistence. Agent wakeup request table for idempotent execution triggers.
**Complexity:** Medium
**Dependencies:** None (engine-only, additive)
**Data Model:**
- `agents` — id, name, role, status (idle/running/paused/error), adapter_type, runtime_config (JSON), budget_monthly_cents, spent_monthly_cents, reports_to (self-ref), heartbeat_interval_seconds, last_heartbeat_at, created_at, updated_at
- `agent_runtime_state` — agent_id (FK), session_id, state_json, updated_at
- `agent_wakeup_requests` — id, agent_id (FK), source, issue_id (nullable), idempotency_key, status, created_at

#### Feature 18: Issue Lifecycle (P0, Large)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Evolve flat `agent_jobs` into a full issue lifecycle. Issues have status workflow (backlog → todo → in_progress → in_review → done → failed), priority, assignee (agent), project association, and source tracking. Issue comments for collaboration. Existing job creation endpoints produce issues. Bridges create issues assigned to Agent Zero. Heartbeat creates issues per the assigned agent's prompt.
**Complexity:** Large
**Dependencies:** Feature 17 (agents must exist)
**Data Model:**
- `issues` — id, identifier (e.g. "OD-42"), title, description, status, priority, assignee_agent_id (FK), project_id (nullable FK), source, prompt, result, started_at, completed_at, created_at, updated_at
- `issue_comments` — id, issue_id (FK), author_agent_id (nullable FK), author_source, content, created_at
- `issue_counter` — singleton row tracking next issue number
- Migrate existing `agent_jobs` data → `issues` on schema upgrade

#### Feature 19: Execution Runs (P0, Medium)
**Repos:** `overnightdesk-engine`
**Description:** Replace the flat job status with structured execution runs. Each time an agent works on an issue, a run is created with full lifecycle tracking (queued → running → succeeded/failed/timed_out). Runs capture token usage, duration, exit code, session state. Per-agent serial queue (each agent processes one run at a time, multiple agents can run in parallel). Run events table for structured logging.
**Complexity:** Medium
**Dependencies:** Feature 17, Feature 18
**Data Model:**
- `runs` — id, agent_id (FK), issue_id (FK), status, source, exit_code, input_tokens, output_tokens, cost_cents, session_id_before, session_id_after, started_at, finished_at, created_at
- `run_events` — id, run_id (FK), event_type, payload (JSON), created_at
- Replace serial queue with agent-aware queue manager

#### Feature 20: Projects (P1, Small)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Group issues by project. Projects have name, description, color, status, and optional target date. Issues can be assigned to a project. Dashboard shows project list and project-scoped issue views.
**Complexity:** Small
**Dependencies:** Feature 18 (issues must exist)
**Data Model:**
- `projects` — id, name, description, color, status (active/completed/archived), target_date, created_at, updated_at

#### Feature 21: Cost Governance (P1, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Track per-run token costs. Aggregate by agent and project. Budget enforcement — pause agent when monthly budget exceeded. Cost analytics API for dashboard consumption. Budget policies (warn at 80%, pause at 100%).
**Complexity:** Medium
**Dependencies:** Feature 19 (runs must track tokens)
**Data Model:**
- `budget_policies` — id, agent_id (nullable FK), project_id (nullable FK), monthly_limit_cents, warn_threshold_pct, action (warn/pause), created_at
- `budget_incidents` — id, policy_id (FK), type (warning/breach), spent_cents, limit_cents, created_at
- Cost aggregation queries over `runs` table

#### Feature 22: Routines (P1, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Evolve file-based cron jobs and heartbeat into DB-backed routines. Routines are scheduled tasks tied to a specific agent with cron expressions, webhook triggers, or interval-based timing. Concurrency policies (skip if running, queue, coalesce). Replaces both heartbeat_state and cron engine with unified routine system.
**Complexity:** Medium
**Dependencies:** Feature 17, Feature 19
**Data Model:**
- `routines` — id, agent_id (FK), name, description, enabled, trigger_type (cron/interval/webhook), trigger_config (JSON), concurrency_policy, last_run_at, next_run_at, created_at, updated_at

#### Feature 23: Approval Workflows (P2, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Generalize the security approval queue into a structured approval workflow. Agents can request approval for sensitive actions. Approvals have status (pending/approved/rejected/revision_requested), comments, and association to issues. Dashboard shows approval queue. Integrates with existing SecurityTeam screening.
**Complexity:** Medium
**Dependencies:** Feature 17, Feature 18
**Data Model:**
- `approvals` — id, agent_id (FK), issue_id (nullable FK), type, status, payload (JSON), decided_at, created_at
- `approval_comments` — id, approval_id (FK), author_source, content, created_at

#### Feature 24: Skills Management (P2, Small)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Move agent skills from filesystem to database-backed management. Skills are markdown knowledge documents injected into agent context. CRUD API for skills. Dashboard skills editor. Agents can have skills assigned. Retains filesystem skills as read-only defaults.
**Complexity:** Small
**Dependencies:** Feature 17
**Data Model:**
- `skills` — id, name, slug, description, content (markdown), source (system/user/scanned), agent_id (nullable FK — null means all agents), created_at, updated_at

#### Feature 25: Activity & Audit Log (P2, Small)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Structured activity log in the engine tracking all state changes: issue created/updated, agent status changed, run started/completed, approval decided, routine triggered. Dashboard activity page with filtering by entity type.
**Complexity:** Small
**Dependencies:** Features 17-19 (needs entities to log about)
**Data Model:**
- `activity_log` — id, entity_type, entity_id, action, actor_type (agent/system/user), actor_id, changes (JSON), created_at

#### Feature 26: Dashboard Agent Management UI (P1, Large)
**Repos:** `overnightdesk`
**Description:** New dashboard pages for the multi-agent model. Agent list with status indicators and live run counts. Agent detail page with configuration, run history, and session info. Issue list with status workflow filters replacing the flat jobs page. Issue detail with comments and activity. Project list and detail. Cost analytics page. Routines management replacing heartbeat config. Approval queue. Activity log page. Updated dashboard overview with charts and metrics.
**Complexity:** Large
**Dependencies:** Features 17-25 (engine API must exist)
**Notes:** This is the frontend for everything built in Features 17-25. Can be built incrementally as each engine feature lands.

**Phase 8 Dependency Graph:**
```
Feature 17 (Agents) → Blocks: 18, 19, 22, 23, 24, 25, 26
Feature 18 (Issues) → Blocks: 19, 20, 23, 25, 26
Feature 19 (Runs)   → Blocks: 21, 25, 26
Feature 20 (Projects) → Blocks: 26
Feature 21 (Costs)  → Blocks: 26
Feature 22 (Routines) → Blocks: 26
Feature 23 (Approvals) → Blocks: 26
Feature 24 (Skills) → Blocks: 26
Feature 25 (Activity) → Blocks: 26
Feature 26 (Dashboard) → Terminal node
```

**Critical Path:** Agents → Issues → Runs → Costs → Dashboard

**Phase 8 Completion Gate:**
- [x] Feature 17: Agents exist as first-class entities, Agent Zero pre-seeded
- [x] Feature 18: Issues replace flat jobs, full status workflow, comments
- [x] Feature 19: Per-agent execution runs with token tracking, parallel agent execution
- [x] Feature 20: Projects group issues
- [x] Feature 21: Per-agent/project budgets with enforcement
- [x] Feature 22: Routines replace heartbeat + cron with unified scheduling
- [x] Feature 23: Approval queue for agent-requested actions
- [x] Feature 24: DB-backed skills management
- [x] Feature 25: Structured activity log
- [x] Feature 26: Full dashboard UI for multi-agent management
- [x] Existing bridges (Telegram/Discord) route to Agent Zero via issue creation
- [x] All features have 80%+ test coverage
- [x] Engine contract tests updated for new API surface

---

## Phase 9: Platform Hardening & Agent Intelligence

**Source:** Paperclip (paperclip.ing) feature gap analysis, 2026-03-30
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Dependencies:** Phase 8 complete

This phase closes the feature gap with the open-source state of the art (Paperclip, 35.5k stars) while maintaining OvernightDesk's managed hosting + SecurityTeam differentiation. Multi-adapter support excluded — OvernightDesk is Claude Code only by design.

### Small Features (engine-only, 1-2 hours each)

#### Feature 27: Issue Checkout/Release (P0, Small)
**Repos:** `overnightdesk-engine`
**Description:** Atomic issue claim via `POST /api/issues/:id/checkout` that sets assignee + transitions to `in_progress` in a single transaction. Returns 409 Conflict if already checked out. `POST /api/issues/:id/release` returns issue to `todo`. Prevents two agents working the same task.
**Data Model:**
- `issues` — add `checkout_run_id` column (nullable FK to runs)

#### Feature 28: Agent Config Revisions (P1, Small)
**Repos:** `overnightdesk-engine`
**Description:** Track every agent configuration change with before/after snapshots. `GET /api/agents/:id/config-revisions` lists history. `POST /api/agents/:id/config-revisions/:revisionId/rollback` restores a previous config. Safety net for destructive config changes.
**Data Model:**
- `agent_config_revisions` — id, agent_id, source (patch/rollback), changed_keys (JSON), before_config (JSON), after_config (JSON), created_at

#### Feature 29: Billing Codes (P2, Small)
**Repos:** `overnightdesk-engine`
**Description:** Optional `billing_code` field on issues that propagates to runs and cost tracking. Enables cost allocation by business function (e.g., "marketing", "devops", "research").
**Data Model:**
- `issues` — add `billing_code` column (nullable TEXT)
- Cost queries group by billing_code when present

#### Feature 30: Issue Labels (P2, Small)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Color-coded labels for issue classification. CRUD API for labels, M:N join table. Dashboard shows label pills on issue list.
**Data Model:**
- `labels` — id, name, color, created_at
- `issue_labels` — issue_id, label_id (composite PK)

#### Feature 31: Wakeup Coalescing (P1, Small)
**Repos:** `overnightdesk-engine`
**Description:** Deduplicate agent wakeup requests using idempotency keys. If a wakeup with the same key is already pending, increment a coalesced_count instead of creating a duplicate. Prevents thundering herd on rapid events.
**Data Model:**
- `agent_wakeup_requests` — add `idempotency_key` (nullable UNIQUE), `coalesced_count` (default 0)

#### Feature 32: Routine Catch-up Policies (P2, Small)
**Repos:** `overnightdesk-engine`
**Description:** When a routine misses scheduled runs (engine downtime, quiet hours), determine behavior: `skip_missed` (default, current behavior) or `enqueue_missed_with_cap` (enqueue up to N missed runs, default 5). Prevents silent missed work.
**Data Model:**
- `routines` — add `catch_up_policy` (TEXT, default 'skip_missed'), `catch_up_cap` (INTEGER, default 5)

#### Feature 33: Org Chart Visualization (P2, Small)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** `GET /api/agents/org` returns agent hierarchy as a tree JSON. Dashboard renders an interactive org chart showing reporting lines, status badges, and budget info.
**Data Model:** None — derived from existing `reports_to` field on agents.

### Medium Features (engine + dashboard, 2-4 hours each)

#### Feature 34: Issue Documents (P1, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Keyed markdown documents attached to issues (e.g., "plan", "research", "spec"). Full revision history with change summaries. Agents can create/update documents during execution. Dashboard document viewer with revision diff.
**Data Model:**
- `documents` — id, title, format (default 'markdown'), latest_body, latest_revision_number, created_at, updated_at
- `document_revisions` — id, document_id, revision_number, body, change_summary, created_at
- `issue_documents` — id, issue_id, document_id, key (UNIQUE per issue)

#### Feature 35: Work Products (P1, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Track external artifacts linked to issues — PRs, deployments, reports, URLs. Each work product has a type, provider, external ID, URL, review state, and health status. Dashboard shows work products on issue detail.
**Data Model:**
- `issue_work_products` — id, issue_id, type (pr/deployment/report/url), provider, external_id, title, url, status, review_state, is_primary, created_at

#### Feature 36: Goal Hierarchy (P1, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Four-level goal system: company → team → agent → task. Goals have parent goals (tree), link to projects and issues. Issues trace back to company mission. Dashboard goal tree visualization.
**Data Model:**
- `goals` — id, title, description, level (company/team/agent/task), status (active/completed/archived), parent_id (self-ref), owner_agent_id, created_at, updated_at
- `projects` — add `goal_id` column (nullable FK)
- `issues` — add `goal_id` column (nullable FK)

#### Feature 37: Run Streaming (SSE) (P0, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Server-Sent Events endpoint `GET /api/runs/:id/stream` that pushes real-time execution events (stdout lines, status changes, token counts) during active runs. Dashboard live run widget replaces polling.
**Data Model:** None new — streams from existing `run_events` table.

#### Feature 38: Kanban Board (P1, Medium)
**Repos:** `overnightdesk`
**Description:** Drag-and-drop Kanban board view for issues. Columns: backlog, todo, in_progress, in_review, done. Drag to change status. Filter by assignee, project, priority. Toggle between list and board views.
**Data Model:** None — frontend only, uses existing issue API.

#### Feature 39: Finance Ledger (P2, Medium)
**Repos:** `overnightdesk-engine`, `overnightdesk`
**Description:** Extend cost tracking beyond simple token counts. Support event kinds: inference_charge, platform_fee, credit_purchase, manual_adjustment. Debit/credit directions. Provider and biller tracking. Dashboard finance summary with breakdowns.
**Data Model:**
- `finance_events` — id, agent_id, event_kind, direction (debit/credit), biller, provider, model, amount_cents, currency, created_at

#### Feature 40: Secrets Management (P1, Medium)
**Repos:** `overnightdesk-engine`
**Description:** Encrypted secret storage with rotation support. Secrets scoped to company, injected into agent environment during execution. API for CRUD and rotation. Never exposed in API responses — write-only after creation.
**Data Model:**
- `secrets` — id, name, encrypted_value, provider (local_encrypted), version, rotated_at, created_at, updated_at

#### Feature 41: Company Export/Import (P2, Medium)
**Repos:** `overnightdesk-engine`
**Description:** Export full tenant configuration (agents, projects, routines, skills, budget policies) as a JSON archive. Import with preview before applying. Enables backup, migration, and template sharing.
**Data Model:** None — serialization of existing entities.

#### Feature 42: Agent Instructions Bundle (P2, Medium)
**Repos:** `overnightdesk-engine`
**Description:** Replace monolithic CLAUDE.md with structured instruction files. Per-agent instruction bundle with named files (identity.md, constraints.md, tools.md). API to manage individual files. Assembled into CLAUDE.md at execution time.
**Data Model:**
- `agent_instruction_files` — id, agent_id, filename, content, created_at, updated_at

#### Feature 43: Per-Task Session Management (P1, Medium)
**Repos:** `overnightdesk-engine`
**Description:** Track Claude Code sessions per issue/task (not just globally per agent). When an agent resumes work on a specific issue, restore the session from that task. Session compaction policy: auto-compact when context exceeds threshold.
**Data Model:**
- `agent_task_sessions` — id, agent_id, issue_id, session_id, session_params (JSON), created_at, updated_at

### Large Features (significant architecture, 4-8 hours)

#### Feature 44: Workspace Isolation (P1, Large)
**Repos:** `overnightdesk-engine`
**Description:** Git worktree management for parallel agent work. Each issue can get its own branch and working directory. Workspace reuse strategies (per-issue, per-project, shared). Setup/cleanup commands. Prevents agents from stepping on each other's filesystem changes.
**Data Model:**
- `project_workspaces` — id, project_id, name, source_type (local/git), cwd, repo_url, repo_ref, setup_command, cleanup_command
- `execution_workspaces` — id, project_id, issue_id, mode, status, cwd, branch_name, created_at

#### Feature 45: Plugin System (P2, Large)
**Repos:** `overnightdesk-engine`
**Description:** Manifest-driven plugin architecture. Plugins can register API endpoints, scheduled jobs, event listeners, and agent tools. Plugin state storage scoped by entity. Plugin lifecycle management (install, configure, enable, disable, uninstall).
**Data Model:**
- `plugins` — id, plugin_key, version, manifest (JSON), status, created_at
- `plugin_config` — plugin_id, config (JSON)
- `plugin_state` — plugin_id, scope_kind, scope_id, key, value
- `plugin_jobs` — plugin_id, job_key, schedule, status, next_run_at
- `plugin_job_runs` — id, job_id, trigger, status, duration_ms, created_at

**Phase 9 Dependency Graph:**
```
Feature 27 (Checkout) → Blocks: 37, 43, 44
Feature 28 (Config Revisions) → Independent
Feature 29 (Billing Codes) → Blocks: 39
Feature 30 (Labels) → Independent
Feature 31 (Wakeup Coalescing) → Independent
Feature 32 (Catch-up) → Independent
Feature 33 (Org Chart) → Independent
Feature 34 (Documents) → Independent
Feature 35 (Work Products) → Independent
Feature 36 (Goals) → Independent
Feature 37 (SSE Streaming) → Depends: 27
Feature 38 (Kanban) → Independent (frontend only)
Feature 39 (Finance Ledger) → Depends: 29
Feature 40 (Secrets) → Independent
Feature 41 (Export/Import) → Independent
Feature 42 (Instructions Bundle) → Independent
Feature 43 (Task Sessions) → Depends: 27
Feature 44 (Workspaces) → Depends: 27
Feature 45 (Plugins) → Independent
```

**Critical Path:** Checkout → SSE Streaming → Task Sessions → Workspaces

**Phase 9 Completion Gate:**
- [ ] Feature 27: Atomic issue checkout with 409 conflict
- [ ] Feature 28: Agent config revision history with rollback
- [ ] Feature 29: Billing codes on issues propagated to costs
- [ ] Feature 30: Color-coded issue labels
- [ ] Feature 31: Wakeup request deduplication
- [ ] Feature 32: Routine catch-up policies
- [ ] Feature 33: Org chart visualization
- [ ] Feature 34: Keyed issue documents with revision history
- [ ] Feature 35: Work product tracking on issues
- [ ] Feature 36: Goal hierarchy (company→team→agent→task)
- [ ] Feature 37: Real-time run streaming via SSE
- [ ] Feature 38: Kanban board for issues
- [ ] Feature 39: Finance ledger with event kinds
- [ ] Feature 40: Encrypted secrets management
- [ ] Feature 41: Tenant export/import
- [ ] Feature 42: Structured agent instructions bundle
- [ ] Feature 43: Per-task session management
- [ ] Feature 44: Git worktree workspace isolation
- [ ] Feature 45: Plugin system
- [ ] All features have 80%+ test coverage
- [ ] Dashboard updated for all new features

---

## Completion Summary

Phases 1-8 complete (26 features). Phase 9 (platform hardening & agent intelligence) planned: 19 features derived from Paperclip gap analysis. Engine has 531+ tests across 15 packages. Platform dashboard live with all multi-agent management pages. Instance wired to aegis-prod tenant-0.

### Commit History

| Phase | Commits | Features |
|-------|---------|----------|
| Phase 1 | `35dc58d`...`9183817` | Schema, Auth, Email |
| Phase 2 | `70dfb54` | Stripe Payments |
| Phase 3 | `e91bf04`, `5e12925` | Provisioning, Onboarding |
| Phase 4 | `af34533` | Dashboard, Bridges |
| Phase 5 | `b6978dc` | Fleet Monitoring, Usage Metrics |
| Reviews | `4028d89`, `749a2cb` | Code quality, security, performance fixes |
| Phase 6 | `10ebadf`, `f65a59d` | Invite-only hardening, contract tests (Features 11-12) |

### Remaining Operational Work

- [ ] Oracle Cloud provisioner shell scripts (adapt from ironclaw-saas)
- [ ] Production env vars in Vercel
- [ ] Apply migrations 0003 + 0004 to production Neon DB
- [ ] Stripe Dashboard setup (products, prices, webhook, Customer Portal)
- [ ] Dead-man's switch cron on Oracle VM
- [ ] Engine API: add `created_after` date filtering for jobs/conversations

### Known Limitations

- **Usage collection client-side filtering:** Engine API lacks date-filtered queries. `collectInstanceUsage()` fetches up to 100 items and filters in JS. Undercounts at >100 daily jobs per tenant.
- **Rate limiters are in-memory:** Vercel serverless functions use ephemeral `Map<string, number[]>`. Rate limits reset on cold starts. Acceptable at current scale (<100 users).
- **Dead-man's switch requires Oracle VM:** Shell script runs independently of the app on the provisioner host.
