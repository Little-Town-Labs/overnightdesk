# Implementation Plan — Feature 3: Transactional Email

**Feature:** 3-transactional-email
**Specification:** `.specify/specs/3-transactional-email/spec.md`
**Constitution:** v1.0.0 (2026-03-21)

---

## Executive Summary

Replace console.log email stubs in `src/lib/auth.ts` with real email delivery via Resend. Add email logging, unsubscribe support, and prepare email functions for downstream features (Stripe payment failure, provisioning confirmation). This is a small-scope feature with clear integration points already stubbed.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Trigger Sources                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ Better   │ │ Stripe   │ │ Provisioner      ││
│  │ Auth     │ │ Webhooks │ │ Pipeline         ││
│  │ Callbacks│ │ (F4)     │ │ (F5)             ││
│  └────┬─────┘ └────┬─────┘ └────┬─────────────┘│
│       │             │            │              │
│       ▼             ▼            ▼              │
│  ┌──────────────────────────────────────────┐   │
│  │  src/lib/email.ts                        │   │
│  │  ┌─────────────────────────────────────┐ │   │
│  │  │ sendVerificationEmail()             │ │   │
│  │  │ sendPasswordResetEmail()            │ │   │
│  │  │ sendWelcomeEmail()                  │ │   │
│  │  │ sendPaymentFailureEmail()  (stub)   │ │   │
│  │  │ sendProvisioningEmail()    (stub)   │ │   │
│  │  └──────────────┬──────────────────────┘ │   │
│  │                 │                        │   │
│  │  ┌──────────────▼──────────────────────┐ │   │
│  │  │ sendEmail() — core with retry       │ │   │
│  │  └──────────────┬──────────────────────┘ │   │
│  └─────────────────┼────────────────────────┘   │
│                    │                            │
│       ┌────────────┴────────────┐               │
│       ▼                         ▼               │
│  ┌──────────┐            ┌──────────────┐       │
│  │ Resend   │            │ email_log    │       │
│  │ API      │            │ (Neon DB)    │       │
│  └──────────┘            └──────────────┘       │
└─────────────────────────────────────────────────┘
```

**Key architectural points:**
- Single email service module (`src/lib/email.ts`) — all email sending goes through one place
- React Email templates in `src/lib/emails/` — type-safe, composable, previewable
- `email_log` table for delivery tracking and dedup
- `user.emailOptOut` column for unsubscribe (non-essential emails only)
- Unsubscribe endpoint at `/api/email/unsubscribe`

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Email Provider | Resend | Constitution mandates it. Free tier (100/day). Simple API. |
| Templates | React Email (`@react-email/components`) | JSX templates, same language as codebase, Resend-native |
| ORM | Drizzle (existing) | email_log table follows existing schema pattern |
| Validation | Zod (existing) | Validate unsubscribe token, email inputs |

**New Dependencies:**
- `resend` — Resend Node.js SDK
- `@react-email/components` — React Email component library (Body, Container, Text, Link, etc.)

---

## Technical Decisions

See `research.md` for full decision documentation. Summary:

1. **Resend** over SendGrid/SES — Constitution, simplicity, free tier
2. **React Email** over MJML/plain HTML — Type-safe, same language, Resend-native
3. **Database email_log** over structured logging — Queryable for support, enables dedup
4. **User column `emailOptOut`** over preferences table — YAGNI, only 2 categories
5. **In-process retry** over job queue — No Redis needed, 7s max delay acceptable
6. **Env var `EMAIL_FROM`** — Flexible for dev/staging/production

---

## Implementation Phases

### Phase 1: Foundation (Schema + Dependencies)
1. Install `resend` and `@react-email/components`
2. Add `email_type` and `email_status` enums to schema
3. Add `email_log` table to schema
4. Add `emailOptOut` column to `user` table
5. Generate and validate Drizzle migration
6. Add `RESEND_API_KEY` and `EMAIL_FROM` to environment

### Phase 2: Core Email Service
1. Create `src/lib/email.ts` — core `sendEmail()` with retry logic and logging
2. Create `src/lib/emails/email-layout.tsx` — shared layout component
3. Create `src/lib/emails/verification-email.tsx`
4. Create `src/lib/emails/password-reset-email.tsx`
5. Wire `sendVerificationEmail` and `sendPasswordResetEmail` into Better Auth callbacks in `auth.ts`

### Phase 3: Welcome Email + Unsubscribe
1. Create `src/lib/emails/welcome-email.tsx` (with waitlist variant)
2. Add `sendWelcomeEmail()` function
3. Create `/api/email/unsubscribe` endpoint
4. Add unsubscribe link generation (signed token)
5. Wire welcome email to post-verification flow

### Phase 4: Future Email Stubs
1. Create `sendPaymentFailureEmail()` — implemented but not wired (Feature 4 will call it)
2. Create `sendProvisioningEmail()` — implemented but not wired (Feature 5 will call it)
3. Create `src/lib/emails/payment-failure-email.tsx`
4. Create `src/lib/emails/provisioning-email.tsx`

---

## Security Considerations

- **RESEND_API_KEY** stored in environment variables only, never in client code
- **Unsubscribe tokens** signed with `BETTER_AUTH_SECRET` to prevent forgery
- **Email content** never includes customer conversation data (Principle 1)
- **Password reset/verification URLs** use HTTPS (enforced by Better Auth)
- **Rate limiting** on email resend handled by Better Auth (3/5min for verification and reset)
- **No email body retention** in email_log — only metadata (type, status, timestamp)

---

## Performance Strategy

- **Email send < 500ms** — Resend API typically responds in 100-300ms
- **Retry delay** — 1s, 2s, 4s exponential backoff (7s max total)
- **Non-blocking** — Email failures don't block auth operations
- **Dedup queries** — Index on `(recipient_email, email_type, created_at)` for fast lookups

---

## Testing Strategy

### Unit Tests
- Email service `sendEmail()` — mock Resend SDK, test retry logic, logging
- Template rendering — verify React Email components produce valid HTML
- Unsubscribe token generation/validation
- Rate limit / dedup logic
- `emailOptOut` flag check before sending non-essential emails

### Integration Tests
- Email log writes to database correctly
- Unsubscribe endpoint updates user record
- Auth callback integration (Better Auth calls email service)

### What We Don't Test
- Actual Resend API delivery (external service — mock it)
- Email rendering in every client (manual QA with React Email preview)

---

## Deployment Strategy

1. Run migration against Neon (adds email_log table, emailOptOut column)
2. Set `RESEND_API_KEY` in Vercel environment variables
3. Set `EMAIL_FROM` in Vercel environment variables (production domain)
4. Deploy — Better Auth immediately starts using real emails instead of console.log
5. Verify: register a test account → receive verification email

**Rollback:** If Resend fails, the console.log fallback is removed. But `sendEmail()` catches all errors and returns `{ success: false }` — auth operations still complete. Worst case: users don't receive emails until Resend issue is resolved.

---

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Resend free tier limit (100/day) | Low (early stage) | Medium | Monitor usage, upgrade to paid ($20/mo) when approaching limit |
| Email deliverability (spam folder) | Medium | High | Verify overnightdesk.com domain in Resend, set up SPF/DKIM/DMARC |
| Migration breaks existing user table | Low | High | `emailOptOut` defaults to false, non-destructive addition |
| React Email bundle size in server | Low | Low | Server-only — no client bundle impact |

---

## Constitutional Compliance

- [x] **Principle 1 (Data Sacred):** No customer conversation data in emails
- [x] **Principle 2 (Security):** API key in env vars, signed unsubscribe tokens, HTTPS links
- [x] **Principle 4 (Simple):** Single email provider, no complex queue, no marketing automation
- [x] **Principle 5 (Business Pays):** Resend free tier (100/day), upgrade path documented
- [x] **Principle 6 (Honesty):** Clear sender identity, honest error messages
- [x] **Principle 7 (Owner's Time):** Automated retries, email logging for support
- [x] **Principle 8 (Quality):** Responsive templates, plain text fallback
- [x] **Email Rules:** Transactional only, CAN-SPAM compliant, no marketing
- [x] **Test-First:** TDD enforced for all phases
- [x] **80%+ coverage:** Testing strategy covers service, templates, and integration

---

## Files to Create/Modify

### New Files
- `src/lib/email.ts` — Core email service
- `src/lib/emails/email-layout.tsx` — Shared template layout
- `src/lib/emails/verification-email.tsx` — Verification template
- `src/lib/emails/password-reset-email.tsx` — Password reset template
- `src/lib/emails/welcome-email.tsx` — Welcome template
- `src/lib/emails/payment-failure-email.tsx` — Payment failure template
- `src/lib/emails/provisioning-email.tsx` — Provisioning template
- `src/app/api/email/unsubscribe/route.ts` — Unsubscribe endpoint
- `src/lib/__tests__/email.test.ts` — Email service unit tests
- `src/lib/__tests__/email-integration.test.ts` — Email integration tests
- `src/lib/emails/__tests__/templates.test.ts` — Template rendering tests
- `drizzle/0002_*.sql` — Migration for email_log + emailOptOut

### Modified Files
- `src/db/schema.ts` — Add email_log table, email enums, emailOptOut column
- `src/lib/auth.ts` — Replace console.log stubs with email service calls
- `package.json` — Add resend, @react-email/components
- `.env.local` — Add RESEND_API_KEY, EMAIL_FROM
- `.env.example` — Document new env vars
