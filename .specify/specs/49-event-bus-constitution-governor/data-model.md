# Data Model — Feature 49: Event Bus + Constitution + Token Governor

All tables live in the dedicated `tenet0` PostgreSQL instance on aegis-prod. Schema: `public`. PostgreSQL 16-alpine.

## Entities

### `departments`
Registers each department and its credentials.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Department name (`president`, `ops`, `tech`, `cro`, `cso`, `cfo`, `secops`, `governor`) |
| namespace_prefix | TEXT | NOT NULL, UNIQUE | The event-type prefix this dept may publish (matches id) |
| credential_hash | TEXT | NOT NULL | bcrypt-hashed bearer token |
| credential_rotated_at | TIMESTAMPTZ | NOT NULL | Last rotation time |
| previous_credential_hash | TEXT | NULL | For grace-window during rotation |
| previous_valid_until | TIMESTAMPTZ | NULL | When the old credential stops working |
| status | TEXT | NOT NULL DEFAULT `active` | `active`, `paused`, `disabled` |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

### `constitution_versions`
Versioned constitution artifacts. Files on disk are loaded in via migrations.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| version_id | BIGSERIAL | PRIMARY KEY | Monotonically increasing version |
| prose_sha256 | TEXT | NOT NULL | Hash of `constitution.md` |
| rules_sha256 | TEXT | NOT NULL | Hash of `constitution-rules.yaml` |
| prose_text | TEXT | NOT NULL | Full text of `constitution.md` for agent prompt loading |
| rules_yaml | TEXT | NOT NULL | Full text of `constitution-rules.yaml` |
| published_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| published_by | TEXT | NOT NULL | Operator identity from migration context |

### `constitution_rules`
Parsed rules from the active constitution, indexed for fast lookup.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| constitution_version_id | BIGINT | NOT NULL REFERENCES constitution_versions | |
| rule_id | TEXT | NOT NULL | Human-readable rule name from YAML (e.g., `fin-payment-requires-approval`) |
| event_type_pattern | TEXT | NOT NULL | Event type this rule applies to (glob) |
| requires_approval_mode | TEXT | NULL | `per_action`, `blanket_category`, or NULL for no approval |
| approval_category | TEXT | NULL | For blanket mode, the category name |
| additional_checks_json | JSONB | NULL | Extra declarative constraints (e.g., max amount, required payload fields) |

**Index:** `(constitution_version_id, event_type_pattern)`

### `events`
All published events (non-rejected).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUIDv7 (time-sortable) |
| event_type | TEXT | NOT NULL | e.g., `fin.payment.received` |
| source_department_id | TEXT | NOT NULL REFERENCES departments | |
| payload | JSONB | NOT NULL | Event data |
| parent_event_id | TEXT | NULL REFERENCES events | Causality chain |
| constitution_version_id | BIGINT | NOT NULL REFERENCES constitution_versions | Which version validated this event |
| published_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:**
- `(published_at DESC)` — retention sweep, recent-first queries
- `(event_type, published_at DESC)` — subscription replay
- `(source_department_id, published_at DESC)` — per-dept audit
- `parent_event_id` — causality walks

**Retention:** rows older than 30 days are moved to `events_archive` by a daily job; events_archive is cold storage, queryable by SecOps.

### `event_subscriptions`
Tracks per-subscriber consumption offset for replay.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| department_id | TEXT | NOT NULL REFERENCES departments | |
| subscription_key | TEXT | NOT NULL | Subscriber-chosen key (e.g., `tech.main`) |
| pattern | TEXT | NOT NULL | Event type pattern (exact, `dept.*`, `*`, `*.failed`) |
| last_consumed_event_id | TEXT | NULL REFERENCES events | For catch-up replay |
| last_heartbeat_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Unique:** `(department_id, subscription_key)`

