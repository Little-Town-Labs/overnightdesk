# Task Breakdown — Feature 4: Stripe Payments

**Branch:** 4-stripe-payments
**Plan:** .specify/specs/4-stripe-payments/plan.md
**Created:** 2026-03-22

---

## Phase 1: Foundation (Stripe Client + Billing Utilities)

### Task 1.1: Billing Utilities — Tests
**Status:** 🟡 Ready
**Effort:** 2 hours
**Dependencies:** None
**User Stories:** US-6 (Gate Features), US-7 (View Status)

**Description:**
Write comprehensive unit tests for billing utility functions. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for `isBillingEnabled()`:
  - Returns `true` when `NEXT_PUBLIC_BILLING_ENABLED=true`
  - Returns `false` when env is `false`, empty, or undefined
- [ ] Tests for `isAdmin(email)`:
  - Returns `true` when email is in `ADMIN_EMAILS`
  - Returns `false` when email is not in list
  - Handles case-insensitive comparison
  - Handles empty/undefined `ADMIN_EMAILS`
  - Handles whitespace in comma-separated list
- [ ] Tests for `requireSubscription(userId, userEmail)`:
  - Billing disabled → `{ allowed: true, reason: "billing_disabled" }`
  - Admin email → `{ allowed: true, reason: "admin" }`
  - Active subscription → `{ allowed: true, subscription }`
  - Past_due subscription → `{ allowed: true, subscription }`
  - Canceled subscription → `{ allowed: false, reason: "canceled" }`
  - No subscription → `{ allowed: false, reason: "no_subscription" }`
- [ ] Tests for `getSubscriptionForUser(userId)`:
  - Returns subscription record when exists
  - Returns null when no subscription
- [ ] All tests confirmed to FAIL (no implementation exists)

---

### Task 1.2: Billing Utilities — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 1.5 hours
**Dependencies:** Task 1.1

**Description:**
Implement billing utility functions to pass all tests from Task 1.1.

**Acceptance Criteria:**
- [ ] `src/lib/stripe.ts` — Stripe client instance (`new Stripe(process.env.STRIPE_SECRET_KEY)`)
- [ ] `src/lib/billing.ts` — exports `isBillingEnabled()`, `isAdmin()`, `requireSubscription()`, `getSubscriptionForUser()`
- [ ] All tests from 1.1 pass
- [ ] No hardcoded secrets or email addresses

---

### Task 1.3: Environment Setup
**Status:** 🟡 Ready
**Effort:** 0.5 hours
**Dependencies:** None
**Parallel with:** Task 1.1

**Description:**
Install Stripe SDK and configure environment variables.

**Acceptance Criteria:**
- [ ] `stripe` package added to dependencies
- [ ] `.env.example` updated with all new Stripe env vars
- [ ] `.env.local` updated with test-mode Stripe keys
- [ ] `NEXT_PUBLIC_BILLING_ENABLED`, `ADMIN_EMAILS` documented
- [ ] Build passes with new dependency

---

## Phase 2: Webhook Handler

### Task 2.1: Webhook Handler — Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 3 hours
**Dependencies:** Task 1.2
**User Stories:** US-2, US-3, US-4

**Description:**
Write comprehensive tests for all Stripe webhook event handlers. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for signature verification:
  - Valid signature → processes event
  - Invalid/missing signature → returns 400
- [ ] Tests for `handleCheckoutCompleted`:
  - Creates subscription record with correct fields (userId, stripeCustomerId, stripeSubscriptionId, plan, status="active", currentPeriodEnd)
  - Maps Stripe price ID → plan enum correctly
  - Logs to platform_audit_log
- [ ] Tests for `handleInvoicePaid`:
  - Updates subscription status to "active"
  - Updates currentPeriodEnd
  - Logs to platform_audit_log
- [ ] Tests for `handleInvoicePaymentFailed`:
  - Updates subscription status to "past_due"
  - Calls `sendPaymentFailureEmail()` with correct args (user, amount, portalUrl)
  - Logs to platform_audit_log
- [ ] Tests for `handleSubscriptionUpdated`:
  - Updates status, plan, currentPeriodEnd
  - Logs to platform_audit_log
- [ ] Tests for `handleSubscriptionDeleted`:
  - Updates status to "canceled"
  - Logs to platform_audit_log
- [ ] Idempotency test: processing same event twice produces same DB state
- [ ] Unknown event type → acknowledged (200) but not processed
- [ ] All tests confirmed to FAIL

