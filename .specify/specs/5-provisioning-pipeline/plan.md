# Implementation Plan — Feature 5: Provisioning Pipeline

**Branch:** 5-provisioning-pipeline
**Specification:** .specify/specs/5-provisioning-pipeline/spec.md
**Created:** 2026-03-22

---

## Executive Summary

Feature 5 spans two systems: Vercel (orchestration) and Oracle Cloud (execution). On the Vercel side, the existing checkout webhook is extended to create instance records and fire provisioning requests. A callback endpoint receives status updates. On the Oracle Cloud side, an adapted ironclaw-saas provisioner creates hardened containers, configures nginx, and reports back. Shell scripts from ironclaw-saas (lib.sh, container-defaults.sh, provision-tenant.sh, deprovision-tenant.sh) are adapted for the OvernightDesk Go engine.

No schema migrations needed — Feature 1 created all required tables.

---

## Architecture Overview

```
Vercel (Next.js)                          Oracle Cloud
─────────────────                         ────────────

Stripe webhook                            Provisioner (Node.js)
  │                                         │
  ├── handleCheckoutCompleted()             POST /provision
  │   ├── Create subscription (F4)            ├── Create data dir
  │   ├── Generate bearer token               ├── Write .env
  │   ├── Hash token (bcrypt)                 ├── Docker run (hardened)
  │   ├── Create instance (queued)            ├── Health check (TCP)
  │   ├── Log fleet event                     ├── Write nginx conf
  │   └── POST /provision ──────────────────► ├── Reload nginx
  │                                           └── POST /callback ─────────┐
  │                                                                       │
  ├── /api/provisioner/callback ◄─────────────────────────────────────────┘
  │   ├── Update instance status
  │   ├── Log fleet event                   POST /deprovision
  │   └── Send welcome email                  ├── Stop container
  │                                           ├── Remove nginx conf
  ├── handleSubscriptionDeleted()             ├── Reload nginx
  │   └── POST /deprovision ───────────────►  └── Preserve data (30 days)
  │
  └── /api/subscription (F4 existing)
      └── Returns instance status
```

### File Layout

**Vercel side (this repo):**
```
src/
├── lib/
│   ├── provisioner.ts              # Provisioner API client (POST /provision, /deprovision)
│   ├── instance.ts                 # Instance management (create, update status, allocate port)
│   └── __tests__/
│       ├── provisioner.test.ts     # Provisioner client tests
│       └── instance.test.ts        # Instance management tests
├── app/
│   └── api/
│       └── provisioner/
│           └── callback/
│               └── route.ts        # POST: receive provisioner status updates
```