### `approvals_active`
Currently valid approvals (per-action and blanket).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| approval_event_id | TEXT | NOT NULL REFERENCES events | The `president.approved` or `president.authorization.granted` event |
| kind | TEXT | NOT NULL | `per_action` or `blanket` |
| scope_event_type | TEXT | NULL | For per_action: the event type it authorizes |
| target_event_id | TEXT | NULL | For per_action: exact event ID being approved |
| category | TEXT | NULL | For blanket: the category name |
| constraints_json | JSONB | NULL | For blanket: constraints (e.g., `{max_amount_cents: 10000}`) |
| expires_at | TIMESTAMPTZ | NULL | NULL = indefinite (blanket only) |
| consumed_at | TIMESTAMPTZ | NULL | For per_action: when it was used |
| revoked_at | TIMESTAMPTZ | NULL | For blanket: when revoked |

**Indexes:**
- `(kind, scope_event_type, target_event_id)` — per-action lookup at publish time
- `(kind, category, expires_at)` — blanket lookup
- Partial index `WHERE consumed_at IS NULL AND revoked_at IS NULL` — fast active-approval check

### `department_budgets`
Monthly token budgets and current spend.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| department_id | TEXT | NOT NULL REFERENCES departments | |
| budget_month | DATE | NOT NULL | First of month, UTC |
| monthly_limit_cents | INTEGER | NOT NULL | Budget cap |
| spent_cents | INTEGER | NOT NULL DEFAULT 0 | Running total |
| warn_threshold_pct | INTEGER | NOT NULL DEFAULT 80 | |
| warn_at_pct_emitted | BOOLEAN | NOT NULL DEFAULT false | De-dup warning events |
| extension_cents | INTEGER | NOT NULL DEFAULT 0 | President-granted budget extension |
| extension_approval_event_id | TEXT | NULL REFERENCES events | |
| status | TEXT | NOT NULL DEFAULT `ok` | `ok`, `warning`, `blocked` |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Primary Key:** `(department_id, budget_month)`

### `token_usage`
Append-only record of every Claude API call, per department.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| department_id | TEXT | NOT NULL REFERENCES departments | |
| model | TEXT | NOT NULL | e.g., `claude-sonnet-4-6` |
| input_tokens | INTEGER | NOT NULL | |
| output_tokens | INTEGER | NOT NULL | |
| cost_cents | INTEGER | NOT NULL | Calculated via pricing table |
| event_id | TEXT | NULL REFERENCES events | The event that triggered this call, if any |
| recorded_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:**
- `(department_id, recorded_at DESC)` — dept spend queries
- `(recorded_at DESC)` — time-range aggregations

### `model_pricing`
Per-model Anthropic pricing. Updated via migrations when Anthropic changes prices.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| model | TEXT | PRIMARY KEY | e.g., `claude-sonnet-4-6` |
| input_cents_per_mtok | NUMERIC(10,4) | NOT NULL | Dollars-per-million-tokens × 100 |
| output_cents_per_mtok | NUMERIC(10,4) | NOT NULL | |
| effective_from | DATE | NOT NULL | |

### `audit_log`
Append-only. Immutable. No department (including President) has UPDATE or DELETE permission.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| actor_id | TEXT | NOT NULL | Department id or `system` |
| action | TEXT | NOT NULL | `event.published`, `event.rejected`, `approval.issued`, `approval.consumed`, `approval.revoked`, `budget.warned`, `budget.blocked`, `budget.extended`, `constitution.loaded`, `credential.rotated`, `secops.violation.*` |
| detail_json | JSONB | NOT NULL | Action-specific payload |
| recorded_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:**
- `(actor_id, recorded_at DESC)`
- `(action, recorded_at DESC)`
- `(recorded_at DESC)` — full time-range scans for SecOps

**Permissions:** INSERT only via the `publish_event()`, `record_token_usage()`, and `rotate_credential()` stored procedures. No direct INSERT, UPDATE, or DELETE from application code.

---

## Relationships

```
departments (1) ── (many) events [source_department_id]
departments (1) ── (many) event_subscriptions
departments (1) ── (many) department_budgets
departments (1) ── (many) token_usage
events (1) ── (many) events [parent_event_id — self-ref for causality]
events (1) ── (1) approvals_active [approval_event_id]
events (0..1) ── (many) token_usage [event_id — the event that triggered the call]
constitution_versions (1) ── (many) constitution_rules
constitution_versions (1) ── (many) events [validated-under version]
model_pricing (1) ── (many) token_usage [by model]
```

