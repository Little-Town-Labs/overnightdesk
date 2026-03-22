# Feature 3: Transactional Email

**Branch:** 3-transactional-email
**Status:** Draft
**Priority:** P0 (Critical)
**Complexity:** Small
**Created:** 2026-03-21

---

## Overview

OvernightDesk needs a transactional email service to deliver critical system messages: email verification, password resets, welcome emails, payment notifications, and provisioning confirmations. These emails are essential for the authentication flow (Feature 2) and the billing flow (Feature 4). Without them, users cannot verify their accounts or recover passwords.

The system currently uses console.log stubs where emails should be sent. This feature replaces those stubs with real email delivery and adds the additional email types required by downstream features.

**Business Value:** Users cannot complete registration or reset passwords without email delivery. Payment and provisioning notifications reduce support burden. This is not optional infrastructure — it is a P0 dependency for the auth and billing flows.

---

## User Stories

### User Story 1: Email Verification on Registration
**As a** new user
**I want** to receive a verification email after registering
**So that** I can confirm my email address and access my account

**Acceptance Criteria:**
- [ ] User receives an email within 60 seconds of registration
- [ ] Email contains a verification link that activates their account
- [ ] Email clearly identifies the sender as OvernightDesk
- [ ] Email renders correctly on mobile and desktop email clients
- [ ] If the email is not received, user can request a resend from the verification page

**Priority:** High

---

### User Story 2: Password Reset Email
**As a** user who forgot their password
**I want** to receive a password reset email
**So that** I can regain access to my account securely

**Acceptance Criteria:**
- [ ] User receives a reset email within 60 seconds of requesting it
- [ ] Email contains a time-limited reset link (expires in 1 hour)
- [ ] Email warns user if they did not request the reset
- [ ] Reset link is single-use — clicking it a second time shows an expired message
- [ ] Email does not reveal whether the email address exists in the system (silent failure for unknown emails)

**Priority:** High

---

### User Story 3: Welcome Email After Verification
**As a** newly verified user
**I want** to receive a welcome email
**So that** I know my account is ready and understand what to do next

**Acceptance Criteria:**
- [ ] Email is sent immediately after email verification succeeds
- [ ] Email includes a link to the dashboard
- [ ] Email briefly explains the next step (subscribe to get started)
- [ ] Email identifies former waitlist members with a personalized note ("You're off the waitlist!")

**Priority:** Medium

---

### User Story 4: Payment Failure Notification
**As a** subscriber whose payment failed
**I want** to be notified promptly
**So that** I can update my payment method before losing access

**Acceptance Criteria:**
- [ ] Email is sent within 5 minutes of a payment failure event
- [ ] Email clearly states the payment failed and the amount
- [ ] Email includes a link to update payment method (Stripe Customer Portal)
- [ ] Email states the grace period remaining before service suspension
- [ ] If multiple payment failures occur, user does not receive duplicate emails within 24 hours

**Priority:** High

---

### User Story 5: Provisioning Confirmation
**As a** new subscriber
**I want** to be notified when my Claude Code instance is ready
**So that** I can start using the service immediately

**Acceptance Criteria:**
- [ ] Email is sent when instance status transitions to `awaiting_auth` or `running`
- [ ] Email includes the dashboard URL where they can access their instance
- [ ] Email includes their bearer token for API access (if applicable)
- [ ] Email briefly explains the onboarding process (connect Claude Code)

**Priority:** Medium

---

### User Story 6: Unsubscribe from Non-Essential Emails
**As a** user
**I want** to opt out of non-essential emails
**So that** I only receive messages critical to my account

**Acceptance Criteria:**
- [ ] Non-essential emails (welcome, provisioning confirmation) include an unsubscribe link
- [ ] Essential emails (verification, password reset, payment failure) do NOT include an unsubscribe option
- [ ] Unsubscribe preference is stored and respected for future sends
- [ ] Unsubscribing from one category does not affect essential emails

**Priority:** Low

---

## Functional Requirements

### FR-1: Email Delivery
The system MUST send transactional emails for the following events:
1. User registration (email verification link)
2. Password reset request (reset link)
3. Email verification success (welcome email)
4. Payment failure (notification with portal link)
5. Provisioning completion (instance ready notification)
6. Verification email resend (re-send verification link)

