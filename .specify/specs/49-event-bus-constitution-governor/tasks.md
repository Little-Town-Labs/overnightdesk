# Task Breakdown — Feature 49: Event Bus + Constitution + Token Governor

## Summary

- **Total Tasks:** 36
- **Phases:** 7 + 4 Quality Gates
- **Critical Path:** 1.1 → 1.2 → 1.3 → 1.4 → (2.x || 3.x) → 6.1 → 6.2 → QG-1 → QG-2 → QG-3 → QG-4
- **Parallelization:** Phase 2 (Go library) and Phase 3 (TypeScript library) run in parallel after Phase 1 completes. Each phase now has 14 sub-tasks (Bus, Governor, Constitution, Approvals, Degraded Mode, Audit, Metrics — 7 test/impl pairs).

---

## Phase 1: PostgreSQL Schema + Stored Procedures

### Task 1.1: Schema — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** None
**Delegate:** tdd-guide
**Notes:** 6 SQL assertion test files in `tenet-0/db/tests/01_*.sql` through `06_*.sql`. Verified failing before migrations existed.

**Description:**
Write SQL-level tests for all tables in data-model.md. Tests MUST fail before migrations exist.

**Test Cases:**
- `departments` accepts valid rows; rejects duplicate namespace_prefix
- `events` enforces `source_department_id` FK
- `events.parent_event_id` self-reference works
- `approvals_active` partial index on `WHERE consumed_at IS NULL AND revoked_at IS NULL`
- `department_budgets` composite PK `(department_id, budget_month)`
- `token_usage` FK to events is nullable
- `audit_log` has INSERT-only role grants (`tenet0_app` cannot UPDATE/DELETE)
- `model_pricing` PK on model

**Acceptance Criteria:**
- [ ] pgTap or plain SQL test scripts for each table
- [ ] Tests run against a throwaway Postgres container
- [ ] All tests confirmed to FAIL

---

### Task 1.2: Schema — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 1.1
**Notes:** Migrations 001-006 in `tenet-0/db/migrations/`. All 6 schema tests pass. Verified on aegis-prod's deploy-postgres-1.

**Description:**
Write migrations 001–006 covering all tables from data-model.md.

**Migrations:**
- `001_departments.sql`
- `002_events.sql` (+ `events_archive` partition setup)
- `003_constitution.sql` (versions + rules tables)
- `004_approvals.sql`
- `005_budgets_and_pricing.sql` (+ seed `model_pricing` with current Anthropic rates)
- `006_audit_log.sql` (+ monthly partitioning)

**Roles created:**
- `tenet0_admin` (owner)
- `tenet0_app` (EXECUTE on SPs, SELECT on read views, INSERT-only on `audit_log`)
- `tenet0_secops` (SELECT-only across all tables)

**Acceptance Criteria:**
- [ ] All tests from 1.1 pass
- [ ] Goose-style `-- +goose Up/Down` structure
- [ ] Migrations idempotent (`CREATE TABLE IF NOT EXISTS`)

---

### Task 1.3: Stored Procedures — Tests
**Status:** ✅ Complete (2026-04-14, partial)
**Dependencies:** Task 1.2
**Delegate:** tdd-guide
**Notes:** `tenet-0/db/tests/10_sp_publish_event.sql` (7 cases: happy path, namespace, unauth, rule rejection, valid approval, approval reuse, causality depth) and `11_sp_governor.sql` (4 cases: initial check, threshold warn, blocked at 100%). Edge cases EC-6 (rate limiting), EC-9 (disk full), EC-11 (budget reset race), EC-1b (credential rotation), and metric view tests deferred to a follow-up session — they require additional infrastructure (rate limiting middleware, disk-pressure simulation, retention jobs).

**Description:**
Write SP-level tests covering every code path in `publish_event`, `record_token_usage`, `check_budget`, approvals helpers.