**Oracle Cloud side (new directory in this repo):**
```
provisioner/
├── index.js                        # Express server (adapted from ironclaw-saas)
├── package.json
├── Dockerfile
├── scripts/
│   ├── lib.sh                      # Adapted from ironclaw-saas
│   ├── container-defaults.sh       # Adapted from ironclaw-saas
│   ├── provision-tenant.sh         # Adapted for Go engine
│   ├── deprovision-tenant.sh       # Adapted from ironclaw-saas
│   └── purge-expired.sh           # 30-day data purge (cron)
└── nginx/
    └── templates/
        └── nginx.conf.template     # Adapted for overnightdesk.com
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Provisioner runtime | Node.js (Express) on Oracle Cloud | Reuse ironclaw-saas provisioner/index.js |
| Shell scripts | Bash (lib.sh, container-defaults.sh) | Proven, directly reusable from ironclaw-saas |
| Container engine | Docker | Already on Oracle Cloud, matches engine Dockerfile |
| Reverse proxy | nginx 1.27 | Already on Oracle Cloud, wildcard TLS configured |
| Token generation | crypto.randomBytes(32) | 256-bit entropy, Node.js native |
| Token storage | bcrypt hash | Industry standard, constitutional requirement |
| Communication | HTTPS + shared secret | Simple, secure, no infrastructure overhead |

---

## Implementation Phases

### Phase 1: Instance Management Utilities (Vercel)

**Files:** `src/lib/instance.ts`, `src/lib/provisioner.ts`

1. `generateTenantId(userId)` — first 12 chars of userId (UUID), validated URL-safe
2. `allocatePort()` — atomic port allocation using Drizzle transaction to prevent race conditions; query instance table for used ports, find next in 4000-4999
3. `generateBearerToken()` — crypto.randomBytes(32), return hex string
4. `hashToken(token)` — bcrypt hash
5. `createInstance(userId, plan)` — orchestrates tenant ID, port, token, DB insert
6. `updateInstanceStatus(tenantId, status, details?)` — update + fleet event log
7. `provisionerClient.provision(params)` — POST to Oracle provisioner
8. `provisionerClient.deprovision(tenantId)` — POST to Oracle provisioner

### Phase 2: Webhook Extensions (Vercel)

**Files:** `src/lib/stripe-webhook-handlers.ts` (extend), `src/app/api/provisioner/callback/route.ts`

1. Extend `handleCheckoutCompleted()`:
   - After subscription creation, call `createInstance(userId, plan)`
   - Fire-and-forget: `provisionerClient.provision()`
2. Extend `handleSubscriptionDeleted()`:
   - Find instance for user
   - Call `provisionerClient.deprovision(tenantId)`
   - Update instance status to "stopped"
3. Create callback endpoint:
   - Verify provisioner secret
   - Update instance status based on callback payload
   - On "running": set provisionedAt, send welcome email
   - On "error": log fleet event with error details

### Phase 3: Oracle Cloud Provisioner (separate deployment)

**Files:** `provisioner/` directory

1. Adapt `provisioner/index.js` from ironclaw-saas:
   - Remove BYOK validation (not needed)
   - Change Stripe webhook → accept POST /provision with shared secret auth
   - Add POST /deprovision endpoint
   - Add callback to Vercel on completion
2. Adapt `scripts/provision-tenant.sh`:
   - Remove PostgreSQL schema creation (engine uses SQLite)
   - Remove BYOK encryption steps
   - Change container image to overnightdesk-engine
   - Update mount paths (/data for SQLite + workspace)
   - Pass bearer token hash as env var to container
   - Update resource limits based on plan parameter
3. Adapt `scripts/deprovision-tenant.sh`:
   - Update status field names for OvernightDesk schema
   - Remove PostgreSQL schema cleanup
4. Copy `scripts/lib.sh` and `scripts/container-defaults.sh` with path updates
5. Create `scripts/purge-expired.sh` for 30-day data cleanup cron

### Phase 4: Dashboard Status Display (Vercel)

**Files:** `src/app/(protected)/dashboard/page.tsx`

1. Add instance status display to dashboard:
   - Show provisioning progress (queued → provisioning → awaiting_auth → running)
   - Show error state with message
   - Show subdomain URL when running
2. Poll `/api/subscription` endpoint (already returns instance data via join)

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Provisioner API authentication | Shared secret (PROVISIONER_SECRET) in Authorization header |
| Bearer token generation | crypto.randomBytes(32) — 256 bits of entropy |
| Token storage | bcrypt hash in database, plaintext only in welcome email |
| Container hardening | All ironclaw-saas security flags applied (read-only rootfs, cap-drop ALL, seccomp, AppArmor, pids-limit, memory/CPU caps) |
| Network isolation | Tenant containers on isolated Docker network, inter-tenant traffic blocked |
| Callback authentication | Same shared secret validates Oracle → Vercel callbacks |
| Data purge | Automated cron, 30-day retention, permanent deletion |

---

## Testing Strategy

### Unit Tests (Vercel)
- `instance.test.ts`: generateTenantId(), allocatePort(), generateBearerToken(), hashToken(), createInstance()
- `provisioner.test.ts`: provisioner client with mocked HTTP (success, failure, timeout)
- Webhook extension tests: handleCheckoutCompleted() triggers provisioning, handleSubscriptionDeleted() triggers deprovisioning
- Callback route tests: valid callback, invalid secret, status updates

### Integration Tests
- Callback endpoint with mocked DB: verify instance status updates and fleet event logging
- End-to-end provisioning flow with mocked provisioner: checkout → instance creation → callback → welcome email

### Oracle Cloud Provisioner Tests
- Shell script tests (provision-tenant.sh with DRY_RUN=true)
- Health check timeout handling
- Nginx config generation verification

---

## Deployment Strategy

### Vercel (this repo)
- Add `PROVISIONER_URL` and `PROVISIONER_SECRET` to Vercel env vars
- Deploy as part of normal Next.js deployment

### Oracle Cloud
1. Copy `provisioner/` directory to Oracle VM
2. Build and run provisioner container (or run directly with Node.js)
3. Configure nginx to proxy provisioner API (e.g., `api.overnightdesk.com/provision`)
4. Add cron job for `purge-expired.sh` (daily at 3am)
5. Pull overnightdesk-engine Docker image
6. Verify wildcard TLS cert covers `*.overnightdesk.com`

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Oracle VM unreachable from Vercel | Low | High | Instance stays "queued", owner notified, manual retry possible |
| Provisioning script fails mid-way | Medium | High | Cleanup partial artifacts, set status "error", log details |
| Port exhaustion (40 max) | Low | Medium | Alert owner at 35 tenants, documented scale-out path to Contabo |
| Wildcard cert missing | Low | High | Verify cert before enabling provisioning, certbot auto-renewal |
| Container image pull fails | Low | Medium | Pre-pull image on VM, fallback to cached version |
| Bearer token in email intercepted | Low | Medium | Token rotatable from dashboard, email over TLS |

---

## Constitutional Compliance

- [x] **Principle 1 (Data Sacred):** Per-tenant isolated containers, platform never accesses tenant data
- [x] **Principle 2 (Security):** Full container hardening, token hashing, shared secret auth
- [x] **Principle 4 (Simple):** Reuse ironclaw-saas scripts, HTTPS + shared secret communication
- [x] **Principle 7 (Owner's Time):** Fully automated provisioning and deprovisioning
- [x] **Principle 8 (Platform Quality):** Real-time status display, no hanging spinners
- [x] **Pillar C (Provisioning):** Follows prescribed state machine exactly
- [x] **Test-First Imperative:** TDD for all Vercel-side code
- [x] **No exceptions or deviations**
