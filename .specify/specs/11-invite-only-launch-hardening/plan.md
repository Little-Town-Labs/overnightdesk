# Implementation Plan — Feature 11: Invite-Only Launch Hardening

**Spec:** [spec.md](./spec.md)
**Date:** 2026-03-22
**Approach:** 5 parallel workstreams, TDD per constitution

---

## Phase 0: Research (Before Implementation)

### R1: better-auth sign-up hook API
- Determine if better-auth supports `denySignUp`, `hooks.before`, or `beforeSignUp` callback
- Check better-auth source/docs for the exact API shape
- Fallback: wrap sign-up in a custom API route that checks invite status first

### R2: Engine-client response shapes
- Verify exact response shapes from engine for all 4 endpoint groups (jobs, conversations, messages, logs)
- Check all callers to confirm they expect arrays

---

## Phase 1: Implementation (5 Parallel Workstreams)

### WS-1: Middleware Whitelist (BLOCKING)
**Files:** `src/lib/middleware-utils.ts`, `src/lib/__tests__/middleware-utils.test.ts`

1. Write tests asserting `isPublicRoute()` returns true for:
   - `/api/stripe/webhook`
   - `/api/cron/health-check`
   - `/api/cron/usage-collection`
   - `/api/provisioner/callback`
   - `/api/email/unsubscribe`
2. Write tests asserting `isPublicRoute()` returns false for:
   - `/api/stripe/checkout`
   - `/api/stripe/portal`
   - `/api/engine/jobs`
   - `/dashboard`
3. Run tests — confirm RED
4. Add entries to `PUBLIC_API_PREFIXES`:
   - `"/api/stripe/webhook"`
   - `"/api/cron"`
   - `"/api/provisioner/callback"`
   - `"/api/email/unsubscribe"`
5. Run tests — confirm GREEN

### WS-2: Security Fixes
**Files:** `src/app/api/provisioner/callback/route.ts`, `src/lib/unsubscribe.ts`, `src/db/index.ts`, `next.config.ts`

#### 2a: Provisioner timing-safe auth
1. Write test for provisioner callback with valid/invalid bearer tokens
2. Run — confirm RED (or confirm existing test shape)
3. Replace `secret !== process.env.PROVISIONER_SECRET` with `crypto.timingSafeEqual` pattern
4. Run — confirm GREEN

#### 2b: Remove fallback secrets
1. Write test: unsubscribe module throws when BETTER_AUTH_SECRET is undefined
2. Run — confirm RED
3. Remove `|| "dev-secret-replace-in-production"`, add guard
4. Run — confirm GREEN
5. Write test: db module throws when DATABASE_URL is undefined
6. Apply same pattern to `src/db/index.ts`

#### 2c: Security headers
1. Add `headers()` to `next.config.ts`
2. Verify with build (declarative config, no unit test needed)

### WS-3: Invite-Only Gate
**Files:** `src/lib/billing.ts`, `src/lib/auth.ts`, `src/app/(auth)/sign-up/page.tsx`, `.env.example`

1. Write tests for `isInvitedEmail()`:
   - Returns true for email in INVITED_EMAILS
   - Returns false for email not in list
   - Case-insensitive comparison
   - Returns false when INVITED_EMAILS is empty/undefined
2. Run — confirm RED
3. Implement `isInvitedEmail()` in `billing.ts` (same pattern as `isAdmin()`)
4. Run — confirm GREEN
5. Research better-auth hook API (R1)
6. Implement server-side sign-up gate (hook or wrapper)
7. Write integration test: non-invited email rejected, invited email accepted, admin email accepted
8. Update sign-up page with invite-only messaging
9. Add INVITED_EMAILS to `.env.example`

### WS-4: Landing Page Copy
**Files:** `src/app/page.tsx`

1. Update HowItWorks step 2: Claude Code subscription, not OpenRouter
2. Update Privacy section: remove "API keys" references, update for BYOS model
3. Add "Sign in" text link to Nav component
4. No tests needed (content-only change, visual verification)

### WS-5: Engine-Client Response Shapes
**Files:** `src/lib/engine-client.ts`, `src/lib/__tests__/engine-client.test.ts`, `src/lib/__tests__/usage-collection.test.ts`

1. Read engine source to confirm exact response shapes for:
   - GET /api/jobs → `{jobs: [...]}`
   - GET /api/conversations → `{conversations: [...]}`
   - GET /api/conversations/:id/messages → `{messages: [...]}`
   - GET /api/logs → `{lines: [...]}`
2. Update engine-client tests to mock envelope responses
3. Run — confirm RED
4. Fix getJobs(): `const data = await response.json(); return data.jobs ?? [];`
5. Fix getConversations(): unwrap similarly
6. Fix getConversationMessages(): unwrap similarly
7. Fix getEngineLogs() if needed
8. Run — confirm GREEN
9. Update usage-collection tests to use envelope-shaped mocks
10. Verify usage-collection works with fixed shapes

---

## Phase -1: Constitutional Gates

| Gate | Check | Status |
|------|-------|--------|
| No raw SQL | All queries via Drizzle ORM | N/A (no new queries) |
| No tenant data access | No direct container/SQLite access | N/A (no new access) |
| Input validation | Zod on new inputs | INVITED_EMAILS is env var, not user input |
| Test-first | TDD for all logic changes | Required |
| 80% coverage | On all changed files | Required |
| Security headers | Must not break auth cookies | Verify SameSite compatibility |

---

## Verification

After all workstreams complete:
1. `npm test` — all tests pass (485 + new tests)
2. `npm run build` — build succeeds
3. Manual verification plan:
   - curl /api/stripe/webhook → 400 (not 302)
   - curl /api/cron/health-check with bearer → 200 (not 302)
   - Attempt sign-up with non-invited email → rejected
   - Check response headers with curl -I
   - Verify dashboard still works for admin
