# Implementation Plan — Feature 49: Event Bus + Constitution + Token Governor

## Executive Summary

Build three interlocked components in a new `/tenet-0/` directory:

1. **Event Bus** — PostgreSQL 16 on aegis-prod, accessed via stored procedures. LISTEN/NOTIFY for real-time delivery; events table for durability and replay.
2. **Constitution** — two-artifact governance (`constitution.md` prose + `constitution-rules.yaml` rules), loaded into Postgres via migrations, enforced at the `publish_event()` stored procedure.
3. **Token Governor** — client-library wrapper around Anthropic SDK calls; per-department monthly budget with 80% warn / 100% block / President-grantable extensions.

Deliverables: Postgres schema + stored procedures + migrations; Go client library (`tenet-0/shared/bus-go/`); TypeScript client library (`tenet-0/shared/bus-ts/`); Docker Compose addition for `tenet0-postgres`; contract tests validating Go ⟷ TS interop.

No new customer-facing behavior. No impact on existing engine, SecurityTeam, or platform. Feature 49 is foundational plumbing for Features 50–57.

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                   aegis-prod VM                                │
│                                                                │
│   ┌──────────────┐     ┌──────────────────────────────────┐   │
│   │ department   │────▶│      tenet0-postgres:5432        │   │
│   │   (Go/TS)    │     │                                  │   │
│   │              │     │  Tables:                         │   │
│   │  - publish   │     │   departments                    │   │
│   │  - subscribe │     │   events + events_archive        │   │
│   │  - governor  │     │   event_subscriptions            │   │
│   │  - constit.  │     │   approvals_active               │   │
│   │              │     │   constitution_versions + rules  │   │
│   │              │     │   department_budgets             │   │
│   └──────┬───────┘     │   token_usage                    │   │
│          │             │   audit_log                      │   │
│          │             │   model_pricing                  │   │
│          │             │                                  │   │
│          │             │  Stored procedures:              │   │
│          │             │   publish_event()                │   │
│          │             │   record_token_usage()           │   │
│          │             │   check_budget()                 │   │
│          │             │   rotate_credential()            │   │
│          │             │   register_subscription() / ack  │   │
│          │             │   activate_constitution()        │   │
│          └───LISTEN───▶│                                  │   │
│                        │   NOTIFY 'event_bus' <event_id>  │   │
│                        └──────────────────────────────────┘   │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Key architectural properties:**
- **Single shared Postgres user** at the app layer (`tenet0_app`); identity established per-call via credential in the stored procedure. No direct INSERT/UPDATE on tables from clients.
- **Stored procedures are the enforcement surface.** Namespace checks, constitutional rules, approval validation, and audit logging all happen inside `publish_event()`. A misbehaving client library cannot bypass them.
- **LISTEN/NOTIFY carries only event IDs** (8KB limit); subscribers fetch payloads by ID from `events`. Keeps the wire thin.
- **Append-only audit_log** with role-level INSERT-only permission. Not even the President can modify it.

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Event store | PostgreSQL 16-alpine | Durable, LISTEN/NOTIFY, mandated by architecture doc |
| DB client (Go) | `jackc/pgx/v5` | First-class LISTEN/NOTIFY, modern, fast |
| DB client (TS) | `pg` (v8) | Matches SecurityTeam; battle-tested |
| Logging (Go) | `log/slog` | Engine pattern |
| Logging (TS) | Pino | Fastify default; SecurityTeam already uses it |
| Testing (Go) | `testing` + `testify` | Engine pattern |
| Testing (TS) | Vitest | SecurityTeam pattern |
| Validation (TS) | Zod | Matches SecurityTeam |
| Container | Docker Compose | Matches existing fleet |
| Secrets | Docker Compose secrets file | Matches n8n/communication-module pattern |

## Directory Layout

