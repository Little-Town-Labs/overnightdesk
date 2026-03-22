# Feature 5: Provisioning Pipeline

**Branch:** 5-provisioning-pipeline
**Status:** Draft
**Created:** 2026-03-22
**Dependencies:** Feature 4 (Stripe Payments) — complete

---

## Overview

When a user completes payment, their isolated AI assistant instance is automatically provisioned on the Oracle Cloud server. The pipeline handles the full lifecycle: creating a hardened container, configuring networking and subdomain routing, generating authentication credentials, tracking provisioning status, and cleaning up on cancellation. The customer sees real-time status updates through their dashboard.

**Business Value:** This is the core product delivery mechanism. Without provisioning, paying customers cannot get their AI assistant. The pipeline must be reliable, secure, and fully automated to protect the owner's time.

**Prior Art:** The ironclaw-saas project (`/mnt/f/ironclaw-saas/`) contains a complete provisioning system with container hardening, nginx configuration, encryption, health checks, and deprovisioning. Key scripts and patterns can be adapted for OvernightDesk.

---

## User Stories

### User Story 1: Automatic Instance Provisioning After Payment

**As a** newly subscribed user
**I want** my AI assistant instance to be automatically created after I pay
**So that** I don't have to wait for manual setup or contact support

**Acceptance Criteria:**
- [ ] After successful checkout, the system queues provisioning automatically
- [ ] The user's instance record is created with status "queued"
- [ ] Provisioning begins within 30 seconds of payment confirmation
- [ ] The user receives a welcome email when provisioning completes
- [ ] No manual intervention is required from the platform owner

**Priority:** High

---

### User Story 2: Track Provisioning Status

**As a** user whose instance is being provisioned
**I want** to see the current status of my instance setup
**So that** I know what's happening and when I can start using it

**Acceptance Criteria:**
- [ ] The dashboard displays the current provisioning status
- [ ] Status progresses through defined stages: queued → provisioning → awaiting_auth → running
- [ ] If provisioning fails, the user sees an error state with a clear message
- [ ] The status updates without requiring a full page refresh
- [ ] The user is not left with a spinner that runs indefinitely — there is always a status or timeout message

**Priority:** High

---

### User Story 3: Isolated Container with Security Hardening

**As the** platform
**I want** each tenant container to be fully isolated and security-hardened
**So that** no tenant can access another tenant's data or escape their container

**Acceptance Criteria:**
- [ ] Each tenant runs in a separate container with a read-only root filesystem
- [ ] All Linux capabilities are dropped
- [ ] Privilege escalation is prevented
- [ ] Process count is limited (fork bomb protection)
- [ ] Memory and CPU are capped per plan (Starter: 256MB/0.25 CPU, Pro: 512MB/0.5 CPU)
- [ ] Temporary storage uses ephemeral mounts
- [ ] Inter-tenant network traffic is blocked
- [ ] Only necessary outbound traffic is allowed (AI provider API on port 443)

**Priority:** High

---

### User Story 4: Per-Tenant Subdomain Routing

**As a** provisioned user
**I want** my instance accessible at a unique subdomain
**So that** I can access my dashboard and API through a dedicated URL

**Acceptance Criteria:**
- [ ] Each tenant gets a subdomain: `{tenant}.overnightdesk.com`
- [ ] The subdomain routes to the tenant's container through a reverse proxy
- [ ] TLS is enabled on the subdomain (HTTPS only)
- [ ] WebSocket connections are supported (for web terminal)
- [ ] The subdomain is active within 60 seconds of provisioning completion

**Priority:** High

---

### User Story 5: Bearer Token Generation

**As a** newly provisioned user
**I want** to receive a secure authentication token for my instance
**So that** I can access my instance's dashboard and API

**Acceptance Criteria:**
- [ ] A cryptographically random bearer token is generated at provisioning time
- [ ] The token is stored hashed in the platform database (never plaintext)
- [ ] The plaintext token is sent to the user in the welcome email (one-time delivery)
- [ ] The token authenticates all API calls to the tenant's engine
- [ ] The user can rotate the token from the dashboard (once authenticated)

**Priority:** High

---

### User Story 6: Deprovisioning on Cancellation

**As the** platform
**I want** to automatically deprovision instances when subscriptions are canceled
**So that** infrastructure resources are reclaimed and data retention policies are enforced

