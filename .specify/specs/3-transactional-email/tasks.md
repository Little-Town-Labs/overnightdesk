# Task Breakdown — Feature 3: Transactional Email

**Feature:** 3-transactional-email
**Plan:** `.specify/specs/3-transactional-email/plan.md`
**Total Tasks:** 12
**Total Phases:** 4

---

## Phase 1: Foundation (Schema + Dependencies)

### Task 1.1: Schema & Migration — Tests
**Status:** 🟡 Ready
**Effort:** 1 hour
**Dependencies:** None

**Description:**
Write tests for email_log table, email_type enum, email_status enum, and user.emailOptOut column.

**Acceptance Criteria:**
- [ ] Test email_log table structure (columns, types, constraints)
- [ ] Test email_type and email_status enum values
- [ ] Test user.emailOptOut default value
- [ ] Test email_log foreign key to user
- [ ] Tests confirmed to FAIL

---

### Task 1.2: Schema & Migration — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 1 hour
**Dependencies:** Task 1.1

**Description:**
Add email_log table, enums, and emailOptOut column to schema. Generate migration. Install dependencies.

**Acceptance Criteria:**
- [ ] `resend` and `@react-email/components` installed
- [ ] email_type and email_status enums added to schema
- [ ] email_log table added to schema with proper relations
- [ ] user.emailOptOut column added
- [ ] Migration generated and validated
- [ ] RESEND_API_KEY and EMAIL_FROM added to .env.local and .env.example
- [ ] All tests from 1.1 pass

---

## Phase 2: Core Email Service

### Task 2.1: Email Service — Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 1.5 hours
**Dependencies:** Task 1.2

**Description:**
Write tests for core sendEmail() function, retry logic, logging, and auth-specific email functions.

**Acceptance Criteria:**
- [ ] Test sendEmail() calls Resend API with correct parameters
- [ ] Test retry logic (3 attempts, exponential backoff)
- [ ] Test email_log row created on success
- [ ] Test email_log row created with error on failure
- [ ] Test sendVerificationEmail() formats correct template and calls sendEmail()
- [ ] Test sendPasswordResetEmail() formats correct template and calls sendEmail()
- [ ] Tests confirmed to FAIL

---

### Task 2.2: Email Service — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 1.5 hours
**Dependencies:** Task 2.1

**Description:**
Create src/lib/email.ts with sendEmail(), sendVerificationEmail(), sendPasswordResetEmail(). Create email templates.

**Acceptance Criteria:**
- [ ] src/lib/email.ts exports sendEmail() with retry logic
- [ ] src/lib/emails/email-layout.tsx — shared layout
- [ ] src/lib/emails/verification-email.tsx — verification template
- [ ] src/lib/emails/password-reset-email.tsx — password reset template
- [ ] All tests from 2.1 pass

---

### Task 2.3: Auth Integration
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours
**Dependencies:** Task 2.2

**Description:**
Replace console.log stubs in src/lib/auth.ts with real email service calls.

**Acceptance Criteria:**
- [ ] auth.ts sendResetPassword callback calls sendPasswordResetEmail()
- [ ] auth.ts sendVerificationEmail callback calls sendVerificationEmail()
- [ ] console.log stubs removed
- [ ] Build passes
- [ ] Existing auth tests still pass

---

## Phase 3: Welcome Email + Unsubscribe

### Task 3.1: Welcome Email & Unsubscribe — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 1 hour
**Dependencies:** Task 2.2
**Parallel with:** Task 2.3

**Description:**
Write tests for welcome email, unsubscribe token generation/validation, unsubscribe endpoint, and emailOptOut check.

**Acceptance Criteria:**
- [ ] Test sendWelcomeEmail() skips if user.emailOptOut is true
- [ ] Test sendWelcomeEmail() sends if emailOptOut is false
- [ ] Test welcome email includes waitlist variant text when isWaitlistConvert=true
- [ ] Test unsubscribe token generation produces valid signed token
- [ ] Test unsubscribe endpoint sets user.emailOptOut to true
- [ ] Test unsubscribe endpoint rejects invalid tokens
- [ ] Tests confirmed to FAIL

