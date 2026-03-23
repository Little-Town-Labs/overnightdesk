# Feature 16: Customer Security Add-On

**Branch:** 16-customer-security-addon
**Status:** Implemented
**Created:** 2026-03-23
**Author:** Claude (spec-kit specify)

---

## Overview

Security screening (Features 13-15) currently only protects Agent Zero. As we onboard customers, Pro plan subscribers ($59/month) should get the same protection — outbound secret/PII screening, inbound injection detection, and approval workflows — while Starter plan subscribers ($29/month) do not.

**Architecture decisions (clarified):**
- **Multi-tenancy:** API-key-based isolation. Each customer's engine uses its own SecurityTeam bearer token. SecurityTeam maps tokens to per-tenant pipeline configs. No database schema changes.
- **Plan gating:** Starter gets NO security features. Pro gets everything.
- **Enforcement point:** Engine checks plan tier before calling SecurityTeam. If the tenant is on Starter, the engine skips all security checks.

**Business Value:** Security screening is a compelling Pro plan differentiator. It protects customers' sensitive data from leaking through messaging bridges — exactly what non-technical small business users need but can't configure themselves. This drives upgrades from Starter to Pro.

---

## User Stories

### User Story 1: Pro Plan Security Activation
**As a** Pro plan customer
**I want** security screening automatically enabled when I subscribe
**So that** my outbound messages are protected without any manual configuration

**Acceptance Criteria:**
- [ ] When a customer upgrades to Pro, their engine starts calling SecurityTeam
- [ ] No manual configuration is required — security activates automatically
- [ ] The customer's dashboard shows a "Security: Active" indicator
- [ ] Outbound messages are screened for secrets/PII before sending
- [ ] Inbound messages are scanned for injection signals

**Priority:** High

### User Story 2: Starter Plan Security Exclusion
**As a** Starter plan customer
**I want** my engine to operate without security overhead
**So that** I get the basic service at the lower price point without latency from unused features

**Acceptance Criteria:**
- [ ] Starter plan engines do NOT call SecurityTeam
- [ ] No security-related latency on Starter plan message processing
- [ ] The security dashboard tab is not visible to Starter plan users
- [ ] Security API routes return a clear "upgrade required" message for Starter users
- [ ] The pricing page clearly communicates that security is a Pro feature

**Priority:** High

### User Story 3: Per-Tenant Security Configuration
**As a** platform operator
**I want** each Pro customer's security screening to be isolated from other customers
**So that** one customer's approval queue, redaction patterns, and scan results don't leak to another

**Acceptance Criteria:**
- [ ] Each Pro tenant gets a unique SecurityTeam bearer token
- [ ] SecurityTeam can distinguish requests by token and apply per-tenant settings
- [ ] Approval queue items are scoped to the requesting tenant's token
- [ ] One tenant's security data is never visible to another tenant
- [ ] Admin (Agent Zero) can see all tenants' security data

**Priority:** High

### User Story 4: Plan Upgrade Activates Security
**As a** customer upgrading from Starter to Pro
**I want** security screening to activate when my plan upgrade takes effect
**So that** I immediately benefit from the feature I'm paying for

**Acceptance Criteria:**
- [ ] After Stripe confirms the upgrade, the engine is notified of the plan change
- [ ] Security screening begins within one engine restart cycle
- [ ] The customer sees the Security tab appear in their dashboard
- [ ] No data loss during the transition — messages sent during upgrade are handled gracefully

**Priority:** Medium

### User Story 5: Plan Downgrade Deactivates Security
**As a** customer downgrading from Pro to Starter
**I want** security screening to stop when my plan change takes effect
**So that** I'm not paying for features I'm no longer receiving

**Acceptance Criteria:**
- [ ] After plan change, the engine stops calling SecurityTeam
- [ ] Pending approval items for this tenant expire naturally (24h TTL)
- [ ] The Security tab disappears from the customer's dashboard
- [ ] The customer's messages continue to flow without security checks
- [ ] No error states — the transition is clean

**Priority:** Medium

### User Story 6: Security Feature Visibility on Pricing Page
**As a** potential customer
**I want** to see what security features are included in each plan
**So that** I can make an informed decision about which plan to choose

**Acceptance Criteria:**
- [ ] The pricing page lists security screening as a Pro-only feature
- [ ] The feature description is understandable by non-technical users
- [ ] Starter plan clearly shows "Security screening: Not included"
- [ ] Pro plan clearly shows "Security screening: Included"

**Priority:** Medium

---

## Functional Requirements

