# Implementation Plan: Hermes Provisioner

**Spec version:** 1.0.0 | **Constitution:** v2.0.0 | **Feature:** 2 (P0)
**Created:** 2026-04-24

---

## Executive Summary

The Hermes Provisioner automates what was done manually for Agent Zero (Feature 1). When a Stripe payment is confirmed, the platform triggers the `platform-orchestrator` service — which already exists on aegis-prod and has Docker socket proxy access. The orchestrator provisions the hermes-agent container, creates the Phase.dev secrets path, configures nginx, issues a TLS cert, and calls back to the platform when complete.

**The provisioner client pattern already exists** (`src/lib/provisioner.ts`). The callback route already exists (`/api/provisioner/callback`). The main work is:
1. Extend `platform-orchestrator` with hermes-specific provisioning logic
2. Update `ProvisionParams` and the schema for hermes (remove Go daemon fields, add Phase.dev fields)
3. Wire Stripe webhook events to the provisioner client

---

## Architecture Decisions

### AD-1: Provisioner lives in `platform-orchestrator` (not a new service)

**Decision:** Extend the existing `platform-orchestrator` Go service with hermes provisioning endpoints. It already has Docker socket proxy access (`DOCKER_HOST`), runs on aegis-prod, and has the `/provision`, `/restart`, `/deprovision` endpoint contract the platform client already calls.

- **Rationale:** Zero new infrastructure. The client (`src/lib/provisioner.ts`) and callback route already exist and target this service. Pattern already validated.
- **Alternative rejected:** New Python/Node provisioner service — adds a new technology dependency with no benefit.

### AD-2: Phase.dev service token managed by platform-orchestrator, stored in platform DB

**Decision:** The orchestrator creates the Phase.dev `/{tenantId}/` path and a scoped service token, then returns the service token to the platform via the callback. The platform stores it encrypted in `instance.phaseServiceToken`.

- **Rationale:** The orchestrator runs on aegis-prod where the Phase CLI is already installed. The platform DB is the source of truth for instance records. Separation of concerns: orchestrator creates credentials, platform stores them.
- **Security:** Service token is encrypted at rest in the platform DB. The orchestrator uses the existing app-level Phase service token (already used for Agent Zero) to create per-tenant scoped tokens via Phase API.

### AD-3: `ProvisionParams` updated for hermes — gatewayPort and dashboardTokenHash removed

**Decision:** The existing `ProvisionParams` has `gatewayPort` (no longer needed — hermes uses subdomain routing) and `dashboardTokenHash` (Go daemon specific). Replace with hermes-relevant fields.

**New `ProvisionParams`:**
```typescript
interface ProvisionParams {
  tenantId: string;
  subdomain: string;           // e.g. "aero-fett.overnightdesk.com"
  plan: "starter" | "pro";
  callbackUrl: string;
}
```

The orchestrator derives all other values (Phase path, data dir, container name) from `tenantId` by convention.

### AD-4: Nginx config generated from template, not from a config file per tenant

**Decision:** The orchestrator generates the nginx server block from a template (identical to `infra/nginx/aero-fett.conf`, substituting container name and subdomain). Written to `/opt/overnightdesk/nginx/conf.d/{tenantId}.conf`.

- **Rationale:** Consistent with the established pattern. Template is simple — only two variables change (subdomain, container name).

### AD-5: Idempotency via tenantId — safe to re-run

**Decision:** Every provisioning step is idempotent on `tenantId`. Re-running provision for an existing tenant is safe: Phase path creation is a no-op if path exists, container `--rm` + re-create, nginx conf overwrite + reload, certbot skips if cert exists.

- **Rationale:** Stripe may deliver `checkout.session.completed` multiple times. The provisioner must not corrupt state on duplicate delivery (NFR-1).

---

## Data Model Changes

### New column: `instance.phaseServiceToken`

```sql
ALTER TABLE instance ADD COLUMN phase_service_token text;
```

Stores the Phase.dev service token scoped to `/{tenantId}/`. Treated as sensitive — never returned in API responses, never logged.

**Drizzle migration:**
```typescript
phaseServiceToken: text("phase_service_token"),
```

### Deprecated columns (retained for schema compatibility, not populated for hermes tenants)

- `gatewayPort` — null for hermes tenants (subdomain routing, no port assignment)
- `dashboardTokenHash` — null for hermes tenants (hermes dashboard uses ephemeral token)

### Updated `instanceStatusEnum`

No changes needed — existing statuses cover the hermes flow:
`queued → provisioning → running` (success) or `error` (failure)

`awaiting_auth` is not used for hermes tenants (`claudeAuthStatus` is set to `connected` at provision time).

---

## API Contracts

### Platform → Orchestrator

