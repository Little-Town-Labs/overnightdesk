# Feature 50 — Research

Phase 0 research record. Decisions locked here become inputs to `plan.md`. Items flagged as "verify" are gated for empirical confirmation during early implementation.

## Decision: Module Layout — Single Go Module

**Chosen:** monorepo with single `tenet-0/go.mod` containing all 10 binaries under `cmd/`.

**Options Considered:**
1. **Single module, multi-cmd** — all 10 binaries share `go.mod`, build with `go build ./cmd/...`
2. Per-binary modules — each MCP and daemon has its own `go.mod`
3. Two modules (one for MCPs, one for daemons)

**Rationale:** Shared substrate dominates — all 10 binaries import `shared/bus-go`, pgxpool, slog, the constitutional rule evaluator. Multi-module forces ceremonial version-tagging across binaries with no external consumer. Single-team, single-VM, single-deploy. Refactoring (memory access matrix shared between `director-memory-mcp` and `audit-self-checker`; PII scrubber shared between write path and re-scan path) stays atomic.

**Wrinkle:** `shared/bus-go` already has its own `go.mod` (Feature 49 published independently for cross-language type alignment with bus-ts). Leave it alone — `tenet-0/go.mod` consumes it via `replace` directive pointing at `./shared/bus-go` for local builds.

**Tradeoffs accepted:** all binaries bump together on dependency upgrades. Acceptable: there is no per-binary release cadence at single-VM scale.

---

## Decision: Container Topology — Per-Daemon Containers, MCPs as stdio Subprocesses

**Daemons:** one container per daemon (4 containers).

**Rationale:** different cadences and failure tolerances (5s hot-path vs 60s polling vs 15min batch vs nightly heavy SQL) make a monolith fragile — one daemon's OOM kills all four. Per-container restart is cleaner via Docker's restart loop than supervisord. ~30MB total image-size delta vs single container; build cache shared. Image isolation is constitutional (Principle 4 reads correctly here: simple per-concern blast radius, not gratuitous fan-out).

**MCP servers:** NOT containers. They are **stdio subprocesses spawned by Zero's Claude Code runtime** via `~/.claude.json`'s `mcpServers` map. The 6 Go MCP binaries are baked into the tenant-0 image (or bind-mounted from `/opt/overnightdesk/tenet0-mcps/`).

**Rationale:** the MCP protocol over stdio is what Claude Code natively speaks. Containerizing MCPs would require an MCP-over-network shim that Claude Code does not currently support. Subprocess model gives per-MCP process isolation for free; Claude Code respawns on next tool call after a crash.

**Resolves OQ-4 from spec.**

---

## Decision: MCP Server Framework — `github.com/mark3labs/mcp-go`

**Chosen:** `mark3labs/mcp-go`, version pinned at a specific commit, gated by Phase 0 verification.

**Options Considered:**
1. **`github.com/mark3labs/mcp-go`** — most popular community Go MCP SDK; stdio transport; tool registration; JSON Schema validation; structured errors; pre-1.0 but actively maintained
2. **Anthropic-published Go MCP SDK** — does not exist as of this research (official SDKs are Python and TypeScript)
3. **Roll-our-own JSON-RPC stdio shim** — ~400 LOC fallback if mark3labs blocks

**Rationale:** mark3labs is the only realistic Go MCP SDK with community traction. Pre-1.0 risk mitigated by version pinning + the option to fall back to a thin shim (the MCP wire protocol is small).

**Verify in early Phase 1 (RES-1):**
- Schema validation rigor — does it validate **output** payloads, not just inputs?
- Concurrency — can tool handlers run concurrently without holding a global mutex?
- Cancellation — does context cancellation propagate from client into tool handlers?
- Version stability — pin a specific commit; the SDK is pre-1.0

**Pivot rule:** if any of the four items fail, write the in-house JSON-RPC shim under `internal/shared/mcp/`. Decision before Phase 2 implementation begins.

---

## Decision: Postgres Driver and Migrations — pgx/v5 + goose

**Chosen:** `github.com/jackc/pgx/v5` with pgxpool; `github.com/pressly/goose/v3` for migrations.