## Stored Procedures (enforcement surface)

The stored procedures are the only supported way to mutate the bus. Client libraries call these; direct table writes are blocked by role permissions.

### `publish_event(credential, event_type, payload, parent_event_id)` → `(event_id, status, error?)`
1. Verify credential → resolve source department
2. Verify `event_type` starts with department's `namespace_prefix`
3. Look up matching rule in `constitution_rules` for the active constitution version
4. If rule requires approval:
   - `per_action`: find an active, unconsumed `president.approved` with matching target; consume it
   - `blanket_category`: find an active, unrevoked `president.authorization.granted` for the category, check `constraints_json` against payload
5. Walk `parent_event_id` chain; reject if depth > 10 or cycle detected
6. Insert into `events`
7. Append to `audit_log`
8. `pg_notify('event_bus', <event_id>)`
9. Return event_id

### `reject_event(credential, event_type, payload, reason)` → void
Only called by `publish_event()` internally on violations. Writes rejection details to `audit_log` with `event.rejected` action and raises a `secops.violation.*` event.

### `record_token_usage(department, model, input_tokens, output_tokens, event_id?)` → `(cost_cents, budget_status)`
1. Verify department active
2. Compute cost from `model_pricing`
3. Insert into `token_usage`
4. Update `department_budgets.spent_cents` for the current month
5. If crossed 80% threshold: emit `governor.budget.warning` event, set `warn_at_pct_emitted = true`
6. If crossed 100% threshold: update status = `blocked`, emit `governor.budget.exceeded` event
7. Return cost and current status

### `check_budget(department)` → `(status, remaining_cents)`
Read-only pre-check called before a Claude API invocation. Returns the current status and remaining budget. If status is `blocked`, the caller must not make the API call.

### `rotate_credential(department, new_credential_hash, grace_minutes)` → void
Admin-only. Moves current credential to previous, sets new, logs to audit.

### `register_subscription(department, subscription_key, pattern)` → subscription_id
Idempotent. Creates or updates the subscription record.

### `ack_event(department, subscription_key, event_id)` → void
Updates `last_consumed_event_id`. Client calls after successful processing.

### `activate_constitution(version_id)` → void
Migration-time only. Marks a constitution version active. All subsequent events are validated under this version.

## Metric Views

Read-only views computing live operational metrics. Backed by `tenet0_app` SELECT grants; queried by the SDK's `Metrics` API.

### `v_events_per_minute`
Rolling 1-minute publish rate per department.
```sql
SELECT source_department_id, COUNT(*) AS events_per_minute
FROM events
WHERE published_at > now() - INTERVAL '1 minute'
GROUP BY source_department_id;
```

### `v_rejection_rate_per_hour`
Audit log rejections per department over last hour.
```sql
SELECT actor_id, action, COUNT(*) AS rejections
FROM audit_log
WHERE recorded_at > now() - INTERVAL '1 hour'
  AND action LIKE 'event.rejected%'
GROUP BY actor_id, action;
```

### `v_subscription_lag`
Per-subscriber lag = max(events.id) − last_consumed_event_id, translated to an approximate event count.

### `v_budget_utilization`
Current-month spend as a percentage of effective limit.

### `v_audit_log_write_rate`
Audit log writes per minute, used to detect storms or silence.

All views are lightweight — they execute against the same indexed tables the SDK writes to.

## Retention and Archival Jobs

- **Hourly:** Rotate `audit_log` older than 1 month into monthly partitions (pg_partman or manual)
- **Daily at 03:00 UTC:** Move `events` rows older than 30 days to `events_archive`
- **Daily at 03:15 UTC:** Budget rollover — create next-month `department_budgets` rows at month-start, emit `governor.budget.reset` event

## Access Control

Three PostgreSQL roles:

1. **`tenet0_admin`** — owns schema, runs migrations, rotates credentials. No runtime use.
2. **`tenet0_app`** — the single role used by client libraries. Has EXECUTE on stored procedures, SELECT on most tables, NO direct INSERT/UPDATE/DELETE.
3. **`tenet0_secops`** — read-only across all tables plus audit_log. Used by SecOps auditor to query compliance.