**`POST /provision`** (existing endpoint, updated payload)
```typescript
// Request
{
  tenantId: string;          // "aero-fett"
  subdomain: string;         // "aero-fett.overnightdesk.com"
  plan: "starter" | "pro";
  callbackUrl: string;       // "https://www.overnightdesk.com/api/provisioner/callback"
}

// Response (sync acknowledgement only — orchestrator provisions async)
{ success: true }
// or
{ success: false, error: string }  // 400/500 on validation failure
```

**`POST /deprovision`** (existing endpoint, unchanged payload)
```typescript
{ tenantId: string }
```

**`POST /restart`** (existing endpoint, unchanged payload)
```typescript
{ tenantId: string }
```

All requests authenticated with `Authorization: Bearer {PROVISIONER_SECRET}`.

### Orchestrator → Platform (callback)

**`POST /api/provisioner/callback`** (existing, small extension)
```typescript
// On success
{
  tenantId: string;
  status: "running";
  containerId: "hermes-{tenantId}";
  phaseServiceToken: string;    // NEW — encrypted by platform before storage
}

// On failure
{
  tenantId: string;
  status: "error";
  error: string;
}
```

The existing callback route already handles `tenantId`, `status`, `containerId`. It needs one addition: extract and store `phaseServiceToken` when status is `running`.

---

## Implementation Phases

### Phase 0 — Schema migration + ProvisionParams update (platform)

**0.1 Add `phaseServiceToken` column**
- Drizzle migration: `alter table instance add column phase_service_token text`
- `src/db/schema.ts`: add `phaseServiceToken: text("phase_service_token")` to instance table

**0.2 Update `ProvisionParams` in `src/lib/provisioner.ts`**
- Replace `gatewayPort: number` and `dashboardTokenHash: string` with `subdomain: string`
- No other changes — client code is otherwise unchanged

**0.3 Update callback route to store phaseServiceToken**
- `src/app/api/provisioner/callback/route.ts`: extract `phaseServiceToken` from callback body
- Store via `updateInstanceStatus()` with extra fields

---

### Phase 1 — Stripe webhook wiring (platform)

The Stripe webhook handler already exists. It needs hermes-specific provisioning wired in.

**1.1 `checkout.session.completed` → provision**
- Find: `src/app/api/stripe/webhook/route.ts` handler for `checkout.session.completed`
- Calls `provisionerClient.provision()` with updated `ProvisionParams`
- Passes `subdomain: \`${tenantId}.overnightdesk.com\``
- Sets instance status to `provisioning` before calling provisioner

**1.2 `customer.subscription.deleted` → deprovision**
- Calls `provisionerClient.deprovision({ tenantId })`
- Sets instance status to `deprovisioned` (after 30-day data retention window — the orchestrator stops containers immediately but data preserved on disk)

**1.3 Idempotency guard**
- Check current instance status before calling provisioner
- If already `running` or `provisioning`, skip (Stripe duplicate event guard)

---

### Phase 2 — Orchestrator: hermes provisioning endpoint

The `platform-orchestrator` is a Go service at `~/overnightdesk-engine` (deployed from `Dockerfile.orchestrator`). Extend it with hermes provisioning logic.

**2.1 `POST /provision` handler**

Sequence (all idempotent on tenantId):

1. **Validate request**: tenantId, subdomain, plan, callbackUrl required
2. **Create Phase.dev path**: `phase secrets create --path /{tenantId}` (no-op if exists)
3. **Create Phase service token**: `phase tokens create --path /{tenantId}` → capture token value
4. **Create data directory**: `mkdir -p /opt/{tenantId}/bin`
5. **Copy startup script**: write `start-all.sh` to `/opt/{tenantId}/bin/start-all.sh`, `chmod +x`
6. **Export secrets**: `phase secrets export --path /{tenantId} > /opt/{tenantId}/.env`, `chmod 600`
7. **Start container** (via Docker socket proxy):
   ```
   docker run -d
     --name hermes-{tenantId}
     --network overnightdesk_overnightdesk
     --restart unless-stopped
     --user 10000:10000
     --entrypoint /usr/bin/bash
     -e HERMES_HOME=/opt/data
     -e HERMES_WEB_DIST=/opt/hermes/hermes_cli/web_dist
     -e PYTHONUNBUFFERED=1
     -v /opt/{tenantId}:/opt/data
     nousresearch/hermes-agent:latest
     /opt/data/bin/start-all.sh
   ```
8. **Health check poll**: GET `http://hermes-{tenantId}:9119/api/status` (via Docker network) — 30s timeout, 5s interval. Pass if HTTP 200.
9. **Write nginx config**: render template to `/opt/overnightdesk/nginx/conf.d/{tenantId}.conf` (same pattern as `infra/nginx/aero-fett.conf`, substituting container name and subdomain)
10. **Reload nginx**: `docker exec overnightdesk-nginx nginx -t && docker exec overnightdesk-nginx nginx -s reload`
11. **Issue TLS cert**: `docker compose -f /opt/overnightdesk/docker-compose.yml run --rm certbot certonly --webroot -w /var/www/certbot -d {subdomain} --non-interactive`
12. **Callback — success**: POST to callbackUrl with `{ tenantId, status: "running", containerId: "hermes-{tenantId}", phaseServiceToken: "<token>" }`

