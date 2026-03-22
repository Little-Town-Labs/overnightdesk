# Tasks — Feature 11: Invite-Only Launch Hardening

**Plan:** [plan.md](./plan.md)
**Date:** 2026-03-22

---

## Story 1: Server-to-Server Routes Work (US-4, US-5, US-6)

### Task 1.1: Middleware whitelist tests
- **File:** `src/lib/__tests__/middleware-utils.test.ts`
- **Action:** Write unit tests for `isPublicRoute()` covering all new public paths and confirming protected paths remain protected
- **TDD Phase:** RED
- **Blocked by:** None

### Task 1.2: Add system routes to PUBLIC_API_PREFIXES
- **File:** `src/lib/middleware-utils.ts`
- **Action:** Add `/api/stripe/webhook`, `/api/cron`, `/api/provisioner/callback`, `/api/email/unsubscribe`
- **TDD Phase:** GREEN
- **Blocked by:** 1.1

---

## Story 2: Security Hardening (US-6, US-7, US-9)

### Task 2.1: Provisioner callback timing-safe auth
- **File:** `src/app/api/provisioner/callback/route.ts`
- **Action:** Replace `!==` with `crypto.timingSafeEqual` pattern. Write/update test.
- **TDD Phase:** RED → GREEN
- **Blocked by:** None

### Task 2.2: Remove unsubscribe fallback secret
- **File:** `src/lib/unsubscribe.ts`
- **Action:** Remove `|| "dev-secret..."` fallback, add guard that throws. Write test.
- **TDD Phase:** RED → GREEN
- **Blocked by:** None

### Task 2.3: Validate DATABASE_URL
- **File:** `src/db/index.ts`
- **Action:** Replace `process.env.DATABASE_URL!` with guarded read that throws.
- **TDD Phase:** GREEN (simple guard)
- **Blocked by:** None

### Task 2.4: Add security headers
- **File:** `next.config.ts`
- **Action:** Add `headers()` config returning X-Frame-Options, HSTS, nosniff, Referrer-Policy, Permissions-Policy
- **TDD Phase:** Verify with build
- **Blocked by:** None

---

## Story 3: Invite-Only Registration (US-2, US-3)

### Task 3.1: isInvitedEmail() helper + tests
- **File:** `src/lib/billing.ts`, `src/lib/__tests__/billing.test.ts`
- **Action:** Add `isInvitedEmail()` function (same pattern as `isAdmin()`). Write unit tests.
- **TDD Phase:** RED → GREEN
- **Blocked by:** None

### Task 3.2: Research better-auth sign-up hook API
- **Action:** Determine the correct API for blocking sign-ups server-side in better-auth
- **Output:** Decision on hook vs wrapper approach
- **Blocked by:** None

### Task 3.3: Implement server-side sign-up gate
- **File:** `src/lib/auth.ts` (or new API route wrapper)
- **Action:** Block non-invited, non-admin emails from registering. Write integration test.
- **TDD Phase:** RED → GREEN
- **Blocked by:** 3.1, 3.2

### Task 3.4: Update sign-up page UX
- **File:** `src/app/(auth)/sign-up/page.tsx`
- **Action:** Add invite-only banner/subtitle. Handle rejection error display.
- **Blocked by:** 3.3

### Task 3.5: Add INVITED_EMAILS to .env.example
- **File:** `.env.example`
- **Action:** Add INVITED_EMAILS with documentation comment
- **Blocked by:** 3.1

---

## Story 4: Landing Page Accuracy (US-1)

### Task 4.1: Fix HowItWorks step 2
- **File:** `src/app/page.tsx`
- **Action:** Replace OpenRouter copy with Claude Code subscription messaging
- **Blocked by:** None

### Task 4.2: Fix Privacy section
- **File:** `src/app/page.tsx`
- **Action:** Update "API keys encrypted" and "bring your own AI key" claims for BYOS model
- **Blocked by:** None

### Task 4.3: Add Sign In link to Nav
- **File:** `src/app/page.tsx`
- **Action:** Add text link to /sign-in next to waitlist button
- **Blocked by:** None

---

## Story 5: Engine-Client Data Shapes (US-8)

### Task 5.1: Verify engine response shapes
- **Action:** Read engine source for GET /api/jobs, /api/conversations, /api/conversations/:id/messages, /api/logs to confirm exact envelope shapes
- **Blocked by:** None

### Task 5.2: Update engine-client tests for envelope responses
- **File:** `src/lib/__tests__/engine-client.test.ts`
- **Action:** Update mocks to return envelope shapes, assert functions return unwrapped arrays
- **TDD Phase:** RED
- **Blocked by:** 5.1

### Task 5.3: Fix engine-client response unwrapping
- **File:** `src/lib/engine-client.ts`
- **Action:** Unwrap `{jobs: [...]}`, `{conversations: [...]}`, `{messages: [...]}`, `{lines: [...]}` in respective functions
- **TDD Phase:** GREEN
- **Blocked by:** 5.2

### Task 5.4: Update usage-collection tests
- **File:** `src/lib/__tests__/usage-collection.test.ts`
- **Action:** Verify mocks use correct shapes after engine-client fix
- **Blocked by:** 5.3

---

## Story 6: Final Verification

### Task 6.1: Run full test suite
- **Action:** `npm test` — all tests pass
- **Blocked by:** All above

### Task 6.2: Run build
- **Action:** `npm run build` — build succeeds
- **Blocked by:** 6.1

### Task 6.3: Commit
- **Action:** Single commit with all changes
- **Blocked by:** 6.2

---

## Execution Order

**Parallel group A** (no dependencies): 1.1, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3, 5.1
**Sequential after A**: 1.2 (after 1.1), 3.3 (after 3.1+3.2), 3.4 (after 3.3), 3.5 (after 3.1)
**Sequential after 5.1**: 5.2 → 5.3 → 5.4
**Final**: 6.1 → 6.2 → 6.3