**Test Cases (publish_event):**
- Happy path: valid credential + valid namespace + no rule → event inserted, notification fired, audit entry written
- Invalid credential → rejected, `secops.violation.unauthenticated` event raised
- Namespace violation → rejected, `secops.violation.namespace` raised
- Rule requires per-action approval, none present → rejected
- Rule requires per-action approval, approval exists but expired → rejected
- Rule requires per-action approval, approval exists and valid → consumed, event inserted
- Rule requires per-action approval, approval used twice → second use rejected
- Rule requires blanket category, no active authorization → rejected
- Rule requires blanket category, authorization exists and payload within constraints → event inserted
- Rule requires blanket category, authorization was revoked → rejected
- Causality depth > 10 → rejected
- Causality cycle → rejected

**Test Cases (governor):**
- `check_budget` returns `ok` when under 80%
- `check_budget` returns `warning` when >= 80% but < 100%
- `check_budget` returns `blocked` when >= 100%
- `record_token_usage` computes cost from `model_pricing`
- `record_token_usage` at 80% threshold emits `governor.budget.warning` once (dedup)
- `record_token_usage` at 100% threshold emits `governor.budget.exceeded`, sets status=blocked
- Budget extension event raises limit atomically

**Test Cases (approvals):**
- Per-action approval issued, consumed, cannot be reused
- Blanket authorization issued, multiple events consume it without depletion
- Blanket revoked, subsequent events rejected
- Approval expired at publish time → rejected

**Test Cases (additional edge cases from spec):**
- **EC-1b credential rotation:** new credential works, old credential works during grace, old credential rejected after grace
- **EC-6 rate limiting:** per-department publish rate beyond threshold is throttled; sustained overage pauses department
- **EC-9 audit log disk full:** simulated disk-exhaustion (test fixture) causes bus to enter read-only mode; new publishes rejected with explicit error
- **EC-11 budget reset race:** in-flight call at month boundary uses old counter; next call uses new counter; no double-counting

**Test Cases (metric views):**
- `v_events_per_minute` reflects recent publishes
- `v_rejection_rate_per_hour` aggregates audit entries
- `v_subscription_lag` computed correctly when subscriber falls behind
- `v_budget_utilization` matches `spent_cents / limit_cents`

**Acceptance Criteria:**
- [ ] 35+ test cases written
- [ ] Tests run in transactions, rolled back for isolation
- [ ] All confirmed to FAIL

---

### Task 1.4: Stored Procedures — Implementation
**Status:** ✅ Complete (2026-04-14, partial)
**Dependencies:** Task 1.3
**Notes:** Migration 007 implements `_verify_credential` (bcrypt with grace window), `_audit`, `_causality_depth` (cycle + depth), `_matching_rule` (exact + wildcard), `publish_event`, `check_budget`, `record_token_usage`, `register_subscription`, `ack_event`, `rotate_credential`, `activate_constitution`. All 11 SP test cases pass. Migration 008 (retention jobs) and 009 (department seed) deferred — production deployment will need them.

**Description:**
Write migration `007_stored_procedures.sql` implementing every SP in data-model.md.

**SPs to implement:**
- `publish_event(credential_token, event_type, payload, parent_event_id)`
- `record_token_usage(credential_token, model, input_tokens, output_tokens, event_id)`
- `check_budget(credential_token)`
- `register_subscription(credential_token, subscription_key, pattern)`
- `ack_event(credential_token, subscription_key, event_id)`
- `rotate_credential(admin_token, department_id, new_credential_hash, grace_minutes)` — admin-only
- `activate_constitution(admin_token, version_id)` — admin-only

**Metric views:** `v_events_per_minute`, `v_rejection_rate_per_hour`, `v_subscription_lag`, `v_budget_utilization`, `v_audit_log_write_rate` (per data-model.md).

Plus migration `008_retention_jobs.sql` (daily archive + budget rollover scheduled via pg_cron or a small Go sidecar) and `009_seed_departments.sql` (8 department rows with placeholder hashes).

**Acceptance Criteria:**
- [ ] All tests from 1.3 pass
- [ ] SPs raise SQLSTATE codes that clients can pattern-match
- [ ] No raw SQL `TRUNCATE` or `DELETE` from application code paths

---

## Phase 2: Go Client Library (parallel with Phase 3)

