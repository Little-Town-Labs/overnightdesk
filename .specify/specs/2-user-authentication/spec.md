# Feature 2: User Authentication

**Feature:** 2-user-authentication
**Priority:** P0 (Critical)
**Source:** PRD v2.1, Section 4 (Authentication Model) + Phase 1
**Constitution:** v1.0.0

---

## Overview

Users need to create accounts, verify their email, sign in, and manage their sessions to access the OvernightDesk platform. Authentication is the gateway to every paid feature — billing, provisioning, and the dashboard all require a verified, authenticated user.

The platform already has waitlist entries with email addresses. Users who previously joined the waitlist should be recognized during registration so the platform can prioritize their onboarding experience.

**Business value:** Without authentication, no user can subscribe or access their instance. This feature unblocks the entire product funnel.

---

## User Stories

### User Story 1: Account Registration
**As a** prospective customer
**I want** to create an account with my email and a password
**So that** I can access the platform and subscribe to a plan

**Acceptance Criteria:**
- [ ] User can register with email address and password
- [ ] User must provide a display name during registration
- [ ] Email addresses must be unique — duplicate registration attempts show a clear error
- [ ] Passwords must meet minimum security requirements (12+ characters)
- [ ] After registration, user receives a verification email
- [ ] User cannot access protected routes until email is verified

**Priority:** High

---

### User Story 2: Email Verification
**As a** newly registered user
**I want** to verify my email address
**So that** the platform knows I own the email and I can proceed to subscribe

**Acceptance Criteria:**
- [ ] User receives a verification email within 60 seconds of registration
- [ ] Verification link/code expires after 24 hours
- [ ] Clicking a valid verification link marks the account as verified
- [ ] Expired or invalid verification links show a clear error with an option to resend
- [ ] User can request a new verification email if the original was lost or expired
- [ ] Resend is rate-limited (max 3 requests per hour)

**Priority:** High

---

### User Story 3: Sign In and Sign Out
**As a** registered user
**I want** to sign in with my email and password and sign out when done
**So that** I can securely access my dashboard and instance

**Acceptance Criteria:**
- [ ] User can sign in with correct email and password
- [ ] Incorrect credentials show a generic error (no indication of whether email or password was wrong)
- [ ] Session persists across browser refreshes (cookie-based)
- [ ] User can sign out, which invalidates the current session
- [ ] After sign out, accessing protected routes redirects to sign in
- [ ] Sessions expire after a configurable inactivity period (default: 7 days)

**Priority:** High

---

### User Story 4: Password Reset
**As a** user who forgot their password
**I want** to reset my password via email
**So that** I can regain access to my account

