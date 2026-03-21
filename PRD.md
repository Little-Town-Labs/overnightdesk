# OvernightDesk — Product Requirements Document

**Version:** 2.0
**Date:** 2026-03-21
**Author:** OvernightDesk team
**Status:** Draft
**Supersedes:** PRD v1.0 (IronClaw + OpenRouter BYOK model)

---

## 1. Overview

OvernightDesk is a managed AI assistant hosting platform for solo entrepreneurs and small businesses. Customers bring their own Claude Code subscription, pay OvernightDesk a monthly fee for hosting and management, and receive a fully isolated AI assistant instance that handles support, operations, and reporting 24/7.

### Vision

"Your business never sleeps." — Give solo operators and small teams an AI-powered back office that runs overnight, handles customer support, and surfaces reports — without sharing data with anyone else.

### Target Users

- Solo entrepreneurs and small teams (1–10 people)
- Regulated industries: healthcare IT, financial advisory, government contracting, consulting
- Non-technical operators who need privacy guarantees and audit trails
- People who have looked at AI tools but can't trust shared infrastructure with client data

### What Changed (v1 → v2)

| v1 (IronClaw + OpenRouter) | v2 (Go daemon + Claude Code) |
|---------------------------|------------------------------|
| IronClaw Rust binary as engine | Custom Go daemon wrapping Claude Code CLI |
| OpenRouter BYOK (API key) | Claude Code subscription (OAuth) |
| Customer provides API key at checkout | Customer authenticates Claude Code post-provisioning |
| BYOK key encrypted/managed by platform | No AI credential management — Claude CLI handles its own auth |
| IronClaw's built-in web UI (Vanilla JS SPA) | Platform web dashboard on Vercel + per-tenant API |
| Single Postgres per host (schema-per-tenant) | NeonDB for platform + SQLite per tenant instance |
| Rust compilation for ARM | Single Go binary, cross-compiled to ARM |

---

## 2. Current State

**Live at:** overnightdesk.com (Vercel)

### What exists today

| Component | Status |
|-----------|--------|
| Landing page with value proposition | Shipped |
| Waitlist signup form (email, name, business) | Shipped |
| Waitlist API endpoint (`POST /api/waitlist`) | Shipped |
| Neon Postgres database (waitlist table) | Shipped |
| Vercel Analytics | Shipped |
| DNS + domain (Namecheap) | Shipped |

### What does not exist yet

- Authentication (sign up / sign in)
- Subscription payments
- Customer dashboard
- Claude Code onboarding flow
- Go daemon engine (new project)
- Instance provisioning
- Transactional email
- Admin/ops tooling (beyond Telegram + CLI)

### Related repositories

| Repo | Purpose | Status |
|------|---------|--------|
| `overnightdesk` (this repo) | Vercel frontend — landing, auth, billing, dashboard | Active, Next.js live |
| `ironclaw-saas` | Infrastructure scripts — provisioning, security, container hardening, Agent Zero | Active, scripts tested |
| `overnightdesk-engine` (new) | Go daemon — Claude Code CLI wrapper, scheduler, messaging bridges, tenant API | Not yet created |
| `claudeclaw` | Reference implementation — studied for architecture patterns | Read-only reference |
| `ironclaw` | Reference implementation — studied for memory/workspace schema | Read-only reference |

---

## 3. Architecture

### System Architecture

```
┌──────────────────────────────────────────────┐
│  Vercel                                      │
│  Next.js 15 (App Router)                     │
│  ├── Landing page + waitlist                 │
│  ├── Auth (Better Auth / Neon Auth)          │
│  ├── Stripe billing                          │
│  ├── Customer dashboard                      │
│  └── Instance management UI                  │
│       │                                      │
│       ├── NeonDB ←→ Platform data            │
│       └── Tenant API ←→ Per-tenant subdomain │
├──────────────────────────────────────────────┤
│  NeonDB (Postgres)                           │
│  Platform database:                          │
│  ├── users, subscriptions                    │
│  ├── instances (status, port, subdomain)     │
│  ├── fleet_events, usage_metrics             │
│  └── platform_audit_log                      │
├──────────────────────────────────────────────┤
│  Oracle Cloud ARM (4 OCPU / 24GB / 200GB)    │
│                                              │
│  ironclaw-infra-net:                         │
│  ├── nginx (TLS, wildcard subdomain routing) │
│  ├── provisioner (Stripe webhook receiver)   │
│  └── Agent Zero (fleet monitoring, support)  │
│                                              │
│  ironclaw-tenant-net:                        │
│  ├── tenant-alice (Go daemon + SQLite)       │
│  ├── tenant-bob   (Go daemon + SQLite)       │
│  └── ... up to ~40 tenants                   │
└──────────────────────────────────────────────┘
```