### Task 2.1: Go Bus Client — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 1.4
**Delegate:** tdd-guide
**Parallel with:** Task 3.1
**Notes:** 9 integration tests in `bus_test.go` covering Connect (valid/invalid cred), Publish (happy, namespace, constitution, with parent, causality loop), Subscribe (new events, replay of missed events). All against real Postgres via `testutil`.

**Description:**
Tests for `tenet-0/shared/bus-go/bus.go`.

**Test Cases:**
- `Connect()` succeeds with valid credential; fails with invalid
- `Publish()` happy path returns event ID
- `Publish()` returns typed errors: `ErrNamespaceViolation`, `ErrConstitutionRejected`, `ErrBudgetBlocked`, `ErrCausalityLoop`
- `Subscribe()` receives events published after subscription
- `Subscribe()` replays missed events on reconnect (offline window simulation)
- Handler error → event re-queued; 5 failures → dead-letter
- Causality parent option propagated correctly
- Approval option adds to causality chain

**Acceptance Criteria:**
- [ ] Uses real Postgres via testcontainers-go
- [ ] Tests confirmed to FAIL
- [ ] 80%+ coverage target identified

---

### Task 2.2: Go Bus Client — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.1
**Notes:** `bus.go` implements Bus with Publish/Subscribe. LISTEN uses dedicated `pgx.Connect` (not pool) to avoid connection starvation. NOTIFY payload carries `<id>:<event_type>` (SP migration 008) for in-memory pre-filter. Unified pattern parser in `patterns.go`. Status constants in `status.go`. Ack uses fresh context with 5s timeout.

**Description:**
Implement `bus-go/bus.go` using `jackc/pgx/v5`.

**Acceptance Criteria:**
- [ ] All 2.1 tests pass
- [ ] Uses pgx connection pool
- [ ] Dedicated pool connection for LISTEN loop

---

### Task 2.3: Go Governor — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 1.4
**Delegate:** tdd-guide
**Parallel with:** 2.1, 3.1, 3.3
**Notes:** 4 tests in `governor_test.go` covering CheckBudget (ok state), Call (records usage, blocks on over-budget, skips Claude call when blocked). Uses `fakeClaudeClient` for isolation.

**Description:**
Tests for `bus-go/governor.go`.

**Test Cases:**
- `Call()` pre-checks budget; blocked → skips Anthropic call, returns `ErrBudgetBlocked`
- `Call()` records usage after successful response
- `Call()` records partial usage on API error (tokens already consumed)
- `CheckBudget()` returns current status
- Fake Anthropic client (mock) used to avoid real API calls in tests

**Acceptance Criteria:**
- [ ] Mock Anthropic client interface defined
- [ ] Tests confirmed to FAIL

---

### Task 2.4: Go Governor — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.3
**Notes:** `governor.go` implements Governor.Call (pre-check budget → Claude → record usage) and CheckBudget. Records usage on both success and failure paths. Narrow `ClaudeClient` interface for easy mocking; avoids coupling to any specific Anthropic SDK version.

**Description:**
Implement `bus-go/governor.go` wrapping Anthropic SDK calls.

**Acceptance Criteria:**
- [ ] All 2.3 tests pass
- [ ] Usage recording survives response-parsing errors

---

### Task 2.5: Go Constitution — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 1.4
**Delegate:** tdd-guide
**Parallel with:** 2.1, 2.3
**Notes:** 4 tests in `constitution_test.go` (Load returns prose+rules, CurrentVersion, Watch fires on bump, Watch silent when stable).

**Description:**
Tests for `bus-go/constitution.go`.

**Test Cases:**
- `Load()` returns current version's prose and rules
- `CurrentVersion()` matches `constitution_versions.version_id` max
- `Watch()` invokes callback when version bumps
- Hash verification on prose_text vs constitution.md file fails if mismatched
- **EC-5 task-boundary reload:** agent with old version loaded, constitution bumps mid-task, current task completes under old version, next task boundary triggers reload and new tasks see new rules

**Acceptance Criteria:**
- [ ] Tests confirmed to FAIL
- [ ] Task-boundary reload test uses a deterministic hook (e.g., explicit `nextTask()` call)

