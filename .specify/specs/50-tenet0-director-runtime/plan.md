# Feature 50 — Implementation Plan

**Spec:** `.specify/specs/50-tenet0-director-runtime/spec.md`
**Status:** Draft (post `/speckit-plan`, pre `/speckit-tasks`)
**Constitution:** v1.0.0 (`.specify/memory/constitution.md`); amendment for `memory_access_matrix` + `memory_scrubber` sections enacted as part of Phase 1

## Executive Summary

Feature 50 is the **runtime platform** for Tenet-0's corporate hierarchy: Zero IS the President, Directors are Claude Code subagent markdown files, and the supporting infrastructure is a focused set of small Go MCPs and background daemons. The deliverable is six Go MCP servers (spawned as stdio subprocesses by Zero's Claude Code runtime), four background daemons (one container each), a Postgres `president` schema, the Director interface contract (markdown convention), and one reference Director (`president.md`).

**Core technical choices (locked):**
- **Module:** single Go module at `tenet-0/go.mod` containing all 10 binaries under `cmd/`
- **MCP framework:** `github.com/mark3labs/mcp-go` (pinned commit, gated by RES-1 verification)
- **HTTP framework:** chi for daemon `/healthz` + `/metrics`
- **Postgres driver / migrations:** pgx/v5 + goose v3
- **Postgres:** `president` schema in the existing Feature 49 instance
- **Container topology:** four daemon containers, six MCPs as stdio subprocesses of Zero
- **Operator auth:** Ed25519 from operator device (comm-module is untrusted transport)
- **MCP authentication:** per-spawn HMAC binding `(namespace || nonce)` injected by Zero
- **Audit integrity:** SHA256 hash chain + Postgres role-based append-only + `BEFORE UPDATE/DELETE` trigger
- **Bus → Zero routing:** `POST /v1/inject/zero` on comm-module (default); polling fallback if comm-module slips
- **Cost invariant (NFR-7):** zero new Anthropic API spend; OAuth subscription covers all Director reasoning

**Estimated effort:** ~28 days (~6 weeks) on the critical path. Seven implementation phases. Phase 0 is mostly research-as-tests (mark3labs spike, comm-module API confirmation, subagent spawn measurement).

## Architecture Overview

### Topology

```
                        ┌──────────────────────────────────────────┐
                        │           operator (Telegram)            │
                        └──────────────────┬───────────────────────┘
                                           │ HTTPS
                              ┌────────────▼────────────┐
                              │ overnightdesk-nginx :443│
                              └────┬───────────────┬────┘
                                   │               │
              ┌────────────────────▼──┐   ┌────────▼──────────────┐
              │ communication-module  │   │ platform-orchestrator │
              │ (Telegram bridge,     │   │  (Feature 58)         │
              │  +/v1/inject/zero)    │   └────────┬──────────────┘
              └────┬─────────────▲────┘            │
                   │ HTTP        │ HTTP            │
        push-to-Zero│         response             │
                   │             │                 ▼
            ┌──────▼─────────────┴──┐    platform-orchestrator-db
            │   tenant-0 (Zero)     │
            │  Claude Code session  │
            │  ┌─────────────────┐  │
            │  │ MCPs (stdio)    │  │   6 subprocesses spawned
            │  │ bus, const,     │  │   on demand by Zero's
            │  │ gov, pending,   │  │   Claude Code runtime
            │  │ audit, memory   │  │
            │  └────────┬────────┘  │
            └───────────┼───────────┘
                        │ pgx (per-MCP cred)
                        ▼
            ┌───────────────────────────────────────┐
            │       tenet0-postgres (LISTEN/NOTIFY) │
            │   bus.events / bus.audit_log / ...    │
            │   president.* (this feature's schema) │
            └─▲───────▲──────────▲────────▲─────▲───┘
              │       │          │        │     │
        bus-watcher health-poll dead-sweep audit (future)
        :9201    :9202        :9203     self-checker  securityteam
                                          :9204
              │
              └─ HTTP POST → comm-module /v1/inject/zero (synthetic operator msg → Zero)
```

All on `overnightdesk_overnightdesk` Docker bridge. No new external ports. `/metrics` exposed on bridge only.

### Package Layout

