# Implementation Plan — Feature 2: User Authentication

**Feature:** 2-user-authentication
**Specification:** spec.md
**Constitution:** v1.0.0
**Date:** 2026-03-21

---

## Executive Summary

Implement email/password authentication using Better Auth on the existing Neon database schema. The schema (tables, enums, migrations) is already complete from Feature 1. This feature is purely application-level code: configuring Better Auth, creating auth API routes, building auth pages, adding route protection middleware, and implementing waitlist-to-account conversion.

Email delivery is stubbed (console.log) — Feature 3 (Transactional Email) will replace stubs with Resend integration.

---

## Architecture Overview

```
Browser                          Vercel (Next.js)                    Neon Postgres
┌──────────┐                    ┌──────────────────┐                ┌─────────────┐
│ Auth      │  POST /api/auth/* │ [...all]/route.ts │  Drizzle ORM  │ user        │
│ Pages     │ ─────────────────>│ Better Auth       │ ──────────────>│ session     │
│ (React)   │                   │ Handler           │                │ account     │
│           │  Set-Cookie       │                   │                │ verification│
│           │ <─────────────────│                   │                │ waitlist    │
└──────────┘                    └──────────────────┘                └─────────────┘
     │                                  │
     │  useSession()              middleware.ts
     │  signIn/signUp/etc         (route protection)
     │                                  │
┌──────────┐                    ┌──────────────────┐
│ Auth      │                   │ Protected Routes  │
│ Client    │                   │ /dashboard        │
│ (React)   │                   │ /settings         │
└──────────┘                    └──────────────────┘
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Auth library | Better Auth v1.5.5 (minimal) | Already installed, schema ready, Drizzle adapter |
| Import path | `better-auth/minimal` | Excludes unused Kysely bundle |
| DB adapter | `better-auth/adapters/drizzle` | Direct connection to existing Drizzle db instance |
| Next.js handler | `better-auth/next-js` | `toNextJsHandler` + `nextCookies()` plugin |
| Client | `better-auth/react` | `createAuthClient` with React hooks |
| Session storage | Database + 5min cookie cache | Revokable sessions, reduced DB load |
| Rate limiting | Memory-based (Better Auth built-in) | No Redis needed at current scale |
| Route protection | `middleware.ts` | Edge-compatible, runs before page render |
| Password hashing | bcrypt (Better Auth default) | Industry standard, cost factor 10 |
| Email | Console.log stub | Real delivery deferred to Feature 3 |

---

## Implementation Phases

### Phase 1: Better Auth Server Configuration
**Files:** `src/lib/auth.ts`, `src/lib/auth-client.ts`
**Effort:** 2 hours

1. Move `better-auth` from devDependencies to dependencies
2. Create `src/lib/auth.ts` — Better Auth server instance with:
   - Drizzle adapter pointing to existing `db` instance
   - Email/password enabled, min 12 chars
   - Email verification with console.log stub
   - Password reset with console.log stub
   - Session config (7-day expiry, daily refresh, 5-min cookie cache)
   - Rate limiting (custom rules per spec)
   - `nextCookies()` plugin
3. Create `src/lib/auth-client.ts` — Browser client with `createAuthClient`
4. Add `BETTER_AUTH_SECRET` to `.env.example`

### Phase 2: API Route Handler
**Files:** `src/app/api/auth/[...all]/route.ts`
**Effort:** 30 minutes

1. Create catch-all route handler using `toNextJsHandler(auth)`
2. Export GET, POST, PATCH, PUT, DELETE handlers

### Phase 3: Route Protection Middleware
**Files:** `middleware.ts` (project root)
**Effort:** 1 hour

1. Create middleware that checks session via `auth.api.getSession({ headers })`
2. Define protected route patterns: `/dashboard`, `/settings`, `/billing`, `/instance`
3. Redirect unauthenticated users to `/sign-in`
4. Preserve original URL for post-login redirect
5. Allow public routes: `/`, `/sign-in`, `/sign-up`, `/verify-email`, `/reset-password`, `/api/auth/*`, `/api/waitlist`

### Phase 4: Auth Pages (UI)
**Files:** `src/app/(auth)/layout.tsx`, `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/verify-email/page.tsx`, `src/app/(auth)/reset-password/page.tsx`
**Effort:** 4 hours

1. Create `(auth)` route group with shared layout (centered card, consistent styling)
2. **Sign Up page** — Form with name, email, password fields. Client-side validation. Calls `authClient.signUp.email()`. Shows verification email sent confirmation.
3. **Sign In page** — Form with email, password. Calls `authClient.signIn.email()`. Redirects to dashboard (or originally requested page). Link to sign up and forgot password.
4. **Verify Email page** — Handles `?token=` query param for verification. Shows success/error/expired states. Resend button.
5. **Reset Password page** — Two modes:
   - Request mode: email input → calls `authClient.forgetPassword()`
   - Reset mode (with `?token=`): new password input → calls `authClient.resetPassword()`

### Phase 5: Waitlist Conversion
**Files:** `src/lib/auth.ts` (hooks), `src/lib/waitlist-conversion.ts`
**Effort:** 1 hour

1. Create `waitlistConversion()` utility — queries waitlist by email (case-insensitive), returns match status
2. Add Better Auth `afterSignUp` hook — check waitlist, log conversion to platform_audit_log, show personalized welcome
3. Waitlist entry preserved (not deleted), conversion tracked via audit log

### Phase 6: Protected Route Placeholders
**Files:** `src/app/(protected)/layout.tsx`, `src/app/(protected)/dashboard/page.tsx`
**Effort:** 30 minutes

1. Create `(protected)` route group with layout that fetches and passes session
2. Create minimal dashboard placeholder page showing user name and sign-out button
3. This gives auth a complete end-to-end flow to test

---

## Security Considerations

| Concern | Implementation |
|---------|---------------|
| Password hashing | bcrypt cost 10 (Better Auth default) |
| Password policy | Min 12 chars (NIST SP 800-63B) |
| Session tokens | Cryptographically random, 256-bit entropy (Better Auth default) |
| Cookies | httpOnly, secure, sameSite=lax |
| CSRF | SameSite=lax cookies + origin checking |
| User enumeration | Generic error on login, always-success on reset |
| Account lockout | Rate limiting: 10 login attempts/minute per IP |
| SQL injection | Drizzle ORM parameterized queries only |
| XSS | React auto-escaping, no dangerouslySetInnerHTML |
| Rate limiting | Per-endpoint limits (see contracts/auth-api.md) |

---

## Performance Strategy

| Metric | Target | Approach |
|--------|--------|----------|
| Login p90 | < 500ms | Database session lookup + cookie cache (5 min) |
| Registration p90 | < 1s | Single DB write + email stub (no SMTP latency) |
| Session verification p90 | < 50ms | Cookie cache serves repeated requests |
| Middleware overhead | < 20ms | Edge-compatible session check |

---

## Testing Strategy

### Unit Tests (Jest)
- Auth server configuration exports correctly
- Auth client configuration exports correctly
- Waitlist conversion utility finds/doesn't find matches
- Middleware route matching logic (protected vs public)

### Integration Tests (Jest + DATABASE_TEST_URL)
- Registration creates user + account + session records
- Duplicate email registration fails with correct error
- Login with correct credentials returns session
- Login with wrong credentials returns generic error
- Password reset creates verification token
- Session revocation deletes session record
- Waitlist conversion logs audit entry

### E2E Tests (Playwright — deferred to later)
- Full registration → verification → login flow
- Password reset flow
- Protected route redirect → login → redirect back
- Sign out clears session

---

## Deployment Strategy

1. Add `BETTER_AUTH_SECRET` to Vercel environment variables (generate with `openssl rand -base64 32`)
2. Add `BETTER_AUTH_URL` to Vercel environment variables (set to production URL)
3. No new database migrations required
4. Deploy to Vercel — zero-downtime (new routes, no breaking changes)
5. Existing landing page and waitlist API unaffected

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Better Auth API breaking change | Low | High | Pin version 1.5.5, test before upgrading |
| Email verification unusable without Feature 3 | Expected | Medium | Console.log stub allows development; Feature 3 follows immediately |
| Rate limiting bypass on Vercel (distributed instances) | Medium | Low | Memory storage acceptable at launch; upgrade to DB/Redis if abuse detected |
| Cookie not set in development (localhost) | Medium | Low | Better Auth handles localhost as secure origin; document BETTER_AUTH_URL setup |

---

## Constitutional Compliance

- [x] **Principle 1 (Data Sacred):** Auth stores only operational data (email, name, session). No tenant data accessed.
- [x] **Principle 2 (Security):** bcrypt passwords, httpOnly cookies, rate limiting, no enumeration, parameterized queries.
- [x] **Principle 4 (Simple Over Clever):** Better Auth handles complexity. No custom auth primitives. Narrow stack (one library, one pattern).
- [x] **Principle 5 (Business Pays):** No new paid services. Memory rate limiting, console.log emails.
- [x] **Principle 6 (Honesty):** Generic errors prevent enumeration while still being helpful. Clear success/error states.
- [x] **Principle 7 (Owner's Time):** Self-service registration, verification, and password reset. No manual admin tasks.
- [x] **Principle 8 (Platform Quality):** Responsive auth forms, clear loading/error/success states, post-login redirect.
- [x] **Test-First Imperative:** Tests written before implementation for each phase. 80%+ coverage target.

---

## Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Feature 1 (Platform Schema) | Complete | All auth tables migrated to Neon |
| Feature 3 (Transactional Email) | Not started | Auth stubs email; Feature 3 replaces with Resend |
| Neon database | Available | Production DB with auth tables ready |
| `better-auth` package | Installed (devDep) | Must move to dependencies |
