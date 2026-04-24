# OvernightDesk — Product Requirements Document

**Version:** 3.0
**Date:** 2026-04-24
**Author:** OvernightDesk team
**Status:** Active
**Supersedes:** PRD v2.1 (Go daemon + Claude Code BYOS), PRD v1.0 (IronClaw + OpenRouter BYOK model)

---

## 1. Overview

OvernightDesk is a managed AI assistant hosting platform for solo entrepreneurs and small businesses. Customers bring their own OpenRouter API key, pay OvernightDesk a monthly fee for hosting and management, and receive a fully isolated AI assistant instance that handles support, operations, and reporting 24/7.

### Vision

"Your business never sleeps." — Give solo operators and small teams an AI-powered back office that runs overnight, handles customer support, and surfaces reports — without sharing data with anyone else.

### Target Users

- Solo entrepreneurs and small teams (1–10 people)
- Regulated industries: healthcare IT, financial advisory, government contracting, consulting
- Non-technical operators who need privacy guarantees and audit trails
- People who have looked at AI tools but can't trust shared infrastructure with client data

### What Changed (v2 → v3)

| v2 (Go daemon + Claude Code) | v3 (hermes-agent + OpenRouter + Phase) |
|------------------------------|----------------------------------------|
| Custom Go daemon wrapping Claude Code CLI | hermes-agent (Nous Research, Python/FastAPI) |
| Claude Code subscription (BYOS OAuth) | OpenRouter API key — customer brings their own |
| Customer authenticates Claude Code post-provisioning | Customer provides OpenRouter key in setup wizard |
| No credential management — Claude CLI handles auth | Secrets stored encrypted in Phase.dev, injected via `phase run` |
| Platform dashboard + terminal proxy for onboarding | Platform dashboard + web chat interface (Vercel AI SDK) |
| Agent Zero = custom Go engine instance | Agent Zero = hermes-agent instance (Gary's, on aegis-prod) |
| NeonDB for platform + SQLite per tenant | Same — NeonDB platform + hermes-agent SQLite per tenant |
| No self-service provisioning | Self-service setup wizard: key → Phase → container → live |

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

| Component | Repo | Status |
|-----------|------|--------|
| Landing page with value proposition | overnightdesk | Shipped |
| Waitlist signup form (email, name, business) | overnightdesk | Shipped |
| Waitlist API endpoint (`POST /api/waitlist`) | overnightdesk | Shipped |
| Neon Postgres database (waitlist table) | overnightdesk | Shipped |
| Vercel Analytics | overnightdesk | Shipped |
| DNS + domain (Namecheap) | overnightdesk | Shipped |
| Go daemon — Claude Code CLI wrapper | overnightdesk-engine | Shipped |
| Serial job queue (one Claude call at a time) | overnightdesk-engine | Shipped |
| Heartbeat scheduler (configurable interval + quiet hours) | overnightdesk-engine | Shipped |
| Cron engine (markdown + YAML job files) | overnightdesk-engine | Shipped |
| REST API (20+ endpoints, Echo, bearer auth) | overnightdesk-engine | Shipped |
| SQLite database (goose migrations, auto-setup) | overnightdesk-engine | Shipped |
| Telegram bridge (webhook, text/voice/image) | overnightdesk-engine | Shipped |
| Discord bridge (Gateway, DMs + mentions) | overnightdesk-engine | Shipped |
| Web terminal proxy (WebSocket PTY, ticket auth) | overnightdesk-engine | Shipped |
| Auth status detection (`/api/auth-status`) | overnightdesk-engine | Shipped |
| Test suite (81.2% coverage) | overnightdesk-engine | Shipped |
| Dockerfile (ARM64 cross-compile, no CGO) | overnightdesk-engine | Shipped |
| Tenant deployment guide + docker-compose reference | overnightdesk-engine | Shipped |

### What does not exist yet

- Authentication (sign up / sign in) — this repo
- Subscription payments (Stripe) — this repo
- Customer dashboard — this repo
- Claude Code onboarding UI (xterm.js frontend) — this repo
- Provisioning pipeline (Stripe → container) — this repo
- Transactional email (Resend) — this repo
- Fleet monitoring (Agent Zero) — this repo

### Related repositories

| Repo | Purpose | Status |
|------|---------|--------|
| `overnightdesk` (this repo) | Vercel frontend — landing, auth, billing, dashboard | Active, Next.js live |
| `overnightdesk-engine` | Go daemon — Claude Code CLI wrapper, scheduler, messaging bridges, tenant API | Complete, 81.2% test coverage |
| `overnightdesk-securityteam` | Security pipeline — inbound/outbound guards, call governor, Telegram approvals | Active |

---

## 3. Architecture

### System Architecture

```
┌──────────────────────────────────────────────────┐
│  Vercel                                          │
│  Next.js 15 (App Router)                         │
│  ├── Landing page + waitlist                     │
│  ├── Auth (Better Auth)                          │
│  ├── Stripe billing                              │
│  ├── Customer dashboard (hermes hub)             │
│  ├── Web chat UI (Vercel AI SDK → hermes :8642)  │
│  └── Self-service setup wizard (secrets → Phase) │
│       │                                          │
│       ├── NeonDB ←→ Platform data                │
│       └── Tenant API ←→ {tenantId}.overnightdesk.com │
├──────────────────────────────────────────────────┤
│  NeonDB (Postgres)                               │
│  Platform database:                              │
│  ├── users, subscriptions                        │
│  ├── instances (status, subdomain, phase token)  │
│  ├── fleet_events, usage_metrics                 │
│  └── platform_audit_log                          │
├──────────────────────────────────────────────────┤
│  Phase.dev                                       │
│  Per-tenant secret paths:                        │
│  ├── /agent-zero  (Gary — Agent Zero)            │
│  ├── /aero-fett   (Mitchel — reference tenant)   │
│  └── /{tenantId}  (each new tenant)              │
│  Secrets: OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN │
│  Injected at container start via `phase run`     │
├──────────────────────────────────────────────────┤
│  Oracle Cloud ARM (4 OCPU / 24GB / 200GB)        │
│                                                  │
│  overnightdesk-infra-net:                        │
│  ├── nginx (TLS, {tenantId}.overnightdesk.com)   │
│  ├── provisioner (Stripe webhook receiver)       │
│  └── Agent Zero (hermes-agent, Gary's instance)  │
│                                                  │
│  overnightdesk-tenant-net:                       │
│  ├── hermes-mitchel  (hermes-agent + SQLite)     │
│  ├── hermes-alice    (hermes-agent + SQLite)     │
│  └── ... up to ~40 tenants                       │
└──────────────────────────────────────────────────┘
```

### Per-Tenant Container

Each customer gets an isolated Docker container running:

```
┌──────────────────────────────────────────────┐
│  hermes-mitchel  (gateway container)         │
│  image: nousresearch/hermes-agent:latest     │
│                                              │
│  hermes gateway run                          │
│  ├── Telegram bridge (WebSocket to gateway)  │
│  ├── Discord bridge (optional)               │
│  ├── Cron scheduler                          │
│  ├── OpenAI-compatible API  :8642            │
│  └── Session / memory management            │
│                                              │
│  /opt/data (bind mount — /opt/{tenantId})    │
│  ├── .env  ← written by `phase secrets export` │
│  ├── config.yaml                             │
│  ├── state.db (SQLite)                       │
│  ├── sessions/                               │
│  └── skills/                                 │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│  hermes-mitchel-dashboard  (sidecar)         │
│  image: nousresearch/hermes-agent:latest     │
│                                              │
│  hermes dashboard --host 0.0.0.0 :9119       │
│  ├── Web UI (React SPA)                      │
│  └── REST API (config, sessions, cron, logs) │
│                                              │
│  /opt/data (same bind mount as gateway)      │
└──────────────────────────────────────────────┘
        ↑ both served via nginx at
          {tenantId}.overnightdesk.com
          / → dashboard :9119
          /v1/* → gateway API :8642
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

#### Engine (overnightdesk-engine — COMPLETE)

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | Go 1.25+ | Low memory (~10MB idle), single binary, ARM cross-compile |
| CLI wrapper | `claude -p` | Print mode with OAuth (NOT `--bare` — see Deployment Gotchas) |
| Tenant database | SQLite | `modernc.org/sqlite` (pure Go, no CGO) |
| Migrations | goose | SQL-file-based, auto-run on startup |
| HTTP framework | Echo | 20+ endpoints, bearer auth, rate limiting |
| Telegram | webhook mode | Text, voice (Whisper), image support |
| Discord | discordgo (Gateway) | DMs + @mentions, MESSAGE_CONTENT intent |
| Web terminal | WebSocket PTY | Ticket auth (single-use, 30s TTL) |
| Testing | 81.2% coverage | Mock Claude CLI (`testutil/mock_claude.sh`) |

#### Infrastructure

| Concern | Choice | Notes |
|---------|--------|-------|
| Compute | Oracle Cloud ARM free tier | 4 OCPU, 24GB RAM, 200GB NVMe |
| Containers | Docker + hardened defaults | Seccomp, AppArmor, read-only rootfs, cap-drop ALL |
| Reverse proxy | nginx 1.27 | Wildcard TLS, per-tenant server blocks |
| Networking | Two Docker bridge networks | infra-net + tenant-net with iptables isolation |
| Provisioning | Shell scripts + provisioner service | Stripe webhook → container create (to be built) |
| Monitoring | Agent Zero + dead-man's switch cron | 30m heartbeat + 6h host-level liveness (to be built) |
| Platform AI | OpenRouter (platform key) | Agent Zero ops, fleet monitoring, support automation |
| Security | overnightdesk-securityteam | Inbound/outbound guards, call governor, Telegram approvals |

---

## 4. Authentication Model

### Customer AI Auth (OpenRouter + Phase.dev)

Customers bring their own **OpenRouter API key**. The key is collected once during setup and stored encrypted in Phase.dev — OvernightDesk never stores it in plaintext.

**Onboarding flow:**

```
1. Customer pays (Stripe) → setup wizard opens
2. Customer enters OpenRouter API key + optional bot tokens
3. Platform writes secrets to Phase.dev at /{tenantId}/
4. Provisioner runs: phase secrets export --path /{tenantId} > /opt/{tenantId}/.env
5. hermes-agent container starts — reads .env as normal
6. Welcome email with dashboard URL
7. Customer opens dashboard → "Your assistant is live" + Launch Dashboard button + Chat
```

Customer never touches the server. Credential rotation = update in Phase.dev + restart container.

**Why this model:**
- Customer's OpenRouter usage bills to their own account
- Secrets never touch the platform DB in plaintext — Phase.dev is the source of truth
- Rotation without redeploy: update Phase.dev secret → restart container
- hermes-agent unchanged — reads from `.env` file as designed
- No OAuth flow or terminal proxying required

### Platform AI Auth (OpenRouter — Agent Zero)

OvernightDesk uses its own OpenRouter API key for platform-level operations only:
- Agent Zero (Gary's hermes-agent instance) — fleet monitoring, support, ops
- Usage summarization and reporting
- Operations that customers don't see or pay for

This key lives in Phase.dev at `/agent-zero/`, injected via `phase run` at Agent Zero's container start.

### Platform → Tenant API Auth

The OvernightDesk platform communicates with the hermes dashboard sidecar on each tenant's subdomain. The hermes dashboard uses an ephemeral session token (generated per server start). The platform accesses the hermes dashboard **only** via the "Launch Dashboard" button — the token is injected into the SPA at page load. The platform does not proxy hermes API calls directly.

> **Future (Phase 7):** The web chat interface calls the hermes OpenAI-compatible API on `:8642` via the platform's `/api/engine/chat` route. The `API_SERVER_KEY` stored in Phase.dev and the instance's `engineApiKey` field are used as the bearer token for this channel.

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

### Phase 3: Engine MVP (overnightdesk-engine) — COMPLETE

**Status:** Shipped 2026-03-21 — 81.2% test coverage

**What was built:**
- Go daemon wrapping `claude -p <prompt> --resume <session> --dangerously-skip-permissions`
- Serial execution queue (one Claude call at a time per tenant)
- Session management (create new, resume existing, persist session ID)
- SQLite database with auto-migrations (conversations, messages, jobs, heartbeat, memory, sessions, bridge configs)
- REST API: 20+ endpoints via Echo with bearer auth, rate limiting (20 req/s), 1MB body limit
- Heartbeat scheduler (configurable interval 60–86400s, quiet hours, failure tracking)
- Cron engine (markdown + YAML frontmatter job files in `/data/workspace/jobs/`)
- Telegram bridge (webhook, text/voice/image, Whisper transcription, allowed users)
- Discord bridge (Gateway WebSocket, DMs + @mentions, text/image, allowed users)
- Web terminal proxy (WebSocket PTY, ticket-exchange auth, 30s TTL, scoped to Claude auth)
- Auth status endpoint (`/api/auth-status` — authenticated/not_authenticated/unknown)
- Structured JSON logging to `/data/logs/`
- Graceful shutdown with state persistence
- Health check (`/healthz`, no auth)
- Single binary, cross-compiled for linux/arm64, no CGO
- Dockerfile + docker-compose reference + tenant deployment guide

**Deployment gotchas discovered:**
1. Use `-p` NOT `--bare -p` — bare mode breaks OAuth auth
2. Mount both `~/.claude/` (credentials) AND `~/.claude.json` (config)
3. Container user UID must match credential file owner (UID 1001 on Oracle VM)
4. Set `HOME=/home/engine` explicitly in compose environment (not .env)
5. Fix volume permissions after UID change: `chown -R NEW_UID:NEW_GID /data`
6. Start nginx HTTP-only first, run certbot, then add HTTPS config
7. Test from host via `curl -sk https://PUBLIC_IP/healthz -H "Host: tenant.overnightdesk.com"`

### Phase 4: Claude Code Onboarding

**Goal:** Non-technical users can connect their Claude Code subscription through the dashboard.

**Engine backend: COMPLETE** — Web terminal proxy (`POST /api/terminal/ticket` → WebSocket PTY), auth status endpoint (`GET /api/auth-status`), scoped terminal (not a general shell).

**Remaining work (this repo — frontend only):**
- xterm.js terminal component in Next.js dashboard
- Guided onboarding UI: "Step 1: Click Connect → Step 2: Log in to Anthropic → Step 3: Done"
- Dashboard displays auth status: connected, expired, not configured (polls `/api/auth-status`)
- Re-auth flow if token expires
- Clear messaging: "You're logging into YOUR Claude Code account. We never see your credentials."

**Dependencies:** Phase 5 (provisioning — need a running container to connect to)

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

**Dependencies:** Phase 2 (Stripe), Phase 3 (engine)
**Note:** Provisioning scripts will be built fresh in this repo or a dedicated infra directory. The approach from ironclaw-saas (shell scripts + Docker API) will be reproduced/repurposed.

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

**Engine backend: COMPLETE** — Telegram bridge (webhook, text/voice/image, Whisper, allowed users, `PUT /api/telegram`), Discord bridge (Gateway, DMs + @mentions, text/image, allowed users, `PUT /api/discord`). Bot tokens stored in DB, never exposed in GET responses.

**Remaining work (this repo — frontend only):**
- Telegram setup wizard in dashboard (BotFather instructions, token input, user ID input)
- Discord setup wizard in dashboard (Developer Portal instructions, token input, user ID input)
- Bridge status display (connected/disconnected, last message timestamp)
- Calls engine API: `PUT /api/telegram`, `PUT /api/discord`, `GET /api/telegram`, `GET /api/discord`

**Dependencies:** Phase 5 (provisioning), Phase 6 (dashboard)

### Phase 9: Agent Zero — Hermes Migration

**Goal:** Replace the current overnightdesk-engine Agent Zero (Gary's tenant-0) with a hermes-agent instance. This is the reference implementation for the new platform architecture and validates the Phase.dev + hermes-agent pattern before it rolls out to paying tenants.

**Requirements:**
- Deploy Gary's hermes-agent container on aegis-prod with Phase.dev secrets injection (`phase secrets export --path /agent-zero > /opt/agent-zero/.env`)
- Validate `phase secrets export` → `.env` → hermes-agent startup flow end-to-end
- Migrate Agent Zero capabilities (fleet monitoring, heartbeat, Telegram bridge) to hermes-agent
- Decommission overnightdesk-tenant-0 (Go daemon) once hermes Agent Zero is stable
- Document the validated deploy pattern as the template for all future tenant provisioning

**Reference:** Mitchel's container (`hermes-mitchel`) was manually provisioned and serves as the structural reference. This phase validates the Phase.dev secrets path and formalises the deploy script.

**Dependencies:** Phase.dev `/agent-zero/` path configured, hermes-agent container image available on aegis-prod

---

### Phase 10: Hermes Provisioner

**Goal:** When a user completes signup + payment, automatically provision their hermes-agent instance on aegis-prod using the Phase.dev secrets pattern validated in Phase 9.

**Requirements:**
- Stripe webhook triggers provisioning
- Provisioner service on aegis-prod receives provisioning request from platform
- Creates per-tenant Phase.dev path (`/{tenantId}/`) via Phase API
- Creates Phase service token scoped to that path — stored in platform DB (`instance.phaseServiceToken`)
- Runs: `phase secrets export --path /{tenantId} > /opt/{tenantId}/.env`
- Starts hermes-agent gateway container + dashboard sidecar
- Provisions nginx server block + certbot TLS for `{tenantId}.overnightdesk.com`
- Updates instance status through lifecycle: `queued → provisioning → running`
- Health check polling to confirm container is live
- Deprovision on cancellation: stop containers, preserve `/opt/{tenantId}/` data 30 days
- Fleet event logged at each state transition

**Dependencies:** Phase 9 (validated pattern), Phase 2 (Stripe), Phase.dev API access

---

### Phase 11: Self-Service Setup Wizard

**Goal:** Non-technical users can configure their hermes-agent instance entirely from the OvernightDesk dashboard — no CLI, no server access.

**Requirements:**
- Post-payment wizard flow in the dashboard (replaces Claude Code onboarding)
- Step 1: OpenRouter API key (with link to openrouter.ai, validation call)
- Step 2: Messaging bridge (Telegram bot token + user IDs, or skip)
- Step 3: Agent personality (name, role, timezone — maps to hermes config.yaml)
- Platform writes secrets to Phase.dev via Phase API — never stores them in platform DB
- Platform stores Phase service token for the tenant (encrypted, used by provisioner)
- Secret update flow: user can update any secret from Settings → platform updates Phase.dev + restarts container
- Wizard shows provisioning progress in real time (queued → running)

**Dependencies:** Phase 10 (provisioner), Phase.dev API integration

---

### Phase 12: Web Chat Interface

**Goal:** Customers can chat directly with their hermes-agent instance from the OvernightDesk platform — no Telegram or Discord account required.

**Requirements:**
- `/dashboard/chat` page — hermes tenants only
- "Chat" tab in the hermes nav (alongside Overview and Settings)
- Vercel AI SDK `useChat` hook — streams responses in real time
- Platform `/api/engine/chat` route: validates session + instance, proxies to `https://{tenantId}.overnightdesk.com/v1/chat/completions`
- nginx `/v1/*` location block on `{tenantId}.overnightdesk.com` → hermes gateway `:8642`
- `API_SERVER_KEY` stored in Phase.dev, referenced by platform API route
- Conversation history displayed in the UI (scrollable, timestamped)
- Mobile-responsive layout

**Dependencies:** Phase 10 (provisioner — containers must be running), Phase 11 (secrets wizard — API_SERVER_KEY in Phase)

---

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
├── tenant_id (text, unique — slug, e.g. "aero-fett")
├── status (enum: queued, provisioning, running, stopped, error, deprovisioned)
├── container_id (text — e.g. "hermes-aero-fett")
├── gateway_port (integer, unique — legacy, may be null for subdomain-routed tenants)
├── engine_api_key (text — bearer token for hermes dashboard sidecar API)
├── phase_service_token (text — encrypted, scoped to /{tenantId}/ in Phase.dev)
├── claude_auth_status (enum: not_configured, connected, expired — "connected" for all hermes tenants)
├── subdomain (text, unique — {tenantId}.overnightdesk.com)
├── provisioned_at (timestamp)
├── deprovisioned_at (timestamp)
├── last_health_check (timestamp)
├── consecutive_health_failures (integer, default 0)
├── created_at
└── updated_at

NOTE: claude_auth_status is retained for schema compatibility. All hermes tenants set this
to "connected" at provisioning time — it does not represent Claude Code auth.

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

Applied to every tenant container. Security policies reproduced from prior infrastructure work.

### Non-Negotiable Hardening

```
--read-only                              # Immutable root filesystem
--cap-drop ALL                           # No Linux capabilities
--security-opt no-new-privileges:true    # No privilege escalation
--security-opt seccomp=overnightdesk.json # Custom seccomp profile
--security-opt apparmor=overnightdesk    # AppArmor write restriction
--pids-limit 256                         # Fork bomb protection
--tmpfs /tmp --tmpfs /run                # Ephemeral temp storage
--memory 512m --memory-swap 512m         # Memory cap, no swap
--cpus 0.5                               # CPU quota
```

### Network Isolation

- Two Docker networks: `overnightdesk-infra-net` (infrastructure) + `overnightdesk-tenant-net` (tenants)
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
- ~20–25 tenants on Oracle Cloud free tier (4 OCPU, 24GB RAM, 200GB disk) — hermes-agent uses ~180–250MB RAM idle per tenant vs ~10MB for Go daemon
- Scale-out to Contabo (~$14/mo) at 18 tenants or 80% memory utilization
- hermes-agent idle: ~180–250MB RAM per tenant (Python runtime overhead)
- hermes-agent active: ~350–500MB RAM per tenant during inference
- Dashboard sidecar: ~100–150MB additional per tenant (second Python process)
- NOTE: Capacity is lower than v2 (Go daemon) due to Python memory footprint — offset by eliminating per-tenant Claude Code subscription cost

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
5. ~~**Web terminal security**~~ — RESOLVED: Engine uses ticket-exchange auth (single-use, 30s TTL), spawns only `claude` process in PTY (not a general shell), sanitizes environment (strips BEARER_TOKEN and API keys).
6. **Monitoring push vs pull** — Should Oracle instance push status to NeonDB/Vercel, or should Vercel poll the tenant APIs?
7. **Token expiry** — What happens when a customer's Claude Code OAuth token expires and they're not around to re-auth? Grace period? Notification?

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Tenant** | A single customer's isolated hermes-agent instance (gateway container + dashboard sidecar + Phase.dev secret path) |
| **Engine** | hermes-agent (Nous Research, Python/FastAPI) — OpenAI-compatible API on :8642, dashboard sidecar on :9119 |
| **Platform** | The Vercel frontend + NeonDB + provisioner — everything the customer doesn't run |
| **BYOS** | Bring Your Own Subscription — customer brings their OpenRouter API key, billed by OpenRouter |
| **Agent Zero** | Gary's hermes-agent instance on aegis-prod — fleet monitoring, support, ops. Replaces the v2 Go daemon tenant-0. |
| **Heartbeat** | Periodic prompt execution (e.g., "check git status", "summarize today's emails") |
| **Dashboard** | Customer-facing UI on Vercel — hermes hub with web chat + "Launch Agent Dashboard" button |
| **hermes-agent** | Nous Research open-source agent runtime. Standard tenant engine from v3.0. |
| **Phase.dev** | Secrets management. Per-tenant path `/{tenantId}/`. Secrets injected at container start via `phase secrets export`. |
| **aegis-prod** | Oracle Cloud ARM VM hosting all tenant containers, nginx, Phase CLI, and TLS termination. |