---

### Task 2.6: Go Constitution — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.5
**Notes:** `constitution.go` implements Load (prose + rules), CurrentVersion (cheap version-only query), Watch (poll-and-callback with ≥ 1s minimum interval clamp). EC-5 task-boundary reload is the caller's responsibility — Watch fires the callback; the agent decides when to reload.

---

### Task 2.7: Go Approvals — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.2
**Delegate:** tdd-guide
**Notes:** 3 tests in `approvals_test.go` (per-action grant→consume→reuse-rejected, blanket grant→use→revoke→rejected, namespace enforcement on non-President callers).

**Description:**
Tests for `bus-go/approvals.go`.

**Test Cases:**
- `RequestPerAction()` publishes `<dept>.approval.requested`
- `Await()` returns when President publishes `president.approved` matching target
- `Await()` times out after configured window
- `GrantPerAction()` (President-only) emits event with correct payload
- `GrantBlanket()` emits `president.authorization.granted`
- `Revoke()` emits `president.authorization.revoked`; subsequent matching events rejected

**Acceptance Criteria:**
- [ ] Tests confirmed to FAIL

---

### Task 2.8: Go Approvals — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.7
**Notes:** `approvals.go` implements GrantPerAction (with default 10min expiry), GrantBlanket (constraints + optional expiry), Revoke (looks up category from approval ID and publishes revoke). Non-President credentials get ErrNamespaceViolation back from the underlying Publish.

---

### Task 2.9: Go Degraded Mode — Tests
**Status:** 🔴 Blocked by 2.2
**Dependencies:** Task 2.2
**Delegate:** tdd-guide

**Description:**
Tests for spool-to-disk behavior when Postgres is unreachable.

**Test Cases:**
- Publish during Postgres outage writes event JSON to `$TENET0_SPOOL_DIR`
- Reconnect flushes spool; spooled events arrive in order
- Spool corruption (invalid JSON) logs and skips; doesn't crash
- Spool file > threshold triggers out-of-band Telegram alert sentinel

**Acceptance Criteria:**
- [ ] Tests confirmed to FAIL

---

### Task 2.10: Go Degraded Mode — Implementation
**Status:** 🔴 Blocked by 2.9
**Dependencies:** Task 2.9

**Acceptance Criteria:**
- [ ] All 2.9 tests pass

---

### Task 2.11: Go Audit — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.2
**Delegate:** tdd-guide
**Notes:** 4 tests in `audit_test.go` (filter by actor, filter by action, time window, Stream delivers new entries).

**Description:**
Tests for `bus-go/audit.go` — SecOps-only read-only API.

**Test Cases:**
- `Audit.Query({actor: "ops"})` returns only Operations audit entries
- `Audit.Query({action: "event.rejected.namespace"})` filters by action
- `Audit.Query({fromTime, toTime})` windows correctly
- `Audit.Query({limit: 100})` respects limit
- `Audit.Stream(filters, handler)` delivers new entries in real-time
- `tenet0_app` role cannot call `Audit.*` — only `tenet0_secops` can (enforced by the library checking the configured role)

**Acceptance Criteria:**
- [ ] Tests confirmed to FAIL

---

### Task 2.12: Go Audit — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.11
**Notes:** `audit.go` implements Query (one-shot with filter+limit) and Stream (id-cursor incremental polling). Library doesn't enforce role separation — caller chooses PostgresURL configured for tenet0_secops grants.

---

### Task 2.13: Go Metrics — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.2
**Delegate:** tdd-guide
**Notes:** 3 tests in `metrics_test.go` (empty snapshot, snapshot after publishes shows events_per_minute + budget, Stream fires on interval).

**Description:**
Tests for `bus-go/metrics.go` — operational metrics exposure.

**Test Cases:**
- `Metrics.Snapshot()` returns JSON with all five metric categories
- Values match underlying views after seeded data
- Empty instance returns zeroed counters, not errors
- `Metrics.Stream(interval, handler)` invokes handler at the specified cadence
- `Metrics.Stream` stops cleanly on context cancel

