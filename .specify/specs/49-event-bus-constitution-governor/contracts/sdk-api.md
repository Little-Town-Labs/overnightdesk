# Client Library API Contract — Go and TypeScript

Both Go and TypeScript libraries expose the same logical API. This document defines the public surface. The libraries live at:

- `tenet-0/shared/bus-go/` — Go client library (`github.com/overnightdesk/tenet-0/shared/bus-go`)
- `tenet-0/shared/bus-ts/` — TypeScript client library (`@tenet-0/bus`)

## Configuration

Every client reads configuration from environment:

| Env Var | Description | Default |
|---------|-------------|---------|
| `TENET0_PG_URL` | Postgres connection string | (required) |
| `TENET0_DEPARTMENT` | Department identifier (e.g., `ops`) | (required) |
| `TENET0_CREDENTIAL` | Bearer token for this department | (required) |
| `TENET0_LOG_LEVEL` | Log level (`debug`/`info`/`warn`/`error`) | `info` |

## Core API

### `Bus.Connect() → Bus`
Establishes a Postgres connection pool. Verifies credential and department status. Fails if credential is invalid or department is disabled.

**Go:**
```go
bus, err := tenet0.Connect(ctx, config)
```

**TypeScript:**
```ts
const bus = await Bus.connect(config);
```

### `Bus.Publish(eventType, payload, opts?) → EventID`
Publishes an event. Blocks until the stored procedure returns (typically < 50ms). Returns the event ID.

**Options:**
- `parentEventID` — for causality chain
- `approvalEventID` — for events under per-action approval

**Errors:**
- `ErrNamespaceViolation` — event type doesn't match department's prefix
- `ErrConstitutionRejected` — rule violation (e.g., missing approval)
- `ErrBudgetBlocked` — department budget exceeded (publishes blocked until reset)
- `ErrCausalityLoop` — parent chain is cyclic or too deep
- `ErrConnectionLost` — Postgres unreachable; caller buffers locally (see degraded mode)

### `Bus.Subscribe(subscriptionKey, pattern, handler) → Subscription`
Registers a subscription. Replays any missed events since the last `ack`, then streams new events via LISTEN/NOTIFY.

**Handler signature:**
```go
func(ctx context.Context, event Event) error
```

**Semantics:**
- If handler returns `nil`: event is acked automatically
- If handler returns an error: event is re-queued with exponential backoff (up to 5 retries, then dead-letter)
- Handler must be idempotent (at-least-once delivery)

### `Bus.Unsubscribe(subscriptionKey) → void`
Stops a subscription but preserves the offset — reconnect will resume.

### `Bus.Close() → void`
Clean shutdown. Drains in-flight handlers, closes pool.

## Approval API

### `Approvals.RequestPerAction(targetEventType, payload, reason) → Request`
Published by a department to request approval before emitting the target event.

Internally publishes `<department>.approval.requested` with the target event type and payload. The President is expected to consume this and emit `president.approved`.

**Returns:** Request handle that can be awaited (with timeout) for the President's decision.

```go
req := bus.RequestApproval(ctx, "fin.payment.outbound", paymentPayload, "payroll run 2026-04")
decision, err := req.Await(ctx, 10*time.Minute)
if decision.Approved {
    bus.Publish("fin.payment.outbound", paymentPayload, tenet0.WithApproval(decision.ApprovalEventID))
}
```

### `Approvals.GrantPerAction(targetEventID, scope, expiresIn, reason) → ApprovalEventID`
President-only. Emits `president.approved` for a specific pending request.

### `Approvals.GrantBlanket(category, constraints, expiresAt?, reason) → ApprovalEventID`
President-only. Emits `president.authorization.granted`.

### `Approvals.Revoke(approvalEventID, reason) → void`
President-only. Emits `president.authorization.revoked`.

## Governor API

### `Governor.Call(claudeClient, request) → Response`
Wraps an Anthropic SDK call with budget pre-check and usage recording.

**Flow:**
1. `check_budget(department)` SP call
2. If status == `blocked`, return `ErrBudgetBlocked` without calling Anthropic
3. Invoke Anthropic SDK
4. Parse `usage.input_tokens` and `usage.output_tokens` from response
5. Call `record_token_usage(department, model, input, output, currentEventID?)` SP
6. Return the original response

**Go:**
```go
resp, err := bus.Governor().Call(ctx, anthropicClient, messageRequest)
```

**TypeScript:**
```ts
const resp = await bus.governor().call(anthropicClient, messageRequest);
```

### `Governor.CheckBudget() → BudgetStatus`
Read-only budget query. Returns `{status, limitCents, spentCents, remainingCents}`.

## Constitution API

### `Constitution.Load() → Constitution`
Reads the active constitution version from the `constitution_versions` table. Returns both prose (for agent prompt) and parsed rules.

### `Constitution.CurrentVersion() → int64`
Returns the active version id.

### `Constitution.Watch(callback) → void`
Polls the `constitution_versions` table on a background goroutine. Invokes `callback` when a new version is published. Each department uses this to reload its system prompt at the next task boundary.

## Metrics API (operational observability)

### `Metrics.Snapshot() → MetricsSnapshot`
Returns a one-shot JSON payload aggregating live metrics from the backing views.

**Shape:**
```json
{
  "generated_at": "2026-04-14T12:34:56Z",
  "events_per_minute": { "ops": 12, "tech": 3, "cro": 0 },
  "rejection_rate_per_hour": [
    { "actor": "ops", "action": "event.rejected.namespace", "count": 2 }
  ],
  "subscription_lag": [
    { "department": "tech", "subscription_key": "tech.main", "lag_events": 0 }
  ],
  "budget_utilization": [
    { "department": "ops", "spent_cents": 123, "limit_cents": 5000, "pct": 2.46 }
  ],
  "audit_log_write_rate_per_minute": 47
}
```

### `Metrics.Stream(intervalSeconds, handler) → Subscription`
Polled snapshot stream. Default interval 30s. Caller-facing convenience for the President's dashboard; internally just a timer over `Snapshot()`.

## Audit API (read-only, SecOps-only)

### `Audit.Query(filters) → []AuditEntry`
Query the `audit_log`. Filters: `actor_id`, `action`, `fromTime`, `toTime`, `limit`.

### `Audit.Stream(filters, handler) → Subscription`
Real-time stream of new audit entries (for SecOps live monitoring).

## Degraded Mode (when Postgres is unreachable)

When `Bus.Publish()` fails with `ErrConnectionLost`:

1. The library writes the event to a local disk queue at `$TENET0_SPOOL_DIR/<department>/<event-id>.json`
2. The library reports the publish as a local success but with a `buffered=true` flag in the returned metadata
3. A background reconnect loop flushes the spool when Postgres returns
4. Per FR-5 (NFR-5), a catastrophic outage raises an out-of-band Telegram alert via a separate file-based sentinel