**Rationale:** pgx supports LISTEN/NOTIFY natively (required for `tenet0-bus-watcher`). pgxpool handles connection-pool restart semantics cleanly. Matches Feature 49 + Feature 58 orchestrator. goose is already what `tenet-0/db/migrate.sh` runs.

**Migration numbering:** `050_*.sql` series for President schema, in `tenet-0/internal/store/migrations/`. Avoids collision with Feature 49's `001-049_*` (which live in `tenet-0/db/migrations/`). The `migrate.sh` script learns to run both directories in numerical order.

---

## Decision: Postgres Schema Strategy — Separate `president` Schema in Shared Instance

**Chosen:** new `president` Postgres schema inside the existing Feature 49 instance (`tenet0-postgres` container).

**Options Considered:**
1. Separate schema in same Postgres instance
2. Separate Postgres container
3. Embed in Feature 49 tables (denormalized)

**Rationale:** spec Assumptions allow it. Schema isolation enables Postgres role-based access control (security strategy §4 — `president_app` role grants scoped to `president` schema). Single-VM deployment; new Postgres container is over-engineering. Splitting later is a migration, not a rewrite.

**Tradeoff accepted:** single point of failure for both bus AND President state (architect §8 risk). Acceptable for MVP single-operator system; documented for revisit if HA matters.

---

## Decision: Bus-Watcher → comm-module Integration — `POST /v1/inject/zero`

**Chosen:** comm-module exposes a new internal-only HTTP endpoint `POST /v1/inject/zero` that accepts a structured payload from the bus-watcher and routes it into Zero's session via the same delivery mechanism comm-module already uses for inbound Telegram → Zero messages.

**Options Considered (architect §3):**
- A. **comm-module exposes `POST /v1/inject/zero` endpoint** — bus-watcher posts, comm-module routes
- B. comm-module subscribes to a bus event type (`system.notify.zero`) — couples comm-module to bus, pollutes event log
- C. Synthetic Telegram messages with `from: tenet0-bus-watcher` — abuses Telegram shape, leaks bus internals into operator's chat (S/N disaster)

**Rationale:** explicit API; clear ownership boundary (comm-module owns "how to talk to Zero"; bus-watcher owns "what to say"); independent failure mode; mirrors comm-module's existing inbound bridge.

**Routing default:** `mirror_to_telegram=false` — bus events go to Zero's session but NOT to operator's Telegram window (avoids drowning Gary in bus chatter).

**comm-module change required:** add `/v1/inject/zero` handler. **Coordination required with comm-module owner** before Phase 5. If comm-module slips, the runtime ships on the polling fallback (CL-1 Option C: bus-watcher writes to `notify_queue` table; Zero polls via `bus-mcp.list_unprocessed_events`).

**Auth:** `Authorization: Bearer ${COMM_MODULE_TOKEN}` (Phase.dev injected per security §2).

---

## Decision: Operator Decision Authentication — Ed25519 from Operator Device

**Chosen:** operator's Telegram client signs decisions with an Ed25519 key generated at onboarding and held only on the operator's mobile device. Comm-module is treated as untrusted transport.

**Format:** signature over canonical `(approval_id, decision, operator_nonce, timestamp_unix)`. Verifying key in env `OPERATOR_DECISION_PUBKEY` (Phase.dev path `/tenet-0/operator/decision-pubkey`). 30-second timestamp window. Nonces single-use (tracked in `operator_nonces` table with unique constraint).

**Rationale (security T4):** comm-module is in the trust path for transport but not authentication. A compromised comm-module cannot forge decisions because it does not hold a signing key. This is stronger than the prior plan's "comm-module signs" model, which trusted comm-module fully.

**Tradeoff:** operator setup includes "generate key on device, register pubkey via Phase.dev". One-time cost; documented in deploy runbook.

---

## Decision: Reserved-Namespace Director Registration — Operator-Signed Manifest

**Chosen:** Director markdown files claiming reserved namespaces (`president`, `secops`) require an operator-signed manifest header — Ed25519 signature over `(department, mcp_grants, file_hash)` verified against `OPERATOR_REGISTRATION_PUBKEY` (Phase.dev).

**Rationale (security T3):** without this, a local attacker with FS write could drop a malicious `president.md` clone with namespace `secops` and gain cross-namespace read. Operator-signed manifest binds reserved namespaces to operator intent.