**Acceptance Criteria:**
- [ ] When a subscription is canceled, deprovisioning is scheduled (not immediate — end of billing period)
- [ ] Deprovisioning stops the container and removes the reverse proxy configuration
- [ ] Tenant data is preserved for 30 days after deprovisioning
- [ ] After 30 days, tenant data is permanently purged
- [ ] The instance status is updated to "deprovisioned" in the database
- [ ] A fleet event is logged for every deprovisioning action
- [ ] The platform owner is notified of deprovisioning events

**Priority:** High

---

### User Story 7: Provisioning Failure Recovery

**As the** platform
**I want** provisioning failures to be detected, logged, and reported
**So that** problems are visible and can be resolved quickly

**Acceptance Criteria:**
- [ ] If any provisioning step fails, the instance status is set to "error"
- [ ] The failure is logged as a fleet event with details about which step failed
- [ ] The platform owner is notified of the failure (via existing notification channels)
- [ ] Partial provisioning artifacts are cleaned up (container, config files)
- [ ] The user sees a helpful error message, not a hanging spinner
- [ ] The owner can manually retry provisioning after fixing the issue

**Priority:** High

---

## Functional Requirements

**FR-1:** The system MUST automatically trigger provisioning when a `checkout.session.completed` webhook event is processed (extending Feature 4's webhook handler).

**FR-2:** The system MUST create an instance record in the database with status "queued" before starting provisioning.

**FR-3:** The system MUST send a provisioning request to the Oracle Cloud server to create the tenant container.

**FR-4:** The provisioning request MUST include: tenant ID, container resource limits (based on plan), and configuration parameters.

**FR-5:** The provisioner MUST apply all security hardening to the container: read-only rootfs, cap-drop ALL, no-new-privileges, process limits, memory/CPU caps, tmpfs mounts.

**FR-6:** The provisioner MUST generate a per-tenant reverse proxy configuration and reload the proxy server.

**FR-7:** The system MUST generate a cryptographically random bearer token, store its hash in the database, and include the plaintext in the welcome email.

**FR-8:** The system MUST track instance status through the lifecycle: queued → provisioning → running → stopped → deprovisioned. (Note: "awaiting_auth" is a separate concern tracked via the `claudeAuthStatus` column, owned by Feature 6: Claude Code Onboarding.)

**FR-9:** Every status transition MUST be logged as a fleet event in the database.

**FR-10:** The system MUST verify that the container is healthy (via health check) before marking the instance as ready.

**FR-11:** The system MUST send a welcome email (using Feature 3 infrastructure) with the subdomain URL and bearer token when provisioning completes.

**FR-12:** The system MUST schedule deprovisioning when a subscription is canceled, effective at the end of the billing period.

**FR-13:** Deprovisioning MUST stop the container, remove the proxy configuration, and update the instance status to "deprovisioned."

**FR-14:** Tenant data MUST be preserved for 30 days after deprovisioning, then permanently purged.

**FR-15:** The system MUST derive the tenant ID from the user's identity (email slug or user ID), ensuring it is unique and URL-safe.

**FR-16:** The system MUST allocate a unique gateway port per tenant from a defined port range.

---

## Non-Functional Requirements

**NFR-1 (Performance):** Provisioning MUST complete within 120 seconds from queue to running (excluding auth).

**NFR-2 (Security):** Container security hardening MUST match the standards defined in the constitution (seccomp, AppArmor, read-only rootfs, cap-drop ALL).

**NFR-3 (Security):** Bearer tokens MUST be generated with at least 256 bits of entropy.

**NFR-4 (Security):** Bearer tokens MUST be stored hashed (bcrypt or equivalent), never in plaintext.

**NFR-5 (Reliability):** If provisioning fails, the system MUST NOT leave orphaned containers or incomplete configurations.

**NFR-6 (Reliability):** Provisioning MUST be idempotent — triggering provisioning for an already-provisioned user MUST NOT create duplicate containers.

**NFR-7 (Observability):** All provisioning steps, including failures, MUST be logged as fleet events with structured details.

**NFR-8 (Capacity):** The system MUST support up to 40 concurrent tenant containers on the Oracle Cloud free tier.

**NFR-9 (Data Retention):** Deprovisioned tenant data MUST be retained for exactly 30 days before purge. Platform billing records MUST be retained for 90 days.

---

## Edge Cases & Error Handling

### Provisioning Edge Cases
- **Duplicate provisioning request:** If checkout webhook fires twice, only one container should be created (idempotency via instance record check).
- **Oracle Cloud server unreachable:** Mark instance as "error", log fleet event, notify owner. Do not retry automatically (owner investigates).
- **Port exhaustion:** If no ports available in range, mark instance as "error" and notify owner.
- **Tenant ID collision:** Derive tenant ID deterministically from user ID; since user IDs are unique, collisions are impossible.
- **Container fails health check:** Mark instance as "error" after timeout (60 seconds of retries). Clean up container. Log details.
- **Provisioning timeout (>120 seconds):** Mark instance as "error", clean up partial artifacts.

### Deprovisioning Edge Cases
- **User resubscribes before deprovisioning executes:** Cancel the pending deprovisioning if the subscription becomes active again.
- **Container already stopped:** Deprovisioning should be idempotent — skip container stop if not running.
- **Data purge fails:** Log the failure, retry on next purge cycle. Do not leave orphaned data indefinitely.
- **30-day retention period:** A scheduled task checks for instances past the retention period and purges data.

### Security Edge Cases
- **Container escape attempt:** Seccomp profile blocks dangerous syscalls. AppArmor restricts file writes. Read-only rootfs prevents persistence.
- **Resource exhaustion attack:** Memory cap (256MB/512MB) and CPU cap (0.25/0.5) prevent impact on other tenants. Process limit (256) prevents fork bombs.
- **Network lateral movement:** Inter-tenant traffic blocked by network isolation. Egress restricted to port 443.

---

## Resolved Clarifications

### Provisioner Architecture — RESOLVED: Shell Scripts on Oracle Cloud
A lightweight HTTP endpoint on Oracle Cloud receives provisioning requests from Vercel and executes shell scripts. This reuses the proven ironclaw-saas shell scripts (provision-tenant.sh, deprovision-tenant.sh, lib.sh, container-defaults.sh) with minimal adaptation. Docker socket access stays on the host only.

### Communication Protocol — RESOLVED: HTTPS API with Shared Secret
Vercel sends HTTPS POST requests to the Oracle Cloud provisioner, authenticated with a shared bearer token. Simple, secure, no key management or queue infrastructure needed.

### Data Purge Mechanism — RESOLVED: Host-Level Cron on Oracle Cloud
A daily cron job on Oracle Cloud checks for deprovisioned instances past the 30-day retention window and purges their data directories. Runs independently of Vercel.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Provisioning success rate | > 95% |
| Time from payment to running instance | < 120 seconds |
| Time from payment to welcome email | < 5 minutes |
| Deprovisioning success rate | 100% |
| Container security hardening compliance | 100% (all flags applied) |
| Orphaned container rate | 0% |

---

## Reusable Code from ironclaw-saas

The following files from `/mnt/f/ironclaw-saas/` can be adapted:

| ironclaw-saas File | Purpose | Reuse Strategy |
|-------------------|---------|---------------|
| `scripts/provision-tenant.sh` | Main provisioning orchestrator | Adapt: change IronClaw binary to Go daemon, update mounts |
| `scripts/deprovision-tenant.sh` | Deprovisioning | Adapt: update status column names, remove schema cleanup |
| `scripts/lib.sh` | Logging, nginx reload, health checks, validation | Reuse directly with minor path changes |
| `scripts/container-defaults.sh` | Security flags, mount config, health checks | Reuse directly |
| `nginx/templates/nginx.conf.template` | Base nginx config | Adapt: change domain to overnightdesk.com |
| `scripts/encrypt-key.sh` / `decrypt-key.sh` | Key encryption | Not needed (OvernightDesk uses OAuth, not BYOK) |
| `provisioner/lib/slugify.js` | Tenant ID generation | Adapt to TypeScript or use similar logic |

**Key Differences from ironclaw-saas:**
- No BYOK key encryption (OvernightDesk uses Claude Code OAuth)
- No per-tenant Postgres schema (OvernightDesk uses per-tenant SQLite inside containers)
- Different container binary (Go daemon instead of IronClaw Rust binary)
- Bearer token instead of BYOK key in welcome email
- Vercel triggers provisioning (not a co-located provisioner)

---

## Out of Scope

- Auto-scaling beyond Oracle Cloud free tier (manual scale-out to Contabo documented in PRD)
- Custom domains for tenant instances
- Container restart logic (Feature 7: Customer Dashboard)
- Web terminal / Claude Code onboarding (Feature 6)
- Fleet monitoring / Agent Zero (Feature 9)
- Multiple instances per user
