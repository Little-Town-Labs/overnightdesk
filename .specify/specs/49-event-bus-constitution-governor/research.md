# Technology Research — Feature 49: Event Bus + Constitution + Token Governor

## Decision 1: Event Transport Mechanism

**Options:**
1. **PostgreSQL LISTEN/NOTIFY + events table** — durable storage, real-time notification, single dependency
2. **Redis Streams** — purpose-built, high throughput
3. **RabbitMQ / NATS** — mature message brokers
4. **Kafka** — overkill for our volume

**Chosen:** PostgreSQL LISTEN/NOTIFY + events table
**Rationale:** The architecture doc explicitly mandates "no Redis, no RabbitMQ — one fewer dependency." PostgreSQL is already the platform DB (NeonDB) and will be on aegis-prod for the event bus. Durability, ordering per-publisher, subscribe semantics via LISTEN/NOTIFY, and replay via the events table all come for free. At 100 events/sec sustained (NFR-2), Postgres is not the bottleneck.
**Tradeoffs:** LISTEN/NOTIFY payloads are limited to 8KB — large event payloads must be stored in the events table and the notification carries only the event ID. This is acceptable (subscribers fetch-by-id on notify).

## Decision 2: Rule Evaluation Location

**Options:**
1. **Server-side in stored procedures** — rules enforced at the DB layer, impossible to bypass
2. **Client-side in each SDK** — more flexible rule expression, easier to write, bypassable
3. **Hybrid** — critical rules (namespace auth, approval chains) server-side; soft advisory rules client-side

**Chosen:** Server-side in a `publish_event()` stored procedure
**Rationale:** Security-critical. A client library bug or malicious department cannot bypass server-side checks. The rules file is loaded into a `constitution_rules` table at startup; the stored procedure reads from it. Performance is bounded by NFR-1's 10ms rule-eval target; indexed rules table with simple predicates fits comfortably.
**Tradeoffs:** Less expressive than a full DSL; rules are limited to what the SP can evaluate (namespace checks, causality chain inspection, approval presence). Complex logic stays in the client as advisory code with audit logging.

## Decision 3: Department Authentication

**Options:**
1. **PostgreSQL role per department** — native, battle-tested, role GRANTs enforce namespace
2. **Application-level bearer tokens** — matches engine's existing pattern (bcrypt-hashed tokens)
3. **TLS client certificates** — strong, operationally heavy

**Chosen:** Application-level bearer tokens stored hashed in `departments` table, validated by the `publish_event()` stored procedure before namespace check.
**Rationale:** Matches the engine's existing auth pattern (operator familiarity). Rotatable without DB role gymnastics. Works equally for Go and TypeScript client libraries. Does not require per-department Postgres connection strings (one shared app user; the bus verifies at publish time).
**Tradeoffs:** Slightly weaker than PG roles for an attacker with DB-level access, but our threat model puts the DB inside the aegis-prod network (not externally exposed), and the audit log captures every publish. We can add PG-role hardening later if needed.

## Decision 4: Client Library Languages

**Options:**
1. **Go only** — matches engine; forces TS departments through HTTP
2. **TypeScript only** — matches SecurityTeam; forces Go departments through HTTP
3. **Both Go and TypeScript** — mirror APIs, more maintenance

**Chosen:** Both Go and TypeScript, with mirrored public API shapes.
**Rationale:** Operations will be Go (wraps engine + SecurityTeam, partially in each), Technology likely Go (infra tooling), but Sales & Marketing, Customer Support, and Finance are likely TypeScript (same stack as SecurityTeam). A native library in each language avoids a shared HTTP broker process and halves latency.
**Tradeoffs:** Two implementations to maintain. Mitigate by keeping each library thin — the bulk of logic is in Postgres stored procedures; the libraries are marshaling and connection management only.

## Decision 5: Governor Integration Point

**Options:**
1. **Wrapper around Anthropic SDK calls** — departments use `governor.call(anthropicClient, request)` instead of raw client
2. **HTTP proxy** — departments call a local governor HTTP server that forwards to Anthropic
3. **SDK middleware / interceptor** — plug into Anthropic SDK's extension points

