# Feature 16: Customer Security Add-On — Implementation Plan

**Branch:** 16-customer-security-addon
**Created:** 2026-03-23

---

## Architecture: Why This Is Simple

The engine already skips all SecurityTeam calls when `SECURITY_URL` is not set (Feature 14). So plan-gating is primarily a **provisioning** concern:

- **Pro plan** → provisioner sets `SECURITY_URL=http://127.0.0.1:4700` and `SECURITY_TOKEN=<per-tenant-token>` in the container env
- **Starter plan** → provisioner omits these vars → engine operates without security (existing behavior)

The SecurityTeam needs to accept multiple valid tokens (one per Pro tenant + admin master token).

---

## Phase 1: SecurityTeam Multi-Token Support

**Repo:** overnightdesk-securityteam

Currently `SECURITY_SERVICE_TOKEN` is a single token. Change to accept a comma-separated list:

```
SECURITY_SERVICE_TOKEN=admin-master-token,tenant-abc-token,tenant-def-token
```

The auth hook in `src/server.ts` already does timing-safe comparison against `tokenBuffer`. Change to compare against an array of token buffers. Any matching token is valid.

This is a small change to the auth hook — no endpoint changes needed.

---

## Phase 2: Provisioning Integration

**Repo:** overnightdesk (platform)

### 2.1: Generate per-tenant security token during provisioning

In the instance creation flow (`src/lib/instance.ts`), when plan is "pro":
1. Generate a random security token: `crypto.randomBytes(32).toString('hex')`
2. Store it on the instance record (new field: `securityToken`)
3. Pass `SECURITY_URL` and `SECURITY_TOKEN` to the provisioner alongside existing env vars

### 2.2: Instance schema extension

Add `securityToken` field to instance table (nullable text). Only populated for Pro plan instances.

### 2.3: Provisioner params extension

Add `securityUrl` and `securityToken` to the `ProvisionParams` interface. The provisioner passes these as Docker env vars when creating the container.

### 2.4: Token registration with SecurityTeam

When a Pro instance is provisioned, the platform appends the new token to SecurityTeam's accepted token list. Options:
- **Option A (simplest):** Platform writes tokens to a shared config (env file, DB table) that SecurityTeam reads on startup
- **Option B:** SecurityTeam has a `POST /admin/tokens` endpoint for dynamic token management
- **Chosen:** Option A — write to the SecurityTeam env file via provisioner, restart SecurityTeam. At current scale (< 10 tenants), this is acceptable.

Actually, even simpler: store accepted tokens in the shared Neon DB. SecurityTeam reads valid tokens from a `security_tokens` table at startup and caches them. New tokens take effect on next poll (every 60s) or restart.

---

## Phase 3: Dashboard Plan Gating

**Repo:** overnightdesk (platform)

### 3.1: Security tab visibility by plan

Currently the Security tab is `adminOnly: true`. Change to show for Pro plan users too:
- Admin users: always see Security tab
- Pro plan users: see Security tab
- Starter plan users: don't see Security tab

### 3.2: API route plan checks

Security API routes currently use `requireAdmin()`. Change to `requireProOrAdmin()`:
- Admin: allowed
- Pro plan with active subscription: allowed
- Starter plan: 403 with "Security screening requires Pro plan. Upgrade at /pricing"

### 3.3: Customer-facing security page

The current security page is admin-only and shows all data. For Pro customers:
- Show their own security status (from their engine)
- Show their own approval queue
- Hide admin-only features (audit triggers, fleet-wide data)

---

## Phase 4: Pricing Page Update

**Repo:** overnightdesk (platform)

Update `src/app/pricing/page.tsx`:
- Pro plan features: add "Security screening (outbound secret/PII detection, inbound injection scanning)"
- Starter plan: add "Security screening: Not included" or a dash

---

## Phase 5: Upgrade/Downgrade Handling

**Repo:** overnightdesk (platform)

### 5.1: Upgrade (Starter → Pro)

In `src/lib/stripe-webhook-handlers.ts`, when subscription plan changes to "pro":
1. Generate security token
2. Store on instance record
3. Register token with SecurityTeam (DB insert)
4. Signal engine to reload config (or note that restart is needed)

### 5.2: Downgrade (Pro → Starter)

When plan changes to "starter":
1. Remove security token from SecurityTeam's accepted list
2. Clear `securityToken` on instance record
3. Engine continues running — next restart it won't have `SECURITY_URL`

---

## File Inventory

### SecurityTeam (overnightdesk-securityteam)
- `src/server.ts` — Multi-token auth support
- `migrations/007_security_tokens.sql` — Token table (id, token_hash, tenant_id, created_at)
- Tests for multi-token auth

### Platform (overnightdesk)
- `src/db/schema.ts` — Add `securityToken` to instance table
- `src/lib/instance.ts` — Generate security token for Pro plans
- `src/lib/provisioner.ts` — Pass security env vars
- `src/lib/stripe-webhook-handlers.ts` — Handle plan changes
- `src/lib/require-admin.ts` → new `require-pro-or-admin.ts`
- `src/app/(protected)/dashboard/dashboard-nav.tsx` — Plan-based visibility
- `src/app/(protected)/dashboard/security/page.tsx` — Customer vs admin view
- `src/app/api/engine/security/*/route.ts` — Plan gating
- `src/app/pricing/page.tsx` — Feature list update

### Engine (overnightdesk-engine)
- No changes needed — Feature 14 already handles "no SECURITY_URL = no security"

---

## Complexity: Medium

Most of the heavy lifting (security client, circuit breaker, proxy endpoints, dashboard) was done in Features 14-15. Feature 16 is primarily configuration and gating.
