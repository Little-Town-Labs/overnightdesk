# Data Model — Feature 7: Customer Dashboard

## Existing Tables (No Changes Required)

Feature 7 does not require new database tables or columns. All platform data models already exist from Features 1-6. Tenant-specific data (jobs, conversations, heartbeat config) lives in the engine's per-tenant SQLite database and is accessed via the engine REST API.

### Tables Used by Feature 7

| Table | Usage in Feature 7 |
|-------|-------------------|
| `user` | Account settings (email, name), session verification |
| `subscription` | Subscription status display, cancellation on account delete |
| `instance` | Instance status, subdomain, engineApiKey for engine API calls |
| `fleet_event` | Log restart events |
| `platform_audit_log` | Log account deletion, settings changes |

### Engine Data (Not in Platform DB)

| Engine Entity | Accessed Via | Usage |
|--------------|-------------|-------|
| Jobs | `GET/POST/DELETE /api/jobs` | Job management section |
| Conversations | `GET /api/conversations` | Activity log section |
| Messages | `GET /api/conversations/:id/messages` | Activity log detail |
| Heartbeat Config | `GET/PUT /api/heartbeat` | Heartbeat configuration |
| Engine Status | `GET /api/status` | Dashboard overview (uptime, queue, auth) |
| Engine Logs | `GET /api/logs` | Log viewer |

### Key Instance Fields for Engine Communication

```
instance.subdomain  → Base URL for engine API (https://{subdomain})
instance.engineApiKey → Bearer token for engine API authentication
instance.status → Determines if management sections are shown (only when "running")
instance.claudeAuthStatus → Displayed in overview section
```

## Relationships

No new relationships. Existing relationship chain:
```
user → instance → (engine API) → jobs, conversations, heartbeat, logs
user → subscription → Stripe (for cancellation on account delete)
```