### Per-Tenant Container

Each customer gets an isolated Docker container running:

```
┌─────────────────────────────────────┐
│  Docker container (read-only rootfs) │
│                                     │
│  Go daemon (overnightdesk-engine)   │
│  ├── Claude Code CLI wrapper        │
│  │   └── claude --bare -p <prompt>  │
│  │       --resume <session>         │
│  │       --dangerously-skip-perms   │
│  ├── Heartbeat scheduler            │
│  ├── Cron job engine                │
│  ├── Telegram bridge (optional)     │
│  ├── Discord bridge (optional)      │
│  ├── REST API (dashboard backend)   │
│  └── Web terminal (xterm.js, auth)  │
│                                     │
│  /data (bind mount, tenant storage) │
│  ├── tenant.db (SQLite)             │
│  ├── .claude/ (CLI session data)    │
│  ├── workspace/ (tenant files)      │
│  └── logs/                          │
│                                     │
│  /tmp, /run (tmpfs, ephemeral)      │
└─────────────────────────────────────┘
```

### Tech Stack

#### Frontend (this repo — overnightdesk)

| Concern | Choice | Notes |
|---------|--------|-------|
| Framework | Next.js 15 (App Router) | Vercel-hosted |
| Styling | Tailwind CSS 4 | |
| Database | Neon Postgres | Serverless driver, us-east-1 |
| ORM | Drizzle ORM | Type-safe, migration-based |
| Auth | Better Auth (Neon Auth) | Not yet integrated |
| Payments | Stripe | Not yet integrated |
| Hosting | Vercel | Free tier currently |
| Analytics | Vercel Analytics | Integrated |
| Email | Resend | Not yet integrated |
| Validation | Zod | |

#### Engine (new repo — overnightdesk-engine)

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | Go | Low memory, single binary, ARM cross-compile |
| CLI wrapper | `claude --bare` | Headless mode, no hooks/LSP, ANTHROPIC_API_KEY or OAuth |
| Tenant database | SQLite | `modernc.org/sqlite` (pure Go, no CGO) |
| Query generation | sqlc | Type-safe Go from SQL, same workflow as platform Postgres |
| Migrations | goose | SQL-file-based, supports Postgres + SQLite |
| HTTP framework | net/http or Echo | Tenant API + web terminal proxy |
| Telegram | telebot or grammY (Go port) | Per-tenant bot bridge |
| Discord | discordgo | Per-tenant bot bridge |

#### Infrastructure (from ironclaw-saas)

| Concern | Choice | Notes |
|---------|--------|-------|
| Compute | Oracle Cloud ARM free tier | 4 OCPU, 24GB RAM, 200GB NVMe |
| Containers | Docker + hardened defaults | Seccomp, AppArmor, read-only rootfs, cap-drop ALL |
| Reverse proxy | nginx 1.27 | Wildcard TLS, per-tenant server blocks |
| Networking | Two Docker bridge networks | infra-net + tenant-net with iptables isolation |
| Provisioning | Shell scripts + provisioner service | Stripe webhook → container create |
| Monitoring | Agent Zero + dead-man's switch cron | 30m heartbeat + 6h host-level liveness |
| Platform AI | OpenRouter (platform key) | Agent Zero ops, fleet monitoring, support automation |

---

## 4. Authentication Model

### Customer AI Auth (Claude Code)

Customers bring their own **Claude Code subscription**. No API keys are exchanged, stored, or managed by OvernightDesk.

**Onboarding flow:**

