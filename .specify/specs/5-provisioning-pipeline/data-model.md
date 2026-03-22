# Data Model — Feature 5: Provisioning Pipeline

## Existing Schema (Minimal Changes Needed)

### instance (existing — from Feature 1)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | text (UUID) | Primary Key | Auto-generated |
| userId | text | FK → user.id, CASCADE, Not Null | Owning user |
| tenantId | text | Unique, Not Null | URL-safe slug (first 12 chars of userId) |
| status | instance_status enum | Not Null, default "queued" | queued, provisioning, awaiting_auth, running, stopped, error, deprovisioned |
| containerId | text | Nullable | Docker container ID |
| gatewayPort | integer | Unique, Nullable | Allocated port (4000-4999) |
| dashboardTokenHash | text | Nullable | Bcrypt hash of bearer token |
| claudeAuthStatus | claude_auth_status enum | Not Null, default "not_configured" | not_configured, connected, expired |
| subdomain | text | Unique, Nullable | {tenantId}.overnightdesk.com |
| provisionedAt | timestamp (tz) | Nullable | When provisioning completed |
| deprovisionedAt | timestamp (tz) | Nullable | When deprovisioned |
| lastHealthCheck | timestamp (tz) | Nullable | Last successful health check |
| createdAt | timestamp (tz) | Not Null, default now() | Record creation |
| updatedAt | timestamp (tz) | Not Null, default now() | Last update |

### fleet_event (existing — from Feature 1)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | serial | Primary Key | Auto-increment |
| instanceId | text | FK → instance.id, SET NULL, Nullable | Related instance |
| eventType | text | Not Null | provisioned, started, stopped, health_check, error, restart, deprovisioned |
| details | jsonb | Nullable | Event-specific data |
| createdAt | timestamp (tz) | Not Null, default now() | Event time |

## Schema Assessment

All tables exist from Feature 1. No new migrations needed.

**What the provisioning pipeline will populate:**
- `instance.tenantId` — derived from userId (first 12 chars)
- `instance.status` — updated through lifecycle by webhook + provisioner callbacks
- `instance.containerId` — set by provisioner after container creation
- `instance.gatewayPort` — allocated by provisioner (next available in 4000-4999)
- `instance.dashboardTokenHash` — bcrypt hash of generated bearer token
- `instance.subdomain` — `{tenantId}.overnightdesk.com`
- `instance.provisionedAt` — set when status transitions to running
- `fleet_event` rows — logged at every status transition

## Provisioner API Data Contracts

### POST /provision (Oracle Cloud provisioner)
```json
{
  "tenantId": "a1b2c3d4e5f6",
  "plan": "starter",
  "gatewayPort": 4001,
  "dashboardTokenHash": "$2b$10$...",
  "callbackUrl": "https://overnightdesk.com/api/provisioner/callback"
}
```

### POST /deprovision (Oracle Cloud provisioner)
```json
{
  "tenantId": "a1b2c3d4e5f6"
}
```

### POST /api/provisioner/callback (Vercel — receives status from Oracle provisioner)
```json
{
  "tenantId": "a1b2c3d4e5f6",
  "status": "running",
  "containerId": "abc123...",
  "error": null
}
```