```
/tenet-0/
├── README.md
├── docker-compose.yml                     # tenet0-postgres service
├── secrets/
│   └── tenet0_pg_password.txt             # gitignored
├── shared/
│   ├── constitution.md                    # prose
│   ├── constitution-rules.yaml            # machine-readable rules
│   ├── bus-go/                            # Go client library
│   │   ├── go.mod
│   │   ├── bus.go                         # Connect, Publish, Subscribe
│   │   ├── governor.go                    # Call, CheckBudget
│   │   ├── constitution.go                # Load, Watch
│   │   ├── approvals.go                   # Request/Grant/Revoke
│   │   ├── audit.go                       # Query/Stream (SecOps)
│   │   ├── internal/                      # SQL, types, pool
│   │   └── *_test.go
│   └── bus-ts/                            # TypeScript client library
│       ├── package.json
│       ├── src/
│       │   ├── bus.ts
│       │   ├── governor.ts
│       │   ├── constitution.ts
│       │   ├── approvals.ts
│       │   ├── audit.ts
│       │   └── internal/
│       └── test/
├── db/
│   ├── migrations/
│   │   ├── 001_departments.sql
│   │   ├── 002_events.sql
│   │   ├── 003_constitution.sql
│   │   ├── 004_approvals.sql
│   │   ├── 005_budgets_and_pricing.sql
│   │   ├── 006_audit_log.sql
│   │   ├── 007_stored_procedures.sql
│   │   ├── 008_retention_jobs.sql
│   │   └── 009_seed_departments.sql
│   └── migrate.sh                         # goose wrapper for Postgres
└── contract-tests/                        # Go ⟷ TS interop tests
    ├── run-interop.sh
    └── fixtures/
```

## Implementation Phases

### Phase 1: Postgres Schema + Stored Procedures
**Deliverables:** `/tenet-0/db/migrations/001–007`, running against a local Postgres in CI.

- Migration 001–006: tables per data-model.md
- Migration 007: stored procedures (`publish_event`, `record_token_usage`, `check_budget`, `register_subscription`, `ack_event`, `rotate_credential`, `activate_constitution`)
- Migration 008: partman-style retention job for audit_log, events archival cron
- Migration 009: seed 8 department rows with placeholder credentials (overridden at Tenet-0 deploy time)

**Tests:** SQL tests via `pgTap` or plain psql scripts — publish event, reject on namespace violation, budget block, approval consumption.

### Phase 2: Go Client Library (`tenet-0/shared/bus-go/`)
**Deliverables:** Importable Go module with full spec API.

- `bus.Connect(ctx, config) → *Bus`
- `bus.Publish(ctx, eventType, payload, opts)` — calls `publish_event()` SP
- `bus.Subscribe(ctx, key, pattern, handler)` — pgx LISTEN loop + replay
- `bus.Governor().Call(ctx, anthropicClient, req)` — wraps Anthropic SDK
- `bus.Governor().CheckBudget()` — calls `check_budget()` SP
- `bus.Constitution().Load()` / `Watch()` — reads `constitution_versions` / `_rules`
- `bus.Approvals().RequestPerAction() / GrantPerAction() / GrantBlanket() / Revoke()`
- Spool-to-disk on `ErrConnectionLost`; background reconnect flush
- Unit tests + integration tests against a throwaway Postgres container

### Phase 3: TypeScript Client Library (`tenet-0/shared/bus-ts/`)
**Deliverables:** Publishable npm package mirroring Go API shape.

- Same API surface; idiomatic TS (async/await, promises, no callbacks)
- `pg` pool; LISTEN via dedicated connection
- Zod schemas for event payloads
- Vitest unit + integration tests

### Phase 4: Constitution Loader and Rule Evaluation
**Deliverables:** Rule evaluation code in the `publish_event()` stored procedure + activation migration pattern.

- Parse `constitution-rules.yaml` into `constitution_rules` rows at activation time (done in migration script, not stored procedure — YAML parsing happens in the migrate script)
- `publish_event()` implements the rule lookup + approval check logic described in data-model.md
- Changes to constitution: (1) edit YAML and prose files, (2) run `./db/migrate.sh bump-constitution`, (3) migration creates new `constitution_versions` row, parses YAML into `constitution_rules`, calls `activate_constitution(new_version_id)`

### Phase 5: Docker Compose + Deployment
**Deliverables:** `tenet0-postgres` running on aegis-prod.

