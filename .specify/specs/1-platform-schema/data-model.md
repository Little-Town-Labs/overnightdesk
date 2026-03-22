# Data Model — 1-platform-schema

## Enums

### subscription_status
Values: `active`, `past_due`, `canceled`, `trialing`

### instance_status
Values: `queued`, `provisioning`, `awaiting_auth`, `running`, `stopped`, `error`, `deprovisioned`

### claude_auth_status
Values: `not_configured`, `connected`, `expired`

### subscription_plan
Values: `starter`, `pro`

---

## Tables

### Better Auth Core Tables

These tables are defined to match Better Auth's exact requirements. Better Auth owns the read/write logic for these tables — our code should not write to them directly (except through Better Auth's API).

#### user
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK, default crypto.randomUUID() | Unique identifier |
| name | text | NOT NULL | Display name |
| email | text | NOT NULL, UNIQUE | Login email |
| email_verified | boolean | NOT NULL, default false | Email verification status |
| image | text | nullable | Profile image URL |
| created_at | timestamp(tz) | NOT NULL, default now() | Account creation |
| updated_at | timestamp(tz) | NOT NULL, default now() | Last modification |

#### session
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK, default crypto.randomUUID() | Unique identifier |
| token | text | NOT NULL, UNIQUE | Session token |
| expires_at | timestamp(tz) | NOT NULL | Session expiry |
| user_id | text | NOT NULL, FK → user.id (CASCADE) | Session owner |
| ip_address | text | nullable | Client IP |
| user_agent | text | nullable | Client user agent |
| created_at | timestamp(tz) | NOT NULL, default now() | Session start |
| updated_at | timestamp(tz) | NOT NULL, default now() | Last activity |

#### account
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK, default crypto.randomUUID() | Unique identifier |
| account_id | text | NOT NULL | Provider-specific account ID |
| provider_id | text | NOT NULL | Auth provider name (e.g., "credential") |
| user_id | text | NOT NULL, FK → user.id (CASCADE) | Account owner |
| access_token | text | nullable | OAuth access token |
| refresh_token | text | nullable | OAuth refresh token |
| access_token_expires_at | timestamp(tz) | nullable | Token expiry |
| refresh_token_expires_at | timestamp(tz) | nullable | Refresh expiry |
| scope | text | nullable | OAuth scope |
| id_token | text | nullable | OIDC ID token |
| password | text | nullable | Hashed password (credential provider) |
| created_at | timestamp(tz) | NOT NULL, default now() | Creation time |
| updated_at | timestamp(tz) | NOT NULL, default now() | Last update |

#### verification
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK, default crypto.randomUUID() | Unique identifier |
| identifier | text | NOT NULL | What is being verified (e.g., email) |
| value | text | NOT NULL | Verification code/token |
| expires_at | timestamp(tz) | NOT NULL | Verification expiry |
| created_at | timestamp(tz) | NOT NULL, default now() | Creation time |
| updated_at | timestamp(tz) | NOT NULL, default now() | Last update |

---

### Platform Custom Tables

#### subscription
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK, default crypto.randomUUID() | Unique identifier |
| user_id | text | NOT NULL, FK → user.id (CASCADE) | Subscriber |
| stripe_customer_id | text | nullable | Stripe customer ID |
| stripe_subscription_id | text | nullable | Stripe subscription ID |
| plan | subscription_plan enum | NOT NULL | Plan tier |
| status | subscription_status enum | NOT NULL | Billing status |
| current_period_end | timestamp(tz) | nullable | End of current billing period |
| created_at | timestamp(tz) | NOT NULL, default now() | Subscription creation |
| updated_at | timestamp(tz) | NOT NULL, default now() | Last status change |

