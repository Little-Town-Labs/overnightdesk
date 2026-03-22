# Technology Research — Feature 2: User Authentication

## Decision 1: Auth Library

**Context:** Need email/password auth with email verification, password reset, session management, and rate limiting.

**Options Considered:**
1. **Better Auth** — Already installed (v1.5.5). Drizzle adapter, Next.js App Router integration, built-in rate limiting, email verification, password reset. MIT license.
2. **NextAuth/Auth.js v5** — Popular, but focuses on OAuth providers. Email/password is a secondary concern. Session management differs (JWT vs database sessions).
3. **Lucia Auth** — Lightweight, but recently deprecated (Jan 2024). Author recommends rolling custom or using alternatives.
4. **Custom Implementation** — Full control but significant security risk surface. Not justified for standard email/password auth.

**Chosen:** Better Auth
**Rationale:** Already installed, schema already migrated (Feature 1), Drizzle adapter available, Next.js App Router integration built-in, rate limiting included. Constitution mandates "Simple Over Clever" — using a proven library avoids reimplementing auth primitives.
**Tradeoffs:** Dependency on Better Auth's API surface and update cadence. Acceptable given MIT license and active maintenance.

---

## Decision 2: Better Auth Import Strategy

**Context:** Better Auth bundles Kysely by default. Since we use Drizzle, we should avoid the unnecessary bundle.

**Options Considered:**
1. **`better-auth` (full)** — Includes Kysely adapter. Larger bundle, unused code.
2. **`better-auth/minimal` + `better-auth/adapters/drizzle`** — Excludes Kysely. Smaller bundle, only what we need.

**Chosen:** `better-auth/minimal` with Drizzle adapter
**Rationale:** Constitution Principle 4 (Simple Over Clever) — don't ship unused code. The Drizzle adapter connects directly to our existing `db` instance.
**Tradeoffs:** Must remember to import from `/minimal` not root.

---

## Decision 3: Session Storage Strategy

**Context:** Better Auth supports both database sessions and JWT sessions.

**Options Considered:**
1. **Database sessions (default)** — Sessions stored in `session` table. Server-side validation. Revokable.
2. **JWT sessions** — Stateless, no DB lookup. Not revokable without a blocklist.
3. **Cookie cache + database** — Database sessions with short-lived cookie cache to reduce DB lookups.

**Chosen:** Database sessions with cookie cache (5 min TTL)
**Rationale:** Spec requires session revocation (password reset invalidates all sessions, sign-out invalidates current session). JWT cannot do this without a blocklist, which adds more complexity than database sessions. Cookie cache reduces DB load for repeated requests within 5 minutes.
**Tradeoffs:** Every session verification hits DB after cache expires. Acceptable at current scale (Neon serverless handles this well).

---

## Decision 4: Rate Limiting Storage

**Context:** Better Auth supports memory, database, or custom (Redis) rate limit storage.

**Options Considered:**
1. **Memory** — Fast, no persistence. Resets on serverless cold start.
2. **Database** — Persistent, but adds writes per request.
3. **Custom (Redis)** — Best option at scale, but adds infrastructure cost.

**Chosen:** Memory (default)
**Rationale:** Constitution Principle 5 (Business Pays for Itself) — no Redis until customer revenue justifies it. Memory-based rate limiting resets on cold starts, but Vercel serverless functions maintain warm instances for ~15 minutes, which is sufficient for rate limiting windows (60s-300s). If abuse occurs, upgrade to database or Redis storage.
**Tradeoffs:** Distributed Vercel instances don't share rate limit state. A determined attacker could bypass by hitting different instances. Acceptable risk at current scale.

---

## Decision 5: Route Protection Pattern

**Context:** Need to protect dashboard, settings, billing, and instance management routes.

**Options Considered:**
1. **Next.js middleware.ts** — Runs on edge before every request. Can check session and redirect.
2. **Layout-level server-side check** — Check session in protected layout, redirect if missing.
3. **Per-page check** — Check session in each page's server component.

**Chosen:** Next.js middleware.ts for route protection
**Rationale:** Single place to define protected routes. Runs before the page renders, so no flash of protected content. Aligns with Better Auth's documented Next.js integration pattern.
**Tradeoffs:** Middleware runs on Vercel Edge Runtime, which has API limitations (no Node.js APIs). Better Auth's `getSession` works with headers, which is compatible with edge middleware.

---

## Decision 6: Auth Page Architecture

**Context:** Need sign-in, sign-up, verify-email, and reset-password pages.

**Options Considered:**
1. **Route group `(auth)`** — Group auth pages under a shared layout. Clean URL paths (`/sign-in`, `/sign-up`).
2. **Nested under `/auth/`** — URLs become `/auth/sign-in`, `/auth/sign-up`.
3. **Single page with tabs** — One page for sign-in/sign-up with tab switching.

**Chosen:** Route group `(auth)` with shared layout
**Rationale:** Clean URLs, shared layout for consistent auth page styling, no URL prefix. Constitution Principle 8 (Platform Quality) — clean URLs signal a professional product.
**Tradeoffs:** Slightly more files than a single-page approach. Worth it for clarity and SEO.

---

## Decision 7: Waitlist Conversion Strategy

**Context:** Existing waitlist entries should be recognized during registration.

**Options Considered:**
1. **Check on registration** — Query waitlist table during sign-up. If match found, mark as converted.
2. **Pre-populate from waitlist** — Send waitlist users a special registration link.
3. **Background job** — After registration, async job checks waitlist match.

**Chosen:** Check on registration (synchronous)
**Rationale:** Simplest approach. The waitlist table is small, query is fast (email has unique index). No need for background jobs or special links. Constitution Principle 4 — simplest solution that works.
**Tradeoffs:** Adds one DB query to registration flow. Negligible at current scale.

---

## Decision 8: Email Delivery (Dependency on Feature 3)

**Context:** Auth requires email for verification and password reset. Feature 3 (Transactional Email) handles Resend integration.

**Options Considered:**
1. **Implement email in Feature 2** — Duplicate work, Feature 3 becomes smaller.
2. **Stub email in Feature 2, implement in Feature 3** — Auth works but emails are console.log'd until Feature 3.
3. **Build Feature 3 first** — Reorder the roadmap.

**Chosen:** Stub email in Feature 2 with console.log
**Rationale:** Auth can be fully tested and functional without real email delivery. Console logging the verification URL during development is standard practice. Feature 3 replaces the stub with Resend. This unblocks auth development immediately.
**Tradeoffs:** Email verification flow isn't production-ready until Feature 3 completes. Acceptable — we're building in phases.
