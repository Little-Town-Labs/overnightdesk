# Quickstart — Feature 49: Tenet-0 Event Bus

This guide walks a Feature-50-or-later developer through spinning up the bus locally and publishing their first event. Assumes Feature 49 is implemented and deployed.

## Prerequisites

- Docker + Docker Compose
- Go 1.22+ (for Go client examples)
- Node 22+ (for TypeScript client examples)
- Repository checked out at `/mnt/f/overnightdesk/`

## 1. Start the local bus

```bash
cd tenet-0
echo "localtestpass" > secrets/tenet0_pg_password.txt
docker compose up -d tenet0-postgres
```

Wait for health: `docker compose ps tenet0-postgres` shows `(healthy)`.

## 2. Run migrations

```bash
cd tenet-0/db
./migrate.sh up
```

Confirms all 9 migrations applied.

## 3. Load a starter constitution

```bash
./migrate.sh bump-constitution
```

Reads `/tenet-0/shared/constitution.md` + `constitution-rules.yaml`, publishes to the bus.

## 4. Publish your first event (Go)

```go
package main

import (
    "context"
    "log"
    "github.com/overnightdesk/tenet-0/shared/bus-go"
)

func main() {
    ctx := context.Background()
    bus, err := tenet0.Connect(ctx, tenet0.Config{
        PostgresURL:  "postgres://tenet0_app:localtestpass@localhost:5432/tenet0",
        Department:   "ops",
        Credential:   "ops-dev-credential",
    })
    if err != nil { log.Fatal(err) }
    defer bus.Close()

    eventID, err := bus.Publish(ctx, "ops.job.completed", map[string]any{
        "job_id": "job-123",
        "duration_ms": 4200,
    })
    if err != nil { log.Fatal(err) }
    log.Println("published:", eventID)
}
```

## 5. Subscribe (TypeScript)

```ts
import { Bus } from '@tenet-0/bus';

const bus = await Bus.connect({
  postgresUrl: 'postgres://tenet0_app:localtestpass@localhost:5432/tenet0',
  department: 'tech',
  credential: 'tech-dev-credential',
});

await bus.subscribe('tech.main', 'ops.*', async (event) => {
  console.log('received:', event.type, event.payload);
});
```

## 6. Bump the constitution

```bash
# Edit /tenet-0/shared/constitution-rules.yaml
cd tenet-0/db
./migrate.sh bump-constitution
```

Within 60s, subscribed departments observe the version change via `Constitution.Watch`.

## 7. Verify metrics

```bash
# From any department's context:
curl -s http://localhost:<dept-port>/metrics | jq .
```

Or via SDK:

```go
snapshot, _ := bus.Metrics().Snapshot(ctx)
log.Printf("events/min: %v", snapshot.EventsPerMinute)
```

## 8. Query audit log (SecOps only)

```go
bus, _ := tenet0.Connect(ctx, tenet0.Config{
    Department: "secops",
    Credential: "secops-dev-credential",
    Role:       tenet0.RoleSecOps,  // uses tenet0_secops PG role
})
entries, _ := bus.Audit().Query(ctx, tenet0.AuditFilter{
    Actor:    "ops",
    FromTime: time.Now().Add(-24*time.Hour),
})
```

## Troubleshooting

| Symptom | Likely Cause |
|---------|--------------|
| `ErrNamespaceViolation` on publish | event type doesn't start with department's prefix |
| `ErrConstitutionRejected` | constitution rule requires approval; use `Approvals.RequestPerAction` |
| `ErrBudgetBlocked` | department spent ≥ 100% monthly budget; wait for reset or request extension |
| `ErrConnectionLost` on publish | Postgres unreachable; events are spooled locally; check `tenet0-postgres` container |
| Subscriber not receiving events | verify subscription pattern matches event type; check `Metrics.Snapshot().SubscriptionLag` |

## Common Patterns

**Long-running work that may need approval mid-task:**
```go
req := bus.Approvals().RequestPerAction("fin.payment.outbound", payload, "monthly payroll")
decision, err := req.Await(ctx, 10*time.Minute)
if decision.Approved {
    bus.Publish("fin.payment.outbound", payload, tenet0.WithApproval(decision.ApprovalEventID))
}
```

**Wrapping Anthropic calls through the governor:**
```go
resp, err := bus.Governor().Call(ctx, anthropicClient, messagesRequest)
// cost and tokens automatically recorded; returns ErrBudgetBlocked if over limit
```

**Subscribing to everything (President only):**
```go
bus.Subscribe(ctx, "president.main", "*", handlePresidentEvent)
```