---

### Task 3.2: Welcome Email & Unsubscribe — Implementation
**Status:** 🔴 Blocked by 3.1
**Effort:** 1.5 hours
**Dependencies:** Task 3.1

**Description:**
Create welcome email template, unsubscribe token utilities, and /api/email/unsubscribe endpoint.

**Acceptance Criteria:**
- [ ] src/lib/emails/welcome-email.tsx — welcome template with waitlist variant
- [ ] sendWelcomeEmail() checks emailOptOut before sending
- [ ] Unsubscribe token generated with signed JWT
- [ ] /api/email/unsubscribe endpoint created
- [ ] Unsubscribe link included in non-essential email templates
- [ ] All tests from 3.1 pass

---

## Phase 4: Future Email Stubs + Template Tests

### Task 4.1: Payment & Provisioning Templates — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours
**Dependencies:** Task 2.2
**Parallel with:** Tasks 2.3, 3.1

**Description:**
Write tests for payment failure and provisioning email functions and templates.

**Acceptance Criteria:**
- [ ] Test sendPaymentFailureEmail() includes amount and portal URL
- [ ] Test sendPaymentFailureEmail() dedup (no send within 24h for same user)
- [ ] Test sendProvisioningEmail() skips if user.emailOptOut is true
- [ ] Test sendProvisioningEmail() includes dashboard URL
- [ ] Tests confirmed to FAIL

---

### Task 4.2: Payment & Provisioning Templates — Implementation
**Status:** 🔴 Blocked by 4.1
**Effort:** 1 hour
**Dependencies:** Task 4.1

**Description:**
Create payment failure and provisioning email templates and functions. These are implemented but not wired to triggers (Feature 4 and 5 will call them).

**Acceptance Criteria:**
- [ ] src/lib/emails/payment-failure-email.tsx — payment failure template
- [ ] src/lib/emails/provisioning-email.tsx — provisioning template
- [ ] sendPaymentFailureEmail() with 24h dedup via email_log query
- [ ] sendProvisioningEmail() with emailOptOut check
- [ ] All tests from 4.1 pass

---

## Phase 5: Integration Validation

### Task 5.1: Integration Tests
**Status:** 🔴 Blocked by 2.3, 3.2, 4.2
**Effort:** 1 hour
**Dependencies:** Tasks 2.3, 3.2, 4.2

**Description:**
Integration tests that verify the full flow: auth callback → email service → database logging.

**Acceptance Criteria:**
- [ ] Integration test: email_log row created when verification email sent
- [ ] Integration test: email_log row created when password reset email sent
- [ ] Integration test: unsubscribe endpoint updates user and prevents future non-essential sends
- [ ] Integration test: payment failure dedup prevents duplicate sends
- [ ] All tests pass with DATABASE_TEST_URL

---

### Task 5.2: Migration & Build Validation
**Status:** 🔴 Blocked by 5.1
**Effort:** 0.5 hours
**Dependencies:** Task 5.1

**Description:**
Apply migration to test database, run full test suite, verify build.

**Acceptance Criteria:**
- [ ] Migration applies cleanly to Neon test branch
- [ ] All tests pass (existing + new)
- [ ] Build passes (`npm run build`)
- [ ] No console.log stubs remaining in auth.ts

---

## Critical Path

```
Task 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 5.1 → 5.2
                              ↘ 3.1 → 3.2 ↗
                              ↘ 4.1 → 4.2 ↗
```

**Parallel opportunities:**
- Tasks 2.3, 3.1, 4.1 can run in parallel after 2.2
- Tasks 3.2 and 4.2 can run in parallel

**Estimated total effort:** ~10 hours
