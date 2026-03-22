# Feature 11: Invite-Only Launch Hardening

**Status:** Draft
**Author:** Claude (spec-kit)
**Date:** 2026-03-22
**Priority:** P0 (Blocking)
**Complexity:** Medium
**Constitutional Alignment:** Principles 2, 4, 6, 7, 8

---

## Overview

Harden the OvernightDesk platform for an invite-only soft launch. Agent Zero (admin) is the first real user. Public visitors see a waitlist landing page. Only explicitly invited guests can register. Critical bugs that block server-to-server communication (Stripe webhooks, cron, provisioner callbacks) must be fixed. Security gaps identified in the comprehensive review must be closed.

---

## Context

All 10 PRD features are implemented (485 tests, 29 suites, build passes). A comprehensive review on 2026-03-22 identified:

- **2 critical issues** (middleware blocks system routes, timing-unsafe provisioner auth)
- **5 high issues** (security headers, rate limiting, over-fetched secrets, etc.)
- **7 medium issues** (fallback secrets, response shape mismatches, etc.)
- **Landing page copy** references "OpenRouter" — wrong product

The platform cannot process payments, run cron jobs, or receive provisioner callbacks in its current state because the auth middleware intercepts all server-to-server routes.

---

## User Stories

### US-1: Public Visitor Sees Waitlist
**As** a public visitor,
**I want** to land on overnightdesk.com and join a waitlist,
**So that** I can get notified when the service opens.

**Acceptance Criteria:**
- Landing page loads with accurate product description (Claude Code, not OpenRouter)
- Waitlist form collects email, name, business description
- No visible sign-up or pricing links in primary navigation
- Small "Sign in" text link in nav for invited users who know to look

### US-2: Invited Guest Registers
**As** an invited guest,
**I want** to register using an email that was pre-approved by the admin,
**So that** I can access the platform during the invite-only phase.

**Acceptance Criteria:**
- Guest navigates to /sign-in, clicks "Create account" link to /sign-up
- If email is in INVITED_EMAILS or ADMIN_EMAILS env var, registration proceeds normally
- If email is NOT in either list, sign-up is rejected server-side with message: "Registration is currently invite-only. Please contact us for access."
- Email comparison is case-insensitive
- The check happens server-side (not just client-side) to prevent bypass via direct API call

### US-3: Admin Accesses Full Platform
**As** the admin (Agent Zero),
**I want** to log in and access all dashboard features without a Stripe subscription,
**So that** I can operate and test the platform as the first user.

**Acceptance Criteria:**
- Admin email in ADMIN_EMAILS bypasses subscription requirement (existing behavior)
- Admin sees all dashboard tabs including admin-only sections (fleet, metrics)
- NEXT_PUBLIC_BILLING_ENABLED=false during invite-only phase

### US-4: Stripe Webhooks Process Successfully
**As** the platform,
**I want** Stripe webhook events to reach the webhook handler,
**So that** subscription lifecycle events (checkout, payment, cancellation) are processed.

**Acceptance Criteria:**
- POST /api/stripe/webhook is not intercepted by auth middleware
- Stripe signature verification works as the authentication mechanism
- All 5 webhook event types process correctly

### US-5: Cron Jobs Execute on Schedule
**As** the platform,
**I want** Vercel Cron to reach health-check and usage-collection endpoints,
**So that** fleet monitoring and usage metrics continue to function.

**Acceptance Criteria:**
- POST /api/cron/health-check is not intercepted by auth middleware
- POST /api/cron/usage-collection is not intercepted by auth middleware
- verifyCronAuth (timing-safe bearer token) is the authentication mechanism

### US-6: Provisioner Callbacks Update Instance Status
**As** the provisioner service,
**I want** to call the provisioner callback endpoint to report provisioning status,
**So that** instance records are updated and customers see accurate status.

**Acceptance Criteria:**
- POST /api/provisioner/callback is not intercepted by auth middleware
- Secret comparison uses crypto.timingSafeEqual (not plain string comparison)
- Instance status updates correctly on valid callback