```
tenet-0/
  go.mod                              # single module; replace ./shared/bus-go
  go.sum
  cmd/
    bus-mcp/main.go                   # 6 MCP server entry points
    constitution-mcp/main.go
    governor-mcp/main.go
    pending-mcp/main.go
    audit-mcp/main.go
    director-memory-mcp/main.go
    bus-watcher/main.go               # 4 daemon entry points
    healthcheck-poller/main.go
    deadline-sweeper/main.go
    audit-self-checker/main.go
  internal/
    shared/
      config/         # env loader; Phase.dev fail-closed
      pgxutil/        # pgxpool + role-aware DSN selection
      mcp/            # mark3labs harness wrapper: stdio bind, slog, panic recovery
      buslisten/      # Postgres LISTEN/NOTIFY helper
      hashchain/      # SHA256 chain extension + verify
      scrubber/       # 7-layer PII catalog + tester fixtures
      accessmatrix/   # YAML loader + enforcement
      lifecycle/      # markdown contract parser + fsnotify watcher
      credentials/    # per-Director credential resolver (HMAC verifier)
      operatorch/     # OperatorNotifier interface + comm-module impl + polling impl
      metrics/        # prom registry + standard histograms/counters
    bus/              # bus-mcp tool handlers
    constitution/     # constitution-mcp tool handlers
    governor/         # governor-mcp tool handlers
    pending/          # pending-mcp tool handlers + state machine
    audit/            # audit-mcp tool handlers
    memory/           # director-memory-mcp tool handlers + index rebuilder
    daemons/
      buswatcher/
      healthcheck/
      deadline/
      selfaudit/
    store/
      migrations/     # 050_*.sql
      queries/        # query helpers per table
  shared/
    bus-go/           # Feature 49 — DO NOT TOUCH
    bus-ts/           # Feature 49 — DO NOT TOUCH
    constitution.md   # amended in Phase 1 to add President-Director model section
    constitution-rules.yaml  # amended to add memory_access_matrix + memory_scrubber
  agents/
    president.md      # the reference Director (FR-24)
  db/
    migrate.sh        # existing goose runner; learns 050_* range
```

### The `llm.Agent` analogue: the 6 MCP boundary

Unlike the deleted prior Feature 50 design (which had an `llm.Agent` interface to isolate the SDK), this feature has **no LLM client in our code at all**. Director subagents reach Anthropic via Claude Code's own OAuth-backed runtime — we never touch the API. The 6 MCP servers are the only Go-side surface Directors interact with; they expose tools, not LLM calls.

### Concurrency Model

Per architect §5; restated by daemon:

| Daemon | Goroutines | Purpose |
|---|---|---|
| `bus-watcher` | 3 | Listener (LISTEN connection); Forwarder (channel drain → POST comm-module → cursor update); Health (`/healthz` + `/metrics`) |
| `healthcheck-poller` | 2 | Ticker fan-out (60s); fsnotify watcher (5s debounce, OQ-1) |
| `deadline-sweeper` | 1 | Idempotent `UPDATE pending_approvals ... RETURNING` per tick |
| `audit-self-checker` | 2 | 15-min sample checks; nightly full chain (mutex prevents overlap) |

NFR-1 (5s notification latency) achievable: PG NOTIFY ~50ms + fetch ~50ms + HTTP POST ~200ms + comm-module → Zero delivery ~500ms ≈ 800ms typical, ~4s headroom.

## Technology Stack

| Layer | Choice | Rationale | Alternatives Rejected |
|---|---|---|---|
| Language | Go 1.25 | Matches Feature 49, engine, orchestrator | Python (mismatch); Rust (no team familiarity) |
| MCP framework | `mark3labs/mcp-go` (pinned commit) | Only realistic Go option; stdio + JSON Schema validation | In-house JSON-RPC shim (fallback per RES-1); no Anthropic Go SDK exists |
| HTTP router (daemons) | chi | Stdlib-shaped, right-sized for `/healthz` + `/metrics` | Echo (over-equipped); fiber (cgo); stdlib-only (more code) |
| Postgres driver | pgx/v5 + pgxpool | Native LISTEN/NOTIFY; matches Feature 58 | lib/pq (maintenance mode); sqlx (no benefit) |
| Migrations | Extended `migrate.sh apply-pending` subcommand (psql + `schema_migrations` tracking table) | Matches Feature 49's existing tooling pattern (bash + psql + node, no Go-side migration runner). Avoids introducing goose to a project that hasn't needed it. **REVISED 2026-04-19 per RES-6.** | goose v3 (rejected — would be a third migration approach in the project); golang-migrate; sqitch |
| Logger | slog (stdlib) | Structured, performant | zerolog (external) |
| Metrics | Prometheus client | Matches engine convention | OpenTelemetry-only (more setup) |
| File watcher | `fsnotify/fsnotify` | Standard Go file system watcher | Polling (fallback only) |
| Container base | `gcr.io/distroless/static-debian12:nonroot` | Matches orchestrator; minimal surface | alpine (larger surface) |
| Config | env vars only, Phase.dev injection | Matches engine + orchestrator | YAML configs (only constitution + matrix + scrubber are file-loaded, bind-mounted ro) |

## Technical Decisions

Full detail in `research.md`. Headlines:

1. **Module: monorepo.** Single `tenet-0/go.mod` for all 10 binaries; `replace` directive points at `./shared/bus-go`.
2. **Container topology: per-daemon containers; MCPs as stdio subprocesses of Zero.** Resolves OQ-4. Constitutional Principle 4 satisfied — different cadences require different blast radii.
3. **MCP framework: mark3labs/mcp-go.** RES-1 spike validates schema/concurrency/cancellation in early Phase 1; pivot to in-house shim if it fails.
4. **Operator auth: Ed25519 signed on operator device.** Comm-module is untrusted transport. Stronger than the prior plan's "comm-module signs" model (T4).
5. **Reserved-namespace registration: operator-signed manifest.** Director markdown files claiming `president` or `secops` require Ed25519 sig over `(department, mcp_grants, file_hash)` (T3).
6. **MCP server auth: per-spawn HMAC binding.** Zero supplies `DIRECTOR_NAMESPACE` and `DIRECTOR_AUTH=HMAC(namespace || nonce, DIRECTOR_HMAC_SECRET)` per Task spawn. Defeats LLM-context impersonation (T5/§3).
7. **Audit integrity: SHA256 hash chain + Postgres role separation.** `president_app` role INSERT-only on `decision_log`; `BEFORE UPDATE/DELETE` trigger; sample validation every 15 min, full nightly.
8. **Bus → Zero routing: `POST /v1/inject/zero` on comm-module.** Architect §3 picks Option A; comm-module owner coordination required (RES-2).
9. **PII scrubber: 7-layer defense.** Unicode normalize → encoding decode → 5 pattern checks → high-entropy check. Catalog versioned in `constitution-rules.yaml`. SecOps re-scans with newer rule versions (Feature 57 future).
10. **Memory access matrix: in `constitution-rules.yaml`.** Fail-closed loader; no runtime in-place reload (defeats privilege-shift attacks).
11. **`visible_to` field on every memory row.** Resolves OQ-3. Default empty; rate-limited per Director (T10).
12. **Constitution-version stamp on every memory row.** Resolves OQ-2. Enables drift re-evaluation.
13. **Spawn telemetry via governor-mcp.** Resolves OQ-5. `record_spawn_telemetry` tool. Token-equivalent measurement only — NFR-7 hard.

## The 6 MCP Servers

For full tool signatures see `contracts/mcp-tool-contracts.yaml`.

### `tenet0-bus-mcp`
- **Purpose:** wraps `shared/bus-go`; lets Directors publish/subscribe/query bus events
- **Tools:** `publish_event`, `query_events`, `get_event`, `walk_causality`, `list_unprocessed_events` (polling fallback)
- **State:** `bus.events` (Feature 49)
- **Credentials:** Per-Director bus credential (Feature 49 FR-2a), env `TENET0_BUS_CREDENTIAL_<DEPT>`
- **Concurrency:** stateless; one shared pgxpool

### `tenet0-constitution-mcp`
- **Purpose:** Feature 49 constitution evaluator + the new memory access matrix
- **Tools:** `requires_approval`, `evaluate_rule`, `list_rules`, `get_constitution_version`, `get_memory_access_matrix`
- **State:** `constitution-rules.yaml` (file read, cached, hash-pinned at startup)
- **Credentials:** read-only; no per-Director auth
- **Concurrency:** atomic-pointer swap on rules reload (manual SIGHUP only)

### `tenet0-governor-mcp`
- **Purpose:** Token-equivalent measurement per Director (NFR-7 — no per-token billing)
- **Tools:** `record_spawn` / `record_spawn_telemetry` (OQ-5), `get_director_usage`, `get_capacity_snapshot`, `record_inline_decision`
- **State:** `president.governor_ledger`
- **Credentials:** per-Director write; President read-all
- **Concurrency:** append-only; bulk-insert batching

### `tenet0-pending-mcp`
- **Purpose:** Pending-approvals durable queue + state machine
- **Tools:** `enqueue`, `claim_for_decision` (atomic CAS), `record_decision`, `transition`, `list_pending`, `get`, `expire_overdue` (called by deadline-sweeper)
- **State:** `president.pending_approvals`
- **Credentials:** President write; per-Director write scoped to their dept; read-all for President + SecOps
- **Concurrency:** `claim_for_decision` uses `UPDATE ... WHERE status = 'pending' RETURNING` for race-free claim

### `tenet0-audit-mcp`
- **Purpose:** Decision log read + hash chain validation
- **Tools:** `record_decision` (INSERT-only), `read_decisions`, `validate_chain`, `validate_sample`, `get_chain_head`
- **State:** `president.decision_log`
- **Credentials:** President write; President + SecOps read
- **Concurrency:** chain extension serialized via `SELECT ... FOR UPDATE` on sentinel row in `decision_log_chain_state`

### `tenet0-director-memory-mcp`
- **Purpose:** Per-Director namespaced memory with access-matrix enforcement and pre-write PII scrubber
- **Tools:** `load_memory_index`, `read_memory`, `search_memory` (FTS), `write_memory` (scrubber + matrix + INSERT + index rebuild), `update_memory` (append with supersedes), `forget_memory`
- **State:** `president.director_memory` + `president.director_memory_index`
- **Credentials:** Per-Director scoped (HMAC verified per call); matrix from constitution-mcp re-fetched on every call (no caching, NFR-6)
- **Concurrency:** index rebuild debounced per-dept (5s coalesce)

## The 4 Daemons

For full health endpoint and metric specifications see `contracts/daemon-health-contracts.yaml`.

