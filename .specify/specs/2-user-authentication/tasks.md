# Task Breakdown — Feature 2: User Authentication

**Feature:** 2-user-authentication
**Plan:** plan.md
**Date:** 2026-03-21

---

## Summary

- **Total Tasks:** 14
- **Phases:** 6
- **TDD Enforced:** Tests before implementation for each phase

---

## Phase 1: Better Auth Server Configuration

### Task 1.1: Auth Server Config — Tests
**Status:** 🟡 Ready
**Effort:** 1 hour
**Dependencies:** None

**Description:**
Write tests for the Better Auth server configuration module.

**Acceptance Criteria:**
- [ ] Test that `auth` export exists and is a valid Better Auth instance
- [ ] Test that `auth.api.getSession` is a function
- [ ] Test that email/password is enabled
- [ ] Test that minimum password length is 12
- [ ] Tests confirmed to FAIL (no implementation)

---

### Task 1.2: Auth Server Config — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 1.5 hours
**Dependencies:** Task 1.1

**Description:**
Create `src/lib/auth.ts` with Better Auth server instance. Create `src/lib/auth-client.ts` with browser client. Move `better-auth` from devDependencies to dependencies. Add `BETTER_AUTH_SECRET` to `.env.example`.

**Acceptance Criteria:**
- [ ] `src/lib/auth.ts` exports configured Better Auth instance
- [ ] Uses `better-auth/minimal` + Drizzle adapter
- [ ] Email/password enabled, min 12 chars, verification required
- [ ] Email verification + password reset with console.log stubs
- [ ] Session: 7-day expiry, daily refresh, 5-min cookie cache
- [ ] Rate limiting with custom rules per spec
- [ ] `nextCookies()` plugin enabled
- [ ] `src/lib/auth-client.ts` exports `createAuthClient` instance
- [ ] `better-auth` moved to dependencies in package.json
- [ ] `BETTER_AUTH_SECRET` added to `.env.example`
- [ ] All tests from 1.1 pass

---

## Phase 2: API Route Handler

### Task 2.1: Auth Route Handler — Tests
**Status:** 🟡 Ready
**Effort:** 30 minutes
**Dependencies:** None
**Parallel with:** Task 1.1

**Description:**
Write tests for the catch-all auth API route handler.

**Acceptance Criteria:**
- [ ] Test that route module exports GET, POST handler functions
- [ ] Tests confirmed to FAIL

---

### Task 2.2: Auth Route Handler — Implementation
**Status:** 🔴 Blocked by 1.2, 2.1
**Effort:** 30 minutes
**Dependencies:** Task 1.2, Task 2.1

**Description:**
Create `src/app/api/auth/[...all]/route.ts` with Better Auth's `toNextJsHandler`.

**Acceptance Criteria:**
- [ ] Route handler exports GET, POST, PATCH, PUT, DELETE
- [ ] Uses `toNextJsHandler(auth)` from `better-auth/next-js`
- [ ] All tests from 2.1 pass

---

## Phase 3: Route Protection Middleware

### Task 3.1: Middleware — Tests
**Status:** 🟡 Ready
**Effort:** 1 hour
**Dependencies:** None
**Parallel with:** Task 1.1, Task 2.1

**Description:**
Write tests for the route protection middleware logic.

**Acceptance Criteria:**
- [ ] Test that protected routes (dashboard, settings, billing) trigger redirect for unauthenticated users
- [ ] Test that public routes (/, sign-in, sign-up, api/auth) pass through
- [ ] Test that redirect preserves the originally requested URL
- [ ] Tests confirmed to FAIL

---

### Task 3.2: Middleware — Implementation
**Status:** 🔴 Blocked by 1.2, 3.1
**Effort:** 1 hour
**Dependencies:** Task 1.2, Task 3.1

**Description:**
Create `middleware.ts` at project root. Check session via Better Auth. Define protected and public route patterns.

**Acceptance Criteria:**
- [ ] Middleware checks session on protected routes
- [ ] Unauthenticated users redirected to `/sign-in?callbackUrl=<original>`
- [ ] Public routes pass through without session check
- [ ] Auth API routes (`/api/auth/*`) excluded from protection
- [ ] All tests from 3.1 pass

---

## Phase 4: Auth Pages (UI)

### Task 4.1: Auth Layout and Sign-Up Page — Tests
**Status:** 🔴 Blocked by 2.2
**Effort:** 1 hour
**Dependencies:** Task 2.2

**Description:**
Write tests for the sign-up page component.

**Acceptance Criteria:**
- [ ] Test that sign-up form renders with name, email, password fields
- [ ] Test that form validates required fields
- [ ] Test that password field enforces minimum length
- [ ] Tests confirmed to FAIL

---

### Task 4.2: Auth Layout and Sign-Up Page — Implementation
**Status:** 🔴 Blocked by 4.1
**Effort:** 1.5 hours
**Dependencies:** Task 4.1

