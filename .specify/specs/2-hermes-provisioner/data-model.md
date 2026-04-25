# Data Model: Hermes Provisioner

## Schema Changes

### `instance` table — one new column

```sql
ALTER TABLE instance ADD COLUMN phase_service_token text;
```

| Column | Type | Change | Notes |
|---|---|---|---|
| `phase_service_token` | text | **NEW** | Phase.dev service token scoped to `/{tenantId}/`. Sensitive — never returned in API responses or logs. Null for legacy Go daemon tenants. |
| `gateway_port` | integer | Deprecated | Null for hermes tenants. Retained for schema compatibility. |
| `dashboard_token_hash` | text | Deprecated | Null for hermes tenants. Retained for schema compatibility. |
| `claude_auth_status` | enum | Unchanged | Set to `connected` for all hermes tenants at provision time. |

### No new tables required

All provisioning state is tracked via the existing `instance` and `fleet_event` tables.

## Provisioning State Machine

```
queued
  │ (Stripe checkout.session.completed received)
  ▼
provisioning
  │ (orchestrator reports success via callback)         │ (orchestrator reports error)
  ▼                                                     ▼
running                                               error
  │ (customer.subscription.deleted)
  ▼
deprovisioned
```

## Fleet Events (logged by orchestrator + callback route)

| eventType | When | Details |
|---|---|---|
| `instance.provisioning.started` | Orchestrator begins | `{ tenantId, subdomain, plan }` |
| `instance.provisioning.phase_created` | Phase.dev path created | `{ tenantId, phasePath }` |
| `instance.provisioning.container_started` | Container healthy | `{ containerId }` |
| `instance.provisioning.nginx_configured` | nginx reloaded | `{ subdomain }` |
| `instance.provisioning.tls_issued` | certbot succeeded | `{ subdomain }` |
| `instance.running` | Callback received | `{ containerId, phaseServiceToken: "[redacted]" }` |
| `instance.error` | Any step fails | `{ step, error }` |
| `instance.deprovisioning.started` | Deprovision begins | `{ tenantId }` |
| `instance.deprovisioned` | Containers stopped, nginx removed | `{ tenantId, dataPreservedAt: timestamp }` |