**On any step failure:**
- Remove nginx config if written (don't leave broken state)
- Callback with `{ tenantId, status: "error", error: "<step> failed: <detail>" }`
- Fleet event logged

**2.2 `POST /deprovision` handler**

1. Stop and remove container: `docker stop hermes-{tenantId} && docker rm hermes-{tenantId}`
2. Remove nginx config: `rm /opt/overnightdesk/nginx/conf.d/{tenantId}.conf`
3. Reload nginx
4. **Preserve data**: `/opt/{tenantId}/` remains on disk (30-day retention — purge job is out of scope for this feature)
5. Callback: `{ tenantId, status: "deprovisioned" }`

**2.3 `POST /restart` handler**

1. `docker restart hermes-{tenantId}`
2. Health check poll (same as provision)
3. Return `{ success: true }` or `{ success: false, error: "..." }`

---

### Phase 3 — End-to-end verification

**3.1 Integration test: full provision flow**
- Create a test instance record (`status: queued`)
- POST to `/provision` with test tenantId
- Assert: container running, nginx config written, TLS cert issued, callback received with `running` status, `phaseServiceToken` stored in DB
- Assert: `https://{subdomain}/api/status` returns 200

**3.2 Integration test: deprovision flow**
- POST to `/deprovision`
- Assert: container stopped, nginx config removed, callback received, status `deprovisioned`
- Assert: `/opt/{tenantId}/` data directory preserved

**3.3 Integration test: idempotency**
- POST to `/provision` twice with same tenantId
- Assert: second call succeeds, no duplicate containers, no duplicate nginx configs

**3.4 Stripe webhook e2e**
- Send test `checkout.session.completed` event via Stripe CLI
- Assert full provision flow triggered

---

## Security Considerations

| Concern | How it's addressed |
|---|---|
| Provisioner endpoint auth | Bearer token (`PROVISIONER_SECRET`) — existing pattern, timing-safe comparison |
| Phase service token in transit | Passed in callback body over HTTPS only, not in logs |
| Phase service token at rest | Stored in platform DB — treat as sensitive credential |
| Docker socket access | Via least-privilege socket proxy (existing) — POST allowed for container ops |
| Tenant data isolation | Each tenant gets its own data directory, container, and Phase path |
| nginx config injection | tenantId validated against `^[a-z0-9-]+$` before use in file paths |

---

## Testing Strategy

- **Unit tests**: `ProvisionParams` validation, tenantId sanitisation, nginx template rendering
- **Integration tests**: Full provision/deprovision flows against a test environment (Phases 3.1–3.4)
- **Idempotency tests**: Duplicate Stripe events, re-run provision (Phase 3.3)
- **Error path tests**: Phase.dev unavailable, container fails health check, certbot fails

Minimum 80% coverage on new platform code (constitution requirement).

---

## Constitutional Compliance

| Principle / Pillar | Requirement | Satisfied by |
|---|---|---|
| P1 Data Sacred | Tenant data not deleted on decommission | 30-day retention — data dir preserved, only containers/nginx removed |
| P2 Secrets never plaintext | Phase.dev is secrets layer | Platform never stores secrets in DB; phaseServiceToken encrypted |
| P2 | Rotation without redeploy | Update Phase.dev path + `docker restart hermes-{tenantId}` |
| P3 | No autonomous action beyond defined state transitions | Provisioner only executes on explicit webhook events |
| P4 Simple | Existing provisioner client pattern reused | No new client library; only orchestrator extended |
| P6 Honesty | Dashboard shows real status | Instance status updated via callback, not assumed |
| P7 Owner's Time | Zero manual provisioning after feature ships | Full automation from Stripe to running instance |
| P8 Platform Quality | Provisioning SLA ≤ 5 minutes | Health check timeout ensures container is actually healthy before callback |
| Pillar C | `nousresearch/hermes-agent:latest` enforced | Image hardcoded in orchestrator, not configurable per-tenant |
| Pillar C | `phase run` / Phase.dev injection | `phase secrets export → .env` at container start |
| Pillar C | Fleet events on state changes | Logged in orchestrator at each step; callback route inserts fleet events |
| Pillar C | Idempotent webhook handlers | Stripe duplicate event guard in Phase 1.3 |

**Exceptions:** None.

---

## Estimated Effort

| Component | Work |
|---|---|
| Schema migration + ProvisionParams update | 1 hour |
| Stripe webhook wiring (platform) | 2 hours |
| Orchestrator: `/provision` endpoint | 4 hours |
| Orchestrator: `/deprovision` + `/restart` | 2 hours |
| Callback route update (phaseServiceToken) | 1 hour |
| Tests | 3 hours |
| **Total** | **~13 hours** |
