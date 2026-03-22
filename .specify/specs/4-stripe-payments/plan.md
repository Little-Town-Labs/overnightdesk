# Implementation Plan — Feature 4: Stripe Payments

**Branch:** 4-stripe-payments
**Specification:** .specify/specs/4-stripe-payments/spec.md
**Created:** 2026-03-22

---

## Executive Summary

Integrate Stripe billing into the existing Next.js platform. Users select a plan on the pricing page, complete checkout via Stripe-hosted page, and receive an active subscription. Stripe webhooks maintain subscription state in NeonDB. A subscription gate restricts dashboard access to paying users (or admin accounts). A feature flag allows disabling billing enforcement during development.

No schema migrations needed — Feature 1 already created the subscription table with all required fields.

---

## Architecture Overview

```
Browser                     Vercel (Next.js)                 Stripe
  │                              │                              │
  ├── GET /pricing ─────────────►│ (public, server component)   │
  │                              │                              │
  ├── POST /api/stripe/checkout ►│──── Create Checkout ────────►│
  │◄─────── redirect URL ───────│◄──── Session URL ────────────│
  │                              │                              │
  │──── Stripe Checkout page ───►│                              │
  │◄─────── success redirect ───│                              │
  │                              │                              │
  │                              │◄──── Webhook events ────────│
  │                              │  (checkout.session.completed, │
  │                              │   invoice.paid/failed,        │
  │                              │   subscription.updated/deleted)│
  │                              │                              │
  │                              │──── Upsert subscription ──► NeonDB
  │                              │──── Audit log ─────────────► NeonDB
  │                              │──── Payment failure email ──► Resend
  │                              │                              │
  ├── POST /api/stripe/portal ──►│──── Create Portal ──────────►│
  │◄─────── portal URL ────────│◄──── Session URL ────────────│
  │                              │                              │
  ├── GET /dashboard ───────────►│                              │
  │  (requireSubscription check) │                              │
  │◄─────── dashboard or gate ──│                              │
```

### File Layout