```yaml
services:
  tenet0-postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tenet0_admin
      POSTGRES_PASSWORD_FILE: /run/secrets/tenet0_pg_password
      POSTGRES_DB: tenet0
    volumes:
      - tenet0-pg-data:/var/lib/postgresql/data
      - ./db/migrations:/migrations:ro
    networks:
      - overnightdesk_overnightdesk
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tenet0_admin -d tenet0"]
    secrets:
      - tenet0_pg_password
```

Deployment on aegis-prod uses the existing `deploy-engine` skill pattern.

### Phase 6: Contract Tests (Go ⟷ TS Interop)
**Deliverables:** Test suite proving Go and TS libraries produce identical wire-level behavior.

- Publish from Go, subscribe from TS → verify payload round-trip
- Approval issued by TS (playing President), consumed by Go (playing Finance)
- Budget enforcement verified from both sides
- Constitution version change observed by both libraries

### Phase 7: Documentation
**Deliverables:** `/tenet-0/README.md`, `/tenet-0/shared/constitution.md` (the initial constitution itself), quickstart guide.

The initial `constitution.md` is drafted in this phase. It's a governance document; content decisions are Gary's.

## Security Considerations

- **Network isolation:** `tenet0-postgres` listens only on the `overnightdesk_overnightdesk` Docker network. No port published to host. Only containers on that network can connect.
- **Credential storage:** department bearer tokens stored bcrypt-hashed in `departments.credential_hash`. Rotation is first-class (grace window with old credential).
- **Stored procedure enforcement:** the app-level role (`tenet0_app`) has `EXECUTE` on SPs and `SELECT` on read-only views, but no DML on tables. Malicious/buggy clients cannot bypass.
- **Audit log immutability:** `tenet0_app` has only INSERT permission on `audit_log`, via SPs. No UPDATE or DELETE exists for any role except `tenet0_admin` (which is never used at runtime).
- **Constitution integrity:** `constitution_versions.prose_sha256` and `rules_sha256` fields are verified against the files on disk at each agent startup; mismatch prevents startup.
- **Replay protection on approvals:** `approvals_active.consumed_at` is set atomically in the SP; a double-use race is eliminated by the transaction.

## Observability & Metrics

**Target (NFR-6):** operators and the President can see events/sec per department, rejection rate, subscription lag, budget utilization, and audit-log write rate in real time.

**Approach:**

1. **Database-backed metric views.** Postgres views compute live metrics directly from `events`, `audit_log`, `department_budgets`, and `event_subscriptions`:
   - `v_events_per_minute(department_id)` — publish rate windowed over 1 minute
   - `v_rejection_rate_per_hour(department_id, action)` — from `audit_log`
   - `v_subscription_lag(department_id, subscription_key)` — current max event ID minus `last_consumed_event_id`
   - `v_budget_utilization(department_id, budget_month)` — `spent_cents / (monthly_limit_cents + extension_cents)`
   - `v_audit_log_write_rate` — sliding-window entry count

2. **Client-library metrics API.** Both Go and TypeScript SDKs expose:
   - `Metrics.Snapshot()` — one-shot JSON payload of all metric views
   - `Metrics.Stream(handler)` — polled subscription (30s default) for dashboard consumption

3. **HTTP exposition (optional).** A lightweight metrics endpoint on each department's HTTP server surfaces `Metrics.Snapshot()` output. Prometheus scraping is out of scope for Feature 49 — the President (Feature 50) aggregates metrics via the SDK and may choose to re-expose them.

4. **Audit log read API.** `Audit.Query(filters)` and `Audit.Stream(filters, handler)` from `contracts/sdk-api.md` are implemented in this feature. SecOps uses them for compliance queries; the President uses them for incident investigation.

**Not in scope:** a full metrics store (Prometheus/TSDB), dashboards, alerting. Those ride on top of this data in Feature 50 and Feature 57.

## Performance Strategy

**Target:** publish p99 < 50ms, rule eval p99 < 10ms, 100 events/sec sustained.

**Tactics:**
- Indexed lookups in `publish_event()` SP: department_id (PK), event_type pattern match (indexed), active approvals (partial index where consumed/revoked is NULL)
- Prepared statements in both client libraries
- Connection pooling (pgx: 10 connections default; pg: 10 default)
- LISTEN/NOTIFY runs on a dedicated connection per library, not shared with publish/subscribe pool
- `events` table partitioned by week (postgres native partitioning) to keep individual partitions small and indexes hot
- `audit_log` partitioned by month