### FR-1: Engine Plan-Tier Awareness
The engine MUST know the tenant's plan tier (starter/pro). When the plan is "starter", the engine MUST skip all SecurityTeam calls — no outbound checks, no inbound scans, no job result screening, no message polling.

### FR-2: Plan Tier Communication
The platform MUST communicate the tenant's plan tier to the engine. This can be via environment variable at provisioning time, API endpoint, or configuration update.

### FR-3: Per-Tenant Security Tokens
Each Pro plan tenant MUST have a unique SecurityTeam bearer token. The token MUST be generated during provisioning and stored securely. The engine receives this token alongside the SecurityTeam URL.

### FR-4: SecurityTeam Token-Based Tenant Mapping
The SecurityTeam MUST accept multiple valid bearer tokens. Each token maps to a tenant configuration. Approval queue items, scan results, and audit data are implicitly scoped by the token used to create them.

### FR-5: Dashboard Plan Gating
The Security dashboard tab MUST only be visible to Pro plan users. The security API routes MUST check the user's plan and return 403 with an "upgrade required" message for Starter users.

### FR-6: Pricing Page Update
The pricing page MUST clearly list security screening features under the Pro plan. The Starter plan MUST show these features as not included.

### FR-7: Upgrade Flow
When a customer upgrades from Starter to Pro via Stripe, the platform MUST provision a SecurityTeam token and communicate the plan change to the engine. Security screening MUST activate on the next engine restart or configuration reload.

### FR-8: Downgrade Flow
When a customer downgrades from Pro to Starter, the engine MUST stop calling SecurityTeam. Pending approval items MUST expire naturally. No tenant data is deleted — it remains in SecurityTeam's database but becomes inaccessible.

### FR-9: Admin Override
Admin users (Agent Zero) MUST always have access to security features regardless of plan tier. The admin's engine always has security enabled.

### FR-10: Backwards Compatibility
Existing Agent Zero setup MUST continue to work without changes. The current single-token SecurityTeam configuration remains valid for admin use.

---

## Non-Functional Requirements

### NFR-1: Performance
- Starter plan engines MUST have zero security-related latency (no HTTP calls to SecurityTeam)
- Plan tier check MUST be a local operation (env var or cached config), not a remote call per message

### NFR-2: Security
- Per-tenant SecurityTeam tokens MUST be generated with sufficient entropy (32+ chars)
- Tokens MUST be stored securely (not in browser, not in logs)
- Tenant isolation MUST prevent cross-tenant data access

### NFR-3: Reliability
- Plan upgrade/downgrade MUST NOT cause message loss
- Engine MUST handle missing or invalid security tokens gracefully (skip security, log warning)

### NFR-4: Scalability
- Token-based isolation supports 100+ tenants without SecurityTeam architecture changes
- No per-tenant SecurityTeam processes — single service handles all tenants

---

## Edge Cases & Error Handling

### EC-1: Upgrade Mid-Conversation
Customer upgrades while a Telegram conversation is active. Messages sent before upgrade completes are unscreened. Messages after are screened. No message is lost.

### EC-2: Downgrade with Pending Approvals
Customer downgrades while approval items are pending. Items expire after 24h TTL. No manual cleanup required.

### EC-3: SecurityTeam Token Revocation
If a tenant's token is revoked (e.g., subscription canceled), SecurityTeam returns 401. Engine treats this the same as "security unavailable" — circuit breaker opens, outbound messages blocked for that tenant.

### EC-4: Admin Views Multi-Tenant Data
Admin uses a master token that can see all approval queues. Individual customers only see their own data (scoped by their unique token).

### EC-5: Free Trial to Pro
If a trial period is added later, security should follow the plan tier — trial-of-Pro gets security, trial-of-Starter does not.

### EC-6: Multiple SecurityTeam Tokens Active
During token rotation or when admin + customer tokens coexist, SecurityTeam must accept all valid tokens independently.

---

## Success Metrics

- **100%** of Pro plan engines have security screening active
- **0%** of Starter plan engines make SecurityTeam calls
- **0** cross-tenant data leaks (approval items, scan results)
- Pricing page clearly communicates security as Pro feature
- Upgrade → security active within 1 engine restart cycle

---

## Out of Scope

- Custom security rules per tenant (future)
- Self-service security configuration (future)
- Per-tenant SecurityTeam dashboard (customers use the existing approval workflow via Telegram)
- SecurityTeam database schema changes (tenant isolation is at API key level)
- Real-time plan change propagation (engine restart is acceptable)