```
src/
├── lib/
│   ├── stripe.ts                    # Stripe client instance
│   ├── billing.ts                   # requireSubscription(), isAdmin(), isBillingEnabled()
│   └── __tests__/
│       ├── billing.test.ts          # Subscription gating + admin + feature flag tests
│       └── stripe-webhook.test.ts   # Webhook handler tests
├── app/
│   ├── pricing/
│   │   └── page.tsx                 # Public pricing page (server component)
│   ├── checkout/
│   │   └── success/
│   │       └── page.tsx             # Post-checkout success page
│   ├── (protected)/
│   │   ├── layout.tsx               # Add subscription check here
│   │   └── dashboard/
│   │       └── page.tsx             # Add subscription status display
│   └── api/
│       └── stripe/
│           ├── checkout/route.ts    # POST: create checkout session
│           ├── webhook/route.ts     # POST: process Stripe events
│           └── portal/route.ts      # POST: create portal session
│       └── subscription/
│           └── route.ts             # GET: current user subscription status
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Stripe SDK | `stripe` (official Node.js) | Constitutional requirement. Type-safe, signature verification built-in |
| Checkout | Stripe Checkout (redirect) | Constitutional requirement. Zero PCI scope on our side |
| Billing portal | Stripe Customer Portal | Constitutional requirement. No custom billing UI |
| Feature flag | `NEXT_PUBLIC_BILLING_ENABLED` env var | Simple, no new dependencies (Principle 4) |
| Admin bypass | `ADMIN_EMAILS` env var | 2-3 emails, no DB changes needed |

---

## Technical Decisions

See `research.md` for full decision records. Key decisions:

1. **Stripe Checkout redirect** over embedded Elements — per constitution, eliminates PCI scope
2. **Handler map pattern** for webhooks — dispatch per event type, testable independently
3. **Utility function `requireSubscription()`** — shared by layout and API routes, mirrors existing auth pattern
4. **Env var for admin emails** — comma-separated, no DB changes
5. **`NEXT_PUBLIC_BILLING_ENABLED` flag** — client+server accessible, requires redeploy to toggle

---

## Implementation Phases

### Phase 1: Foundation (Stripe Client + Billing Utilities)

**Files:** `src/lib/stripe.ts`, `src/lib/billing.ts`

1. Create Stripe client instance (reads `STRIPE_SECRET_KEY` from env)
2. Implement `isBillingEnabled()` — reads `NEXT_PUBLIC_BILLING_ENABLED`
3. Implement `isAdmin(email)` — checks email against `ADMIN_EMAILS` env var
4. Implement `requireSubscription(userId, userEmail)` — combines billing flag + admin check + DB query
5. Implement `getSubscriptionForUser(userId)` — Drizzle query on subscription table

**Dependencies:** None (uses existing schema)

### Phase 2: Webhook Handler

**Files:** `src/app/api/stripe/webhook/route.ts`

1. POST handler: read raw body, verify Stripe signature
2. Dispatch to event-specific handlers via handler map
3. `handleCheckoutCompleted` — upsert subscription (create with Stripe IDs, plan, status)
4. `handleInvoicePaid` — update status to "active", update currentPeriodEnd
5. `handleInvoicePaymentFailed` — update status to "past_due", send payment failure email
6. `handleSubscriptionUpdated` — update status, plan, currentPeriodEnd
7. `handleSubscriptionDeleted` — update status to "canceled"
8. All handlers log to `platform_audit_log`
9. All handlers are idempotent (upsert by stripeSubscriptionId)

**Dependencies:** Phase 1 (Stripe client)

**Important:** Next.js App Router strips the raw body by default. The webhook route must use `export const config = { api: { bodyParser: false } }` or read from `request.text()` to access raw body for signature verification.

### Phase 3: Checkout + Portal API Routes

**Files:** `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/portal/route.ts`, `src/app/api/subscription/route.ts`

1. Checkout route:
   - Validate plan (Zod: "starter" | "pro")
   - Check auth session
   - Check no existing active subscription
   - Check not admin (admins don't need checkout)
   - Map plan to price ID from env var
   - Create Stripe Checkout Session with `client_reference_id`, `customer_email`, success/cancel URLs
   - Return checkout URL

2. Portal route:
   - Check auth session
   - Find subscription with stripeCustomerId
   - Create Stripe Billing Portal session with `return_url`
   - Return portal URL

3. Subscription status route:
   - Check auth session
   - Return subscription data (or admin/billing-disabled status)

**Dependencies:** Phase 1 (billing utilities), Phase 2 (webhook creates subscriptions)

### Phase 4: Frontend Pages

**Files:** `src/app/pricing/page.tsx`, `src/app/checkout/success/page.tsx`, `src/app/(protected)/layout.tsx`, `src/app/(protected)/dashboard/page.tsx`

1. **Pricing page** (public, server component):
   - Display Starter and Pro plans with prices and features
   - BYOS (Bring Your Own Subscription) notice
   - CTA buttons → checkout API (or sign-in redirect if not authenticated)
   - Read billing flag to adjust messaging if billing disabled

2. **Checkout success page:**
   - Read `session_id` from URL params
   - Display confirmation (plan name, next steps)
   - Link to dashboard
   - Idempotent — safe to refresh

3. **Protected layout update:**
   - After auth check, call `requireSubscription()`
   - If not allowed and billing enabled, redirect to `/pricing`
   - If past_due, allow access but pass warning flag

4. **Dashboard update:**
   - Display subscription status card (plan, status, next billing date)
   - "Manage Billing" link → portal API
   - Past-due warning banner with link to update payment method

**Dependencies:** Phase 3 (API routes)

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Webhook signature verification | `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET` |
| No session on webhook route | Webhook verifies Stripe signature, not user session |
| Price ID manipulation | Price IDs from env vars, not user input. Checkout session created server-side |
| Admin bypass abuse | Admin list in env var, not user-controllable. Env vars set in Vercel |
| Duplicate subscriptions | Check existing active subscription before creating checkout |
| Raw body for signature | Use `request.text()` in Next.js App Router, not parsed JSON |
| Stripe keys in code | All keys in env vars per constitution |
| CSRF on checkout/portal | POST routes verify session. Stripe Checkout is a redirect, not a form |

---

## Performance Strategy

| Concern | Approach |
|---------|---------|
| Webhook response time | < 5s target. DB upsert + audit log + email send (async) |
| Pricing page | Server component, no client JS needed. Static content + env var for prices |
| Subscription check | Single DB query per request. Could add server-side caching later if needed |
| Checkout creation | Single Stripe API call (~200ms). Acceptable latency |

---

## Testing Strategy

### Unit Tests
- `billing.test.ts`: `requireSubscription()` with all combinations:
  - Billing disabled → always allowed
  - Admin email → always allowed
  - Active subscription → allowed
  - Past_due subscription → allowed
  - Canceled subscription → not allowed
  - No subscription → not allowed
- `isAdmin()` with matching/non-matching emails
- `isBillingEnabled()` with various env values

### Integration Tests
- `stripe-webhook.test.ts`: Each webhook event handler independently:
  - `checkout.session.completed` → creates subscription
  - `invoice.paid` → updates to active
  - `invoice.payment_failed` → updates to past_due + sends email
  - `customer.subscription.updated` → updates fields
  - `customer.subscription.deleted` → marks canceled
  - Duplicate event → idempotent (same result)
  - Invalid signature → 400 response
- Webhook handlers use mocked Stripe SDK and mocked DB

### API Route Tests
- Checkout: valid plan, invalid plan, existing subscription, unauthenticated, admin
- Portal: with subscription, without subscription, unauthenticated
- Subscription status: with sub, without sub, admin, billing disabled

### E2E Tests (deferred to Feature 5+)
- Full checkout flow requires Stripe test mode + webhook forwarding
- Will be implemented when provisioning pipeline (Feature 5) connects checkout to container creation

---

## Deployment Strategy

### Environment Variables to Add

**Vercel (production):**
```
STRIPE_SECRET_KEY=sk_live_xxx (or sk_test_xxx for staging)
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_STARTER_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
NEXT_PUBLIC_BILLING_ENABLED=false  (start disabled, enable when ready)
ADMIN_EMAILS=gary@littletownlabs.com
```

**Local (.env.local):**
```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx (from stripe cli listen)
STRIPE_STARTER_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
NEXT_PUBLIC_BILLING_ENABLED=true
ADMIN_EMAILS=gary@littletownlabs.com
```

### Stripe Dashboard Setup (One-Time)

1. Create products: "OvernightDesk Starter", "OvernightDesk Pro"
2. Create monthly prices for each product
3. Configure Customer Portal (allow cancellation, payment method update)
4. Add webhook endpoint: `https://overnightdesk.com/api/stripe/webhook`
5. Subscribe to events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`

### Stripe CLI for Local Development

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Outputs whsec_xxx for STRIPE_WEBHOOK_SECRET
```

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Webhook delivery failure | Low | High | Stripe retries automatically. Handlers are idempotent |
| Out-of-order webhooks | Medium | Medium | Use Stripe-reported status, not event sequence inference |
| Duplicate checkout sessions | Low | Medium | Check existing subscription before creating checkout |
| Next.js raw body parsing | Medium | High | Use `request.text()` for signature verification, test explicitly |
| Grace period timing | Low | Medium | Stripe handles retry schedule. We just read the status they report |
| Admin email env var typo | Low | Low | Admin list is small, easy to verify |

---

## Constitutional Compliance

- [x] **Principle 2 (Security):** Webhook signature verification, session auth on all routes, keys in env vars
- [x] **Principle 4 (Simple):** Stripe Checkout redirect, Customer Portal, env var feature flag — no custom billing UI
- [x] **Principle 5 (Business Pays for Itself):** Stripe free tier (no monthly fee, 2.9% + 30c per transaction)
- [x] **Principle 6 (Honesty):** Pricing page shows BYOS requirement clearly
- [x] **Principle 7 (Owner's Time):** Self-service billing via Customer Portal
- [x] **Stripe Integration Rules:** Official SDK, signature verification, env var price IDs, test mode for dev, Customer Portal for self-service
- [x] **Pillar B (API Route Security):** All routes check auth or webhook signature
- [x] **Test-First Imperative:** TDD for all billing logic, webhook handlers, and API routes
- [x] **No exceptions or deviations**