```
1. Customer pays (Stripe) → container provisioned
2. Welcome email with dashboard URL + bearer token
3. Customer opens dashboard → "Connect your Claude Code account"
4. Clicks button → embedded web terminal opens inside dashboard
5. Claude Code launches → OAuth flow opens in new browser tab
6. Customer logs into their Anthropic account → terminal shows "✓ Authenticated"
7. Dashboard switches to "Your assistant is live" → done
```

After initial auth, Claude Code manages its own token refresh. Customer never touches the terminal again unless they choose to.

**Why this model:**
- Zero credential management burden for us
- Customer's Claude usage bills directly to their Anthropic account
- No API key rotation, validation, or encryption needed
- Matches how Claude Code works on their own machine
- We never see their conversations or API traffic

### Platform AI Auth (OpenRouter)

OvernightDesk uses its own OpenRouter API key for platform-level operations only:
- Agent Zero fleet monitoring and health checks
- Automated support responses
- Usage summarization and reporting
- Operations that customers don't see or pay for

This key is stored in the Agent Zero container's environment, not exposed to tenant containers.

### Dashboard Auth

Each tenant gets a bearer token generated at provisioning time for their web dashboard. The token is:
- Generated via `openssl rand -base64 32`
- Sent in the welcome email
- Required for all dashboard API calls
- Stored hashed in the platform database
- Rotatable via dashboard settings (once authenticated)

---

## 5. Features — Prioritized Roadmap

### Phase 1: Authentication

**Goal:** Users can create an account and sign in.

**Requirements:**
- Email + password registration
- Email verification (magic link or code)
- Sign in / sign out
- Password reset flow
- Session management (cookie-based via Better Auth)
- Protected routes (dashboard, settings)
- Waitlist-to-account conversion (existing waitlist emails get priority)

**Dependencies:** Better Auth setup on existing Neon database

### Phase 2: Stripe Payments

**Goal:** Users subscribe to a plan before getting an instance.