### `tenet0-bus-watcher`
- **Purpose:** LISTEN on `tenet0-postgres` event_bus channel; route notifications to Zero via comm-module; also runs lifecycle file-system watcher
- **Container:** `mem_limit: 128m`, `pids_limit: 64`, port `:9201` (metrics)
- **Failure modes:** Postgres connection drop → reconnect + replay from `bus_watcher_state.last_acked`; comm-module drop → fall through to polling notifier + publish `president.notification.degraded`; crash → events queue durably (Feature 49 NFR-3)
- **Notifier:** `OperatorNotifier` interface, two implementations (CommModuleNotifier default; PollingShim fallback)
- **Lifecycle watcher:** fsnotify on `~/.claude-agent-zero/agents/` with 5s debounce, requires bind-mount (RES-7)

### `tenet0-healthcheck-poller`
- **Purpose:** Every 60s probe MCP-server liveness for each registered Director (FR-18)
- **Container:** `mem_limit: 64m`, port `:9202`
- **Probe:** subprocess `<mcp-binary> --healthcheck` (exit 0 = healthy, 2s timeout) — RES-4 will confirm shape
- **Mounts:** read-only `/agents` (Director registry hashes), read-only `/mcps` (MCP binary subprocess invocation)
- **State machine:** transitions only persisted to `mcp_liveness` + published as `*.lifecycle.degraded/recovered` events; raw poll results in memory only

### `tenet0-deadline-sweeper`
- **Purpose:** Every 60s expire pending approvals past `operator_deadline` (FR-20)
- **Container:** `mem_limit: 64m`, port `:9203`
- **Idempotent:** single SQL `UPDATE pending_approvals SET status='expired' ... RETURNING` per tick; one `president.rejected` per row published
- **Backstop:** advisory lock prevents accidental double-instance

### `tenet0-audit-self-checker`
- **Purpose:** Every 15 min verify `decision_log` ↔ bus audit log; sample-validate hash chain; nightly full chain (FR-21)
- **Container:** `mem_limit: 256m` (for full chain validation), port `:9204`
- **Cycles:** 15-min sample (1k random rows) + 24h full chain at 03:00 UTC
- **Findings:** raise `secops.violation.{namespace_impersonation,audit_gap,audit_corruption,matrix_drift}` events

## Director Interface Contract (FR-23)

Every Director markdown file MUST follow this structure (full schema in `contracts/director-markdown-contract.yaml`):

```markdown
---
identity:
  name: <human-readable>
  department: <namespace, ^[a-z][a-z0-9_]+$>
bus_namespace: <equals department>
mcp_grants:
  - tenet0-bus-mcp
  - tenet0-constitution-mcp
  - ... (subset of the global 6)
constitution_version: ">=1.1.0"
operator_signature: <base64 Ed25519, REQUIRED for reserved namespaces>
---

# <Name> — <Charter Title>

## Charter
<one-paragraph mission>

## Decision Protocol
<how this Director makes decisions; for the President, see reference president.md>

## Memory Protocol
<standard footer instructing load_memory_index → search → write>

## Constitutional Acknowledgment
<explicit statement that the Director operates within constitution v1.1+>
```

**Validator:** lives at `internal/shared/lifecycle/validator.go`. Used by both the lifecycle daemon (runtime registration validation) and a CI-only `cmd/validate-director` binary (golden-file regression tests on `president.md`). Failures publish `secops.violation.registry_invalid`; reserved-namespace registrations without valid operator signature are quarantined.

## Memory Subsystem

Schemas in `data-model.md`. Key invariants:

- **Access matrix in `constitution-rules.yaml`** under `memory_access_matrix`. Loaded at MCP startup, hash-pinned, fail-closed. No runtime in-place reload — amendments require MCP restart.
- **PII scrubber catalog** in `constitution-rules.yaml` under `memory_scrubber`. 7 layers (Unicode normalize → encoding decode → 5 patterns → high-entropy). Versioned with the constitution.
- **Append-only enforcement:** Postgres role grants + trigger; `update_memory` creates new row with `superseded_by`; `forget_memory` marks superseded with audit-logged reason.
- **30-day expiry on `state` type only** via daily maintenance task (CL-3). Charter / decision / pattern / reference persist indefinitely.
- **Caps:** soft warn at 1k entries (publish `president.memory.cap_warned`); hard reject at 5k (publish `president.memory.cap_rejected`).
- **`visible_to` field** for cross-namespace sharing (OQ-3); rate-limited per Director (security T10).
- **`constitution_version` column** on every row (OQ-2) for drift re-evaluation.

## Reference Director: `president.md`

Ships at `tenet-0/agents/president.md` (deployed to `~/.claude-agent-zero/agents/president.md` on aegis-prod). Frontmatter declares all 6 MCP grants; namespace=`president`; operator-signed manifest required (reserved namespace).

Body sections:
- **Charter:** Zero is the President of Tenet-0. Receives bus events, synthesizes patterns, decides pre-approval requests beyond rules, surfaces to operator when reasoning warrants human judgment. NOT a separate process — IS Zero, acting in the President role when inbound is bus-framed.
- **Decision Protocol:** the 5-step flow: constitution-mcp.requires_approval → pending-mcp.claim → rule/LLM dispatch → record_decision → publish outcome.
- **Memory Protocol:** the standard footer (load_memory_index FIRST; search before deciding; write decision after; use update_memory to consolidate).
- **Constitutional Acknowledgment:** Principle 1 absolute; pre-write scrubber is safety net not permission.

