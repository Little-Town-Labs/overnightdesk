# Technology Research — Feature 3: Transactional Email

## Decision 1: Email Service Provider

**Context:** The platform needs a transactional email provider for verification, password reset, welcome, payment failure, and provisioning emails.

**Options Considered:**
1. **Resend** — Modern API-first email service, React Email support, generous free tier (100 emails/day), simple SDK
2. **SendGrid** — Mature, high volume, complex setup, expensive at scale
3. **AWS SES** — Cheapest at scale ($0.10/1000), requires AWS infrastructure, complex DNS setup
4. **Nodemailer + SMTP** — Self-hosted, no cost, requires SMTP server, deliverability concerns

**Chosen:** Resend
**Rationale:** Constitution (Principle 4) mandates Resend. Beyond that: free tier covers early stage (100/day = ~3000/month), API is simple (single function call), native React Email support pairs well with Next.js, and Vercel integration is excellent. Business pays for itself (Principle 5) — upgrade to $20/month at scale.
**Tradeoffs:** 100 emails/day free tier limit (sufficient for launch — 100 users × ~1 email/day). Vendor lock-in mitigated by simple API surface (easy to swap).

---

## Decision 2: Email Templates

**Context:** Need HTML email templates that render correctly across clients (Gmail, Outlook, Apple Mail).

**Options Considered:**
1. **React Email** — JSX-based templates, component reuse, type-safe, preview tool, maintained by Resend team
2. **MJML** — XML-based, responsive by default, separate build step required
3. **Plain HTML strings** — No dependencies, hard to maintain, no preview tooling
4. **Handlebars/EJS** — Template engine, familiar syntax, no React integration

**Chosen:** React Email (`@react-email/components`)
**Rationale:** Native integration with Resend SDK (render to HTML string), same language as the rest of the codebase (TypeScript/React), component reuse for consistent styling across all email types, built-in preview server for development.
**Tradeoffs:** Additional dependency. But it's maintained by Resend's team and eliminates the need for hand-crafting responsive HTML tables.

---

## Decision 3: Email Logging Strategy

**Context:** Spec FR-5 requires logging all sent emails with recipient, type, timestamp, status, and error details.

**Options Considered:**
1. **Database table (`email_log`)** — Queryable, durable, fits existing Drizzle pattern
2. **Structured logging (console/Vercel logs)** — Simpler, no migration, but not queryable for support
3. **Resend dashboard only** — Zero code, but no programmatic access, no correlation with user IDs

**Chosen:** Database table (`email_log`)
**Rationale:** Enables support workflows (look up email history for a user), retry tracking, and duplicate detection (FR-3 payment failure dedup). Fits existing Drizzle ORM pattern. Small table — never needs to be large at current scale.
**Tradeoffs:** Requires migration. But the table is simple and the pattern is established.

---

## Decision 4: Unsubscribe Implementation

**Context:** CAN-SPAM requires one-click unsubscribe on non-essential emails. Essential emails (verification, password reset, payment failure) are exempt.

**Options Considered:**
1. **Database column on `user` table** — Simple boolean, no new table
2. **Separate `email_preferences` table** — Extensible for future categories
3. **List-Unsubscribe header only** — RFC 8058, handled by email clients, no custom UI needed

**Chosen:** Database column on `user` table + List-Unsubscribe header
**Rationale:** Principle 4 (Simple Over Clever). Only two categories exist: essential (always sent) and non-essential (welcome, provisioning confirmation). A single boolean `emailOptOut` on the user table is sufficient. Adding List-Unsubscribe headers is free and improves deliverability.
**Tradeoffs:** If we later need per-category preferences, we'd add a table then. YAGNI for now.

---

## Decision 5: Retry Strategy

**Context:** Spec NFR-Reliability requires automatic retry (up to 3 attempts with exponential backoff) for failed sends.

**Options Considered:**
1. **In-process retry with exponential backoff** — Simple, no infrastructure, blocks for a few seconds max
2. **Background job queue (BullMQ/Redis)** — Robust, but requires Redis (violates Principle 5 — no paid services until revenue)
3. **Vercel Cron + retry table** — Periodic retry of failed emails, no Redis needed

**Chosen:** In-process retry with exponential backoff
**Rationale:** Email sends are fast (<500ms typically). Three retries with delays of 1s, 2s, 4s add at most 7 seconds. This is acceptable for server-side operations (auth callbacks, webhook handlers). No additional infrastructure needed.
**Tradeoffs:** If Resend is fully down, the 7-second retry window won't help. But the spec says: "Email delivery failures MUST NOT block the triggering operation" — so we log the failure and move on.

---

## Decision 6: From Address Configuration

**Context:** Need a verified sender domain for production emails.

**Options Considered:**
1. **`noreply@overnightdesk.com`** — Standard, clear intent
2. **`hello@overnightdesk.com`** — Friendlier, but misleading if replies aren't monitored
3. **Configurable via env var** — Flexible for staging vs production

**Chosen:** Environment variable (`EMAIL_FROM`) with default `OvernightDesk <noreply@overnightdesk.com>`
**Rationale:** Different from addresses for development (Resend test domain) vs production (verified overnightdesk.com domain). Env var pattern is established in the project.
**Tradeoffs:** None significant. Standard approach.
