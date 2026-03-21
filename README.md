# OvernightDesk

**Your business never sleeps.**

Customer-facing web app for [OvernightDesk](https://overnightdesk.com) — a private AI assistant that handles support, operations, and reporting for solo entrepreneurs and small businesses in regulated industries.

## Current State: Waitlist

The site is live at **overnightdesk.com** with a landing page and waitlist signup. No auth or payments yet — that comes after Agent Zero is validated on the infrastructure layer.

## Stack

| Concern | Service | Tier |
|---------|---------|------|
| Framework | Next.js 15 (App Router) | — |
| Styling | Tailwind CSS 4 | — |
| Database | Neon Postgres | Free |
| ORM | Drizzle ORM | — |
| Auth (future) | Neon Auth (Better Auth) | Free |
| Hosting | Vercel | Free |
| Analytics | Vercel Analytics | Free |
| Domain | overnightdesk.com (Namecheap) | ~$12/yr |

## Project Structure

```
overnightdesk/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Landing page + waitlist form
│   │   ├── layout.tsx            ← Root layout + analytics
│   │   ├── globals.css           ← Tailwind imports
│   │   └── api/
│   │       └── waitlist/route.ts ← POST /api/waitlist
│   └── db/
│       ├── schema.ts             ← Drizzle schema (waitlist table)
│       └── index.ts              ← Neon + Drizzle connection
├── drizzle/                      ← Generated migrations
├── drizzle.config.ts             ← Drizzle Kit config
├── .env.example                  ← Required env vars
└── .env.local                    ← Local secrets (gitignored)
```

## Landing Page Sections

1. **Hero** — "Your business never sleeps"
2. **Problem** — Solo entrepreneurs drowning in admin/support
3. **How it works** — Sign up, connect AI key, you're live
4. **Built for people like you** — Consultants, healthcare IT, financial advisors, government contractors
5. **Your data stays yours** — Isolation, encryption, audit trail, BYOK
6. **Waitlist signup** — Email, name, business type

## Database

**Neon Postgres** (us-east-1, AWS)

Current schema — one table:

| Table | Columns | Purpose |
|-------|---------|---------|
| `waitlist` | id, email (unique), name, business, created_at | Early access signups |

Neon Auth is enabled on the database for future use.

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...@ep-xxx.aws.neon.tech/neondb?sslmode=require

# Optional
NEXT_PUBLIC_APP_URL=https://overnightdesk.com
```

## DNS (Namecheap)

| Type | Host | Value |
|------|------|-------|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |

## Related Projects

OvernightDesk is a multi-repo platform. These three repos work together:

| Repo | Purpose | Status |
|------|---------|--------|
| [`overnightdesk`](../overnightdesk) | **This repo** — Vercel frontend (landing, auth, billing, dashboard) | Active |
| [`overnightdesk-engine`](../overnightdesk-engine) | Go daemon — Claude Code CLI wrapper, scheduler, messaging bridges, tenant REST API | Complete |
| [`overnightdesk-securityteam`](../overnightdesk-securityteam) | Security pipeline — inbound sanitization, outbound guards, call governor, Telegram approvals | Active |

Supporting repos (not part of the core platform):

| Repo | Purpose |
|------|---------|
| `ironclaw-saas` | Infrastructure layer — provisioning scripts, container hardening, Agent Zero (Oracle Cloud) |
| `ironclaw` | Upstream reference — studied for memory/workspace schema |
| `claudeclaw` | Upstream reference — studied for architecture patterns |

## Development

```bash
npm install
cp .env.example .env.local   # Add your DATABASE_URL
npm run dev                   # http://localhost:3000
```

### Database Commands

```bash
npm run db:generate   # Generate migration from schema changes
npm run db:migrate    # Apply migrations to Neon
npm run db:studio     # Open Drizzle Studio
```

## Roadmap

- [x] Landing page + waitlist
- [x] Vercel deployment + DNS
- [x] Vercel Analytics
- [ ] Neon Auth integration (email + password, email verification)
- [ ] Stripe payments (subscription plans)
- [ ] OpenRouter BYOK onboarding flow
- [ ] Customer dashboard (instance status, key management)
- [ ] Provisioning webhook to ironclaw-saas Oracle server
- [ ] Resend transactional email (welcome, support replies)