**Implementation:** lifecycle daemon validates the signature on every register event. Reserved-namespace registration without valid sig → `secops.violation.registry_invalid` + quarantine. Non-reserved namespaces (every Director added in Features 52–56) do not require operator signing — unsigned ops/tech/finance markdown files are fine.

---

## Decision: MCP Server Authentication — HMAC-bound Subagent Identity

**Chosen:** when Zero spawns a Director subagent, the spawn includes per-spawn env vars `DIRECTOR_NAMESPACE=fin` and `DIRECTOR_AUTH=HMAC-SHA256(namespace || nonce, DIRECTOR_HMAC_SECRET)`. The MCP server (loaded with `DIRECTOR_HMAC_SECRET` from Phase.dev at startup) verifies the HMAC and uses `DIRECTOR_NAMESPACE` for matrix lookup on every tool call.

**Options Considered:**
1. Subagent metadata supplied by LLM context — **rejected**, prompt-injectable
2. mTLS — overkill for stdio
3. Signed JWT — equivalent security to HMAC for this case (Zero is both issuer and trust root) but heavier
4. **Per-spawn HMAC binding** — chosen

**Rationale:** binds namespace to a per-spawn nonce so a stale env var leaked in a crash dump cannot be replayed against a future spawn.

---

## Decision: Audit Log Tamper Evidence — SHA256 Hash Chain + Postgres Role Separation

**Chosen:** SHA256 hash chain on `decision_log` (each row stores `prev_hash` + `row_hash`); Postgres roles isolate INSERT-only writes from migration-time DDL; `BEFORE UPDATE OR DELETE` trigger as belt-and-braces.

**Hash chain seed:** row 0's `prev_hash` is `SHA256("tenet0-decision-log-v1" || constitution_v1_hash)` recorded in migration `050_006_decision_log.sql`.

**Validation cadence:** random 1,000-row sample every 15 minutes; full chain nightly at 03:00 UTC. Detection raises `secops.violation.audit_corruption` with affected row range; log keeps accepting writes (corruption is detection, not freeze).

**Rationale:** trivial computational cost (sub-microsecond per insert); tamper-evidence even if Postgres role controls bypassed; same model as prior plan — preserved verbatim.

---

## Decision: PII Scrubber Catalog (Defense in Depth)

**Chosen:** seven-layer defense in `tenet0-director-memory-mcp.write_memory`:

| Layer | Mechanism |
|---|---|
| 1 | Unicode NFKC normalize before any regex match (defeats lookalike characters) |
| 2 | Auto-decode pass for base64 / rot13 / hex blocks ≥ 32 chars before pattern match |
| 3 | Customer email regex with allowlist for operator-confirmed business emails |
| 4 | Credit card: 13–19 digit run + Luhn check + context-word requirement (`card`, `payment`, `cc`) |
| 5 | Anthropic credential pattern: `sk-ant-[A-Za-z0-9_-]{20,}` — block always |
| 6 | Conversation transcript heuristic: line-start `^(Customer|Tenant|User|Client):` — block; require Director to summarize, not transcribe |
| 7 | Generic high-entropy block ≥ 64 chars (Shannon > 4.5 bits/char) — block, suggest external storage |

**Rules versioned in `constitution-rules.yaml`** under a new `memory_scrubber` section, hash-pinned at MCP startup. SecOps (Feature 57) periodically re-scans memory with newer rule versions.

**False-positive mitigations:** documented per-layer in plan §11 security strategy.

---

## Decision: Memory Access Matrix — `constitution-rules.yaml` Section

**Chosen:** new top-level `memory_access_matrix` section in `constitution-rules.yaml`. Default content:

```yaml
memory_access_matrix:
  president:
    write: [president]
    read:  [president, ops, tech, finance, s_m, support, secops]
  ops:
    write: [ops]
    read:  [ops]
  tech:
    write: [tech]
    read:  [tech]
  finance:
    write: [finance]
    read:  [finance]
  s_m:
    write: [s_m]
    read:  [s_m]
  support:
    write: [support]
    read:  [support]
  secops:
    write: [secops]
    read:  [president, ops, tech, finance, s_m, support, secops]
```

**Loader:** schema-validate at MCP startup; fail-closed if invalid. **No runtime in-place reload** — amendments require MCP restart. Prevents privilege-shift attacks via mid-flight amendment.

