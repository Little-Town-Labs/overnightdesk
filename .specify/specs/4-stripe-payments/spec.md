# Feature 4: Stripe Payments

**Branch:** 4-stripe-payments
**Status:** Draft
**Created:** 2026-03-22
**Dependencies:** Feature 2 (User Authentication) — complete

---

## Overview

Authenticated users can subscribe to a paid plan to receive a managed AI assistant instance. The billing system handles plan selection, checkout, subscription lifecycle (renewals, failures, cancellations), and self-service billing management. The system gates provisioning and dashboard access behind an active subscription.

**Business Value:** This is the revenue engine. Without billing, there is no business. Every subsequent feature (provisioning, dashboard, onboarding) depends on a successful payment.

---

## User Stories

### User Story 1: View Pricing and Select a Plan

**As a** visitor or authenticated user
**I want** to see available plans with clear pricing and feature comparison
**So that** I can decide which plan fits my needs

**Acceptance Criteria:**
- [ ] Pricing page displays all available plans with monthly prices
- [ ] Each plan lists what is included (resources, features, limits)
- [ ] Pricing page clearly states that customers must bring their own Claude Code subscription
- [ ] The page works for both unauthenticated visitors and signed-in users
- [ ] A call-to-action button leads to checkout (or sign-in if not authenticated)

**Priority:** High

---

### User Story 2: Subscribe via Checkout

**As an** authenticated user
**I want** to complete payment and start my subscription
**So that** I can get my AI assistant instance provisioned

**Acceptance Criteria:**
- [ ] User is redirected to a secure third-party checkout page
- [ ] Checkout pre-fills the user's email address
- [ ] After successful payment, the user is redirected back to the application
- [ ] The application confirms the subscription is active
- [ ] The subscription record is created in the database with correct plan and status
- [ ] User cannot check out if they already have an active subscription

**Priority:** High

---

### User Story 3: Receive Payment Confirmation

**As a** subscribed user
**I want** to see confirmation that my subscription is active
**So that** I know my payment was processed and my instance will be provisioned

**Acceptance Criteria:**
- [ ] A success page is displayed after checkout completion
- [ ] The success page shows the plan name, billing period, and next steps
- [ ] The subscription status is immediately reflected in the application
- [ ] The user can navigate to the dashboard (which will show provisioning status once Feature 5 is built)

**Priority:** High

---

### User Story 4: Handle Failed Payments

**As a** subscribed user whose payment fails
**I want** to be notified and given time to fix my payment method
**So that** my service is not immediately interrupted

**Acceptance Criteria:**
- [ ] When a payment fails, the subscription enters a grace period (3 days)
- [ ] The user receives an email notification about the failed payment with a link to update their payment method
- [ ] During the grace period, the user retains access to their instance
- [ ] After the grace period expires without resolution, the subscription is marked canceled
- [ ] The user can update their payment method through a self-service billing portal
- [ ] Payment failure emails are deduplicated (max 1 per 24 hours per user)

**Priority:** High

---

### User Story 5: Manage Subscription (Self-Service)

**As a** subscribed user
**I want** to manage my billing, change plans, or cancel my subscription
**So that** I have full control over my account without contacting support

**Acceptance Criteria:**
- [ ] A "Manage Billing" link in the dashboard opens a self-service billing portal
- [ ] The billing portal allows updating payment methods
- [ ] The billing portal allows viewing invoice history
- [ ] The user can cancel their subscription through the billing portal
- [ ] Cancellation takes effect at the end of the current billing period (not immediately)
- [ ] The user can resubscribe after cancellation

**Priority:** High

---

### User Story 6: Gate Features Behind Active Subscription

**As the** platform
**I want** to restrict dashboard and provisioning access to users with active subscriptions
**So that** only paying customers consume infrastructure resources

**Acceptance Criteria:**
- [ ] Users without a subscription see a prompt to subscribe
- [ ] Users with a canceled or expired subscription see a prompt to resubscribe
- [ ] Users with a past_due subscription retain access during the grace period
- [ ] API routes that require subscription check the user's subscription status
- [ ] The subscription check uses the database record (source of truth from webhooks)

**Priority:** High

---

### User Story 7: View Subscription Status

**As a** subscribed user
**I want** to see my current subscription details in the dashboard
**So that** I know my plan, billing date, and account standing

**Acceptance Criteria:**
- [ ] Dashboard displays current plan name
- [ ] Dashboard displays subscription status (active, past_due, canceled)
- [ ] Dashboard displays next billing date
- [ ] Dashboard provides a link to the billing portal for self-service management
- [ ] If subscription is past_due, a warning banner explains the grace period and links to payment update

**Priority:** Medium

---

## Functional Requirements

**FR-1:** The system MUST display a pricing page with plan options, prices, and feature comparisons.

**FR-2:** The system MUST redirect authenticated users to a third-party checkout flow when they select a plan.

**FR-3:** The system MUST process subscription lifecycle events from the payment provider via webhooks, including: subscription created, payment succeeded, payment failed, subscription updated, and subscription deleted.

**FR-4:** Webhook processing MUST be idempotent — processing the same event twice MUST produce the same result.

**FR-5:** The system MUST store subscription status (active, past_due, canceled, trialing) as reported by the payment provider. The platform MUST NOT override the provider's status with local logic.

**FR-6:** When a payment fails, the system MUST transition the subscription to past_due and send a payment failure notification email (using existing email infrastructure from Feature 3).