**Acceptance Criteria:**
- [ ] User can request a password reset by providing their email
- [ ] Reset request always shows a success message (even if email doesn't exist — prevents enumeration)
- [ ] If the email exists, a reset link is sent within 60 seconds
- [ ] Reset link expires after 1 hour
- [ ] User can set a new password via the reset link
- [ ] After reset, all existing sessions for that user are invalidated
- [ ] Reset request is rate-limited (max 3 per hour per email)

**Priority:** High

---

### User Story 5: Protected Routes
**As a** platform operator
**I want** dashboard and settings pages to require authentication
**So that** only logged-in users can access paid features and account data

**Acceptance Criteria:**
- [ ] Unauthenticated visitors accessing protected routes are redirected to the sign-in page
- [ ] After sign in, users are redirected back to the originally requested page
- [ ] API routes that require authentication return 401 for unauthenticated requests
- [ ] API routes return consistent error responses (not stack traces or internal details)
- [ ] Protected routes include: dashboard, settings, billing, instance management

**Priority:** High

---

### User Story 6: Waitlist-to-Account Conversion
**As a** waitlist subscriber
**I want** the platform to recognize my email when I register
**So that** I receive priority treatment and a smooth transition from waitlist to customer

**Acceptance Criteria:**
- [ ] When a user registers with an email that exists in the waitlist, the system links the records
- [ ] Waitlist members see a personalized welcome acknowledging their early interest
- [ ] The waitlist entry is marked as converted (not deleted — preserved for analytics)
- [ ] Non-waitlist users can register normally without any difference in the process
- [ ] Waitlist conversion status is visible in the platform audit log

**Priority:** Medium

---

### User Story 7: Account Security
**As a** user
**I want** my account to be protected against unauthorized access
**So that** my subscription and instance are safe

**Acceptance Criteria:**
- [ ] Failed login attempts are tracked per account
- [ ] After 5 consecutive failed attempts, the account is temporarily locked (30-minute cooldown)
- [ ] Account lockout resets after a successful login
- [ ] Sessions are bound to secure, httpOnly cookies (not accessible via JavaScript)
- [ ] CSRF protection is active on all authentication forms
- [ ] Auth endpoints are rate-limited (login: 10/min, register: 5/min, password reset: 3/hr)

**Priority:** High

---

## Functional Requirements

### FR-1: Registration Flow
The system must accept email, password, and name to create a new user account. Upon successful creation, a verification email is sent automatically.

### FR-2: Email Verification
The system must generate a time-limited verification token, deliver it via email, and mark the user's account as verified when the token is consumed. Expired tokens must not be accepted.

### FR-3: Session Management
The system must create a session upon successful login, persist it via secure cookies, and invalidate it upon logout or expiry. Sessions must support "remember me" behavior (configurable expiry up to 30 days).

### FR-4: Password Reset
The system must generate a time-limited reset token, deliver it via email, allow the user to set a new password, and invalidate all existing sessions for that user.

### FR-5: Route Protection
All dashboard, billing, settings, and instance management routes must require an authenticated session. Unauthenticated access must redirect to the sign-in page (for pages) or return 401 (for API routes).

### FR-6: Waitlist Conversion
When a user registers with an email matching a waitlist entry, the system must associate the records and log the conversion event. The waitlist entry must be preserved (not deleted).

### FR-7: Account Lockout
The system must temporarily lock accounts after 5 consecutive failed login attempts. Lockout duration is 30 minutes. Lockout state resets after successful authentication.

---

## Non-Functional Requirements

### Performance
- Login response time < 500ms (p90)
- Registration response time < 1s (p90)
- Session verification (middleware) < 50ms (p90)
- Email delivery initiated within 5 seconds of triggering event

### Security
- Passwords stored using a strong one-way hash (minimum: bcrypt with cost 10 or equivalent)
- Session tokens are cryptographically random (minimum 256-bit entropy)
- Cookies: `httpOnly`, `secure`, `sameSite=lax`
- Auth endpoints rate-limited per IP and per account
- No user enumeration via login, registration, or password reset responses
- CSRF protection on all state-changing forms
- Password requirements: minimum 12 characters (NIST SP 800-63B aligned)

### Reliability
- Auth system available whenever the platform is available (no separate auth service SLA)
- Failed email delivery must not block registration — user can resend
- Database constraints prevent duplicate accounts even under race conditions

### Usability
- Auth forms work on desktop and mobile (responsive)
- Clear error messages that tell the user what to do next
- Password strength indicator during registration
- Successful actions (register, verify, reset) show confirmation with next steps

---

## Edge Cases & Error Handling

### EC-1: Duplicate Registration Race Condition
Two simultaneous registration requests with the same email must not create duplicate accounts. The database uniqueness constraint is the source of truth. The second request receives an error.

### EC-2: Verification Email Not Received
User must be able to resend verification email. Resend generates a new token (old token still valid until expiry). Rate-limited to prevent abuse.

### EC-3: Password Reset for Unregistered Email
Must return the same success message as for a registered email. No information leakage about account existence.

### EC-4: Session Cookie Stolen
If a session is compromised, the user must be able to change their password, which invalidates all sessions (including the compromised one).

### EC-5: Browser with Cookies Disabled
Auth system relies on cookies. If cookies are disabled, the sign-in form should display a clear message explaining that cookies are required.

### EC-6: Concurrent Sessions
User may be logged in from multiple devices simultaneously. Sign-out on one device does not affect other sessions. Password change invalidates all sessions.

### EC-7: Account Locked During Valid Login
If the account is locked due to too many failed attempts, a valid login attempt during the lockout period must still be rejected with a message indicating temporary lockout (without revealing the countdown).

### EC-8: Waitlist Email with Different Case
Email matching between waitlist and registration must be case-insensitive (e.g., `User@Example.com` matches `user@example.com` in the waitlist).

---

## Success Metrics

- **Registration completion rate:** > 80% of users who start registration complete verification
- **Login success rate:** > 95% of login attempts by verified users succeed
- **Password reset completion:** > 70% of reset links are used within 1 hour
- **Zero security incidents** related to auth in first 90 days

---

## Out of Scope

- Social login (Google, GitHub) — not in PRD Phase 1
- Multi-factor authentication (MFA) — deferred to a future feature
- Admin/staff roles — single user type for now
- API key authentication — dashboard uses sessions only
- OAuth provider functionality — the platform is not an OAuth provider