## Implementation Phases

TDD throughout (Constitution Test-First Imperative). Every implementation task has a preceding test task that must FAIL before implementation begins.

### Phase 0 — Research & Spike (3 days)

- RES-1: validate mark3labs/mcp-go on schema/concurrency/cancellation/version. Pin commit. Decide proceed vs in-house shim.
- RES-2: coordinate with comm-module owner on `/v1/inject/zero` design. If owner unavailable, pivot to polling fallback for MVP.
- RES-3: measure Claude Code subagent spawn baseline on aegis-prod (cold spawn, parallel limit, MCP-grant-failure semantics).
- RES-4: confirm MCP liveness probe shape (subprocess `--healthcheck` flag).
- RES-5: confirm Feature 49 publishes only event ID on LISTEN/NOTIFY (not full payload).
- RES-6: confirm `migrate.sh` handles cross-schema migrations.
- RES-7: confirm aegis-prod can bind-mount `~/.claude-agent-zero/agents/`.

Each result documented in `research.md` updates. Phase 0 ends with **GO/NO-GO** memo on each RES item.

### Phase 1 — Foundation (4 days)

- Repo skeleton, `tenet-0/go.mod` with monorepo + `replace`
- `internal/shared/{config, pgxutil, mcp, hashchain, scrubber, accessmatrix, lifecycle, credentials, operatorch, metrics}` shared packages
- All 050_*.sql migrations applied; `tenet-0/db/migrate.sh` updated
- Constitution amendment for `memory_access_matrix` + `memory_scrubber` sections (owner approval, version bump to v1.1.0)
- `wire.go` patterns for each binary established

**Tests:** unit on every shared package; integration via testcontainers Postgres applies migrations end-to-end.

**Acceptance:** `go test ./...` green; one binary (smallest = `audit-mcp`) boots and serves a stub tool call against testcontainers PG.

### Phase 2 — MCP Servers (5 days)

In dependency order:
- `tenet0-bus-mcp` (depends only on `shared/bus-go`)
- `tenet0-constitution-mcp` (depends on shared accessmatrix loader)
- `tenet0-pending-mcp` (depends on bus-mcp, constitution-mcp)
- `tenet0-audit-mcp` (depends on shared hashchain)
- `tenet0-governor-mcp` (depends on bus-mcp)
- `tenet0-director-memory-mcp` (depends on accessmatrix, scrubber, governor-mcp)