---

### Task 2.2: Webhook Handler — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 3 hours
**Dependencies:** Task 2.1

**Description:**
Implement Stripe webhook route and all event handlers to pass tests from Task 2.1.

**Acceptance Criteria:**
- [ ] `src/app/api/stripe/webhook/route.ts` — POST handler
- [ ] Raw body parsing via `request.text()` for signature verification
- [ ] `stripe.webhooks.constructEvent()` for signature validation
- [ ] Handler map dispatching to event-specific functions
- [ ] All 5 event handlers implemented (checkout.completed, invoice.paid, invoice.payment_failed, subscription.updated, subscription.deleted)
- [ ] Upsert pattern by stripeSubscriptionId for idempotency
- [ ] Payment failure email integration via `sendPaymentFailureEmail()` from Feature 3
- [ ] Audit logging to platform_audit_log for all state changes
- [ ] All tests from 2.1 pass
- [ ] No session auth on webhook route (signature-only)

---

## Phase 3: Checkout + Portal API Routes

### Task 3.1: Checkout & Portal API — Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 2 hours
**Dependencies:** Task 1.2
**Parallel with:** Task 2.1
**User Stories:** US-2, US-5

**Description:**
Write tests for checkout session creation, portal session creation, and subscription status API. **TESTS FIRST** (TDD).