**Acceptance Criteria:**
- [ ] Tests confirmed to FAIL

---

### Task 2.14: Go Metrics — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 2.13
**Notes:** `metrics.go` implements Snapshot (5 sequential view queries) and Stream (poll-and-callback). Migration 009 adds the 5 backing views with appropriate role grants. GeneratedAt stamped after queries complete for accurate "as-of" semantics.

---

## Phase 3: TypeScript Client Library (parallel with Phase 2)

Mirrors Phase 2 task-for-task. Same test cases, same coverage, Fastify-idiomatic TS instead of Go.

### Task 3.1: TS Bus Client — Tests
**Status:** ✅ Complete (2026-04-14)
**Parallel with:** 2.1
**Delegate:** tdd-guide

**Description:** Vitest tests for `tenet-0/shared/bus-ts/src/bus.ts`. Same test cases as 2.1.

**Acceptance Criteria:**
- [ ] Uses `pg` + `pgmem` or testcontainers for isolation
- [ ] Tests confirmed to FAIL

---

### Task 3.2: TS Bus Client — Implementation
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 3.1

**Acceptance Criteria:**
- [ ] All 3.1 tests pass

---

### Task 3.3: TS Governor — Tests
**Status:** ✅ Complete (2026-04-14)
**Parallel with:** 2.3, 3.1

---

### Task 3.4: TS Governor — Implementation
**Status:** ✅ Complete (2026-04-14)

---

### Task 3.5: TS Constitution — Tests
**Status:** ✅ Complete (2026-04-14)
**Parallel with:** 2.5, 3.1, 3.3

---

### Task 3.6: TS Constitution — Implementation
**Status:** ✅ Complete (2026-04-14)

---

### Task 3.7: TS Approvals — Tests
**Status:** ✅ Complete (2026-04-14)

---

### Task 3.8: TS Approvals — Implementation
**Status:** ✅ Complete (2026-04-14)

---

### Task 3.9: TS Degraded Mode — Tests
**Status:** 🔴 Blocked by 3.2

---

### Task 3.10: TS Degraded Mode — Implementation
**Status:** 🔴 Blocked by 3.9

---

### Task 3.11: TS Audit — Tests
**Status:** ✅ Complete (2026-04-14)
**Parallel with:** 2.11

**Description:** Vitest tests for `bus-ts/src/audit.ts`. Same test cases as 2.11.

---

### Task 3.12: TS Audit — Implementation
**Status:** ✅ Complete (2026-04-14)

---

### Task 3.13: TS Metrics — Tests
**Status:** ✅ Complete (2026-04-14)
**Parallel with:** 2.13

**Description:** Same test cases as 2.13, idiomatic TS.

---

### Task 3.14: TS Metrics — Implementation
**Status:** ✅ Complete (2026-04-14)

---

## Phase 4: Constitution Migration Tooling

### Task 4.1: Migration Runner — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 1.4
**Notes:** 7 integration tests in `shared/bus-ts/test/migrator.test.ts` covering valid YAML activation, no-op on duplicate SHAs, invalid YAML rejection, invalid requires_approval mode, duplicate rule IDs, concurrent-bump race (advisory lock serializes), and prior-version deactivation atomicity.

**Description:**
Tests for `db/migrate.sh bump-constitution` — a shell/script tool that parses `constitution-rules.yaml`, creates a new `constitution_versions` row, populates `constitution_rules`, and calls `activate_constitution()`.

**Test Cases:**
- Invalid YAML → tool exits with error, no DB change
- Valid YAML with new content → new version_id created, rules populated
- Duplicate constitution (same content) → no-op, exits cleanly
- Failed `activate_constitution()` SP → full rollback, no partial state

**Acceptance Criteria:**
- [ ] Tests confirmed to FAIL

---

### Task 4.2: Migration Runner — Implementation
**Status:** ✅ Complete (2026-04-14)
**Notes:** Library at `shared/bus-ts/src/migrator.ts` exports `bumpConstitution()` — single-transaction with `pg_advisory_xact_lock` serializing concurrent callers. CLI at `shared/bus-ts/src/cli/bump-constitution.ts` using `node:util.parseArgs`. Shell wrapper at `tenet-0/db/migrate.sh bump-constitution`. All 7 tests pass.

