# Constitution

> **v2.0.0 (2026-04-24) — Engine pivot.** Tenant engine replaced: overnightdesk-engine (Go + Claude Code CLI) → hermes-agent (Nous Research, Python/FastAPI). Model routing: Claude Code BYOS → OpenRouter. Secrets: platform DB → Phase.dev per-tenant paths, injected via `phase run`. Added secrets-management principle under Security. Reference tenant: aero-fett (Mitchel).

## OvernightDesk Platform — Operating Principles

**Version:** 2.0.0
**Owner:** Gary Brown / LittleTownLabs
**Ratified:** 2026-03-21
**Last Amended:** 2026-04-24

**Platform Lineage:** Inherits from [Little Town Labs Platform Constitution v1.0.0](/mnt/f/ltl-ops/.specify/memory/constitution.md). This document specializes the platform principles for the OvernightDesk Vercel frontend. Where this document is silent, the platform constitution applies.

**Tenant Engine:** Tenants run [hermes-agent](https://github.com/NousResearch/hermes-agent) (Nous Research, Python/FastAPI) as the standard engine image. The custom Go daemon (overnightdesk-engine) is deprecated as of v2.0.0. This document governs the Next.js platform frontend, billing, provisioning orchestration, and the hermes-agent container contract.

---

# Part I: Principles

These principles are shared across the OvernightDesk system. They apply to every component — the engine, the frontend, and the infrastructure.

---

## Principle 1: The Customer's Data is Sacred

**No exceptions.**

- Each tenant runs in a physically isolated Docker container. The frontend never accesses tenant container filesystems, databases, or agent sessions directly.
- The frontend communicates with tenant instances only through the hermes-agent authenticated REST API — never via direct container access.
- Customer model-provider credentials (OpenRouter API keys, messaging tokens) are never stored in plaintext by the platform. They live in Phase.dev under `/{tenantId}/` and are injected into the hermes-agent container at start time via `phase run`. The platform database stores only Phase bootstrap credentials, never the downstream secrets themselves.
- We do not log, analyze, or store tenant conversations on the platform side. The platform database stores only operational metadata (status, billing, events).
- If a customer asks what data we hold, the dashboard shows them completely and honestly.
- After subscription cancellation, platform records are retained for billing compliance (90 days). Tenant container data is preserved 30 days, then permanently purged.

This is the core of what we sell. Violating it once — even accidentally — ends the business.

---

## Principle 2: Security is a Feature, Not a Checkbox

The frontend is the public attack surface. Every route, endpoint, and form is a potential entry point.

**Authentication & authorization:**
- All dashboard routes MUST be protected by authenticated session (Better Auth)
- All API routes MUST verify session or webhook signature — no unprotected mutations
- Stripe webhooks MUST verify signature before processing any event
- Provisioning actions MUST verify active subscription status before execution
- Bearer tokens for tenant API communication MUST be stored hashed (bcrypt), never plaintext

**Secrets management:**
- Tenant secrets (OpenRouter API keys, messaging bridge tokens, gateway credentials) MUST NOT be stored in the platform database in plaintext or reversible encryption.
- All tenant secrets MUST live in Phase.dev under the per-tenant path `/{tenantId}/`.
- Secrets MUST be injected into the hermes-agent container at start via `phase run` — never baked into images, never passed as plaintext Docker env vars sourced from the platform DB.
- The platform DB MAY store Phase.dev bootstrap credentials (service tokens scoped to the tenant path) but MUST treat them as sensitive credentials (encrypted at rest, never logged).
- Secret rotation MUST be possible without platform redeploys — updating a secret in Phase.dev and restarting the container is the only supported rotation flow.

**Input validation:**
- All user input MUST be validated with Zod schemas before processing
- All database queries MUST use parameterized queries via Drizzle ORM — no raw string interpolation
- API responses MUST NOT leak internal error details, stack traces, or infrastructure information

**Frontend security:**
- CSRF protection on all forms
- Rate limiting on auth endpoints (login, register, password reset)
- Secure cookie configuration (httpOnly, secure, sameSite)
- No sensitive data in client-side state or localStorage

---

## Principle 3: The Ops Agent Acts; The Owner Decides

The platform frontend does not make autonomous decisions. It is a UI and API layer that:

- Presents information to the customer
- Accepts customer input and validates it
- Triggers provisioning workflows on customer or webhook events
- Displays status from the engine and infrastructure

The provisioner service (Phase 5) will act on Stripe webhook events, but only for well-defined state transitions:
- `checkout.session.completed` → queue provisioning
- `invoice.payment_failed` → mark past_due, notify customer
- `customer.subscription.deleted` → schedule deprovisioning

Any novel situation or ambiguous state MUST log a fleet event and notify the owner, not attempt recovery.

---

## Principle 4: Simple Over Clever

This is a Next.js App Router project. The stack is deliberately narrow:

| Concern | Choice | Constraint |
|---------|--------|------------|
| Framework | Next.js 15 (App Router) | Server components by default, client components only when interactive |
| Styling | Tailwind CSS 4 | No CSS-in-JS, no component libraries (unless explicitly approved) |
| Database | Neon Postgres | Serverless driver, connection pooling via @neondatabase/serverless |
| ORM | Drizzle ORM | Type-safe queries, SQL-like syntax, migration-based schema changes |
| Auth | Better Auth | Session-based, cookie auth, server-side verification |
| Payments | Stripe | Checkout redirect flow, Customer Portal for self-service |
| Email | Resend | Transactional only, no marketing automation |
| Validation | Zod | Shared schemas between frontend and API routes |
| Hosting | Vercel | Edge-optimized, serverless functions |
| Tenant engine | hermes-agent (`nousresearch/hermes-agent:latest`) | Python/FastAPI; OpenAI-compatible API on :8642, dashboard sidecar on :9119 |
| Model routing | OpenRouter | All tenant model calls; keys managed via Phase.dev — replaces Claude Code BYOS |
| Secrets | Phase.dev | Per-tenant path `/{tenantId}/`, injected via `phase run` at container start |
| Chat UI | Vercel AI SDK (`/dashboard/chat`) | Talks to hermes OpenAI-compatible endpoint on tenant container port 8642 |
| Messaging bridge | hermes gateway | Telegram, Discord, etc. — runs inside the tenant container |
| Routing/TLS | nginx on aegis-prod | `{tenantId}.overnightdesk.com` → tenant container |

**What we do NOT use:**
- No state management libraries (React state + server components are sufficient)
- No GraphQL (REST via engine API, server actions for platform operations)
- No real-time frameworks (polling is acceptable for dashboard status at current scale)
- No microservice decomposition on the frontend — it is one Next.js app
- No ORMs besides Drizzle — no Prisma, no raw pg queries

**Files under 800 lines, functions under 50 lines.** When something breaks, it should be debuggable by reading the server log and the component tree.

---

## Principle 5: The Business Pays for Itself Before It Grows

Vercel free tier is the right choice for phase one. Upgrade to Vercel Pro happens when:
- Free tier limits are hit (100GB bandwidth, 100 hours serverless)
- Custom domain SSL or team features are needed
- Revenue from paying customers justifies the cost

Neon free tier is sufficient until:
- 512MB storage is exceeded
- Connection pooling limits are hit
- Branching for staging environments is needed

No paid services are added until customer revenue covers them. The upgrade path is:
1. Free tier (current) — $0/mo
2. Vercel Pro + Neon Launch — ~$25/mo (at ~10 paying customers)
3. Vercel Pro + Neon Scale — ~$45/mo (at ~25 paying customers)

Every new feature must either retain existing customers or acquire new ones.

---

## Principle 6: Honesty with Customers

- The pricing page shows exactly what customers get and what they need to bring (their own OpenRouter API key — we never store it in plaintext)
- We clearly communicate: "Your API key lives in Phase.dev under your tenant's isolated path. We never see it in plaintext, and it's injected into your container only at runtime."
- Error states are shown honestly in the dashboard — no fake "everything is fine" when a container is unhealthy
- If provisioning fails, the customer sees the real status, not a spinner that runs forever
- Billing is transparent — Stripe Customer Portal for self-service, no hidden fees

---

## Principle 7: The Owner's Time is Protected

The frontend should minimize manual operations:

- Stripe webhooks handle billing lifecycle automatically
- Provisioning is triggered by payment events, not manual action
- Customer self-service (password reset, plan changes, bridge setup) reduces support load
- Fleet events and audit logs provide the owner with context without requiring investigation

If Gary is manually provisioning containers or resetting passwords, something is wrong.

---

## Principle 8: Platform Quality Drives Retention

The platform frontend is the only part of OvernightDesk that customers interact with directly. The engine runs silently inside containers — customers never see it. What they see is the dashboard, the onboarding flow, the billing experience, and the status indicators.

If the dashboard feels broken, slow, or confusing, the customer assumes the whole product is broken — even if their Claude Code instance is running perfectly inside its container.

**Rules:**
- Every user-facing flow MUST have clear loading states, error states, and success confirmations
- Status indicators MUST reflect real-time truth — no stale caches masking container failures
- Onboarding MUST guide non-technical users step-by-step — no assumed knowledge of Docker, CLI, or OAuth
- Error messages MUST tell the customer what happened and what to do next — no raw error codes
- The dashboard MUST work reliably on mobile (responsive) — solo operators check status from their phone
- Billing flows MUST be friction-free — Stripe Checkout and Customer Portal handle the complexity

**Rationale:**
Customers are paying for peace of mind. They need to trust that their AI assistant is running overnight without them. That trust is built through a platform that feels solid, communicates clearly, and never leaves them wondering what's happening. Platform quality is not polish — it is the product.

---

# Part II: Implementation Pillars

---

## Pillar A: Data Access Patterns

**Enforces:** Data Sacred, Security

- All database access MUST go through Drizzle ORM — no raw SQL, no direct pg queries
- Schema changes MUST be migration-based (`drizzle-kit generate` → `drizzle-kit migrate`)
- The platform database stores only: users, subscriptions, instances, fleet events, usage metrics, audit log, waitlist
- Tenant data (conversations, memory, jobs) lives in per-tenant SQLite inside containers — the platform never queries it directly
- Read operations from tenant instances go through the engine REST API

---

## Pillar B: API Route Security

**Enforces:** Security, Least Privilege

- Every API route (`app/api/`) MUST check authentication as its first operation
- Exception: webhook endpoints verify signatures instead of sessions
- Exception: public endpoints (waitlist, health) are explicitly documented as public
- API routes MUST return consistent response shapes: `{ success, data?, error?, meta? }`
- Error responses MUST use appropriate HTTP status codes — no 200s for errors
- All mutations MUST be idempotent where possible (especially webhook handlers)

---

## Pillar C: Provisioning Orchestration

**Enforces:** Data Sacred, Availability, Owner's Time

The frontend orchestrates provisioning but does not execute it directly:

1. Stripe webhook confirms payment → platform creates `instances` row (status: `queued`)
2. Platform sends provisioning request to Oracle Cloud server (provisioner service)
3. Provisioner creates container, configures nginx, reports back
4. Platform updates instance status through the lifecycle: `queued → provisioning → awaiting_auth → running`
5. Failures are logged as fleet events and the owner is notified

**Rules:**
- Provisioning state transitions MUST be logged in `fleet_events`
- Webhook handlers MUST be idempotent (Stripe may deliver events multiple times)
- Container image MUST be `nousresearch/hermes-agent:latest` (pinned per release); custom engine images are prohibited
- Container start MUST use `phase run` so secrets are resolved from Phase.dev at runtime — never passed as plaintext env vars sourced from the platform DB
- Container creation MUST apply the platform container security baseline (seccomp, AppArmor, cap-drop ALL plus explicit adds; read-only rootfs where compatible with hermes-agent)
- Deprovisioning MUST NOT delete data immediately — 30-day retention before purge

---

## Pillar D: Frontend Performance

**Enforces:** Simple Over Clever, Business Pays for Itself

- Landing page LCP MUST be < 2s
- Dashboard TTFB MUST be < 1s on Vercel edge
- Server components by default — client components only for interactive elements (forms, terminals, real-time status)
- No client-side data fetching libraries (SWR, React Query) unless polling requires it — server components fetch at render time
- Images optimized via next/image
- Bundle size monitored — no heavy client-side dependencies without justification

---

# Part III: Operational Constraints

---

## Stripe Integration Rules

- All Stripe operations MUST use the official `stripe` Node.js SDK
- Webhook endpoint MUST verify `stripe-signature` header before processing
- Subscription status MUST be the Stripe-reported status — never override locally
- Price IDs and product IDs MUST come from environment variables, never hardcoded
- Test mode (`STRIPE_SECRET_KEY` starting with `sk_test_`) MUST be used in development
- Stripe Customer Portal MUST be used for plan changes and payment method updates — no custom billing UI

---

## Email Rules

- Transactional emails only — no marketing, no newsletters, no promotional content
- Every email MUST have a clear purpose: verification, notification, or action required
- Email templates MUST NOT contain customer conversation data or tenant-specific AI output
- Unsubscribe link required on all non-essential emails (CAN-SPAM compliance)

---

## Test-First Imperative

**Rules:**
- No implementation code SHALL be written before tests exist
- Tests MUST be confirmed to FAIL before writing implementation code (RED)
- Implementation MUST be minimal to pass tests (GREEN)
- Refactoring follows only after tests pass (IMPROVE)
- Minimum 80% code coverage required for all features
- API route tests MUST test authentication, validation, happy path, and error cases
- Stripe webhook tests MUST use Stripe's test fixtures and signature verification
- E2E tests (Playwright) required for critical user flows: signup, payment, dashboard access

**Exceptions:**
- Exploratory spike code (must be discarded, not merged)
- Tailwind styling changes (visual, not logic)

---

# Part IV: Governance

---

## Amendment Process

1. Propose amendment with rationale
2. Assess impact on existing specifications and implementations
3. Owner approves or rejects
4. Update version number:
   - **MAJOR**: Changes to principles (Part I)
   - **MINOR**: Changes to pillars or operational constraints (Parts II-III)
   - **PATCH**: Clarifications and corrections
5. Update "Last Amended" date
6. Propagate changes to sibling constitutions if the amendment affects shared principles

---

## Cross-Repository Consistency

The OvernightDesk system has three constitutions:
1. **ltl-ops** (platform) — foundational principles inherited by all LTL projects
2. **overnightdesk-engine** — DEPRECATED as of v2.0.0. Go daemon retained for historical reference; tenant engine is now hermes-agent (upstream: Nous Research)
3. **overnightdesk** (this repo) — Next.js frontend, billing, provisioning orchestration, hermes-agent container contract

Shared principles (Data Sacred, Security, Honesty, Simple Over Clever, Owner's Time, Test-First) MUST remain consistent across all three. If one repo amends a shared principle, the others MUST be reviewed and updated.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Tenant** | A single customer's isolated instance (hermes-agent container + Phase.dev secret path + OpenRouter routing) |
| **Engine** | hermes-agent (Nous Research, Python/FastAPI) running inside the tenant container. Exposes an OpenAI-compatible API on :8642 and a dashboard sidecar on :9119. Replaces the deprecated Go daemon. |
| **Platform** | The Vercel frontend + NeonDB + provisioner — everything the customer doesn't run |
| **BYOS** | Bring Your Own Subscription — customer brings their OpenRouter API key (stored in Phase.dev), billed by OpenRouter |
| **Agent Zero** | Platform ops agent (Gary's tenant-0) that monitors the fleet, handles support |
| **Fleet Event** | A logged operational event (provisioned, started, stopped, health_check, error, restart) |
| **Dashboard** | Customer-facing UI on Vercel showing instance status, chat interface, and management controls |
| **Provisioner** | Service on aegis-prod that creates/destroys hermes-agent tenant containers on webhook events |
| **Phase.dev** | Secrets management service. Each tenant has an isolated path `/{tenantId}/`. Secrets injected into containers at runtime via `phase run`. |
| **hermes-agent** | Nous Research open-source agent runtime. Standard tenant engine from v2.0.0. |
| **aegis-prod** | Oracle Cloud VM hosting all tenant containers, nginx, and TLS termination for `*.overnightdesk.com`. |

---

## Amendment History

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-03-21 | Initial constitution. Derived from overnightdesk-engine v2.0 and ltl-ops platform v1.0.0. Specialized for Next.js frontend, Stripe billing, and provisioning orchestration. |
| 2.0.0 | 2026-04-24 | MAJOR: Tenant engine replaced. overnightdesk-engine (Go daemon wrapping Claude Code CLI) deprecated in favour of hermes-agent (Nous Research, Python/FastAPI). Model routing moved from Claude Code BYOS to OpenRouter. Added Phase.dev secrets-management principle under Principle 2. Updated Principle 1 (credentials), Principle 6 (honesty), Pillar C (image + `phase run` rules), stack table, cross-repo references, and glossary. Reference implementation: aero-fett (Mitchel). |