**Chosen:** Wrapper function in each client library.
**Rationale:** Simplest to reason about — the department code explicitly calls the governor. No extra process, no hidden middleware, testable in isolation. The wrapper does: pre-check budget, call Anthropic, record usage, enforce post-call limits.
**Tradeoffs:** Departments must remember to use the wrapper. A direct Anthropic call bypasses the governor. Mitigation: the `anthropic.Message.usage` field is always captured in audit logs when it flows through the wrapper; SecOps can detect departments whose audit-log entries are sparse relative to their observed behavior.

## Decision 6: Anthropic Pricing Data

**Options:**
1. **Hardcoded in a constants file** — simple, needs manual update when prices change
2. **Pricing table in Postgres, updated via migration** — versioned, auditable
3. **Fetch from Anthropic API at startup** — Anthropic does not publish a pricing API

**Chosen:** Pricing table in Postgres, updated via migration.
**Rationale:** Gives us a single source of truth for cost calculations across Go and TS libraries. Price changes become git commits (audit trail). Matches the engine's `DefaultInputRateCentsPerMTok` pattern but centralizes it. Migration bump on every price change.
**Tradeoffs:** Requires discipline to update promptly when Anthropic changes prices. Acceptable; it rarely happens and departments are not cost-fragile in the short term.

## Decision 7: Constitution File Location and Loading

**Options:**
1. **File on disk, loaded once at bus startup** — simple; requires bus restart on constitution change
2. **File on disk, periodic reload (e.g., every 60s)** — no restart needed; more complex
3. **Stored in Postgres constitution table, file is source-of-truth via migration** — versioned cleanly

**Chosen:** File on disk in `/tenet-0/shared/` — `constitution.md` + `constitution-rules.yaml`. On change, a migration loads the new rules into the `constitution_versions` and `constitution_rules` tables. The stored procedure reads from these tables at publish time.
**Rationale:** Versioned in git, human-editable, enforced from Postgres. Amendments are a git commit + migration run — clear audit trail. Running agents poll the `constitution_versions` table for version changes and reload their prompt on task boundary (per spec FR-7, EC-5).
**Tradeoffs:** Two-step amendment process (edit file + run migration) vs. single-step hot-reload. The extra step is welcome friction for a governance document.

## Decision 8: Go PostgreSQL Driver

**Options:**
1. **jackc/pgx** — modern, native Postgres protocol, prepared statement support, LISTEN/NOTIFY first-class
2. **lib/pq** — older but battle-tested, database/sql compatible
3. **sqlc-generated code over pgx** — type-safe queries from SQL

**Chosen:** `jackc/pgx` (specifically `pgx/v5`)
**Rationale:** First-class LISTEN/NOTIFY support via `pgxpool.Conn.WaitForNotification`. Significantly faster than lib/pq. Active maintenance. Used in production at major scale.
**Tradeoffs:** Different API than `database/sql` (we can use `pgx/stdlib` adapter if we want `database/sql` compatibility — not needed here).

## Decision 9: Deployment — New Postgres Container

**Options:**
1. **New dedicated container** on `overnightdesk_overnightdesk` network: `tenet0-postgres:5432`
2. **Reuse `deploy-postgres-1`** (already running) with a separate database
3. **External managed Postgres** (Neon, Supabase)

**Chosen:** New dedicated container `tenet0-postgres`.
**Rationale:** Isolation. If Tenet-0 has a runaway department hammering the bus, it cannot impact n8n's Postgres or any other shared infrastructure. Separate WAL, separate resource limits. Low marginal cost (a few hundred MB RAM).
**Tradeoffs:** One more container to operate. Accepted.

## Decision 10: Delivery Semantics Implementation

**Options:**
1. **LISTEN/NOTIFY for online + polling for catch-up** — hybrid; exactly what Postgres offers
2. **Pure polling** — simpler but less real-time
3. **Pure LISTEN/NOTIFY with no catch-up** — misses events when a subscriber is offline

**Chosen:** Hybrid — LISTEN/NOTIFY for online delivery; `event_subscriptions` table tracks each subscriber's last consumed event ID; on reconnect, the library replays events since the last ID from the `events` table.
**Rationale:** Meets US-2 acceptance criterion ("offline subscribers still receive the event when they reconnect within a retention window"). At-least-once is natural — a crashed subscriber re-reads from its offset, gets duplicates; subscribers are idempotent per spec FR-5.
**Tradeoffs:** Requires per-subscriber offset tracking and a background replay loop. Complexity is in the library, not at the call site.