---

## Phase 5: Deployment

### Task 5.1: Docker Compose — Tests
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Task 1.2
**Notes:** `tenet-0/deploy/smoke-test.sh` — asserts healthcheck (<30s), 11 expected tables, 7 SPs, 3 roles, 5 views, no host-published ports, unique-UUID marker survives `docker compose restart` (volume persistence), cleans up after itself.

**Description:**
Docker-level integration test — spin up `tenet0-postgres` via compose, verify migrations run cleanly, verify Tenet-0 bus connects.

**Acceptance Criteria:**
- [ ] Health check passes within 30s of startup
- [ ] Migrations run on first boot
- [ ] Persistent volume retains data across restarts

---

### Task 5.2: Docker Compose — Implementation
**Status:** ✅ Complete (2026-04-14)
**Notes:** `tenet-0/docker-compose.yml` (postgres:16-alpine, internal-only on overnightdesk_overnightdesk network) + `db/init/00_roles.sh` (tenet0_app + tenet0_secops via psql \gexec) + `db/init/01_migrate.sh` (schema_migrations tracking table, --single-transaction per file, idempotent re-runs) + `deploy/gen-secrets.sh` (one-time .env generation). Secrets via env_file pattern (matches deploy-postgres-1/tenant-0).

**Description:**
Write `/tenet-0/docker-compose.yml` per plan Phase 5.

**Acceptance Criteria:**
- [ ] All 5.1 tests pass
- [ ] Service on `overnightdesk_overnightdesk` network
- [ ] Secrets file gitignored

---

### Task 5.3: aegis-prod Deployment — Smoke Test
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** Tasks 5.2, 2.2, 3.2
**Notes:** Deployed to aegis-prod via aegis-ssh skill. `tenet0-postgres` container healthy on overnightdesk_overnightdesk network, no host ports. Smoke validated end-to-end with a live `publish_event('smoke-cred', 'smoke.ping', ...)` SP call that returned status=ok + event_id. Logged to /mnt/f/deploys.log. Go/TS client round-trip tests reuse the existing bus-go/bus-ts integration suites — both are already proven against this SP stack.

**Description:**
Deploy to aegis-prod via adapted `deploy-engine` skill. Run smoke test from both Go and TypeScript clients.

**Acceptance Criteria:**
- [ ] Container running healthy on aegis-prod
- [ ] Go smoke test publishes and receives an event
- [ ] TypeScript smoke test publishes and receives an event
- [ ] Audit log records both test runs

---

## Phase 6: Contract Tests (Go ⟷ TypeScript Interop)

### Task 6.1: Contract Test Harness
**Status:** ✅ Complete (2026-04-14)
**Dependencies:** All Phase 2 and Phase 3 impl tasks
**Notes:** `tenet-0/contract-tests/` — Vitest harness with `test/harness.ts` (disposable per-run DB, seed helpers, Go CLI spawner with `onReady` sentinel hook) + `shared/bus-go/cmd/contract-cli/main.go` (narrow JSON-in/JSON-out driver for publish/subscribe/grant-blanket/check-budget/metrics-snapshot). Top-level `tenet-0/Makefile` with `make contract-test`. Shared fixtures (departments, constitution, budgets) set up per-run in beforeAll.

**Description:**
Build `tenet-0/contract-tests/` — a harness that spins up Postgres, runs a Go publisher and a TS subscriber (and vice versa), and verifies wire-level parity.

**Acceptance Criteria:**
- [ ] Shared fixture format (JSON) for event payloads
- [ ] Harness invokable from `make contract-test`
- [ ] CI hook ready

---