**Tests:** unit per tool handler; integration via testcontainers; MCP protocol conformance (mark3labs's `tools/list`, `tools/call`); HMAC auth verification; access matrix conformance suite (60 cases: every (caller, target, op) cell of the 7-namespace matrix).

**Acceptance:** all 6 MCPs answer their full tool surface; each `tools/call` for a write-class tool produces correct DB state + violations on bad input.

### Phase 3 — Daemons (4 days)

- `tenet0-bus-watcher` (most complex — comm-module integration + fsnotify + polling fallback)
- `tenet0-healthcheck-poller`
- `tenet0-deadline-sweeper`
- `tenet0-audit-self-checker`

**Tests:** mock comm-module HTTP server (records POST bodies); testcontainers Postgres with synthetic bus traffic; fsnotify events injected via `os.WriteFile`; deadline expiry verified via clock manipulation; hash chain corruption injected to verify audit-self-checker raises violation.

**Acceptance:** each daemon survives 1-hour soak test against testcontainers stack; restart preserves state via `bus_watcher_state` cursor / mcp_liveness table.

### Phase 4 — Director Memory + Reference Director (4 days)

- Memory subsystem hardened: scrubber 7-layer test suite (known-good + adversarial corpus); access matrix conformance reused from Phase 2; cap enforcement at 1k/5k; `visible_to` filtering; 30-day state expiry maintenance task; `constitution_version` stamp.
- `tenet-0/agents/president.md` written and golden-file tested.
- CI `cmd/validate-director` binary built; runs in CI on every PR touching `agents/`.
- Operator-signed manifest infrastructure: Ed25519 verification path, registration of operator pubkeys.

**Tests:** scrubber adversarial corpus (50 known-bad payloads, 20 known-good); validator golden file for `president.md`; manifest signature verification with valid + invalid signatures.

**Acceptance:** president.md validates; reserved-namespace forgery fails; scrubber adversarial corpus passes 100%.

### Phase 5 — Operator Surfacing + Telegram (4 days)

- Operator decision Ed25519 verification end-to-end (operator → Telegram → comm-module → bus → Zero → president-mcp.record_decision).
- Operator nonce lifecycle (issue → consume → expire); idempotency replay returns cached decision.
- Comm-module integration testing: `/v1/inject/zero` happy path; signature mismatch rejected; nonce replay returns idempotent reply; expired nonce rejected; expired approval auto-rejected.
- Polling fallback path tested.
- Direct Telegram client (last-resort fallback) implemented and gated behind `OPERATOR_NOTIFIER` env.

**Tests:** end-to-end approval flow with mock operator (signing key in test fixture); comm-module mock; coverage of EC-3, EC-7.

**Acceptance:** US-5 acceptance criteria pass; operator round-trip < 30s on testcontainers stack.

### Phase 6 — Hardening + Deploy (4 days)

- Audit self-check end-to-end: forge a `president.*` event with no matching `decision_log` row → verify `secops.violation.namespace_impersonation` raised within one cycle. Inject hash chain corruption → verify `secops.violation.audit_corruption`.
- Constitution re-evaluation (FR-10) warn-only mode wired.
- Load test: 50 simulated Directors + synthetic event stream; verify NFR-1 thresholds.
- Container builds: `tenet-0/Dockerfile.{bus-watcher,healthcheck-poller,deadline-sweeper,audit-self-checker}` (distroless static, non-root, ARM64+amd64).
- docker-compose entries on aegis-prod.
- nginx route NOT added (bridge-only).
- Deploy runbook (`tenet-0/docs/runbooks/director-runtime-deploy.md`).
- First aegis-prod deploy with no Directors registered (runtime should idle gracefully).
- Smoke test: publish synthetic test event, verify bus-watcher routes to Zero, Zero acknowledges via inline decision.

**Acceptance:** all spec FRs and NFRs verified on aegis-prod; constitutional gates green; deployed; metrics green for 24h.

## Security Strategy

Full detail in `research.md` (decisions) and security-reviewer's threat model (integrated below). Critical items (block first deploy):

- **T1 — Misconfigured matrix:** schema-validate at MCP startup (fail-closed); audit-self-checker compares effective grants to last-amended baseline; matrix amendment is constitution Part IV process (owner approval, version bump).
- **T2 — PII scrubber bypass:** 7-layer defense (Unicode normalize → encoding decode → 5 patterns → high-entropy). Scrubber rules versioned and hash-pinned. SecOps re-scans with newer rule versions.
- **T3 — Forged Director registration:** file ownership (Zero's UID, perms ≤ 0640); reserved namespaces require operator-signed Ed25519 manifest.
- **T4 — Compromised comm-module:** operator's Telegram client signs decisions on device; verifying key in `OPERATOR_DECISION_PUBKEY`; comm-module is untrusted transport.
- **T5 — Prompt injection in stored memory:** sandboxed delimiters in subagent prompt; **output binding** (Zero supplies `approval_id`, `target_event_id`; LLM output is `{decision, rationale, confidence}` only); decision/pattern memories immutable after write.
- **T6 — Lifecycle file race:** `flock` on `~/.claude-agent-zero/agents/.lifecycle.lock`; 5s debounce; conflicts → quarantine both files.
- **T7 — Decision log tampering:** Postgres role separation + INSERT-only + `BEFORE UPDATE/DELETE` trigger + SHA256 hash chain.
- **MCP server auth:** per-spawn HMAC binding (security §3) defeats LLM-context impersonation.
- **Compile-time tenant.db isolation:** CI lints `tenet-0/` for any import path from tenant packages.
- **Runtime tenant.db isolation:** `president_app` Postgres role has zero grants on tenant tables.
- **Phase.dev secret injection:** all credentials via `phase run`; never on disk; scrubbing rules in logger/audit/HTTP/panic.
- **Network exposure:** bridge-only, no host port mapping, no nginx route.

High items (block GA): rate limiting on operator endpoint; cross-Director read audit events (US-4); `visible_to` rate-limit (T10); reserved-namespace allowlist; nightly full hash chain validation; matrix-drift detection.

Medium items (post-GA): credential rotation runbook; instruction-shape classifier on memory load (T5 belt-and-braces); dedicated unprivileged UIDs.

## Performance Strategy

- **NFR-1 (5s notification, 10s rule-path, 60s LLM-path):** bus-watcher latency budget broken down (PG NOTIFY ~50ms + fetch ~50ms + POST comm-module ~200ms + delivery ~500ms); rule-path inline in Zero with no Task spawn; LLM-path bounded by Claude Code subagent cold-spawn (RES-3 measured) + reasoning + return.
- **NFR-2 (operator p95 < 30s):** dominated by Telegram, not transport.
- **NFR-3 (audit completeness):** transactional boundary couples `decision_log` insert to outcome event publish; self-checker catches gaps within 15 min.
- **NFR-5 (memory durability):** writes acknowledged only after Postgres COMMIT; backups configured at PG level (inherits Feature 49).
- **NFR-6 (memory isolation):** access matrix re-fetched on every MCP call (no caching); HMAC-bound subagent identity; conformance suite covers all 49 (caller, target, op) cells.
- **NFR-7 (zero new Anthropic spend):** governor MCP measures only; no per-token billing path exists in any binary.
- **Load test target (Phase 6):** 50 simulated Directors, 100 events/sec sustained per Feature 49 NFR-2, verify NFR-1 thresholds hold under load.

## Testing Strategy

| Test type | Tool | Coverage target | What it verifies |
|---|---|---|---|
| Unit | `go test`, `testify` | ≥80% | Pure logic — rule eval, hash chain, scrubber, access matrix, HMAC verification |
| Integration | testcontainers-go (Postgres) | ≥70% | Full bus round-trip with real LISTEN/NOTIFY |
| Mock comm-module | `httptest.Server` | n/a | bus-watcher integration; CL-1 fallback path |
| Mock subagent simulator | golden-file | n/a | Reads `president.md`, returns canned `{decision, rationale}` JSON to exercise full Flow A without Anthropic call |
| Crash recovery | `os.Process.Kill` + restart | full FR-14 path | In-flight LLM discarded, pending_approvals reload, lifecycle.restarted published |
| Access matrix conformance | table-driven | 100% on the 49-cell matrix | Every (caller, target, op) cell behaves per matrix |
| Hash chain | testcontainers + corruption injection | ≥95% | Sample validation catches injected gaps; full validation passes on clean chain |
| Scrubber adversarial | corpus of known-bad | ≥95% | All 7 layers; 50 known-bad payloads must reject; 20 known-good must pass |
| Director markdown golden | `cmd/validate-director` | full | `president.md` validates; intentionally-broken examples fail |
| Load | custom Go harness | n/a | NFR-1 thresholds at 50 simulated Directors / 100 events/sec |

**No production code touches aegis-prod until all tests pass against the testcontainers stack.**

## Deployment Strategy

**Container builds:**
- `tenet-0/Dockerfile.bus-watcher`, `Dockerfile.healthcheck-poller`, `Dockerfile.deadline-sweeper`, `Dockerfile.audit-self-checker` — multi-stage, distroless static, non-root (UID 65532), ARM64 + amd64
- MCP binaries: built into the same multi-stage image; bind-mounted into tenant-0 container at `/opt/mcps/` for Zero's Claude Code runtime to spawn
- `cmd/validate-director` binary: built in CI, not deployed

**Compose entries** added to `/mnt/f/overnightdesk/docker-compose.yml`:
- `tenet0-bus-watcher`, `tenet0-healthcheck-poller`, `tenet0-deadline-sweeper`, `tenet0-audit-self-checker`
- `tenant-0` service modified: add bind-mounts for `/opt/mcps/` (read-only) and `~/.claude-agent-zero/agents/` (already exists)
- All daemons: `cap_drop: ALL`, `security_opt: no-new-privileges:true`, no `ports:` mapping
- `depends_on: tenet0-postgres: { condition: service_healthy }` and on `overnightdesk-communication-module` for bus-watcher

**Phase.dev wrapper:** `start-director-runtime.sh` mirrors `start-orchestrator.sh` — sources bootstrap `.env`, runs `phase run --app overnightdesk --env production --path /tenet-0/* -- docker compose up -d <daemon>`.

**First-deploy sequence:**
1. Apply migrations (`tenet-0/db/migrate.sh`)
2. Amend constitution + rules-yaml (commit, owner approval recorded)
3. Seed Phase.dev with secrets at paths `/tenet-0/{bus,mcps/*,daemons/*,operator,postgres}/`
4. Build images (CI or aegis-prod)
5. `start-director-runtime.sh up -d <daemon>` for each of 4 daemons
6. Update tenant-0 container with new bind-mounts; restart Zero's session
7. Smoke test: publish synthetic test event, verify bus-watcher routes, Zero acknowledges
8. Log to `/mnt/f/deploys.log`

**Rollback:** `docker stop <daemon>` for individual daemons; state in Postgres preserved; restart resumes. For full rollback: revert constitution amendment; bring all daemons down; tenant-0 reverts to pre-runtime state.

## Risks & Mitigation

| Risk | Severity | Mitigation |
|---|---|---|
| mark3labs/mcp-go pre-1.0 churn | High | Pin commit; RES-1 spike validates; in-house shim fallback |
| comm-module owner unavailable for `/v1/inject/zero` design | High | Polling fallback (CL-1 Option C) ships MVP; coordinate during Phase 0 RES-2 |
| Claude Code subagent spawn slower than 5s cold | Medium | RES-3 measures baseline; if too slow, surface as risk to NFR-1 LLM-path budget; warm-pool optimization deferred |
| Operator Ed25519 onboarding too complex | Medium | RES-8 documents procedure; comm-module-signed fallback exists (less secure) if onboarding stalls |
| Single Postgres = SPOF for bus + state + memory | Medium | Inherits Feature 49 backups; document for HA revisit if customer growth warrants |
| Subagent spawn latency dominates LLM-path NFR-1 | Medium | Rule-path-dominance design (encouraged in markdown contracts); track via spawn telemetry (OQ-5) |
| Director markdown hot-reload races (T6) | Medium | `flock` + 5s debounce + quarantine on conflict |
| OAuth subscription rate limits under burst | Medium | Governor measures; Zero's dispatch checks remaining headroom; surfaces backpressure as `president.governor.throttled` |
| Migration coordination fails (RES-6) | Low | Tested in Phase 1 against testcontainers; trivial fix if `migrate.sh` needs an update |
| `decision_log` write throughput bottleneck under burst | Low | Hash chain SERIALIZABLE inserts; measured under load in Phase 6; revisit if > 10 decisions/min sustained |
| `visible_to` field abuse (T10) | Low | Rate-limit non-default writes per Director |

## Constitutional Compliance

| Constitution principle | Status | Evidence |
|---|---|---|
| Principle 1 — Data Sacred | ✅ | Compile-time isolation (CI lint); Postgres role separation; pre-write PII scrubber (7 layers); president_app role has zero tenant grants |
| Principle 2 — Security as Feature | ✅ | Phase.dev secrets; Ed25519 operator auth; HMAC MCP auth; hash chain audit; Postgres role separation; distroless non-root; cap_drop ALL; bridge-only network |
| Principle 3 — Agent Acts, Owner Decides | ✅ | Post-hoc review default; pre-approval is narrow exception list in `constitution-rules.yaml`; operator surfacing through single Telegram channel |
| Principle 4 — Simple Over Clever | ✅ | 10-binary fan-out justified — 4 daemons have fundamentally different cadences/failure tolerances; 6 MCPs forced by stdio MCP protocol; no gratuitous decomposition |
| Principle 6 — Honesty | ✅ | Degraded modes are first-class events; conflict reporting in digests honest; `president.llm.unavailable` published on detection |
| Principle 7 — Owner's Time | ✅ | Single-channel notification (Telegram); aggressive blanket-authorization preference; conservative mode after operator unavailability |
| Test-First Imperative | ✅ | TDD throughout; testcontainers-go for Postgres; mock comm-module; subagent simulator; ≥80% coverage; ≥95% on memory access matrix and hash chain |
| Pillar A — Data Access | ✅ | All DB access through pgx; goose migrations; no raw SQL string interpolation |
| Pillar B — API Route Security | ✅ | Auth-first on every endpoint; idempotent mutations (Idempotency-Key on operator decision POST); consistent error shape |

**No exceptions claimed.**

## Open Items (resolve during `/speckit-tasks` or implementation)

- **OR-1:** mark3labs/mcp-go schema validation depth — RES-1 verifies in Phase 0; pivot to in-house shim if needed
- **OR-2:** comm-module `/v1/inject/zero` endpoint design — RES-2 coordinates with owner before Phase 5
- **OR-3:** Claude Code subagent spawn baseline — RES-3 measures in Phase 0
- **OR-4:** MCP liveness probe shape (subprocess `--healthcheck` flag) — RES-4 confirms before Phase 3
- **OR-5:** Postgres LISTEN/NOTIFY payload size — RES-5 confirms before Phase 1
- **OR-6:** Migration cross-schema coordination — RES-6 verifies in Phase 1
- **OR-7:** Bind-mount for `~/.claude-agent-zero/agents/` — RES-7 confirms with deploy.sh author
- **OR-8:** Operator Ed25519 onboarding — RES-8 documents procedure; comm-module-signed fallback if too complex

## Estimated Effort

| Phase | Days | Scope |
|---|---|---|
| 0 | 3 | Research & spike |
| 1 | 4 | Foundation: monorepo, shared packages, migrations, constitution amendment |
| 2 | 5 | 6 MCP servers |
| 3 | 4 | 4 daemons |
| 4 | 4 | Memory hardening + reference Director + validator |
| 5 | 4 | Operator surfacing + Telegram + Ed25519 |
| 6 | 4 | Self-audit + load test + deploy |
| **Total** | **28 days** | Critical path mostly sequential |

Some parallelism within phases (e.g., MCPs in Phase 2 can be split across two engineers since they have minimal cross-dependencies after the `internal/shared/mcp` harness exists).

## Next Steps

1. Review this plan
2. `/speckit-analyze` for spec ↔ plan ↔ data-model ↔ contracts consistency check
3. `/speckit-tasks` to generate the task breakdown from these phases
4. Commit when satisfied:
   ```bash
   git add .specify/specs/50-tenet0-director-runtime/
   git commit -m "feat: add spec, plan, contracts for Tenet-0 Director Runtime (Feature 50)"
   ```

## References

- Spec: `.specify/specs/50-tenet0-director-runtime/spec.md`
- Research: `.specify/specs/50-tenet0-director-runtime/research.md`
- Data model: `.specify/specs/50-tenet0-director-runtime/data-model.md`
- Contracts: `.specify/specs/50-tenet0-director-runtime/contracts/`
- Sibling Feature 49: `.specify/specs/49-event-bus-constitution-governor/`
- Sibling Feature 58 (orchestrator): `/mnt/f/overnightdesk-engine/.specify/specs/58-platform-orchestrator/`
- Architecture doc: `.docs/tenet-0/sub-agent-architecture.md`
- Constitution: `.specify/memory/constitution.md`
- Engine Go patterns: `/mnt/f/overnightdesk-engine/internal/shared/config/config.go`, `deploy.sh`