**Amendment process:** Constitution Part IV — owner approval, version bump, both `constitution.md` and `constitution-rules.yaml` updated together. Audit-self-checker compares effective grants to last-amended baseline; mismatch raises `secops.violation.matrix_drift`.

---

## Decision: Concurrency Model — Worker Pools + Single-Owner State Machines

**Chosen (per architect §5):**

| Daemon | Goroutines |
|---|---|
| `bus-watcher` | 3: Listener (LISTEN connection), Forwarder (drains channel + POSTs comm-module + cursor update), Health (`/healthz` + `/metrics`) |
| `healthcheck-poller` | 2: Ticker fan-out (60s interval, errgroup probes), File-system watcher (debounced 5s for OQ-1 lifecycle) |
| `deadline-sweeper` | 1: ticker (60s) runs idempotent `UPDATE pending_approvals ... RETURNING` and publishes one `president.rejected` per row |
| `audit-self-checker` | 2: 15-min ticker for sample-sized checks, separate nightly cron-style ticker for full chain (mutex prevents overlap) |

**Bus-watcher backpressure:** buffered channel (cap=100) between Listener and Forwarder. Drop-oldest with `bus.notify.dropped` audit event on overflow. Cursor in Postgres ensures at-least-once.

**Hash chain serialization:** `decision_log` extension uses `SELECT ... FOR UPDATE` on a sentinel row to guarantee monotonic chain even under concurrent writers.

---

## Decision: Director Markdown Hot-Reload — fsnotify + 5s Debounce

**Chosen:** `tenet0-bus-watcher` (or a sidecar in the same daemon) uses `github.com/fsnotify/fsnotify` to watch `~/.claude-agent-zero/agents/`. Debounce 5 seconds — coalesces multi-edit sessions into one register/deregister pair.

**Resolves OQ-1 from spec.**

**Container concern:** the daemon needs access to the agents directory. Either bind-mount `~/.claude-agent-zero/agents/` read-only into the bus-watcher container, or run a polling fallback (read directory contents every N seconds, hash-compare). Default plan: bind-mount; polling fallback for restricted environments.

---

## Decision: Memory Versioning — Tag with Constitution Version

**Chosen:** every memory row carries a `constitution_version` column populated at write time. Enables re-evaluation of older memories if the constitution drifts.

**Resolves OQ-2 from spec.**

