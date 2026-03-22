# Technology Research — Feature 4: Stripe Payments

## Decision 1: Stripe SDK

**Options Considered:**
1. **`stripe` Node.js SDK** — Official, type-safe, maintained by Stripe
2. **Raw HTTP calls** — No dependency, full control
3. **Better Auth Stripe plugin** — Better Auth has a community Stripe plugin

**Chosen:** `stripe` Node.js SDK (official)
**Rationale:** Constitution mandates "All Stripe operations MUST use the official stripe Node.js SDK." Type-safe, excellent documentation, handles signature verification natively. The Better Auth plugin is community-maintained and adds coupling between auth and billing that isn't needed.
**Tradeoffs:** Adds one dependency. Acceptable — it's the official SDK.

## Decision 2: Checkout Flow

**Options Considered:**
1. **Stripe Checkout (redirect)** — Redirect to Stripe-hosted checkout page
2. **Stripe Elements (embedded)** — Custom checkout form with Stripe.js
3. **Stripe Payment Links** — No-code hosted pages

**Chosen:** Stripe Checkout (redirect)
**Rationale:** Constitution specifies "Checkout redirect flow." Handles PCI compliance entirely (Stripe hosts the payment form). No client-side Stripe.js needed. Less code, fewer security concerns.
**Tradeoffs:** Less UI customization. Acceptable — Stripe's checkout page is polished and mobile-optimized.

## Decision 3: Billing Portal

**Options Considered:**
1. **Stripe Customer Portal** — Hosted self-service billing management
2. **Custom billing UI** — Build our own plan change/cancellation/invoice UI

**Chosen:** Stripe Customer Portal
**Rationale:** Constitution mandates "Stripe Customer Portal MUST be used for plan changes and payment method updates — no custom billing UI." Eliminates pages of UI work and PCI scope.
**Tradeoffs:** Limited branding customization. Acceptable.

## Decision 4: Webhook Processing Pattern

**Options Considered:**
1. **Direct handler in API route** — Single route.ts processes all events
2. **Event-driven with queue** — Queue events for background processing
3. **Handler map pattern** — Route.ts dispatches to event-specific handlers

**Chosen:** Handler map pattern
**Rationale:** Clean separation per event type, easy to test each handler independently, keeps the route.ts focused on signature verification and dispatch. No queue infrastructure needed at this scale.
**Tradeoffs:** Slightly more files than a single handler. Worth it for testability.

## Decision 5: Subscription Gating Architecture

**Options Considered:**
1. **Middleware** — Next.js middleware checks subscription on every request
2. **Layout-level check** — Server component layout queries subscription status
3. **Per-route check** — Each page/API checks independently
4. **Utility function** — Shared `requireSubscription()` called where needed

**Chosen:** Utility function + layout-level check
**Rationale:** The `(protected)` layout already checks auth. A `requireSubscription()` utility can be called in the layout or individual pages. API routes call it explicitly. This matches the existing pattern and avoids middleware complexity (middleware runs on edge, can't easily query Neon).
**Tradeoffs:** Must remember to call it in API routes. Acceptable — it mirrors the existing auth check pattern.

## Decision 6: Admin Bypass Implementation

**Options Considered:**
1. **Environment variable with comma-separated emails** — Simple, no DB changes
2. **Database `is_admin` column** — Queryable, but requires migration
3. **Separate admin table** — Normalized but over-engineered

**Chosen:** Environment variable (`ADMIN_EMAILS`)
**Rationale:** FR-16 requires env var configuration. Only 2-3 emails. No database changes needed. Simple string comparison. Can be updated without deployment by changing env vars.
**Tradeoffs:** Not queryable from DB. Acceptable at this scale.

## Decision 7: Feature Flag Implementation

**Options Considered:**
1. **Environment variable boolean** — `BILLING_ENABLED=true/false`
2. **Feature flag service (LaunchDarkly, Unleash)** — Full feature management
3. **Database config table** — Runtime toggleable

**Chosen:** Environment variable (`NEXT_PUBLIC_BILLING_ENABLED`)
**Rationale:** Simplest approach per Principle 4. No new dependencies. `NEXT_PUBLIC_` prefix makes it available on client (for pricing page rendering) and server. Toggled per environment in Vercel.
**Tradeoffs:** Requires redeploy to toggle. Acceptable — billing isn't toggled frequently.

## Decision 8: Stripe Product/Price Configuration

**Options Considered:**
1. **Create products in Stripe Dashboard, reference by env var** — IDs in env vars
2. **Create products via Stripe API on startup** — Self-provisioning
3. **Hardcode price IDs** — Simplest but violates FR-12

**Chosen:** Stripe Dashboard + env vars
**Rationale:** Constitution requires price IDs from env vars. Products/prices created once in Stripe Dashboard (and test mode equivalent). Referenced via `STRIPE_STARTER_PRICE_ID` and `STRIPE_PRO_PRICE_ID`.
**Tradeoffs:** Manual Stripe Dashboard setup. One-time effort.