**Benchmarks:**
- A single `publish_event()` round-trip (local Postgres): expect 3–5 ms
- Allows plenty of headroom under the 50ms p99 target

## Testing Strategy

### Unit Tests (per library)
- Publish/subscribe happy path
- Namespace violation rejection
- Approval request → grant → consume
- Budget warn/block transitions
- Constitution version change detection
- Degraded mode: spool to disk, flush on reconnect

### Integration Tests (per library + Postgres)
- End-to-end publish → LISTEN notification → subscriber handler
- Replay after subscriber reconnect (simulate offline window)
- Causality chain cycle detection
- Approval expiry
- Credential rotation grace window

### Contract Tests (Go ⟷ TS)
- Bidirectional publish/subscribe with identical payload shapes
- Approval issued on one side, consumed on other
- Both libraries observe constitution version bump
- Budget state visible identically to both

### Load Tests
- 100 events/sec sustained for 1 hour — publish latency distribution
- 1,000 events in 10 seconds burst — no loss
- 10 concurrent subscribers — no starvation

**Coverage target:** 80%+ on bus, governor, constitution, approval code paths.

## Deployment Strategy

1. **Phase 5 completes** → `tenet0-postgres` container image built and tagged
2. **Deploy to aegis-prod** via existing `deploy-engine` skill (adapt for `tenet0`)
3. **Run migrations 001–007** to create schema
4. **Seed departments** via migration 009 with production credentials (generated at deploy time, written to Docker secrets)
5. **Smoke test:** a simple `publish_event()` from a local Go test harness to verify round-trip
6. **Write initial constitution** (Phase 7) and load via `bump-constitution` migration
7. **Gate:** no department (Features 52–57) begins until the bus passes all contract and load tests

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LISTEN/NOTIFY 8KB payload limit bites us | Low | Low | Payloads go in `events` table; NOTIFY only carries event ID |
| `pg_notify` loses messages under load | Very Low | Medium | Subscribers reconcile via `last_consumed_event_id` on reconnect |
| Stored procedure is slow under realistic rule count | Medium | Medium | Load test before deploy; indexes on `constitution_rules.event_type_pattern`; simpler rules if hot |
| Two libraries drift in behavior | Medium | High | Contract tests (Phase 6) catch this; shared wire-level test fixtures |
| Anthropic pricing changes and we forget | Medium | Low | Migration-gated `model_pricing` updates; SecOps audit flags spend calculated with stale pricing |
| Postgres container becomes single point of failure | High | High | At MVP: accepted (Tenet-0 is Gary's business; downtime is bounded). Phase 2: add read replica or move to Neon if volume justifies |
| Developer publishes raw Anthropic call bypassing governor | Medium | Medium | Code review; SecOps audits actual vs. recorded call volume |

## Constitutional Compliance

Platform constitution (`.specify/memory/constitution.md`) alignment:

- [x] **Data Sacred:** Tenet-0 bus carries no customer tenant data. Audit log is indefinite but contains only department operational data.
- [x] **Security:** Network-isolated DB, bcrypt-hashed credentials, stored-procedure enforcement, immutable audit log.
- [x] **Simple Over Clever:** PostgreSQL-only (no Redis, no broker). Two libraries, shared SP-based logic.
- [x] **Owner Decides:** President approvals are a first-class concept. Operators cannot be bypassed for sensitive events.
- [x] **Test-First:** Unit, integration, contract, and load tests all specified.
- [x] **Business Pays for Itself:** New Postgres container is ~100 MB RAM; marginal cost on existing VM.
- [x] **Platform Quality Drives Retention:** Not user-facing; internal plumbing only.

No exceptions required.

## Open Implementation Questions (defer to `/speckit-tasks`)

- Exact token rate limits per department (start at 100/sec burst, 50/sec sustained; adjust during load test)
- Initial monthly budget values (defer per roadmap; start with a generous $50/dept/month until real usage is observed)
- pgTap vs. plain SQL scripts for SP tests (investigator's preference during Phase 1)
- pg_partman vs. manual partitioning (try native first; move to pg_partman only if retention jobs get unwieldy)