### US-7: Security Headers Protect Against Common Attacks
**As** the platform,
**I want** standard security response headers on all pages,
**So that** the application is protected against clickjacking, MIME sniffing, and information leakage.

**Acceptance Criteria:**
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Strict-Transport-Security: max-age=31536000; includeSubDomains
- Permissions-Policy: camera=(), microphone=(), geolocation=()

### US-8: Engine-Client Returns Correct Data Shapes
**As** the dashboard and usage collection system,
**I want** engine-client functions to return unwrapped arrays (not envelope objects),
**So that** job listings, conversation lists, and usage metrics display correct data.

**Acceptance Criteria:**
- getJobs() returns an array of jobs, not {jobs: [...], limit, offset}
- getConversations() returns an array of conversations
- getConversationMessages() returns an array of messages
- getEngineLogs() returns an array of strings (verify current behavior)
- Usage collection correctly counts today's jobs and conversations

### US-9: No Fallback Secrets in Production Code
**As** the platform,
**I want** missing environment variables to cause immediate, clear errors at startup,
**So that** misconfiguration is caught before serving requests with weak/no secrets.

**Acceptance Criteria:**
- unsubscribe.ts throws if BETTER_AUTH_SECRET is missing (no fallback string)
- db/index.ts throws if DATABASE_URL is missing (no non-null assertion)
- Error messages are clear and name the missing variable

---

## Out of Scope

- Distributed rate limiting (Upstash/Vercel KV) — acceptable at current scale
- Bot token encryption at rest in engine SQLite — deferred
- Terms of Service / Privacy Policy pages — deferred
- Waitlist-to-signup conversion logic — deferred
- Custom 404 page — deferred
- Plan upgrade/downgrade flow — deferred (handled via Stripe portal)
- `--channels` permission relay investigation — separate feature

---

## Technical Notes

### Middleware Whitelist
Add specific paths to PUBLIC_API_PREFIXES, NOT broad prefixes:
- `/api/stripe/webhook` (not `/api/stripe` — checkout and portal must stay protected)
- `/api/cron` (prefix — both cron routes need it)
- `/api/provisioner/callback`
- `/api/email/unsubscribe`

### Invite Gate Implementation
better-auth may support a `denySignUp` hook or `hooks.before` handler. Research the exact API. Fallback: create a server action or API route that validates the email before the better-auth sign-up call reaches the database.

### Engine-Client Response Shapes
The Go engine returns enveloped responses:
- GET /api/jobs → `{jobs: [...], limit, offset}`
- GET /api/conversations → `{conversations: [...], limit, offset}`
- GET /api/conversations/:id/messages → `{messages: [...], limit, offset}`
- GET /api/logs → `{lines: [...]}`

The engine-client functions must unwrap these envelopes to match their declared return types.

### Landing Page Copy
Step 2 currently says "Create a free OpenRouter account, grab your API key, paste it in."
Replace with Claude Code subscription messaging. The exact copy should reflect:
- Customer subscribes to Claude Pro or Max from Anthropic
- They connect their account through a simple login flow
- No API keys to manage

Privacy section claims "API keys encrypted at rest with AES-256" and "You bring your own AI key" — both reference the old BYOK model and need updating for the BYOS (Bring Your Own Subscription) model.

---

## Dependencies

- No external dependencies — all changes are within the overnightdesk repo
- No database schema changes required
- No engine changes required (response shapes are correct on the engine side)

---

## Constitutional Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| P1: Data Sacred | Compliant | No changes to data access patterns |
| P2: Security | **Fixes violations** | Timing-safe auth, security headers, no fallback secrets |
| P4: Simple Over Clever | Compliant | INVITED_EMAILS follows existing ADMIN_EMAILS pattern |
| P6: Honesty | **Fixes violation** | Landing page copy will accurately describe the product |
| P7: Owner's Time | Compliant | Middleware fix enables automated webhook/cron flows |
| P8: Platform Quality | Compliant | Accurate error messages for invite-only rejection |
| Test-First | Required | All changes must have tests, 80%+ coverage |
