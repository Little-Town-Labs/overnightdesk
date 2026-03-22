# API Contract — Feature 5: Provisioning Pipeline

## Routes Overview

### Vercel (this repo)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/provisioner/callback` | Provisioner secret | Receive status updates from Oracle provisioner |

### Oracle Cloud Provisioner (separate service, adapted from ironclaw-saas)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/provision` | Shared secret | Create tenant container |
| POST | `/deprovision` | Shared secret | Remove tenant container |
| GET | `/health` | None | Provisioner health check |

---

## Vercel-Side Changes

### Webhook Extension: handleCheckoutCompleted()

After creating the subscription record (Feature 4), the handler will:

1. Generate tenant ID from userId (first 12 chars)
2. Allocate next available gateway port (4000-4999)
3. Generate bearer token (`crypto.randomBytes(32)`)
4. Hash bearer token (bcrypt)
5. Create instance record (status: "queued")
6. Log fleet event: "instance.queued"
7. Fire-and-forget: POST to Oracle provisioner `/provision`
8. Return (don't wait for provisioning to complete)

### POST /api/provisioner/callback

Receives status updates from the Oracle Cloud provisioner.

**Request:**
```json
{
  "tenantId": "a1b2c3d4e5f6",
  "status": "running" | "error",
  "containerId": "abc123...",
  "error": "Optional error message"
}
```

**Auth:** `Authorization: Bearer ${PROVISIONER_SECRET}` header

**Success (200):**
```json
{ "success": true }
```

**Logic:**
1. Verify provisioner secret
2. Find instance by tenantId
3. Update instance status, containerId
4. If status is "running":
   - Set provisionedAt = now()
   - Set subdomain = `{tenantId}.overnightdesk.com`
   - Log fleet event: "instance.provisioned"
   - Send welcome email with subdomain URL and bearer token (plaintext stored temporarily for email)
5. If status is "error":
   - Log fleet event: "instance.error" with details
   - Set instance status to "error"

### Webhook Extension: handleSubscriptionDeleted()

After marking subscription as canceled (Feature 4), the handler will:

1. Find user's instance
2. If instance exists and status is running/awaiting_auth:
   - Fire-and-forget: POST to Oracle provisioner `/deprovision`
   - Update instance status to "stopped"
   - Log fleet event: "instance.deprovisioning"
   - Set deprovisionedAt = now()

---

## Oracle Cloud Provisioner API

### POST /provision

Creates a tenant container with full security hardening.

**Request:**
```json
{
  "tenantId": "a1b2c3d4e5f6",
  "plan": "starter" | "pro",
  "gatewayPort": 4001,
  "dashboardTokenHash": "$2b$10$...",
  "callbackUrl": "https://overnightdesk.com/api/provisioner/callback"
}
```

**Auth:** `Authorization: Bearer ${PROVISIONER_SECRET}`

**Immediate Response (202 Accepted):**
```json
{ "received": true, "tenantId": "a1b2c3d4e5f6" }
```

**Async Steps (background):**
1. Validate tenantId format
2. Create data directory: `/opt/overnightdesk/tenants/{tenantId}`
3. Write container .env with port, token hash
4. Start container with security flags (resource limits based on plan)
5. Wait for health check (TCP probe, 60s timeout)
6. Generate nginx config (per-tenant server block)
7. Reload nginx
8. POST callback to Vercel with status "running" + containerId
9. On failure: clean up container/config, POST callback with status "error"

### POST /deprovision

Stops and removes a tenant container.

**Request:**
```json
{
  "tenantId": "a1b2c3d4e5f6"
}
```

**Auth:** `Authorization: Bearer ${PROVISIONER_SECRET}`

**Response (200):**
```json
{ "received": true, "tenantId": "a1b2c3d4e5f6" }
```

**Steps:**
1. Stop and remove Docker container
2. Remove nginx config file
3. Reload nginx
4. Preserve data directory (30-day retention)

---

## Environment Variables (New)

### Vercel
| Variable | Example | Description |
|----------|---------|-------------|
| `PROVISIONER_URL` | `https://api.overnightdesk.com` | Oracle Cloud provisioner base URL |
| `PROVISIONER_SECRET` | `prov_xxx...` | Shared secret for provisioner auth |

### Oracle Cloud Provisioner
| Variable | Example | Description |
|----------|---------|-------------|
| `PROVISIONER_SECRET` | `prov_xxx...` | Same shared secret (validates Vercel requests AND used when calling back to Vercel) |
| `DOMAIN` | `overnightdesk.com` | Domain for subdomains |
| `ENGINE_IMAGE` | `ghcr.io/overnightdesk/engine:latest` | Docker image for tenant containers |
