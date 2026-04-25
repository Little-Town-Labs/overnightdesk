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

## Read API

Historical-event reads. Promised by spec.md FR §"President can query historical events" (lines 55, 111, 199, 231) but originally absent from the SDK shape; added in Feature 50 Task 2.2 (Path C drift closure).

These methods are read-only and do not consume budget or write audit entries. The Postgres role grants (`tenet0_app: SELECT ON events`, migration `002_events.sql:35`) are sufficient — no SP changes required.

### `Bus.QueryEvents(filter) → QueryResult`
Returns events matching the filter, ordered by `(published_at, id)` ascending. Uses keyset pagination so a `Cursor` is stable under concurrent inserts.

**Filter:**
- `EventTypePattern` — same pattern shape as `Subscribe` (`""`/`"*"` = all, exact, `dept.*` prefix, `*.verb` suffix)
- `SourceDepartment` — exact-match department slug
- `StartTime`, `EndTime` — `published_at` range (both optional, both inclusive)
- `Limit` — default 100, max 1000
- `Cursor` — opaque pagination cursor; pass `QueryResult.NextCursor` from the prior call

**Result:** `{Events []Event, NextCursor string}` — `NextCursor` is empty when the page is the final one.

**Errors:**
- `ErrQueryInvalid` — `StartTime > EndTime`, or malformed cursor

**Go:**
```go
res, err := bus.QueryEvents(ctx, tenet0.QueryFilter{
    EventTypePattern: "president.*",
    Limit:            50,
})
```

### `Bus.GetEvent(eventID) → Event`
Returns one event by ID.

**Errors:**
- `ErrNotFound` — event does not exist

### `Bus.WalkCausality(eventID, opts) → WalkResult`
Walks the causality chain rooted at `eventID`. Direction `WalkAncestors` follows `parent_event_id` until a root is reached. Direction `WalkDescendants` does a breadth-first traversal of children (rows where `parent_event_id = current.id`).

**Options:**
- `MaxDepth` — default 10, max 50
- `Direction` — `WalkAncestors` (default) or `WalkDescendants`

**Result:** `{Chain []Event, TerminatedReason WalkTermination}` where `TerminatedReason` is one of:
- `WalkReachedRoot` — natural end (no parent / no more children)
- `WalkMaxDepth` — hit the depth cap
- `WalkCycleDetected` — encountered an already-visited event (the duplicate is NOT appended)

**Errors:**
- `ErrNotFound` — `eventID` does not exist

### `Bus.ListUnprocessedEvents(req) → ListUnprocessedResult`
CL-1 polling primitive: returns events newer than `SinceEventID`, ordered ASC. Empty `SinceEventID` means "from the beginning" (cold start).

**Request:**
- `Limit` — default 50, max 500
- `SinceEventID` — opaque high-water-mark from prior call

**Result:** `{Events []Event, HighWaterMark string}` — `HighWaterMark` is the id of the last returned row; pass it back as `SinceEventID` on the next poll. Empty when zero events were returned.

NOTE: this MVP implementation is **not** department-scoped; access is gated by the calling MCP server. A future revision may add department-aware filtering.

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