**Acceptance Criteria:**
- [ ] Tests for `POST /api/stripe/checkout`:
  - Valid plan ("starter"/"pro") → returns checkout URL
  - Invalid plan → returns 400
  - Unauthenticated → returns 401
  - Existing active subscription → returns 400
  - Admin account → returns 400 (admins don't need checkout)
  - Maps plan to correct price ID env var
- [ ] Tests for `POST /api/stripe/portal`:
  - User with subscription → returns portal URL
  - User without subscription → returns 404
  - Unauthenticated → returns 401
- [ ] Tests for `GET /api/subscription`:
  - User with active subscription → returns subscription data
  - User without subscription → returns `hasSubscription: false`
  - Admin user → returns admin status with Pro access
  - Billing disabled → returns `billingEnabled: false`
  - Unauthenticated → returns 401
- [ ] All tests confirmed to FAIL

---

### Task 3.2: Checkout & Portal API — Implementation
**Status:** 🔴 Blocked by 3.1
**Effort:** 2 hours
**Dependencies:** Task 3.1

**Description:**
Implement checkout, portal, and subscription status API routes to pass tests from Task 3.1.

**Acceptance Criteria:**
- [ ] `src/app/api/stripe/checkout/route.ts` — POST handler
  - Zod validation for plan
  - Session auth via Better Auth
  - Duplicate subscription check
  - Stripe Checkout Session creation with client_reference_id, customer_email, success/cancel URLs
- [ ] `src/app/api/stripe/portal/route.ts` — POST handler
  - Session auth
  - Subscription lookup for stripeCustomerId
  - Stripe Billing Portal Session creation with return_url
- [ ] `src/app/api/subscription/route.ts` — GET handler
  - Session auth
  - Returns subscription + admin + billing flag status
- [ ] All tests from 3.1 pass
- [ ] All responses follow `{ success, data?, error? }` format

---

## Phase 4: Frontend Pages

### Task 4.1: Pricing Page
**Status:** 🔴 Blocked by 3.2
**Effort:** 2 hours
**Dependencies:** Task 3.2
**User Stories:** US-1

**Description:**
Create public pricing page with plan comparison and checkout CTAs.

**Acceptance Criteria:**
- [ ] `src/app/pricing/page.tsx` — server component (public route)
- [ ] Displays Starter and Pro plans with monthly prices
- [ ] Feature comparison table (resources, what's included)
- [ ] Clear BYOS notice ("Bring your own Claude Code subscription")
- [ ] CTA buttons:
  - Authenticated → POST to checkout API
  - Unauthenticated → redirect to sign-in with return URL
- [ ] Works when billing is disabled (page renders, checkout still works for testing)
- [ ] Dark theme consistent with existing pages (zinc-950 background)
- [ ] Mobile responsive

---

### Task 4.2: Checkout Success Page
**Status:** 🔴 Blocked by 3.2
**Effort:** 1 hour
**Dependencies:** Task 3.2
**Parallel with:** Task 4.1
**User Stories:** US-3

**Description:**
Create post-checkout success page confirming subscription.

**Acceptance Criteria:**
- [ ] `src/app/checkout/success/page.tsx`
- [ ] Reads `session_id` from URL search params (for display only, not for creating records — webhook handles that)
- [ ] Displays confirmation: plan name, next steps
- [ ] Link to dashboard
- [ ] Idempotent — safe to refresh
- [ ] Dark theme consistent with existing pages

---

### Task 4.3: Protected Layout + Dashboard Updates
**Status:** 🔴 Blocked by 3.2
**Effort:** 2 hours
**Dependencies:** Task 3.2
**User Stories:** US-6, US-7

**Description:**
Update protected layout with subscription gate and enhance dashboard with subscription status.

**Acceptance Criteria:**
- [ ] `src/app/(protected)/layout.tsx` updated:
  - After auth check, call `requireSubscription()`
  - If not allowed → redirect to `/pricing`
  - Pass subscription status to children (or let pages query independently)
- [ ] `src/app/(protected)/dashboard/page.tsx` updated:
  - Subscription status card (plan name, status, next billing date)
  - "Manage Billing" button → POST to portal API → redirect
  - Past-due warning banner with link to update payment method
  - Admin badge if admin account
- [ ] Billing-disabled mode: layout allows all authenticated users through

---

## Phase 5: Quality Gates

### Task 5.1: Security Review
**Status:** 🔴 Blocked by 2.2, 3.2
**Effort:** 1 hour
**Dependencies:** Tasks 2.2, 3.2

**Description:**
Run security review on all Stripe-related code.

**Acceptance Criteria:**
- [ ] Webhook signature verification confirmed working
- [ ] No hardcoded Stripe keys or price IDs
- [ ] No sensitive data in client-side code
- [ ] Admin email bypass is server-side only
- [ ] API responses don't leak Stripe internal errors
- [ ] All CRITICAL/HIGH issues resolved

---

### Task 5.2: Code Review + Build Verification
**Status:** 🔴 Blocked by 4.1, 4.2, 4.3
**Effort:** 1 hour
**Dependencies:** All Phase 4 tasks

**Description:**
Final code review, build verification, and test suite run.

**Acceptance Criteria:**
- [ ] All tests pass (`npm test`)
- [ ] Build passes (`npm run build`)
- [ ] No console.log statements in production code
- [ ] No TypeScript errors
- [ ] Code review passed

---

## Dependency Graph

```
Phase 1 (Foundation):
  1.1 (billing tests) ──────► 1.2 (billing impl)
  1.3 (env setup) ──────────────────────────────┐
                                                 │
Phase 2 (Webhooks):                              │
  1.2 ──► 2.1 (webhook tests) ──► 2.2 (webhook impl)
                                                 │
Phase 3 (API Routes):                            │
  1.2 ──► 3.1 (API tests) ──► 3.2 (API impl) ◄──┘
                                   │
Phase 4 (Frontend):                │
  3.2 ──► 4.1 (pricing page)      │
  3.2 ──► 4.2 (success page)      │
  3.2 ──► 4.3 (layout + dashboard)│
                                   │
Phase 5 (Quality):                 │
  2.2, 3.2 ──► 5.1 (security)     │
  4.1, 4.2, 4.3 ──► 5.2 (review)  │
```

**Parallelization Opportunities:**
- Tasks 1.1 and 1.3 can run in parallel (tests + env setup)
- Tasks 2.1 and 3.1 can run in parallel (both depend on 1.2, independent of each other)
- Tasks 4.1, 4.2, and 4.3 can all run in parallel (all depend on 3.2)

---

## Critical Path

```
1.1 → 1.2 → 2.1 → 2.2 → 5.1 → 5.2
```

**Critical path effort:** 2 + 1.5 + 3 + 3 + 1 + 1 = **11.5 hours**
**Total effort (all tasks):** **20 hours**
**With parallelization:** ~**13 hours**

---

## User Story → Task Mapping

| User Story | Tasks |
|-----------|-------|
| US-1: View Pricing | 4.1 |
| US-2: Subscribe via Checkout | 3.1, 3.2, 2.1, 2.2 |
| US-3: Payment Confirmation | 4.2 |
| US-4: Failed Payments | 2.1, 2.2 |
| US-5: Manage Subscription | 3.1, 3.2 |
| US-6: Gate Features | 1.1, 1.2, 4.3 |
| US-7: View Status | 1.1, 1.2, 4.3 |
| FR-13–16: Admin Accounts | 1.1, 1.2 |
| FR-17–20: Feature Flag | 1.1, 1.2 |
