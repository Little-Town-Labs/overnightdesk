# API Contract — Feature 4: Stripe Payments

## Routes Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/stripe/checkout` | Session | Create Stripe Checkout session, return redirect URL |
| POST | `/api/stripe/webhook` | Stripe signature | Process Stripe webhook events |
| POST | `/api/stripe/portal` | Session | Create Stripe Customer Portal session, return redirect URL |
| GET | `/api/subscription` | Session | Get current user's subscription status |

---

## POST /api/stripe/checkout

Creates a Stripe Checkout session for the authenticated user.

**Request:**
```json
{
  "plan": "starter" | "pro"
}
```

**Validation:** Zod schema — `plan` must be "starter" or "pro".

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "url": "https://checkout.stripe.com/c/pay/cs_xxx..."
  }
}
```

**Error Responses:**
- `401` — Not authenticated
- `400` — Invalid plan or user already has active subscription
- `500` — Stripe API error

**Logic:**
1. Verify session (Better Auth)
2. Check no existing active/past_due subscription
3. Check not an admin account (admins don't need to pay)
4. Create Stripe Checkout Session with:
   - Price ID from env var (`STRIPE_STARTER_PRICE_ID` or `STRIPE_PRO_PRICE_ID`)
   - Customer email pre-filled
   - `client_reference_id` = user.id (links checkout to our user)
   - `success_url` = `/checkout/success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url` = `/pricing`
   - Mode: `subscription`
5. Return checkout URL

---

## POST /api/stripe/webhook

Processes Stripe webhook events. No session auth — uses Stripe signature verification.

**Request:** Raw body (Stripe event payload)
**Headers:** `stripe-signature` (required)

**Success Response:** `200` with `{ received: true }`
**Error Responses:**
- `400` — Missing or invalid signature
- `500` — Processing error (Stripe will retry)

**Events Handled:**

### checkout.session.completed
- Extract `client_reference_id` (our user ID)
- Extract `subscription` ID and `customer` ID from session
- Retrieve Stripe subscription to get price → plan mapping
- Upsert subscription record: userId, stripeCustomerId, stripeSubscriptionId, plan, status="active", currentPeriodEnd
- Log to platform_audit_log

### invoice.paid
- Find subscription by `stripeSubscriptionId`
- Update status to "active", update `currentPeriodEnd`
- Update `updatedAt`
- Log to platform_audit_log

### invoice.payment_failed
- Find subscription by `stripeSubscriptionId`
- Update status to "past_due", update `updatedAt`
- Send payment failure email via `sendPaymentFailureEmail()` (Feature 3)
- Log to platform_audit_log

### customer.subscription.updated
- Find subscription by `stripeSubscriptionId`
- Update status, plan (if changed), `currentPeriodEnd`, `updatedAt`
- Log to platform_audit_log

### customer.subscription.deleted
- Find subscription by `stripeSubscriptionId`
- Update status to "canceled", update `updatedAt`
- Log to platform_audit_log

**Idempotency:** All handlers use upsert/update by `stripeSubscriptionId`. Processing the same event twice produces the same database state.

---

## POST /api/stripe/portal

Creates a Stripe Customer Portal session for self-service billing management.

**Request:** No body needed (uses session user).

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "url": "https://billing.stripe.com/p/session/xxx..."
  }
}
```

**Error Responses:**
- `401` — Not authenticated
- `404` — No subscription found (user hasn't subscribed)
- `500` — Stripe API error

**Logic:**
1. Verify session
2. Find user's subscription with `stripeCustomerId`
3. Create Stripe Billing Portal session with `return_url` = `/dashboard`
4. Return portal URL

---

## GET /api/subscription

Returns the current user's subscription status. Used by frontend for gating and display.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "hasSubscription": true,
    "plan": "pro",
    "status": "active",
    "currentPeriodEnd": "2026-04-22T00:00:00Z",
    "isAdmin": false,
    "billingEnabled": true
  }
}
```

**No subscription (200):**
```json
{
  "success": true,
  "data": {
    "hasSubscription": false,
    "plan": null,
    "status": null,
    "currentPeriodEnd": null,
    "isAdmin": false,
    "billingEnabled": true
  }
}
```

**Admin account (200):**
```json
{
  "success": true,
  "data": {
    "hasSubscription": true,
    "plan": "pro",
    "status": "active",
    "currentPeriodEnd": null,
    "isAdmin": true,
    "billingEnabled": true
  }
}
```

**Error Responses:**
- `401` — Not authenticated

---

## Shared Utility: requireSubscription()

Server-side utility used by protected routes and API endpoints.

**Signature:**
```typescript
async function requireSubscription(userId: string, userEmail: string): Promise<{
  allowed: boolean;
  reason?: "no_subscription" | "canceled" | "billing_disabled" | "admin";
  subscription?: SubscriptionRecord;
}>
```

**Logic:**
1. If `NEXT_PUBLIC_BILLING_ENABLED !== "true"` → return `{ allowed: true, reason: "billing_disabled" }`
2. If email is in `ADMIN_EMAILS` → return `{ allowed: true, reason: "admin" }`
3. Query subscription by userId where status in ("active", "past_due")
4. If found → return `{ allowed: true, subscription }`
5. Else → return `{ allowed: false, reason: "no_subscription" or "canceled" }`

---

## Environment Variables (New)

| Variable | Example | Description |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_xxx` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxx` | Webhook endpoint signing secret |
| `STRIPE_STARTER_PRICE_ID` | `price_xxx` | Stripe price ID for Starter plan |
| `STRIPE_PRO_PRICE_ID` | `price_xxx` | Stripe price ID for Pro plan |
| `NEXT_PUBLIC_BILLING_ENABLED` | `true` | Feature flag for billing enforcement |
| `ADMIN_EMAILS` | `gary@example.com,friend@example.com` | Comma-separated admin emails (bypass billing) |