**FR-7:** The system MUST enforce a 3-day grace period for failed payments before marking the subscription canceled.

**FR-8:** The system MUST provide a link to the payment provider's self-service billing portal for plan changes, payment method updates, and invoice history.

**FR-9:** The system MUST gate dashboard and provisioning routes behind an active (or past_due) subscription.

**FR-10:** The system MUST prevent duplicate subscriptions — a user with an active subscription cannot create a second one.

**FR-11:** Subscription cancellation MUST take effect at the end of the current billing period, not immediately.

**FR-12:** Price identifiers and product identifiers MUST come from environment variables, never hardcoded in source code.

---

## Non-Functional Requirements

**NFR-1 (Security):** Webhook endpoints MUST verify the payment provider's request signature before processing any event.

**NFR-2 (Security):** The webhook endpoint MUST NOT require user session authentication (it receives server-to-server calls).

**NFR-3 (Security):** Payment provider API keys MUST be stored as environment variables, never committed to source code.

**NFR-4 (Performance):** Webhook processing MUST complete within 5 seconds to avoid timeout/retry from the payment provider.

**NFR-5 (Reliability):** If webhook processing fails, the event MUST be retryable (the provider will redeliver).

**NFR-6 (Reliability):** All subscription state changes MUST be logged for audit and debugging.

**NFR-7 (Usability):** The pricing page MUST be accessible to unauthenticated visitors (public route).

**NFR-8 (Usability):** Error messages during checkout or billing MUST be user-friendly — no raw error codes or technical details.

---

## Edge Cases & Error Handling

### Checkout Edge Cases
- **User refreshes success page:** Success page must be idempotent — re-rendering does not create duplicate records.
- **User navigates away during checkout:** No subscription created; user can restart checkout.
- **User has existing canceled subscription:** User can resubscribe via checkout.
- **User opens checkout in two tabs:** Only one subscription should be created (enforced by uniqueness on payment provider's customer ID).

### Webhook Edge Cases
- **Duplicate webhook delivery:** Idempotent processing — upsert by provider subscription ID, not insert.
- **Out-of-order webhook delivery:** Use provider-reported status rather than inferring from event sequence.
- **Webhook arrives before success redirect:** Subscription record may be created by webhook before user sees success page — success page checks existing record.
- **Webhook signature validation fails:** Return 400, do not process event, log the attempt.

### Payment Failure Edge Cases
- **Multiple consecutive failures:** Each failure extends the grace period start, but the total grace period is always 3 days from the first failure.
- **User updates payment method during grace period:** If next payment succeeds, subscription returns to active automatically (handled by provider).
- **Grace period expires:** Subscription marked canceled. User must resubscribe via checkout to restore service.

### Subscription Management Edge Cases
- **User cancels mid-period:** Access continues until period end. No prorated refund (handled by provider policy).
- **User cancels then wants to reactivate:** Must create new subscription via checkout after current period ends.
- **Subscription plan change:** Handled entirely through the billing portal (not custom UI).

---

## Resolved Clarifications

### Plan Differentiation — RESOLVED: Resource Limits
Starter and Pro plans differ by container resource allocation:
- **Starter:** 256MB RAM / 0.25 CPU
- **Pro:** 512MB RAM / 0.5 CPU
Feature set is identical across plans. Usage limits not enforced (flat subscription).

### Trial Period — RESOLVED: No Trial
Pay first, no free trial. At early stage with limited capacity (40 tenants), every provisioned instance should be paying. Trial can be added later.

### Instance Limits — RESOLVED: One Per User
One instance per user. Multiple instances add complexity to billing, provisioning, and dashboard. Revisit after product-market fit.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Checkout completion rate | > 80% (of users who click "Subscribe") |
| Webhook processing success rate | 100% (idempotent, no lost events) |
| Payment failure → resolution rate | > 70% (users fix payment within grace period) |
| Time from checkout to subscription active | < 10 seconds |
| Involuntary churn (failed payments → cancel) | < 5% monthly |

---

## Additional Requirements

### Admin/Free Accounts

A small number of accounts (owner + 1-2 others) MUST bypass payment entirely and receive full Pro-tier access without a Stripe subscription.

**FR-13:** The system MUST support a list of admin email addresses (via environment variable) that are granted full access without payment.

**FR-14:** Admin accounts MUST bypass all subscription checks — they are treated as having an active Pro subscription at all times.

**FR-15:** Admin accounts MUST NOT appear in billing metrics or revenue reporting.

**FR-16:** The admin email list MUST be configurable via environment variable, not hardcoded.

### Billing Feature Flag

The entire billing system MUST be toggleable via a feature flag so that billing can be disabled during development, testing, or pre-launch.

**FR-17:** A feature flag (environment variable) MUST control whether billing enforcement is active.

**FR-18:** When billing is disabled, all authenticated users are treated as having an active subscription (equivalent to admin bypass).

**FR-19:** When billing is enabled, only users with an active/past_due subscription or admin accounts can access gated features.

**FR-20:** The pricing page and checkout flow MUST still render when billing is disabled (for testing), but subscription checks on gated routes are skipped.

---

## Out of Scope

- Usage-based billing (flat subscription only)
- Annual billing (monthly only for MVP)
- Coupon/discount codes
- Referral programs
- Multiple instances per user
- Custom enterprise pricing
- Prorated refunds (handled by payment provider policy)
