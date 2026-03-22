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

### Phase 4: Product
- [ ] `/speckit-specify 7-customer-dashboard`
- [ ] `/speckit-specify 8-messaging-bridge-setup`
- [ ] Implement Features 7 and 8
- [ ] **Gate:** Customers can manage their instance fully

### Phase 5: Operations
- [ ] `/speckit-specify 9-fleet-monitoring`
- [ ] `/speckit-specify 10-usage-metrics`
- [ ] Implement Features 9 and 10
- [ ] **Gate:** Platform has operational visibility

---

## Next Steps

Start with Phase 1, Feature 1:
```
/speckit-specify 1-platform-schema
```