#### instance
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK, default crypto.randomUUID() | Unique identifier |
| user_id | text | NOT NULL, FK → user.id (CASCADE) | Instance owner |
| tenant_id | text | NOT NULL, UNIQUE | Slug derived from user |
| status | instance_status enum | NOT NULL, default 'queued' | Lifecycle status |
| container_id | text | nullable | Docker container ID |
| gateway_port | integer | UNIQUE, nullable | Assigned port |
| dashboard_token_hash | text | nullable | Hashed bearer token |
| claude_auth_status | claude_auth_status enum | NOT NULL, default 'not_configured' | Claude Code auth state |
| subdomain | text | UNIQUE, nullable | {tenant}.overnightdesk.com |
| provisioned_at | timestamp(tz) | nullable | When provisioned |
| deprovisioned_at | timestamp(tz) | nullable | When deprovisioned |
| last_health_check | timestamp(tz) | nullable | Last successful health check |
| created_at | timestamp(tz) | NOT NULL, default now() | Record creation |
| updated_at | timestamp(tz) | NOT NULL, default now() | Last modification |

#### fleet_event
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | Auto-incrementing ID |
| instance_id | text | nullable, FK → instance.id (SET NULL) | Related instance (null for system-wide) |
| event_type | text | NOT NULL | Event type (extensible, not enum) |
| details | jsonb | nullable | Structured event context |
| created_at | timestamp(tz) | NOT NULL, default now() | Event timestamp |

**Notes:** Append-only — application layer must not UPDATE or DELETE rows. event_type is text (not enum) because event types are extensible without migrations.

#### usage_metric
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | Auto-incrementing ID |
| instance_id | text | NOT NULL, FK → instance.id (CASCADE) | Tracked instance |
| metric_date | date | NOT NULL | Calendar date |
| claude_calls | integer | NOT NULL, default 0 | AI invocations that day |
| tool_executions | integer | NOT NULL, default 0 | Tool uses that day |

**Constraints:** UNIQUE (instance_id, metric_date)

#### platform_audit_log
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | Auto-incrementing ID |
| actor | text | NOT NULL | Who did it (provisioner, agent-zero, owner, user:{id}) |
| action | text | NOT NULL | What was done |
| target | text | nullable | What was affected |
| details | jsonb | nullable | Structured context |
| created_at | timestamp(tz) | NOT NULL, default now() | When it happened |

**Notes:** Append-only — no updates or deletes. No FK to user — actor is a text field because actors include system components, not just users.

---

## Relationships

```
user 1──N session       (CASCADE delete)
user 1──N account       (CASCADE delete)
user 1──1 subscription  (CASCADE delete)
user 1──1 instance      (CASCADE delete)
instance 1──N fleet_event    (SET NULL on delete — preserves history)
instance 1──N usage_metric   (CASCADE delete)
platform_audit_log — no FKs (actor is text, not FK)
verification — standalone (no FKs)
```

---

## Indexes

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| user | unique | email | Login lookup |
| session | unique | token | Session validation |
| instance | unique | tenant_id | Slug lookup |
| instance | unique | subdomain | Routing lookup |
| instance | unique | gateway_port | Port allocation |
| fleet_event | btree | created_at | Time-range queries |
| fleet_event | btree | instance_id | Per-instance filtering |
| usage_metric | unique composite | (instance_id, metric_date) | One row per instance per day |
| platform_audit_log | btree | created_at | Time-range queries |
| verification | btree | identifier | Verification lookup |

---

## Existing Tables (NOT modified)

| Table | Owner | Notes |
|-------|-------|-------|
| waitlist | overnightdesk (this repo) | Existing Drizzle-managed table. Preserved as-is. |
| security_approval_queue | overnightdesk-securityteam | Raw SQL migrations. Do not reference. |
| content_staging | overnightdesk-securityteam | Raw SQL migrations. Do not reference. |
| ingested_messages | overnightdesk-securityteam | Raw SQL migrations. Do not reference. |
| security_governor_log | overnightdesk-securityteam | Raw SQL migrations. Do not reference. |
| email_fetch_state | overnightdesk-securityteam | Raw SQL migrations. Do not reference. |
| security_audit_results | overnightdesk-securityteam | Raw SQL migrations. Do not reference. |