**Requirements:**
- Pricing page with plan tiers (Starter, Pro)
- Stripe Checkout integration (redirect flow)
- Subscription lifecycle: create, update, cancel, reactivate
- Webhook handler for Stripe events (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`)
- Billing portal link (Stripe Customer Portal) for self-service plan changes
- Grace period handling (3 days) for failed payments
- Store subscription status in NeonDB
- Gate dashboard/provisioning behind active subscription

**Dependencies:** Phase 1 (auth)

### Phase 3: Engine MVP (overnightdesk-engine)

**Goal:** Go daemon that wraps Claude Code CLI for headless execution.

**Requirements:**
- Spawn `claude --bare -p <prompt> --resume <session> --dangerously-skip-permissions` as child process
- Serial execution queue (one Claude call at a time per tenant)
- Session management (create new, resume existing, persist session ID)
- SQLite database for tenant data (conversations, memory, jobs, heartbeat)
- REST API for dashboard integration (status, logs, settings, jobs)
- Bearer token authentication on all API endpoints
- Configurable heartbeat (periodic prompt execution with quiet hours)
- Cron job engine (timezone-aware, markdown job files)
- Structured logging to /data/logs/
- Graceful shutdown with state persistence
- Health check endpoint (/healthz, unauthenticated)
- Single binary, cross-compiled for linux/arm64

**Dependencies:** None (can be built in parallel with Phase 1-2)

### Phase 4: Claude Code Onboarding

**Goal:** Non-technical users can connect their Claude Code subscription through the dashboard.

**Requirements:**
- Embedded web terminal in dashboard (xterm.js via WebSocket to container)
- Guided onboarding UI: "Step 1: Click Connect → Step 2: Log in to Anthropic → Step 3: Done"
- Terminal session scoped to Claude Code auth only (not a general shell)
- Auth status detection (check if `~/.claude/` has valid credentials)
- Dashboard displays auth status: connected, expired, not configured
- Re-auth flow if token expires
- Clear messaging: "You're logging into YOUR Claude Code account. We never see your credentials."

**Dependencies:** Phase 3 (engine), Phase 5 (provisioning)

### Phase 5: Provisioning Pipeline

**Goal:** When a user completes signup + payment, automatically provision their instance.

**Requirements:**
- Stripe webhook triggers provisioning
- Provisioning request to Oracle Cloud server (provisioner service)
- Container creation with full security hardening (seccomp, AppArmor, read-only rootfs, resource caps)
- Per-tenant subdomain: `{tenant}.overnightdesk.com`
- Nginx server block generated and reloaded
- Network isolation (tenant-net, iptables egress rules)
- Dashboard bearer token generated and stored
- Provisioning status tracking (queued → provisioning → awaiting_auth → running → error)
- Health check polling to confirm instance is live
- Deprovision on subscription cancellation (container stopped, data preserved 30 days)
- Welcome email with dashboard URL, bearer token, and getting-started guide

**Dependencies:** Phase 2 (Stripe), Phase 3 (engine), ironclaw-saas provisioning scripts

### Phase 6: Customer Dashboard

**Goal:** Authenticated, subscribed users can see and manage their AI assistant.

**Requirements:**
- Dashboard home showing instance status (provisioning, awaiting_auth, running, stopped, error)
- Claude Code auth status (connected / not connected / expired)
- Connect Claude Code button → web terminal onboarding flow
- Heartbeat configuration (enable/disable, interval, prompt, quiet hours)
- Job management (create, view, delete cron jobs)
- Activity log (recent Claude runs with timestamps and summaries)
- Telegram/Discord setup wizard (provide bot token, user IDs)
- Subscription status summary (plan, next billing date, manage link)
- Account settings (email, password change, delete account)
- Instance controls: restart

**Dependencies:** Phase 4 (Claude auth), Phase 5 (provisioning)

### Phase 7: Messaging Bridges

**Goal:** Customers can talk to their assistant via Telegram and Discord.

**Requirements:**
- Each tenant configures their own Telegram bot (token via dashboard)
- Each tenant configures their own Discord bot (token via dashboard)
- Setup wizard with step-by-step instructions (BotFather, Developer Portal)
- Allowed user IDs required (non-empty) — enforced by engine
- Text, image, and voice message support
- Message routing: Telegram/Discord → engine → Claude CLI → response → Telegram/Discord
- Webhook URL auto-configured: `https://{tenant}.overnightdesk.com/telegram/webhook`

**Dependencies:** Phase 3 (engine), Phase 5 (provisioning)

### Phase 8: Transactional Email (Resend)

**Goal:** Send essential lifecycle emails.

**Requirements:**
- Welcome email on signup
- Email verification
- Subscription confirmation
- Payment failed notification
- Instance provisioned + getting started guide
- Claude Code auth reminder (if instance is running but auth not completed)
- Password reset
- Account deletion confirmation
- Unsubscribe/preferences (CAN-SPAM compliance)

**Dependencies:** Phase 1 (auth), Resend account setup

---

## 6. Data Model

### Platform Database (NeonDB — Postgres)

```
users
├── id (uuid, PK)
├── email (unique)
├── name
├── password_hash
├── email_verified (boolean)
├── created_at
└── updated_at

subscriptions
├── id (uuid, PK)
├── user_id (FK → users)
├── stripe_customer_id
├── stripe_subscription_id
├── plan (enum: starter, pro)
├── status (enum: active, past_due, canceled, trialing)
├── current_period_end (timestamp)
├── created_at
└── updated_at

instances
├── id (uuid, PK)
├── user_id (FK → users)
├── tenant_id (text, unique — slug derived from email)
├── status (enum: queued, provisioning, awaiting_auth, running, stopped, error, deprovisioned)
├── container_id (text)
├── gateway_port (integer, unique)
├── dashboard_token_hash (text — bcrypt)
├── claude_auth_status (enum: not_configured, connected, expired)
├── subdomain (text, unique — {tenant}.overnightdesk.com)
├── provisioned_at (timestamp)
├── deprovisioned_at (timestamp)
├── last_health_check (timestamp)
├── created_at
└── updated_at

fleet_events
├── id (serial, PK)
├── instance_id (FK → instances, nullable)
├── event_type (text — provisioned, started, stopped, health_check, error, restart)
├── details (jsonb)
└── created_at

usage_metrics
├── id (serial, PK)
├── instance_id (FK → instances)
├── metric_date (date)
├── claude_calls (integer)
├── tool_executions (integer)
└── UNIQUE (instance_id, metric_date)

platform_audit_log
├── id (serial, PK)
├── actor (text — provisioner, agent-zero, owner, user:{id})
├── action (text)
├── target (text)
├── details (jsonb)
└── created_at

waitlist (existing)
├── id (serial, PK)
├── email (text)
├── name (text)
├── business (text)
└── created_at
```

### Tenant Database (SQLite — per instance)

Adapted from IronClaw's memory/workspace schema:

```
conversations
├── id (text, PK — UUID)
├── channel (text — telegram, discord, heartbeat, cron, dashboard)
├── user_id (text)
├── thread_id (text, nullable)
├── started_at (text — ISO-8601)
├── last_activity (text — ISO-8601)
└── metadata (text — JSON)

conversation_messages
├── id (text, PK — UUID)
├── conversation_id (FK → conversations)
├── role (text — user, assistant, system)
├── content (text)
└── created_at (text — ISO-8601)

memory_documents
├── id (text, PK — UUID)
├── path (text, unique — filesystem-like, e.g. "context/vision.md")
├── content (text)
├── created_at (text — ISO-8601)
├── updated_at (text — ISO-8601)
└── metadata (text — JSON)

memory_chunks
├── id (text, PK — UUID)
├── document_id (FK → memory_documents)
├── chunk_index (integer)
├── content (text)
└── UNIQUE (document_id, chunk_index)
  (FTS5 virtual table for full-text search)

heartbeat_state
├── id (text, PK — UUID)
├── last_run (text — ISO-8601)
├── next_run (text — ISO-8601)
├── interval_seconds (integer, default 1800)
├── enabled (integer — boolean)
├── consecutive_failures (integer, default 0)
└── last_checks (text — JSON)

agent_jobs
├── id (text, PK — UUID)
├── conversation_id (FK → conversations, nullable)
├── name (text)
├── status (text — pending, running, completed, failed)
├── source (text — heartbeat, cron, telegram, discord, dashboard)
├── prompt (text)
├── result (text, nullable)
├── started_at (text — ISO-8601, nullable)
├── completed_at (text — ISO-8601, nullable)
└── created_at (text — ISO-8601)

claude_sessions
├── id (text, PK — UUID)
├── session_id (text — Claude Code session ID)
├── created_at (text — ISO-8601)
└── last_used_at (text — ISO-8601)
```

---

## 7. Container Security

Carried from ironclaw-saas security work. Applied to every tenant container.

### Non-Negotiable Hardening

```
--read-only                              # Immutable root filesystem
--cap-drop ALL                           # No Linux capabilities
--security-opt no-new-privileges:true    # No privilege escalation
--security-opt seccomp=claudeclaw.json   # Custom seccomp profile
--security-opt apparmor=claudeclaw       # AppArmor write restriction
--pids-limit 256                         # Fork bomb protection
--tmpfs /tmp --tmpfs /run                # Ephemeral temp storage
--memory 512m --memory-swap 512m         # Memory cap, no swap
--cpus 0.5                               # CPU quota
```

### Network Isolation

- Two Docker networks: `ironclaw-infra-net` (infrastructure) + `ironclaw-tenant-net` (tenants)
- Inter-tenant traffic blocked via iptables
- Egress limited to port 443 (Anthropic API) + platform DB
- DNS resolution restricted

### Blast Radius of --dangerously-skip-permissions

Claude Code runs with full tool access inside the container. The container security ensures:

| Action | Possible? | Why |
|--------|-----------|-----|
| Read/write /data | Yes (intended) | Tenant's own workspace |
| Write to rootfs | No | Read-only filesystem |
| Fork bomb | No | pids-limit 256 |
| Exhaust memory | Capped | 512MB hard limit |
| Access other tenants | No | Network isolation + no host mounts |
| Access Docker socket | No | Not mounted |
| Mount filesystems | No | Seccomp + cap-drop |
| Escape via ptrace | No | Seccomp blocks ptrace |
| Call arbitrary HTTPS | Yes | Tenant's own Claude sub, acceptable |

---

## 8. Non-Functional Requirements

### Security
- Container isolation with seccomp, AppArmor, read-only rootfs
- No AI credentials managed by platform (Claude Code handles its own auth)
- Dashboard bearer token per tenant
- Stripe webhook signature verification
- CSRF protection on all forms
- Rate limiting on auth endpoints and API routes
- Input validation on all endpoints (Zod frontend, Go backend)
- HTTPS everywhere (Vercel + nginx TLS termination)
- Platform secrets in environment only, never in code/logs

### Privacy
- Physical tenant isolation: each customer's instance is a separate container
- Customer's Claude Code auth stays in their container — platform never accesses it
- No cross-tenant data access (separate containers, separate SQLite databases, separate networks)
- Customer conversations never leave their container
- Data export: users can download their tenant data
- Data deletion: full deprovision with data purge after 30-day retention

### Performance
- Landing page: < 2s LCP
- Dashboard: < 1s TTFB on Vercel edge
- Provisioning: < 120s from payment to container running
- Claude Code onboarding: < 2 minutes (guided flow)
- API responses: < 500ms p95
- Go daemon memory: < 15MB idle per tenant

### Reliability
- Provisioning retries with exponential backoff
- Health checks every 30 minutes (Agent Zero)
- Host-level dead-man's switch (6h cron, independent of Agent Zero)
- Webhook idempotency (Stripe events may be delivered multiple times)
- Auto-restart on container crash (1 attempt, then escalate)
- Circuit breaker after 3 restart failures per hour
- Graceful degradation if Oracle instance is unreachable

### Capacity
- 40 tenants on Oracle Cloud free tier (4 OCPU, 24GB RAM, 200GB disk)
- ~600MB total daemon memory at 40 tenants (Go efficiency)
- Scale-out to Contabo (~$14/mo) at 35 tenants or 85% memory utilization
- Go daemon idle: ~10MB RAM, ~0% CPU per tenant
- Go daemon active (during Claude call): ~150MB RAM, 5-15% CPU (IO-bound)

---

## 9. Out of Scope (for now)

- Admin dashboard for managing tenants (ops stays on Telegram + CLI)
- Multi-user teams / organizations
- Custom domains for customer instances
- Mobile app
- Self-hosted / on-premise option
- Usage-based billing (flat subscription only)
- Multiple AI providers (Claude Code only; OpenRouter for platform ops only)
- Vector embeddings for memory search (FTS5 only in v1; vector search in v2)
- Claude Code `--channels` permission relay (interesting for Phase 2+)

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Waitlist → signup conversion | > 30% |
| Signup → paid subscriber | > 20% |
| Time to first running instance | < 5 minutes (including Claude Code auth) |
| Monthly churn | < 5% |
| Support tickets per user/month | < 1 |
| Provisioning success rate | > 95% |
| Instance uptime | > 99% |

---

## 11. Open Questions

1. **Pricing tiers** — What differentiates Starter vs Pro? (Resource limits? Number of cron jobs? Messaging bridges? Support level?)
2. **Trial period** — Free trial before payment, or pay-first with money-back guarantee?
3. **Instance limits** — One instance per user, or can Pro users run multiple?
4. **Claude Code subscription guidance** — Do we recommend a specific Claude plan? (Max vs Pro vs Team)
5. **Web terminal security** — How to scope the embedded terminal to auth-only and prevent general shell access?
6. **Monitoring push vs pull** — Should Oracle instance push status to NeonDB/Vercel, or should Vercel poll the tenant APIs?
7. **Token expiry** — What happens when a customer's Claude Code OAuth token expires and they're not around to re-auth? Grace period? Notification?

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Tenant** | A single customer's isolated instance (container + SQLite + Claude Code session) |
| **Engine** | The Go daemon (`overnightdesk-engine`) that wraps Claude Code CLI |
| **Platform** | The Vercel frontend + NeonDB + provisioner + Agent Zero — everything the customer doesn't run |
| **BYOS** | Bring Your Own Subscription — customer uses their Claude Code subscription, billed by Anthropic |
| **Agent Zero** | Platform ops agent that monitors the fleet, handles support, uses OpenRouter (our key) |
| **Heartbeat** | Periodic prompt execution (e.g., "check git status", "summarize today's emails") |
| **Dashboard** | Customer-facing UI on Vercel + per-tenant API for real-time instance data |
