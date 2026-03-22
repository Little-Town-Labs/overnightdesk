# OvernightDesk

**Your business never sleeps.**

Customer-facing web platform for [OvernightDesk](https://overnightdesk.com) — a managed Claude Code hosting service that gives solo entrepreneurs and small businesses a private AI assistant running 24/7.

## Architecture

OvernightDesk is a multi-repo platform:

| Repo | Purpose | Status |
|------|---------|--------|
| **overnightdesk** (this repo) | Vercel frontend — landing, auth, billing, dashboard, provisioning orchestration | 12 features, invite-only launch ready |
| [overnightdesk-engine](../overnightdesk-engine) | Go daemon — Claude Code CLI wrapper, scheduler, messaging bridges, tenant REST API | Complete (81.2% coverage) |
| [overnightdesk-securityteam](../overnightdesk-securityteam) | Security pipeline — inbound sanitization, outbound guards, call governor | Schema complete |

### How It Works

```
Customer → Vercel (Next.js) → Stripe → Provisioner (Oracle Cloud) → Docker Container
                                                                        └── Go Engine → Claude Code CLI
Customer Dashboard → Engine REST API → Jobs, Heartbeat, Conversations, Bridges
```

1. Customer signs up, subscribes via Stripe Checkout
2. Stripe webhook triggers provisioning on Oracle Cloud
3. Container is created with full security hardening
4. Customer connects Claude Code via xterm.js terminal in the dashboard
5. AI assistant runs 24/7 with heartbeat scheduling, job management, and messaging bridges

## Stack

| Concern | Service | Notes |
|---------|---------|-------|
| Framework | Next.js 15 (App Router) | Server components by default |
| Styling | Tailwind CSS 4 | Dark theme (zinc palette) |
| Database | Neon Postgres | Serverless driver |
| ORM | Drizzle ORM | Type-safe queries, migration-based |
| Auth | Better Auth | Email/password, session cookies |
| Payments | Stripe | Checkout, webhooks, Customer Portal |
| Email | Resend | Verification, password reset, notifications |
| Hosting | Vercel | Edge-optimized, Cron jobs |
| Domain | overnightdesk.com | Namecheap |

## Features

### Phase 1: Foundation
- **Database Schema** — Users, subscriptions, instances, fleet events, usage metrics, audit log
- **Authentication** — Email/password registration, email verification, password reset, protected routes
- **Transactional Email** — Resend integration for all lifecycle emails, CAN-SPAM unsubscribe

### Phase 2: Billing
- **Stripe Payments** — Pricing page (Starter $29/mo, Pro $59/mo), Checkout, webhooks, Customer Portal
- **Admin accounts** — Free access for ADMIN_EMAILS, billing feature flag
- **Subscription gating** — Dashboard protected behind active subscription

### Phase 3: Infrastructure
- **Provisioning Pipeline** — Stripe webhook → Oracle Cloud provisioner → container creation
- **Instance Management** — Status tracking (queued → provisioning → running), bearer tokens, health checks
- **Claude Code Onboarding** — xterm.js terminal, 3-step wizard, auth status polling

### Phase 4: Product
- **Customer Dashboard** — Tab navigation with 9 sections:
  - Overview (instance status, engine health, subscription)
  - Heartbeat (enable/disable, interval, prompt, quiet hours)
  - Jobs (create, list, paginate, delete pending)
  - Activity (conversation log with expandable messages)
  - Logs (engine log viewer with refresh)
  - Usage (30-day Claude calls + tool executions chart)
  - Bridges (Telegram + Discord setup wizards)
  - Admin (fleet health + business metrics — admin only)
  - Settings (password change, account deletion)
- **Instance Restart** — Confirmation dialog, 5-minute rate limit
- **Messaging Bridges** — Telegram (BotFather wizard) and Discord (Developer Portal wizard)

### Phase 5: Operations
- **Fleet Monitoring** — Vercel Cron health checks (30 min), consecutive failure tracking, owner Telegram notifications
- **Dead-Man's Switch** — Host-level cron independent of the app (6h threshold)
- **Usage Metrics** — Daily collection from engine API, customer usage display, admin business metrics
- **Admin Dashboard** — Fleet health table, event history, subscriber count, churn risk detection

### Phase 6: Hardening
- **Invite-Only Launch** — INVITED_EMAILS registration gate, middleware whitelist for system routes, timing-safe provisioner auth, security headers, landing page copy fix
- **Contract Tests** — 28 contract tests validating all 16 engine-client functions against real engine response shapes. Fixed 7 integration bugs (WebSocket URL, heartbeat field mapping, Message JSON tags, job timestamps, status nested fields, bridge reconfig detection)

## Project Structure

```
overnightdesk/
├── src/
│   ├── app/
│   │   ├── page.tsx                        ← Landing page + waitlist form
│   │   ├── pricing/                        ← Pricing page + checkout flow
│   │   ├── (protected)/dashboard/          ← Customer dashboard (9 tabs)
│   │   │   ├── layout.tsx                  ← Dashboard layout + nav
│   │   │   ├── page.tsx                    ← Overview tab
│   │   │   ├── heartbeat/                  ← Heartbeat configuration
│   │   │   ├── jobs/                       ← Job management
│   │   │   ├── activity/                   ← Activity log
│   │   │   ├── logs/                       ← Engine log viewer
│   │   │   ├── usage/                      ← Usage metrics
│   │   │   ├── bridges/                    ← Telegram + Discord setup
│   │   │   │   ├── telegram/
│   │   │   │   └── discord/
│   │   │   ├── admin/                      ← Admin-only pages
│   │   │   │   ├── fleet/                  ← Fleet health + events
│   │   │   │   └── metrics/                ← Business metrics
│   │   │   └── settings/                   ← Account settings
│   │   └── api/
│   │       ├── auth/                       ← Better Auth endpoints
│   │       ├── stripe/                     ← Webhook, checkout, portal
│   │       ├── engine/                     ← Engine API proxy routes
│   │       ├── admin/                      ← Admin fleet + metrics APIs
│   │       ├── cron/                       ← Health check + usage collection
│   │       ├── account/                    ← Account deletion
│   │       ├── instance/                   ← Auth status + terminal ticket
│   │       └── provisioner/                ← Provisioner callback
│   ├── lib/
│   │   ├── auth.ts                         ← Better Auth config
│   │   ├── billing.ts                      ← Subscription gating + admin check
│   │   ├── stripe.ts                       ← Lazy Stripe client
│   │   ├── stripe-webhook-handlers.ts      ← 5 Stripe event handlers
│   │   ├── instance.ts                     ← Instance CRUD + port allocation
│   │   ├── engine-client.ts                ← Engine REST API client (18 functions)
│   │   ├── provisioner.ts                  ← Oracle Cloud provisioner HTTP client
│   │   ├── resolve-instance.ts             ← Shared auth + instance resolver
│   │   ├── require-admin.ts                ← Shared admin auth helper
│   │   ├── verify-cron-auth.ts             ← Timing-safe cron auth
│   │   ├── health-check.ts                 ← Fleet health check logic
│   │   ├── owner-notifications.ts          ← Owner Telegram alerts
│   │   ├── usage-collection.ts             ← Daily usage collection
│   │   ├── admin-metrics.ts                ← Business metrics computation
│   │   ├── email.ts                        ← Resend email service
│   │   └── config.ts                       ← Shared config utilities
│   └── db/
│       ├── schema.ts                       ← Drizzle schema (14 tables)
│       └── index.ts                        ← Neon + Drizzle connection
├── drizzle/                                ← Generated migrations (0001-0004)
├── vercel.json                             ← Cron jobs config
├── .specify/                               ← Spec-kit specifications
│   ├── memory/constitution.md
│   ├── roadmap.md
│   └── specs/1-10/                         ← All feature specs, plans, tasks
└── .env.example                            ← Required env vars
```

## Database Schema

14 tables in Neon Postgres:

| Table | Purpose |
|-------|---------|
| `user` | User accounts (Better Auth) |
| `session` | Active sessions |
| `account` | Auth credentials (email/password) |
| `verification` | Email verification tokens |
| `waitlist` | Early access signups |
| `subscription` | Stripe subscription records |
| `instance` | Tenant instance records (status, subdomain, health) |
| `fleet_event` | Operational event audit trail |
| `usage_metric` | Daily usage stats per instance |
| `platform_audit_log` | Admin action audit trail |
| `email_log` | Sent email records |

## Environment Variables

See `.env.example` for full list. Key groups:

- **Database:** `DATABASE_URL`, `DATABASE_TEST_URL`
- **Auth:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs
- **Billing:** `NEXT_PUBLIC_BILLING_ENABLED`, `ADMIN_EMAILS`, `INVITED_EMAILS`
- **Email:** `RESEND_API_KEY`, `EMAIL_FROM`
- **Provisioner:** `PROVISIONER_URL`, `PROVISIONER_SECRET`
- **Monitoring:** `CRON_SECRET`, `OWNER_TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_CHAT_ID`

## Development

```bash
npm install
cp .env.example .env.local   # Add your secrets
npm run dev                   # http://localhost:3000
```

### Database

```bash
npm run db:generate   # Generate migration from schema changes
npm run db:migrate    # Apply migrations to Neon
npm run db:studio     # Open Drizzle Studio
```

### Testing

```bash
npm test              # Run all 529 tests (30 suites)
npm test -- --watch   # Watch mode
```

## Production Setup

1. **Vercel:** Deploy from GitHub, set all env vars from `.env.example`
2. **Stripe:** Create products/prices, configure Customer Portal, add webhook endpoint (`/api/stripe/webhook`)
3. **Neon:** Apply all migrations (`drizzle/0001-0004`)
4. **Oracle Cloud:** Deploy provisioner scripts, configure dead-man's switch cron
5. **Telegram:** Create owner notification bot, set `OWNER_TELEGRAM_BOT_TOKEN` + `OWNER_TELEGRAM_CHAT_ID`

## Remaining Operational Work

- [ ] Oracle Cloud provisioner shell scripts (adapt from ironclaw-saas)
- [ ] Production env vars in Vercel
- [ ] Apply migrations 0003 + 0004 to production Neon DB
- [ ] Stripe Dashboard setup (products, webhook endpoint)
- [ ] Dead-man's switch cron on Oracle VM
- [ ] Engine API: add `created_after` date filtering for jobs/conversations (improves usage collection)