### FR-2: Email Content
Each email MUST include:
- Clear sender identity (from: "OvernightDesk" with a verified domain)
- Plain text fallback for all HTML emails
- Responsive HTML that renders correctly on major email clients (Gmail, Outlook, Apple Mail)
- A footer with the company name and physical address (CAN-SPAM requirement)

### FR-3: Rate Limiting
The system MUST prevent email abuse:
- Maximum 3 verification email resends per 5-minute window per user
- Maximum 3 password reset requests per 5-minute window per email
- No duplicate payment failure emails within 24 hours for the same subscription

### FR-4: Unsubscribe
Non-essential emails MUST include a one-click unsubscribe link per CAN-SPAM regulations. Essential emails (verification, password reset, payment failure) are exempt from unsubscribe.

### FR-5: Email Logging
All sent emails MUST be logged with:
- Recipient email address
- Email type (verification, reset, welcome, payment_failure, provisioning)
- Timestamp
- Delivery status (sent, failed)
- Error details on failure

### FR-6: Sender Configuration
The system MUST send from a verified domain (e.g., `noreply@overnightdesk.com` or configurable via environment variable). Replies MUST be directed to a support address or clearly marked as no-reply.

---

## Non-Functional Requirements

### Performance
- Email delivery initiated within 500ms of the triggering event
- Email arrives in user's inbox within 60 seconds (dependent on provider SLA)

### Reliability
- Failed email sends MUST be retried automatically (up to 3 attempts with exponential backoff)
- If all retries fail, the failure MUST be logged and the email marked as failed
- Email delivery failures MUST NOT block the triggering operation (registration completes even if email send fails)

### Security
- Email templates MUST NOT contain sensitive data (passwords, tokens beyond reset links)
- Reset and verification links MUST use HTTPS
- Email content MUST NOT include customer conversation data or AI output (Constitution Principle 1)

### Compliance
- CAN-SPAM: Physical address in footer, unsubscribe on non-essential emails
- Email content stored only as delivery logs — no email body retention

---

## Edge Cases & Error Handling

### EC-1: Email Provider Down
If the email provider is unavailable, the system logs the failure and retries. The triggering operation (registration, password reset) still completes. User sees a message: "We're having trouble sending emails. Please try again in a few minutes."

### EC-2: Invalid Email Address
If the email provider rejects the address as invalid (hard bounce), the system logs the rejection. No retries are attempted for hard bounces.

### EC-3: Email Already Verified
If a user requests verification email resend but is already verified, the system does not send an email and returns a success message (no information leakage about verification status to third parties).

### EC-4: Rapid-Fire Resend Requests
If a user repeatedly clicks "resend", rate limiting (FR-3) prevents excessive sends. User sees: "Please wait a few minutes before requesting another email."

### EC-5: Unsubscribed User Triggers Essential Email
If an unsubscribed user triggers a password reset, the email is still sent — essential emails bypass unsubscribe preferences.

### EC-6: Email Template Rendering Failure
If a template fails to render, the system falls back to a plain-text version. If that also fails, the failure is logged and no email is sent.

### EC-7: Bearer Token in Provisioning Email
The bearer token in the provisioning email is a one-time display. The email warns: "Save this token — it will not be shown again." If the token is lost, the user can regenerate it from the dashboard.

### EC-8: Duplicate Webhook Events
Stripe may send duplicate payment failure events. The system uses idempotency checks (FR-3) to prevent sending duplicate payment failure emails.

---

## Success Metrics

- **Delivery rate**: > 98% of emails delivered successfully (not bounced)
- **Delivery speed**: 95th percentile inbox arrival < 60 seconds
- **Verification completion**: > 70% of users verify email within 24 hours
- **Support reduction**: Password reset and verification support tickets decrease by 80% after launch

---

## Dependencies

- **Feature 2 (User Authentication)**: Email verification and password reset callbacks are already stubbed in `auth.ts`
- **Feature 4 (Stripe Payments)**: Payment failure notifications require webhook integration (future)
- **Feature 5 (Provisioning)**: Provisioning confirmation requires instance status events (future)

---

## Out of Scope

- Marketing emails or newsletters
- SMS notifications
- Push notifications
- Email template editor (admin UI)
- A/B testing of email content
- Custom email domains per tenant