**Description:**
Create `(auth)` route group with shared layout. Build sign-up page with form, validation, and authClient integration.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/layout.tsx` renders centered card layout
- [ ] `src/app/(auth)/sign-up/page.tsx` has name, email, password fields
- [ ] Client-side validation (required fields, email format, password length)
- [ ] Calls `authClient.signUp.email()` on submit
- [ ] Shows loading state during submission
- [ ] Shows success state (verification email sent) after registration
- [ ] Shows error state for duplicate email or validation failure
- [ ] Link to sign-in page
- [ ] All tests from 4.1 pass

---

### Task 4.3: Sign-In Page — Tests
**Status:** 🔴 Blocked by 4.2
**Effort:** 30 minutes
**Dependencies:** Task 4.2

**Description:**
Write tests for the sign-in page component.

**Acceptance Criteria:**
- [ ] Test that sign-in form renders with email and password fields
- [ ] Test that form validates required fields
- [ ] Tests confirmed to FAIL

---

### Task 4.4: Sign-In Page — Implementation
**Status:** 🔴 Blocked by 4.3
**Effort:** 1 hour
**Dependencies:** Task 4.3

**Description:**
Build sign-in page with form, validation, and authClient integration.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/sign-in/page.tsx` has email, password fields
- [ ] Calls `authClient.signIn.email()` on submit
- [ ] Redirects to dashboard (or callbackUrl from query params) on success
- [ ] Shows generic error for invalid credentials
- [ ] Shows loading state during submission
- [ ] Links to sign-up and forgot password
- [ ] All tests from 4.3 pass

---

### Task 4.5: Verify Email and Reset Password Pages — Tests
**Status:** 🔴 Blocked by 4.2
**Effort:** 30 minutes
**Dependencies:** Task 4.2
**Parallel with:** Task 4.3

**Description:**
Write tests for verify-email and reset-password page components.

**Acceptance Criteria:**
- [ ] Test verify-email page renders verification status
- [ ] Test reset-password page renders email form (request mode) and password form (reset mode)
- [ ] Tests confirmed to FAIL

---

### Task 4.6: Verify Email and Reset Password Pages — Implementation
**Status:** 🔴 Blocked by 4.5
**Effort:** 1.5 hours
**Dependencies:** Task 4.5

**Description:**
Build verify-email and reset-password pages.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/verify-email/page.tsx` handles token verification
- [ ] Shows success, error, and expired states
- [ ] Resend button calls `authClient.sendVerificationEmail()`
- [ ] `src/app/(auth)/reset-password/page.tsx` has two modes:
  - Request mode: email input → `authClient.forgetPassword()`
  - Reset mode (with token): new password → `authClient.resetPassword()`
- [ ] Shows consistent loading/success/error states
- [ ] All tests from 4.5 pass

---

## Phase 5: Waitlist Conversion

### Task 5.1: Waitlist Conversion — Tests
**Status:** 🟡 Ready
**Effort:** 30 minutes
**Dependencies:** None
**Parallel with:** Phase 1, 2, 3

**Description:**
Write tests for the waitlist conversion utility.

**Acceptance Criteria:**
- [ ] Test that conversion check finds matching waitlist email (case-insensitive)
- [ ] Test that conversion check returns null for non-waitlist email
- [ ] Test that conversion logs audit entry
- [ ] Tests confirmed to FAIL

---

### Task 5.2: Waitlist Conversion — Implementation
**Status:** 🔴 Blocked by 1.2, 5.1
**Effort:** 1 hour
**Dependencies:** Task 1.2, Task 5.1

**Description:**
Create `src/lib/waitlist-conversion.ts` with conversion check utility. Add Better Auth `afterSignUp` hook in `src/lib/auth.ts`.

**Acceptance Criteria:**
- [ ] `checkWaitlistConversion(email)` queries waitlist table (case-insensitive)
- [ ] Returns `{ isWaitlisted: boolean, waitlistEntry?: WaitlistRow }`
- [ ] `afterSignUp` hook calls conversion check
- [ ] Conversion event logged to `platform_audit_log`
- [ ] Waitlist entry NOT deleted (preserved for analytics)
- [ ] All tests from 5.1 pass

---

## Phase 6: Protected Route Placeholder

### Task 6.1: Dashboard Placeholder — Tests
**Status:** 🔴 Blocked by 3.2
**Effort:** 15 minutes
**Dependencies:** Task 3.2

**Description:**
Write tests for the protected dashboard placeholder.

**Acceptance Criteria:**
- [ ] Test that dashboard page renders user information
- [ ] Test that sign-out button is present
- [ ] Tests confirmed to FAIL

---

### Task 6.2: Dashboard Placeholder — Implementation
**Status:** 🔴 Blocked by 6.1
**Effort:** 30 minutes
**Dependencies:** Task 6.1

**Description:**
Create `(protected)` route group with layout that passes session. Create minimal dashboard page.

**Acceptance Criteria:**
- [ ] `src/app/(protected)/layout.tsx` fetches session server-side
- [ ] `src/app/(protected)/dashboard/page.tsx` shows user name and email
- [ ] Sign-out button calls `authClient.signOut()` and redirects to landing
- [ ] All tests from 6.1 pass

---

## Critical Path

```
Task 1.1 → 1.2 → 2.2 → 4.1 → 4.2 → 4.3 → 4.4
                    ↘ 3.2 → 6.1 → 6.2
                    ↘ 5.2
```

**Parallel opportunities:**
- Tasks 1.1, 2.1, 3.1, 5.1 can all start simultaneously (tests, no deps)
- Tasks 4.3/4.5 can run in parallel after 4.2

---

## Quality Gates

### After Phase 2 (API route ready):
- [ ] Run `/code-review` on auth configuration

### After Phase 4 (all auth pages):
- [ ] Run `/security-review` on auth code (passwords, sessions, rate limiting)

### After Phase 6 (feature complete):
- [ ] Run full test suite: `npm test`
- [ ] Verify test coverage ≥ 80%
- [ ] Run build: `npm run build`
- [ ] Manual smoke test: register → verify → login → dashboard → sign out
