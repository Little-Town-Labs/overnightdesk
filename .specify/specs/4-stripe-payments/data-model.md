# Data Model — Feature 4: Stripe Payments

## Existing Schema (No Changes Needed)

The subscription table already exists in `src/db/schema.ts` with all required fields:

### subscription (existing)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | text (UUID) | Primary Key | Auto-generated UUID |
| userId | text | FK → user.id, CASCADE, Not Null | Owning user |
| stripeCustomerId | text | Nullable | Stripe customer ID (cus_xxx) |
| stripeSubscriptionId | text | Nullable | Stripe subscription ID (sub_xxx) |
| plan | subscription_plan enum | Not Null | "starter" or "pro" |
| status | subscription_status enum | Not Null | "active", "past_due", "canceled", "trialing" |
| currentPeriodEnd | timestamp (tz) | Nullable | End of current billing period |
| createdAt | timestamp (tz) | Not Null, default now() | Record creation |
| updatedAt | timestamp (tz) | Not Null, default now() | Last update |

### Enums (existing)
- `subscription_plan`: "starter", "pro"
- `subscription_status`: "active", "past_due", "canceled", "trialing"

### Relations (existing)
- `subscription.userId` → `user.id` (many-to-one, cascade delete)
- `userRelations` includes `subscriptions: many(subscription)`

## Schema Assessment

The Feature 1 (Platform Schema) migration already created all tables and enums needed for billing. No new migrations are required for Feature 4.

**What the webhook handlers will populate:**
- `stripeCustomerId` — set on `checkout.session.completed` (Stripe creates the customer)
- `stripeSubscriptionId` — set on `checkout.session.completed`
- `plan` — determined from the Stripe price ID in the checkout session
- `status` — updated on every webhook event (`invoice.paid` → active, `invoice.payment_failed` → past_due, `customer.subscription.deleted` → canceled)
- `currentPeriodEnd` — updated on `invoice.paid` and `customer.subscription.updated`

## Audit Logging

Subscription state changes will be logged to the existing `platform_audit_log` table:

| actor | action | target | details |
|-------|--------|--------|---------|
| "stripe-webhook" | "subscription.created" | user:{id} | { stripeSubscriptionId, plan, status } |
| "stripe-webhook" | "subscription.updated" | user:{id} | { oldStatus, newStatus, event } |
| "stripe-webhook" | "payment.failed" | user:{id} | { invoiceId, amount } |
| "stripe-webhook" | "subscription.canceled" | user:{id} | { reason } |

## Indexes Needed

The current schema does not have explicit indexes on subscription lookup fields. Consider adding:
- `subscription.userId` — already has FK, Postgres may auto-index
- `subscription.stripeSubscriptionId` — for webhook upsert lookups (unique)
- `subscription.stripeCustomerId` — for customer portal session creation

These can be added as part of the implementation if query performance requires it.