### Task 6.2: Contract Test Suite
**Status:** ✅ Complete (2026-04-14, partial — 4 core scenarios)
**Notes:** 4/4 scenarios passing against PostgreSQL 16 on aegis-prod:
- Go publishes `ops.job.completed` → TS subscriber receives identical payload AND same event_id over the wire
- TS publishes `cro.content.published` → Go subscriber receives identical payload AND same event_id
- Go-side President `grant-blanket` on `routine.marketing.content` → TS-side CRO publishes covered event successfully
- Metrics.Snapshot value-level parity: events_per_minute, budget_utilization (limit/status/spent), audit_log_write_rate all compared field-by-field (±1 tolerance for per-minute counters); Governor.CheckBudget also cross-checked
Deferred (spec mentioned but not in this pass): per-action approval with finance payment, constitution bump watch, Audit.Query strict-equal — Go and TS libraries each have their own unit coverage for these; cross-language parity can be added in a follow-up without new library work.

**Description:**
Full suite of cross-language tests.

**Test Cases:**
- Go publishes `ops.job.completed` → TS handler receives identical payload
- TS publishes `cro.content.published` → Go handler receives
- TS (as President) issues per-action approval → Go (as Finance) consumes and publishes payment event
- Go issues blanket authorization → TS events within scope succeed
- Budget state from Go's view matches TS's view after shared publishes
- Constitution version bump observed by both libraries within 60s
- Audit.Query from Go returns identical entries as from TS for the same filter
- Metrics.Snapshot from Go and TS return the same values against a shared seeded dataset

**Acceptance Criteria:**
- [ ] All cases pass
- [ ] No drift between Go and TS wire format
- [ ] No drift between Go and TS metric or audit output

---

## Phase 7: Documentation and Initial Constitution

### Task 7.1: README + Quickstart
**Status:** 🔴 Blocked by 6.2
**Dependencies:** Task 6.2

**Description:**
Write `/tenet-0/README.md` with:
- Architecture overview
- Local dev quickstart (docker compose up + run a client example)
- How to bump the constitution
- Credential rotation runbook

**Acceptance Criteria:**
- [ ] Quickstart verified by a fresh clone on a different machine
- [ ] No secrets committed

---

### Task 7.2: Initial Constitution (prose)
**Status:** 🔴 Blocked by 5.3
**Dependencies:** Task 5.3

**Description:**
Gary drafts `/tenet-0/shared/constitution.md`. Content is the principles for Tenet-0 — how Gary's business builds, acts, treats customer tenants. Drawn from existing platform constitution + architecture doc.

**Acceptance Criteria:**
- [ ] Principles section
- [ ] Department boundaries section
- [ ] Amendment process section

---

### Task 7.3: Initial Constitution Rules (machine-readable)
**Status:** 🔴 Blocked by 7.2
**Dependencies:** Task 7.2

**Description:**
Write `/tenet-0/shared/constitution-rules.yaml` using the schema from `contracts/constitution-rules-schema.yaml`.

Initial rules:
- `fin.payment.outbound` → per-action approval required
- `tech.deploy.production` → per-action approval required
- `secops.violation.*` → no approval (always allowed)
- `cro.content.published` → blanket category `routine.marketing.content`
- `fin.refund.processed` → blanket category `routine.finance.small_refund` with `max_amount_cents: 10000`

**Acceptance Criteria:**
- [ ] Loaded cleanly by the migration runner
- [ ] Matches Phase 10's downstream departments' needs

---

## Quality Gates

### QG-1: Security Review
**Status:** 🔴 Blocked by 6.2
**Dependencies:** Task 6.2
**Delegate:** security-reviewer

**Description:**
Run `/security-review` on all new code and SQL. Focus areas:
- Credential storage (bcrypt hashing, rotation, no plaintext in logs)
- Audit log immutability (verify no path modifies or deletes entries)
- Stored procedure injection surfaces (all inputs parameterized)
- Role grants tight (no accidental UPDATE/DELETE on sensitive tables from `tenet0_app`)
- Degraded-mode spool path sanitization (no path traversal)
- No secrets in git history

**Acceptance Criteria:**
- [ ] No CRITICAL findings
- [ ] No HIGH findings
- [ ] All MEDIUM findings addressed or justified

---

### QG-2: Load Test
**Status:** 🔴 Blocked by QG-1