**Use case:** if the matrix tightens (e.g., revoke President's read on `finance`), older `decision` memories written under the permissive matrix can be flagged for SecOps review. Without this tag, drift is silent.

---

## Decision: `visible_to` Field on All Director Memories

**Chosen:** every memory row supports an optional `visible_to: [department]` array. Default empty (private). MCP applies as filter on cross-namespace reads.

**Resolves OQ-3 from spec.**

**Use case (matches spec US-4):** the President writes a `decision` memory affecting Finance, marks `visible_to: [finance]` so Finance can read that single entry. Otherwise Finance never learns from President decisions.

**Abuse mitigation (security T10):** rate-limit non-default `visible_to` writes per Director to ≤10/day baseline. SecOps review can disregard flooding via metric.

---

## Decision: Spawn Telemetry — Recorded by `governor-mcp`

**Chosen:** `tenet0-governor-mcp` exposes a `record_spawn_telemetry` tool. Zero calls it after every Director Task spawn with `{director, event_id, tokens_in, tokens_out, wall_clock_ms, mode}`.

**Resolves OQ-5 from spec.**

**Use case:** capacity-planning data for future Phase 10.x Director additions; detect Claude Code spawn-overhead regressions; honest token-equivalent measurement (NFR-7) without per-token billing.

---

## Open Research Items (verify during implementation, not blocking plan)

### RES-1: mark3labs/mcp-go Schema Validation + Concurrency [RESOLVED 2026-04-19]

**SDK pinned at:** `github.com/mark3labs/mcp-go v0.48.0` (latest release, 2026-04-14)
**go.sum hash:** `h1:o+MXuGW/HCeR2ny5LcAcZQn2bo6I2xaZMEHnpRG+dtw=`
**Spike location:** `tenet-0/spikes/phase-0/mark3labs-spike/`
**Go toolchain used:** 1.24.4 (project target 1.25+ — SDK has no incompatibilities at 1.24.4)

| Criterion | Result | Evidence |
|---|---|---|
| Output schema validation | **FAIL** | Tool registered with `WithOutputSchema[ExpectedOutput]()` requiring `{result: string}`. Handler returned `{wrong_field: 42}` as both text content and `StructuredContent`. SDK passed it through unchanged: `IsError=false`, `structuredContent=map[wrong_field:42]`. No validation error raised. |
| Concurrency (10 concurrent ≈ 200ms) | **PASS** | 10 concurrent in-process client calls to a 200ms-sleeping handler completed in **201.06ms** (effectively perfect parallelism; no global handler mutex). |
| Context cancellation | **PASS** | Client called with `context.WithTimeout(1s)` against a handler selecting on `ctx.Done()` vs 5s timer. Handler observed cancel and returned in **1000ms** with `context.DeadlineExceeded`. Client surfaced `internal error: context deadline exceeded`. |
| Error envelope shape | **PASS (CONDITIONAL)** | Two paths: (a) handler returning Go `error` → client receives wrapped Go error string `"internal error: <msg>"` (no JSON-RPC code/data exposed at this API surface; original error message preserved). (b) handler returning `mcp.NewToolResultError(msg)` → client receives `CallToolResult{IsError: true, Content: [{type:text, text:msg}]}` — the recommended idiom. Use (b) consistently for structured errors. |

**Recent release stability signals (last 5 releases per GitHub):**
- v0.48.0 (2026-04-14) — server impl metadata + OAuth RFC 8707
- v0.47.1 (2026-04-08) — docs + goroutine-leak fixes
- v0.47.0 (2026-04-04) — client task ops + tool middleware
- v0.46.0 (2026-03-26) — **breaking:** jsonschema lib swap (`invopop/jsonschema` → `google/jsonschema-go`); affects custom schema integration only
- v0.45.0 (2026-03-06) — RFC 7591 client URI + Implementation struct enhancements

Active maintenance, ~weekly cadence; one breaking dep swap in last 5 versions (v0.46.0). Pin v0.48.0 explicitly in `tenet-0/go.mod`.

**Verdict:** **CONDITIONAL-GO** — proceed with `mark3labs/mcp-go v0.48.0` with one mandatory mitigation:

> The SDK does **not** enforce output schemas. Every Director MCP tool handler must wrap its return through a thin `validateOutput[T any](payload any) error` helper (using `google/jsonschema-go` — already in the dep tree) before returning. Centralize this in `internal/shared/mcp/output_validate.go` so all 6 MCP servers share one implementation. Add a unit test per tool that the helper rejects malformed output. Without this, plan §11 security guarantees (matrix grants, scrubber rule pinning) are not enforceable on the response path.

Concurrency, cancellation, and error envelope semantics are all production-ready. No need for in-house JSON-RPC shim.

**Implications for plan.md:**
- Add `internal/shared/mcp/output_validate.go` to the Phase 1 substrate task list (small — ~50 LOC + tests).
- Convention: tool handlers MUST use `mcp.NewToolResultError(msg)` for user-visible failures; never bare `return nil, err` (caller sees a generic "internal error" wrapper instead of the structured envelope).
- Pin `github.com/mark3labs/mcp-go v0.48.0` exactly in `tenet-0/go.mod`; treat upgrades as deliberate (changelog review required, given pre-1.0 status and recent v0.46.0 breaking swap).
- Watch for upstream output-schema enforcement work; if added in a later release, the wrapper becomes redundant (delete it, don't keep both).

### RES-2: comm-module `/v1/inject/zero` Endpoint [RESOLVED — Gary confirmed proposed design 2026-04-19]

Comm-module owner is Gary (sole technical founder). Endpoint design proposed below; Gary confirms or modifies before Phase 5 implementation.

**Proposed endpoint:** `POST /v1/inject/zero` on `overnightdesk-communication-module:8080`

**Auth:** `Authorization: Bearer ${COMM_MODULE_INJECT_TOKEN}` (Phase.dev path `/comm-module/inject-token`; bus-watcher reads via `COMM_MODULE_TOKEN` env var)

**Request body (JSON):**
```json
{
  "origin": "tenet0-bus-watcher",
  "frame": "BUS_EVENT",
  "bus_event_id": "<UUID>",
  "event_type": "fin.approval.requested",
  "source": "fin",
  "parent_event_id": null,
  "payload": { /* arbitrary, ≤32KB */ },
  "mirror_to_telegram": false
}
```

**Response:**
- `202 Accepted` — message routed into Zero's session
- `401` — bad token
- `400` — malformed body
- `503` — Zero session unreachable; bus-watcher backs off + falls through to polling per CL-1

**Default `mirror_to_telegram: false`** — bus events go to Zero's session via the same in-process delivery comm-module already uses for inbound Telegram, but do NOT echo to operator's Telegram window. (Override-true useful for debugging individual events.)

**Decision required from Gary before Phase 5:**
- Confirm endpoint path + auth + payload shape
- Confirm in-process delivery to Zero's session is the correct mechanism (vs. some other inbound bridge)
- If this requires comm-module dev work that won't fit Phase 5 timing → ship MVP on polling fallback; treat this endpoint as a Phase 6+ enhancement

### RES-3: Claude Code Subagent Spawn Semantics [RESOLVED via aegis-ssh 2026-04-19]

**Measurement run on aegis-prod inside `overnightdesk-tenant-0` container** (ARM64, Claude Code 2.1.101, OAuth via Zero's existing token, 5 sequential cold invocations of `claude --print` with a trivial OK-reply prompt; `/usr/bin/time` wall-clock).

| Run | Wall-clock |
|---|---|
| 1 | 4.30s (cold) |
| 2 | 3.00s |
| 3 | 4.00s |
| 4 | 3.08s |
| 5 | 3.81s |

**Stats:** mean 3.64s · max 4.30s · min 3.00s · n=5

**Verdict: GO.** Cold-start of an entire Claude Code CLI invocation on aegis-prod is well under 5s. Task-tool subagent spawn within an *already-warm* Zero session is plausibly equal or faster (Claude Code already booted). NFR-1 LLM-path budget of 60s leaves ample headroom for Director reasoning + MCP calls + Anthropic API round-trip.

**Caveats noted for future re-measurement:**
- These are `claude --print` cold-starts, not Task-tool spawns within an active Zero session. The actual Director spawn pattern may differ. **A more precise measurement** (Task tool inside an interactive Zero session) is recommended once Zero has registered Directors to spawn — natural opportunity comes during Phase 6 deploy smoke test.
- Sample size n=5 is statistically thin. Re-measure under load during Phase 6.
- Parallel-spawn limit and MCP-grant-failure semantics were NOT measured (require an interactive session). **Defer to Phase 6 smoke test** — if Zero's first parallel-Director spawn fails, design assumption (5–10 parallel) is wrong and dispatcher needs revision.

**Pivot rule** (still applies for Phase 6): if real Task-tool spawn p95 ≥ 30s under load, revise NFR-1 to 90s or add warm-pool. Current data does not trigger pivot.

### RES-4: MCP Liveness Probe Shape [RESOLVED 2026-04-19]

**Chosen:** subprocess `<mcp-binary> --healthcheck` flag.

The flag exits 0 if the MCP binary can: (a) connect to Postgres with its credential, (b) load the access matrix from `constitution-rules.yaml`, (c) confirm its required dependencies reachable. Exits non-zero with stderr message otherwise.

**Rationale:**
- RES-1 confirmed mark3labs/mcp-go works as expected with output validation wrapper. The MCP server's stdio interface itself is fine.
- A `--healthcheck` flag avoids the cost of spawning a full MCP server + JSON-RPC handshake + `tools/list` round-trip on every 60s poll.
- Cost per probe: ~50–100ms for a simple Postgres ping + YAML load. 6 MCPs × N Directors × 60s interval = bounded.
- Decoupled from MCP protocol semantics — if the SDK's `tools/list` shape changes in a future release, healthcheck still works.
- Each MCP binary already needs init-time error reporting; the flag is a small addition.

**Implementation note:** the flag must NOT spawn the full MCP server (no stdio bind). It runs init checks then exits. Add to each MCP's `cmd/<mcp>/main.go`: `if os.Args contains --healthcheck → run init → exit code → return`.

### RES-5: Postgres LISTEN/NOTIFY Payload Size [RESOLVED 2026-04-19]

**Verified.** Migration `008_notify_event_type.sql` line 143 confirms Feature 49 publishes only `<event_id>:<event_type>` (UUID 36 bytes + ':' + event_type ≤30 bytes ≈ 70 bytes total). Well under Postgres 8KB NOTIFY limit. Subscribers fetch the full event row from `bus.events` by ID after receiving the notification.

**Source:** `tenet-0/db/migrations/008_notify_event_type.sql:143` — `PERFORM pg_notify('event_bus', v_new_id || ':' || p_event_type);`

**No issue.** No coordination with Feature 49 maintainer needed.

### RES-6: Migration Coordination — Plan Revision Required [RESOLVED 2026-04-19]

**Finding:** Feature 49 does NOT use goose. The plan's "Postgres Driver and Migrations — pgx/v5 + goose" decision is wrong about the migration tooling.

**Actual state:**
- `tenet-0/db/migrations/001-010_*.sql` — 10 raw SQL files
- `tenet-0/docker-compose.yml` — `tenet0-postgres` mounts `./db/init:/docker-entrypoint-initdb.d:ro` (first-init bootstrap) AND `./db/migrations:/migrations:ro` (read-only reference)
- `tenet-0/db/migrate.sh` only supports the `bump-constitution` subcommand (calls `bus-ts/dist/cli/bump-constitution.js`); has NO `migrate up` command
- Migrations 001-010 are applied at first-DB-init via `/docker-entrypoint-initdb.d/`; for an existing DB, they would be applied manually (no automated tracking table observed)

**Decision:** extend the existing pattern rather than introduce goose. Two changes:

1. **Add new SQL files at `tenet-0/db/migrations/050_*.sql`** alongside existing 001-010. Same directory; same bind-mount.
2. **Add `migrate.sh apply-pending [--dry-run]` subcommand** that:
   - Connects as `tenet0_admin` via `TENET0_ADMIN_URL`
   - Reads `schema_migrations` table (creates if missing — first migration `050_001_roles.sql` includes the table DDL)
   - Compares to filenames in `db/migrations/` numerically
   - Applies any unapplied via `psql -f`, records each in `schema_migrations` as a single transaction
   - Idempotent; safe to re-run

**Rationale:** Keeps the existing project's tooling consistent (bash + psql + node, no Go-side migration runner). Goose would introduce a third migration approach to a project that hasn't needed one. The new subcommand is ~50 lines of bash.

**Plan update required:** in `plan.md` Technology Stack table, replace "Migrations: goose v3" row with "Migrations: extended `migrate.sh` (psql + schema_migrations table)". Phase 1 task list (Tasks 1.4–1.5) updated accordingly.

### RES-7: aegis-prod Bind-Mount for Agents Directory [RESOLVED 2026-04-19]

**Verified on aegis-prod.** `~/.claude-agent-zero` (containing `agents/` subdirectory with 47 markdown files) is already bind-mounted into `overnightdesk-tenant-0:/home/engine/.claude` (read-write, full directory).

For `tenet0-bus-watcher` daemon to also see the agents directory, add the same bind-mount (read-only) to its compose entry:
```yaml
tenet0-bus-watcher:
  volumes:
    - /home/ubuntu/.claude-agent-zero/agents:/agents:ro
```

**No action required from operator** beyond adding the volume line to `docker-compose.yml` in Phase 6.

### RES-8: Operator Onboarding for Ed25519 Signing [RESOLVED 2026-04-19]

**Procedure documented in `tenet-0/docs/runbooks/operator-onboarding.md`** (see file). Summary:

1. **One-time key generation on operator's mobile device** — use `signal-cli` on Android/iOS, or `age-keygen` on a trusted laptop, to generate an Ed25519 keypair. Private key stays on the device (never copied, never backed up to cloud).
2. **Public key extraction** — operator copies the base64 public key (44 chars).
3. **Phase.dev registration** — `phase secrets create --app overnightdesk --env production --path /tenet-0/operator/ -- decision-pubkey=<base64-pubkey>`. One operation, ~30 seconds.
4. **Verification** — operator signs a test message; bus-watcher verifies; runbook's "first-decision smoke test" confirms round-trip.

**Complexity assessment:** procedure is doable in ~10 minutes; matches the spirit of "BYOS" — operator controls their own key like they control their own Claude Code subscription. No MVP fallback needed; the procedure is shipped from day one.

**If operator cannot complete onboarding:** documented fallback `OPERATOR_AUTH=comm-module-signed` env flag downgrades to comm-module-as-trust-root (security T4 risk) — flagged as deferred hardening with clear runbook warning.

---

---

## Phase 0 GO/NO-GO Verdict — 2026-04-19

| RES | Status | Verdict |
|---|---|---|
| RES-1 mark3labs/mcp-go | ✅ Resolved | **CONDITIONAL-GO** — pin `v0.48.0`; add `internal/shared/mcp/output_validate.go` (~50 LOC) to compensate for unsafe output schema passthrough |
| RES-2 comm-module endpoint | ✅ Resolved | Gary confirmed proposed design (POST /v1/inject/zero, bearer auth, payload shape, mirror_to_telegram=false) |
| RES-3 subagent spawn baseline | ✅ Resolved | Measured on aegis-prod via aegis-ssh: mean 3.64s, max 4.30s; NFR-1 60s budget validated. Re-measure under load in Phase 6. |
| RES-4 MCP liveness probe | ✅ Resolved | Subprocess `--healthcheck` flag pattern; cheap, no protocol coupling |
| RES-5 NOTIFY payload size | ✅ Resolved | ~70 bytes (event_id:event_type); well under 8KB Postgres limit. No issue. |
| RES-6 migration tooling | ✅ Resolved (with PLAN REVISION) | Feature 49 uses raw `psql` + `/docker-entrypoint-initdb.d`, NOT goose. Plan's "goose v3" decision is incorrect. **Revision:** extend `migrate.sh` with `apply-pending` subcommand using psql + `schema_migrations` tracking table. |
| RES-7 agents bind-mount | ✅ Resolved | `~/.claude-agent-zero` already bind-mounted into tenant-0; add read-only mount of `agents/` to bus-watcher container in Phase 6. |
| RES-8 operator onboarding | ✅ Resolved | Procedure documented at `tenet-0/docs/runbooks/operator-onboarding.md`. ~10 min one-time setup using `age-keygen`. |

### Summary

**All 8 RES items resolved as of 2026-04-19.** Phase 0 closed; Phase 1 cleared to start.

- **RES-2** confirmed by Gary
- **RES-3** measured via aegis-ssh — under-budget for NFR-1; re-measure during Phase 6 smoke under realistic load

### Plan revisions required before Phase 1

1. **Replace "goose v3" with "extended migrate.sh"** in plan.md Technology Stack table
2. **Add `internal/shared/mcp/output_validate.go`** to Phase 1 substrate task list (was missed; required by RES-1 CONDITIONAL-GO)
3. **Add `migrate.sh apply-pending` subcommand** as a Phase 1 task

### Spec revisions required

None. Spec is locked; all RES findings affect plan/tasks only.

### Phase 1 GO

Phase 0 is sufficiently resolved to **GO Phase 1** for the scope that does not depend on RES-2 / RES-3:

- ✅ Phase 1 Foundation can proceed (monorepo, shared packages, migrations, constitution amendment)
- ✅ Phase 2 MCP Servers can proceed (mark3labs/mcp-go pinned)
- ⚠️ Phase 5 Operator Surfacing waits on RES-2 confirmation
- ⚠️ Phase 6 deploy / NFR-1 LLM-path acceptance waits on RES-3 measurement

Recommend operator decisions on RES-2 and RES-3 in parallel with Phase 1 work — neither blocks Phase 1.

---

## References

- Spec: `.specify/specs/50-tenet0-director-runtime/spec.md`
- Sibling Feature 49 spec: `.specify/specs/49-event-bus-constitution-governor/spec.md`
- Architecture doc: `.docs/tenet-0/sub-agent-architecture.md`
- Constitution: `.specify/memory/constitution.md`
- Existing Feature 49 Go: `tenet-0/shared/bus-go/`
- Engine repo Go patterns: `/mnt/f/overnightdesk-engine/internal/shared/config/config.go`, `/mnt/f/overnightdesk-engine/deploy.sh`
- Sibling Feature 58 (orchestrator) plan: `/mnt/f/overnightdesk-engine/.specify/specs/58-platform-orchestrator/plan.md`