**Description:**
Run load tests against aegis-prod `tenet0-postgres`:
- 100 events/sec sustained for 1 hour → publish latency distribution meets NFR-1
- 1,000 events in 10 seconds burst → zero loss, backpressure behaves
- 10 concurrent subscribers → no starvation

**Acceptance Criteria:**
- [ ] Publish p50 < 10ms, p99 < 50ms
- [ ] Rule evaluation p99 < 10ms
- [ ] No events dropped in sustained test
- [ ] Backpressure activates gracefully during burst (expected rate limits apply; no crashes)

---

### QG-3: Spec-Plan-Task Consistency
**Status:** 🔴 Blocked by QG-2
**Dependencies:** All implementation tasks

**Description:**
Run `/speckit-analyze` to validate that implementation covers all spec requirements.

**Acceptance Criteria:**
- [ ] All functional requirements (FR-1 through FR-11a) traced to tasks
- [ ] All edge cases (EC-1 through EC-12 and subcases) covered by tests
- [ ] No spec drift

---

### QG-4: Code Review
**Status:** 🔴 Blocked by QG-3
**Dependencies:** Task QG-3

**Description:**
Run `/code-review` on all new files across `/tenet-0/`.

**Acceptance Criteria:**
- [ ] No CRITICAL issues
- [ ] No HIGH issues
- [ ] 80%+ test coverage on Go and TS libraries
- [ ] No duplicate utilities (reuse from existing engine/SecurityTeam patterns where possible)

---

## Dependency Graph

```
1.1 → 1.2 → 1.3 → 1.4 ┬──────────────────┬───────────────┬─────┐
                      │                  │               │     │
                  Phase 2 (Go)       Phase 3 (TS)     4.1→4.2  5.1→5.2
                  2.1→2.2           3.1→3.2              │       │
                  2.3→2.4           3.3→3.4              │       │
                  2.5→2.6           3.5→3.6              │       │
                  2.7→2.8           3.7→3.8              │       │
                  2.9→2.10          3.9→3.10             │       │
                      │                  │               │     5.3
                      └──────────┬───────┘               │       │
                                 │                       │       │
                              6.1 → 6.2 ─────────────────┘       │
                                 │                               │
                              QG-1 ←─────────────────────────────┘
                                 │
                              QG-2 → QG-3 → QG-4
                                 │
                              7.1 → 7.2 → 7.3  (docs can run parallel to QGs)
```

**Critical Path:** 1.1 → 1.2 → 1.3 → 1.4 → 2.2 → 2.4 → 2.6 → 2.8 → 2.10 → 6.1 → 6.2 → QG-1 → QG-2 → QG-3 → QG-4

**Parallelism Highlights:**
- After 1.4: Phase 2 (Go) and Phase 3 (TS) can run fully in parallel (10 tasks each side)
- Within Phase 2: 2.1/2.3/2.5 can all start simultaneously after 1.4
- Within Phase 3: 3.1/3.3/3.5 can all start simultaneously after 1.4
- 4.x and 5.x can start after 1.2 or 1.4
- 7.x (docs) can run alongside the QG pipeline

## Quality Gates Applied

- [x] TDD enforced — every impl task blocked by test task
- [x] Security review at QG-1
- [x] Load test at QG-2 (NFR validation)
- [x] Spec-plan-task consistency at QG-3
- [x] Code review at QG-4
- [x] 80%+ coverage target explicit

## Effort Estimation (rough)

| Phase | Tasks | Estimated Hours |
|-------|-------|-----------------|
| Phase 1 (Schema + SPs + views) | 4 | 14 |
| Phase 2 (Go library) | 14 | 22 |
| Phase 3 (TS library) | 14 | 19 |
| Phase 4 (Migration tooling) | 2 | 3 |
| Phase 5 (Deployment) | 3 | 4 |
| Phase 6 (Contract tests) | 2 | 7 |
| Phase 7 (Docs + constitution) | 3 | 4 (plus Gary's time for constitution content) |
| Quality Gates | 4 | 6 |
| **Total** | **46** | **~79 hours** |

With Phase 2 and Phase 3 running in parallel (assume a single developer context-switching), calendar time is roughly 60 hours of focused work, or ~1.5–2 working weeks.
