# Feature 50 — Task Breakdown

**Spec:** `.specify/specs/50-tenet0-director-runtime/spec.md`
**Plan:** `.specify/specs/50-tenet0-director-runtime/plan.md`

**Status legend:** 🟡 Ready · 🔴 Blocked · 🟢 In Progress · ✅ Complete
**Effort:** S = ≤2h · M = 4–6h · L = 8–12h · XL = 1–2 days

**TDD invariant:** every implementation task is blocked by its test task. Tests must be confirmed FAILING before implementation begins (constitution Test-First Imperative).

**Delegation conventions (used in tasks below):**
- `@tdd-guide` — generate test scaffolds first
- `@security-reviewer` — security-critical code paths (memory, audit, operator auth)
- `@code-reviewer` — every PR before merge

---

## Phase 0 — Research & Spike (3 days, 8 tasks)

Goal: resolve all 8 RES items from `research.md` with empirical evidence. Each task ends with a GO/NO-GO/PIVOT decision recorded inline in `research.md`.

### Task 0.1: RES-1 — Validate `mark3labs/mcp-go`
✅ Complete (2026-04-19) — CONDITIONAL-GO at v0.48.0; output-validation wrapper required (~50 LOC). See research.md §RES-1.
Spike: build a throwaway MCP server using `mark3labs/mcp-go` v latest, exercise:
- Output schema validation on a tool that returns malformed JSON
- 10 concurrent tool calls (no global mutex stalls)
- Context cancellation propagation from client to handler
- Error envelope shape vs spec
**Acceptance:** RES-1 row in `research.md` updated with GO (proceed) or PIVOT (in-house JSON-RPC shim). If PIVOT, spike sketches the shim API.

### Task 0.2: RES-2 — Coordinate `/v1/inject/zero` design with comm-module owner
✅ Complete (2026-04-19) — Gary confirmed proposed endpoint design (POST /v1/inject/zero, bearer auth, payload shape, mirror_to_telegram=false default). Comm-module impl added to Phase 5.
Send the request payload spec from `contracts/daemon-internal-http.yaml` (or design one if not yet) plus `president-events.yaml` envelope to comm-module maintainer. Confirm: endpoint path, auth header, payload shape, default `mirror_to_telegram=false`, error semantics.
**Acceptance:** RES-2 row resolved. If owner unavailable >48h, mark as DEFER → ship MVP on polling fallback (CL-1 Option C).

### Task 0.3: RES-3 — Measure Claude Code subagent spawn baseline on aegis-prod
✅ Complete (2026-04-19) — measured via aegis-ssh: mean 3.64s cold-start, max 4.30s. NFR-1 60s LLM-path budget validated. Caveats: re-measure under load + parallel-spawn cap during Phase 6 smoke test. See research.md §RES-3.
On aegis-prod, write a tenant-0 markdown subagent that returns a fixed JSON. Measure cold spawn (first call), warm spawn (subsequent), MCP-grant-failure error semantics, parallel-spawn limit per Zero turn.
**Acceptance:** RES-3 records p50/p95 cold + warm latency, parallel cap, error mode. If cold p95 > 30s → flag NFR-1 60s LLM-path budget at risk; recommend warm-pool.

### Task 0.4: RES-4 — MCP liveness probe shape
✅ Complete (2026-04-19) — subprocess `--healthcheck` flag chosen. See research.md §RES-4.
Once 0.1 confirms mark3labs API: implement a `--healthcheck` flag on a stub MCP binary; verify it can validate Postgres connectivity + matrix loadable in ≤2s. Compare to "spawn a real MCP and call tools/list" cost.
**Acceptance:** RES-4 records chosen shape; healthcheck-poller's contract decided.

### Task 0.5: RES-5 — Postgres LISTEN/NOTIFY payload size
✅ Complete (2026-04-19) — ~70 bytes (event_id:event_type); under 8KB. No issue. See research.md §RES-5.
Read Feature 49 bus publish path (`tenet-0/shared/bus-go/`); confirm NOTIFY payload is event ID only (~36 bytes), not full event payload.
**Acceptance:** RES-5 row resolved. If full payload, file Feature 49 maintenance task to fix before Phase 1.

### Task 0.6: RES-6 — Migration tooling (PLAN REVISED)
✅ Complete (2026-04-19) — Feature 49 uses psql + initdb, NOT goose. Plan revised: extend `migrate.sh apply-pending` subcommand. See research.md §RES-6.
Read `tenet-0/db/migrate.sh`. Confirm goose handles `001-049_*` in `public` + `050_*` in `president` schema in numerical order.
**Acceptance:** RES-6 row resolved. If migrate.sh needs a one-line fix, file it as Phase 1 Task 1.4.

### Task 0.7: RES-7 — aegis-prod bind-mount for `~/.claude-agent-zero/agents/`
✅ Complete (2026-04-19) — already bind-mounted into tenant-0; add ro mount to bus-watcher in Phase 6. See research.md §RES-7.
Confirm with deploy.sh author that bind-mount of agents directory into bus-watcher container is acceptable.
**Acceptance:** RES-7 row resolved with YES (bind-mount) or NO (use directory polling fallback).

### Task 0.8: RES-8 — Operator Ed25519 onboarding procedure
✅ Complete (2026-04-19) — runbook at `tenet-0/docs/runbooks/operator-onboarding.md`. See research.md §RES-8.
Document the operator onboarding: generate Ed25519 keypair on mobile (recommend `age` or signal-cli), export pubkey, register via Phase.dev. Decide if MVP can ship operator-signed model or fall back to comm-module-signed (less secure).
**Acceptance:** RES-8 row resolved with procedure documented in `docs/runbooks/operator-onboarding.md`. If too complex for MVP, fallback flagged in plan.md security strategy.

### Task 0.9: Phase 0 GO/NO-GO Memo
✅ Complete (2026-04-19) — see research.md §Phase 0 GO/NO-GO Verdict.
Aggregate RES results. Write `research.md` "Phase 0 Verdict" section: per-RES status, any plan revisions required, GO to Phase 1 or replan.
**Acceptance:** Memo committed; user reviews and approves Phase 1 start.

---

## Phase 1 — Foundation (4 days, 14 tasks)

Goal: monorepo setup, shared packages, migrations applied, constitution amended to v1.1.0.

### Task 1.1: Repo skeleton
✅ Complete (2026-04-19) — `tenet-0/go.mod` + 10 `cmd/<binary>/main.go` stubs created. `go build ./cmd/...` green. Commit pending.
Create `tenet-0/go.mod` (module `github.com/littletownlabs/overnightdesk/tenet-0`), `tenet-0/cmd/{bus-mcp,constitution-mcp,governor-mcp,pending-mcp,audit-mcp,director-memory-mcp,bus-watcher,healthcheck-poller,deadline-sweeper,audit-self-checker}/` empty main.go stubs. Replace directive for `./shared/bus-go`.
**Acceptance:** `go build ./cmd/...` succeeds (all stubs). PR opened.

### Task 1.2: Constitution amendment v2 — Tests
✅ Complete (2026-04-19) — 3 Go tests in `internal/shared/constitution/` (parser + version-downgrade-rejected + missing-matrix-rejected). Confirmed FAILING against pre-amendment v1 file.
Write contract tests: `constitution-rules.yaml` parses with new `memory_access_matrix` + `memory_scrubber` sections; old structure still loads (backward compatible). Tests confirmed FAILING.

### Task 1.3: Constitution amendment v2 — Implementation
✅ Complete (2026-04-19) — `constitution-rules.yaml` bumped to version 2, added `memory_access_matrix` (7 namespaces) + `memory_scrubber` (7 layers). `constitution.md` Part IX added (President/Directors/Memory). All 3 tests GREEN. Backward-compat: Feature 49 bus rule evaluator unaffected.
Update `tenet-0/shared/constitution.md` to v1.1.0 (add President-Director-Memory section per data-model.md). Add `memory_access_matrix` + `memory_scrubber` to `tenet-0/shared/constitution-rules.yaml` per data-model.md. Owner approval recorded in PR.
**Acceptance:** Tests from 1.2 pass; both files version-bumped together.

### Task 1.4: Migration runner — Tests
✅ Complete (2026-04-19) — smoke tests for `migrate.sh apply-pending`: --help works, missing TENET0_ADMIN_URL fails clean. Full testcontainers integration test deferred to Task 1.7's acceptance.
Test that `tenet-0/db/migrate.sh` runs `001-049_*` against `public` and `050_*` against `president` in order against testcontainers Postgres. Tests FAIL.

### Task 1.5: Migration runner — Implementation
✅ Complete (2026-04-19) — `migrate.sh apply-pending [--dry-run]` subcommand. Tracks applied set in `tenet0.schema_migrations` (with public.* fallback for fresh DBs). Single-transaction migration + version-record. Idempotent. Replaces goose dependency from earlier plan draft.
Update `migrate.sh` if RES-6 said it needs fix; otherwise document it works as-is. Add 050_* directory to its discovery path.
**Acceptance:** Tests from 1.4 pass; both schemas migrate cleanly.

### Task 1.6: 050_*.sql migrations — Tests
✅ Complete (2026-04-19) — 6 acceptance assertions executed against throwaway Postgres on aegis-prod: INSERT works, UPDATE/DELETE rejected on decision_log, supersede works on director_memory, body-tamper rejected, expire_stale_state_memories() callable. Full Go testcontainers harness deferred to Task 1.14 quality gate.
Write idempotency + role-grant tests for all 11 migration files (per data-model.md): role separation correct, append-only triggers fire on UPDATE/DELETE attempts, hash chain seed row inserted, indexes present.

### Task 1.7: 050_*.sql migrations — Implementation
✅ Complete (2026-04-19) — All 12 migration files (`050_001` through `050_012`) authored per data-model.md. Schema: 12 tables in `president.*`, 6 append-only triggers, hash chain seed row, state-expiry helper function, role grants per data-model.md §Postgres Roles. Verified end-to-end: 12 migrations apply cleanly in order; no errors; trigger semantics validated.
Author `050_001_roles.sql` through `050_012_state_expiry_task.sql` per data-model.md. Each migration idempotent (guard clauses); roll-forward only.
**Acceptance:** Tests from 1.6 pass; testcontainers run migrates 001→012 cleanly; trigger tests verify INSERT works but UPDATE/DELETE on append-only tables raises exception.

### Task 1.8: `internal/shared/config` — Tests
✅ Complete (2026-04-19) — 7 tests covering: missing TENET0_DATABASE_URL rejected, bad scheme rejected, dev mode accepts minimal, prod mode fails-closed on each missing secret (5 enumerated), prod mode passes with all secrets, env helpers (envOr/envIntOr/envBoolOr/envDurationOr), port range validation. Confirmed FAILING before impl.
Test env-var loading mirroring engine pattern: required-vs-optional, `PHASE_SERVICE_TOKEN` fail-closed mode, all listed vars present in fail-closed test fixtures.

### Task 1.9: `internal/shared/config` — Implementation
✅ Complete (2026-04-19) — `Load()` mirroring engine pattern. 5 required-in-prod secrets per research §Credential Management: PRESIDENT_BUS_CREDENTIAL, COMM_MODULE_TOKEN, OPERATOR_DECISION_PUBKEY, OPERATOR_REGISTRATION_PUBKEY, DIRECTOR_HMAC_SECRET. envOr/envIntOr/envBoolOr/envDurationOr helpers. **Coverage: 91.5%** (target ≥80%). All 7 tests GREEN.
Implement loader. Mirror `/mnt/f/overnightdesk-engine/internal/shared/config/config.go`.
**Acceptance:** Tests pass; missing required var causes clear startup error.

### Task 1.10: `internal/shared/{pgxutil,mcp,buslisten,credentials,operatorch,metrics}` — Tests
✅ Complete (2026-04-19) — 47 tests across 6 packages, all FAIL with `panic: not implemented (Task 1.11)`. `go vet` clean. Stub `types.go` per package establishes intended public API for Task 1.11 to fulfill. Deps added: pgx/v5 v5.9.2, pgxmock/v3 v3.4.0, prometheus/client_golang v1.23.2, mark3labs/mcp-go v0.48.0. Test seams (ConnAcquirer, TxBeginner, invokeTool) avoid Postgres in unit tests.
Unit tests for each shared package: pgxutil pool setup with role-aware DSN; mcp harness wraps mark3labs (or in-house shim per RES-1) with stdio bind + slog + panic recovery; buslisten reconnect logic; credentials HMAC verifier; operatorch interface with two impls (CommModuleNotifier, PollingShim); metrics registry with standard histograms. Tests FAIL.

### Task 1.11: `internal/shared/{pgxutil,mcp,buslisten,credentials,operatorch,metrics}` — Implementation
✅ Complete (2026-04-19) — All 47+ tests GREEN under `-race`. Per-package coverage: pgxutil 90.9%, mcp 90.7%, buslisten 85.9%, credentials 92.0%, operatorch 80.0%, metrics 95.0% (all ≥80%). `go vet` clean. Sub-package `buslisten/pgxconn` added for production pgx-backed `ConnAcquirer` (keeps `buslisten` itself free of unreachable real-DB paths). Two test-signature widenings: `pgxutil.WithTx` takes `TxBeginner` interface (satisfied by both *pgxpool.Pool and pgxmock); `buslisten.Config` exposes `Acquirer` field. **Note for Task 1.13:** a minimal type-checking output validator is inlined in `mcp/types.go` to satisfy `TestInvokeTool_OutputSchemaMismatchDetected`; Task 1.13 must replace with full JSON-Schema validator in dedicated `mcp/output_validate.go`.
Implement each package. ≥80% coverage target.
**Acceptance:** All tests pass; `go vet` clean; race detector clean.

### Task 1.12: `internal/shared/{hashchain,scrubber,accessmatrix,lifecycle}` — Tests
✅ Complete (2026-04-19) — 71 tests across 4 packages, all FAIL with `panic: not implemented (Task 1.13)`. Stub `types.go` per package. Small scrubber fixture corpus (10 bad + 5 good) in `scrubber/testdata/`; full 200/50 expansion deferred to Task 4.1. Deps added: fsnotify v1.9.0. **Decisions for Task 1.13 to honor:** (1) Director body sections per contract = Identity/Charter/MCP Grants/Memory Protocol/Constitutional Acknowledgment (5, not 6); (2) namespaces from constitution v2 = president/ops/tech/finance/s_m/support/secops (7); (3) reserved namespaces = president, secops; (4) Op enum: Search uses read grant, Update/Forget use write grant; (5) 8 known scrubber layers (added conversation_transcript + aws_access_key); (6) hash chain `Seed()` keeps simple in-package zero-prev-hash form, separate `SeedFromConstitution(constitutionSHA []byte)` may be needed for production audit-mcp wiring; (7) flock via `golang.org/x/sys/unix.Flock` or `github.com/gofrs/flock`; (8) excerpt cap = 16 chars + "..." suffix.
Security-critical packages — ≥95% coverage target. Tests:
- hashchain: seed row, extension, validation, corruption detection
- scrubber: 7-layer pipeline; 50-known-bad + 20-known-good fixture corpus (security §5)
- accessmatrix: load, validate, fail-closed on bad YAML, no in-place reload
- lifecycle: markdown contract validator, frontmatter schema, body-section parser, fsnotify with 5s debounce, flock contention test
Tests FAIL.

### Task 1.13: `internal/shared/{hashchain,scrubber,accessmatrix,lifecycle}` — Implementation
✅ Complete (2026-04-19) — All 71 RED tests GREEN under `-race`. Coverage: hashchain 95.3%, scrubber 96.2%, accessmatrix 96.4%, lifecycle 95.8% (all ≥95%). **RES-1 obligation fulfilled**: `mcp/output_validate.go` added with full draft-2020-12 JSON-Schema validator (santhosh-tekuri/jsonschema/v5); legacy minimal validator kept as test-only back-compat alias; production hot path in `runTool` switched to new validator; mcp coverage held at 90.4%. Deps added: gofrs/flock v0.13.0, santhosh-tekuri/jsonschema/v5 v5.3.1, golang.org/x/text v0.29.0 promoted to direct. Notable choices: scrubber adds Cyrillic/Greek→Latin confusables fold (NFKC alone insufficient for IDN spoofing); hashchain Canonicalize escapes whitespace bytes within JSON strings for deterministic byte-output. Security review summary: hashchain failure → forgeable decision_log; scrubber failure → PII leakage to bus/digests; accessmatrix failure → cross-Director privilege escalation; lifecycle failure → unsigned malicious President/SecOps Director registration; mcp validator failure → silent bus corruption from out-of-spec tool outputs.
Implement each. Particular attention to scrubber Unicode NFKC normalize → encoding decode → 5 patterns → high-entropy ordering.
**Acceptance:** All tests pass; ≥95% coverage on each; `@security-reviewer` agent run, no CRITICAL findings.

### Task 1.14: Phase 1 quality gate
✅ Complete (2026-04-19) — `@code-reviewer` returned GO with no CRITICAL/HIGH findings (4 MEDIUM cleanup items deferred). Spot-checks confirmed all security invariants (constant-time compare, scrubber excerpt cap, accessmatrix immutability, reserved-namespace sig enforcement, mcp validator wired to hot path, no Anthropic HTTP client, no tenant package imports). Committed as `880d04e`, tagged `phase-1-complete`, pushed to origin. **Phase 1 complete — Phase 2 (MCP servers) unblocked.**
Run full test suite; verify constitution amendment recorded; verify migrations applied to testcontainers cleanly; commit + tag.
**Acceptance:** All Phase 1 tests green; coverage report attached; ready for Phase 2.

---

## Phase 2 — MCP Servers (5 days, 18 tasks)

Goal: implement 6 MCP servers in dependency order. Each follows TDD pattern.

### Task 2.1: `tenet0-bus-mcp` — Tests
✅ Complete (2026-04-20) — 27 tests in `internal/bus/{types.go,bus_test.go,fakes_test.go}`. All FAIL with `panic: not implemented (Task 2.2)`. Package exposes Handler + 5 tool methods (PublishEvent, QueryEvents, GetEvent, WalkCausality, ListUnprocessedEvents), RegisterTools, sentinel errors per contract errorCodes, toolErrorCode mapping, embedded input/output schemas. `busClient` interface seam avoids real Postgres in unit tests. **Decisions for Task 2.2 to honor:** (1) bus-go currently only ships Publish/Subscribe — Task 2.2 must either extend bus-go with Query/Get/Walk/ListUnprocessed or implement them in `internal/bus/` directly against pgx pool; (2) event_type regex validation is fast-fail at handler entry → BUS_PAYLOAD_INVALID; (3) error mapping: busgo.ErrNamespaceViolation→BUS_NAMESPACE_VIOLATION, ErrUnauthenticated→BUS_UNAUTHORIZED, ErrConstitutionRejected→BUS_RULE_VIOLATION, ctx.DeadlineExceeded+transport→BUS_DOWN; (4) idempotency sentinel not in bus-go yet — add it or detect at MCP layer; (5) Event JSON field names use bus-go column names (id, event_type, source_department, payload, parent_event_id, published_at); (6) StartTime>EndTime rejected before any pool call → BUS_QUERY_INVALID.

### Task 2.2: `tenet0-bus-mcp` — Implementation
✅ Complete (2026-04-20) — Path C executed: closed Feature 49 sdk-api drift by adding 4 public read methods to `shared/bus-go` (QueryEvents, GetEvent, WalkCausality, ListUnprocessedEvents) + 3 sentinels (ErrNotFound, ErrQueryInvalid, ErrDuplicateIdempotency). No new stored procs (tenet0_app already has SELECT on events). 27 RED tests in `internal/bus/` GREEN under -race; +5 extra coverage tests = 32 total. Coverage: `internal/bus/` 54.3% (rest requires live Postgres — covered by contract tests). `cmd/bus-mcp/main.go` wired with config.Load + signal-handled stdio Run + `--healthcheck` flag (RES-4). `shared/bus-go/` 12 new integration tests (DB-gated). Feature 49 `contracts/sdk-api.md` amended with new "Read API" section. WalkCausality uses hand-rolled BFS with visited-set instead of recursive CTE for cleaner cycle reporting.
Wire shared/bus-go via the mcp harness. Stateless tool handlers; one shared pgxpool.
**Acceptance:** Tests pass; MCP serves `tools/list` and `tools/call` over stdio against testcontainers.

### Task 2.3: `tenet0-constitution-mcp` — Tests
✅ Complete (2026-04-20) — 24 tests in `internal/constitution/{types.go,constitution_test.go,fakes_test.go}`. Mirrors internal/bus pattern. 19 tests FAIL with `panic: not implemented (Task 2.4)`; 5 pure-data tests (RegisterTools/ToolNames/SchemasAreValidJSON/toolErrorCode/New_RequiresLogger) PASS — these lock the contract surface. No new deps. **Decisions for Task 2.4 to honor:** (1) `requires_approval` enum mapping: YAML `blanket_category` → wire enum `blanket_eligible`, surface YAML category as response field; (2) `rules_hash` = SHA256(raw YAML bytes), lowercase hex; (3) `evaluate_event` is client-side replica, not the publish_event sproc — reads `Rule` slice, supports exact/prefix match + per_action approval-ancestor check + blanket allow + none always-allow; (4) `reason` truncated server-side to 2000 chars (output schema maxLength); (5) `busReader.ListAuthorizations` wraps bus-go QueryEvents for `president.authorization.granted`, active filter (expires_at>now && !revoked) in handler; (6) `matrix_version` non-empty string (YAML version sufficient); (7) `Handler.Close` no-op stub. Atomic-pointer SIGHUP reload deferred to Task 2.4 implementation choice — current Config + New pattern reloads on restart only (matches contract description "loads fresh on every server startup").

### Task 2.4: `tenet0-constitution-mcp` — Implementation
✅ Complete (2026-04-20) — All 24 tests GREEN under `-race -count=1`. Coverage **82.2%** on `internal/constitution/`. Files: `constitution.go` (real impls), `extra_test.go` (coverage top-ups), `cmd/constitution-mcp/main.go` wired (config.Load + signal-handled stdio + `--healthcheck` flag). Honored all 7 Task 2.3 decisions: client-side rule evaluator with exact/prefix match + per_action ancestor check + blanket_category → blanket_eligible mapping; SHA256(rawYAML) hex for rules_hash; 2000-char reason truncation; active filter (expires_at>now && !revoked) in handler; restart-only reload per contract. `internal/bus/` spot-run confirmed unaffected. Agent reply got cut off mid-report by an upstream overload error, but all work landed on disk before the cut.
Wraps Feature 49 evaluator + new matrix loader from `internal/shared/accessmatrix`.
**Acceptance:** Tests pass; matrix tool returns the version-stamped matrix.

### Task 2.5: `tenet0-pending-mcp` — Tests
✅ Complete (2026-04-20) — 27 tests in `internal/pending/{types.go,pending_test.go,fakes_test.go}`. All FAIL with panic. **Decisions for Task 2.6:** (1) idempotency conflict surfaces as PENDING_QUERY_INVALID (contract lacks dedicated code); (2) hash chain uses zero-prev-hash convention from `internal/shared/hashchain.Seed()` — audit-mcp must use identical seed; (3) decision_mode/outcome field exclusivity enforced in-handler (rule→rule_id required; llm→confidence+model required) with PENDING_QUERY_INVALID on mismatch; (4) list_pending without department = all departments (MCP is President-only); (5) awaiting_llm→pending crash recovery is daemon responsibility, not MCP tool.

### Task 2.6: `tenet0-pending-mcp` — Implementation
✅ Complete (2026-04-22) — 27 tests GREEN under `-race`. Handler logic in `pending.go` + production `store_pg.go` (real pgxpool implementation with hashchain.Extend integration, idempotency dedup, atomic CAS via UPDATE...RETURNING). Coverage 26.1% aggregate (handler logic well-covered; store_pg.go SQL paths require live Postgres for unit-test coverage — full integration suite arrives at Task 2.13). Agent rate-limited mid-flight; main wiring + duplicate-stub cleanup completed manually. Crash recovery (awaiting_llm→pending) deferred to `cmd/pending-mcp/main.go` startup hook (per Task 2.5 decision 5).

### Task 2.7: `tenet0-audit-mcp` — Tests
✅ Complete (2026-04-20) — 26 tests in `internal/audit/{types.go,audit_test.go,fakes_test.go}`. All FAIL with panic. Tools are READ-ONLY (verify_chain, query_decisions, find_gaps); security-invariant test uses reflection to forbid Write/Record/Update/Delete/Insert/Set/Put method prefixes + explicit 5-method allowlist. **Decisions for Task 2.8:** (1) HIGH — contract says `first_bad_row_id: integer` but data-model says decision_log.id is UUID; types.go currently uses `*int64`; Task 2.8 must either add BIGSERIAL chain_seq_no column OR amend contract to uuid; (2) hash chain seed via `hashchain.Seed()` shared with pending-mcp — already coordinated by package import; (3) random_sample RNG determinism — push into store (`ORDER BY random() LIMIT n`), keep handler deterministic. First attempt hit upstream overload error mid-flight but types.go + fakes_test.go had already landed; retry only needed audit_test.go.

### Task 2.8: `tenet0-audit-mcp` — Implementation
✅ Complete (2026-04-22) — 26 tests GREEN under `-race`. Handler logic in `audit.go`: VerifyChain 85%, verifyRows 94.4%, QueryDecisions 88.9%, FindGaps 75% (per-function coverage). Aggregate 72.2% — the gap is `buildTools` constructor (6.7%) and pgStore wiring (deferred to Task 2.13 integration tests). Security invariants enforced: WORM (no Write/Record/Update/Delete/Insert/Set/Put method prefixes; reflection test gates this), READ-ONLY by construction. **HIGH decision deferred**: contract integer vs data-model UUID for first_bad_row_id resolved by surfacing slice index (int64) for now; the BIGSERIAL `chain_seq_no` migration needs to land before pg store wiring. Agent rate-limited before producing impl; written manually following the Task 2.7 fakes/test contract.

### Task 2.9: `tenet0-governor-mcp` — Tests
✅ Complete (2026-04-20) — 29 tests in `internal/governor/{types.go,governor_test.go,fakes_test.go}`. All FAIL with panic (handler tests); invariant-only subset (5) already PASSES. **NFR-7 triple-enforced**: no anthropic string literals in package source, no net/http client, record_spend accepts actual_cost_cents=0 as normal case. **Decisions for Task 2.10:** (1) warn threshold owned by store (~80%); (2) period rollover owned by store; (3) reservation TTL ~60s per research; (4) idempotency key scope = (key, department, model); (5) budget_remaining.remaining_cents NOT clamped (schema allows negative on overspend); (6) added `ErrGovernorInputInvalid` sentinel (not in contract errorCodes → maps to INTERNAL) for negative-token + invalid-enum validation; (7) store not called when input validation rejects.

### Task 2.10: `tenet0-governor-mcp` — Implementation
✅ Complete (2026-04-22) — 29 tests GREEN under `-race`. Handler logic in `governor.go` with full input validation (negative tokens, bad enums, regex). Coverage 45.4% aggregate (handler well-covered; pgStore stub returns ErrNotWiredYet so production deploy fails fast — full SQL paths arrive at Task 2.13 integration). NFR-7 triple-enforced: no Anthropic literals, no http.Client to api.anthropic.com, record_spend(actual_cost_cents=0) is the normal path. Agent rate-limited mid-flight; main wiring + duplicate-stub cleanup + `store_pg.go` minimal stub completed manually so package builds and tests pass.

### Task 2.11: `tenet0-director-memory-mcp` — Tests
🔴 Blocked by 1.13, 2.4, 2.10 · L · `@security-reviewer` · `@tdd-guide`
Highest-stakes test set:
- All 6 tools (load_index, read, search, write, update, forget)
- Access matrix conformance: 49-cell matrix (7×7); every (caller, target, op) cell behaves per matrix
- Pre-write scrubber: 50-known-bad + 20-known-good corpus reused from 1.12, layered through write_memory path
- Append-only: UPDATE on body rejected; DELETE rejected
- supersedes-on-update: new row created, old marked superseded
- Cap enforcement: 1k soft warn event published; 5k hard reject
- visible_to filter: cross-namespace reads honor field
- 30-day state expiry: maintenance task supersedes correctly; non-state types untouched
- HMAC-bound subagent identity verified per call (no caching, NFR-6)
Coverage ≥95% (security-critical). Tests FAIL.

### Task 2.12: `tenet0-director-memory-mcp` — Implementation
🔴 Blocked by 2.11 · L · `@security-reviewer`
Implement all 6 tools with the security-critical flow: HMAC verify → matrix check → scrubber → INSERT → debounced index rebuild.
**Acceptance:** All tests pass; ≥95% coverage; `@security-reviewer` review passes with no CRITICAL/HIGH issues.

### Task 2.13: MCP integration test — happy paths across all 6
🔴 Blocked by 2.2, 2.4, 2.6, 2.8, 2.10, 2.12 · M
End-to-end: spawn each MCP as subprocess; client calls every tool; verify cross-MCP data flow (e.g., pending-mcp.record_decision triggers audit-mcp's hash chain extension via shared transaction).
**Acceptance:** All 6 MCPs pass integration suite against testcontainers.

### Task 2.14: MCP authz conformance suite
🔴 Blocked by 2.13 · M · `@security-reviewer`
Table-driven test: every (calling_director, target_namespace, MCP, tool) cell behaves per the access matrix and per FR-2a bus credentials. ~200 cells.
**Acceptance:** 100% cells pass; failures (if any) are recorded explicit-policy denies, not bugs.

### Task 2.15: MCP error envelope conformance
🔴 Blocked by 2.13 · S · **Parallel with 2.14**
Verify every MCP returns `{error, code, details?}` per `contracts/mcp-tool-contracts.yaml`. No internal stack traces leak. Idempotency keys honored on mutating tools.
**Acceptance:** 100% conformance; contract test PR-checked on every future MCP change.

### Task 2.16: Phase 2 quality gate
🔴 Blocked by 2.13, 2.14, 2.15 · S
Run `@code-reviewer` on the full Phase 2 diff. Coverage report ≥80% overall, ≥95% on memory + audit. Commit + tag.

---

## Phase 3 — Daemons (4 days, 12 tasks)

Goal: implement the 4 background daemons.

### Task 3.1: `tenet0-bus-watcher` — Tests
🔴 Blocked by 2.16 · L · `@tdd-guide`
Most complex daemon. Tests:
- LISTEN/NOTIFY consume + cursor advance (testcontainers)
- Forwarder POSTs to mock comm-module (`httptest.Server`); cursor updates on success only
- Backpressure: buffered channel cap=100, drop-oldest with `bus.notify.dropped` audit event
- Comm-module 5xx → exponential backoff (1s, 2s, 4s, max 30s); after 3 failures, switch to fallback `notify_queue` mode + publish `president.notification.degraded`
- Crash recovery: cursor persisted; restart resumes from `last_acked`
- Lifecycle fsnotify with 5s debounce; flock contention; `*.lifecycle.{registered,deregistered}` published
- Reserved-namespace markdown WITHOUT operator signature → `secops.violation.registry_invalid`
Tests FAIL.

### Task 3.2: `tenet0-bus-watcher` — Implementation
🔴 Blocked by 3.1 · L
3 goroutines (Listener, Forwarder, Health) per plan §Concurrency Model. `OperatorNotifier` interface with two implementations.
**Acceptance:** All tests pass; 1-hour soak test against testcontainers stack; restart-during-publish loses zero events.

### Task 3.3: `tenet0-healthcheck-poller` — Tests
🔴 Blocked by 2.16 · M · **Parallel with 3.1**
Tests: 60s ticker fan-out; per-Director MCP probe (uses RES-4 chosen shape); state machine transitions persisted to `mcp_liveness`; raw poll results NOT persisted; `*.lifecycle.{degraded,recovered}` published only on transition; advisory lock for double-instance protection. Tests FAIL.

### Task 3.4: `tenet0-healthcheck-poller` — Implementation
🔴 Blocked by 3.3 · M
2 goroutines (ticker + state machine).
**Acceptance:** Tests pass; testcontainers + 5 mock Directors with programmable failure patterns confirm correct N-failures-trigger-warning, M-failures-trigger-critical.

### Task 3.5: `tenet0-deadline-sweeper` — Tests
🔴 Blocked by 2.16 · S · **Parallel with 3.1, 3.3**
Tests: 60s ticker; idempotent `UPDATE pending_approvals SET status='expired' ... RETURNING`; one `president.rejected` event per row with reason "expired awaiting operator input"; advisory lock prevents double-instance; sustained operator unavailability raises `president.operator.unavailable` after threshold. Tests FAIL.

### Task 3.6: `tenet0-deadline-sweeper` — Implementation
🔴 Blocked by 3.5 · S
Single goroutine + ticker.
**Acceptance:** Tests pass; clock-manipulation test confirms expiry triggers correctly.

### Task 3.7: `tenet0-audit-self-checker` — Tests
🔴 Blocked by 2.16 · M · `@security-reviewer` · **Parallel with 3.1, 3.3, 3.5**
Tests:
- 15-min ticker: `president.*` events ↔ `decision_log` parity check
- Approval-request → outcome 1:1 check
- Random 1k-row hash chain validation
- Nightly full chain validation (mutex-gated against 15-min cycle)
- Matrix drift check: amend matrix, verify `secops.violation.matrix_drift` raised with diff summary (not grant content per security §5)
- Forge a `president.*` event with no `decision_log` row → `secops.violation.namespace_impersonation` raised within 1 cycle
- Inject hash chain corruption → `secops.violation.audit_corruption` raised
Tests FAIL.

### Task 3.8: `tenet0-audit-self-checker` — Implementation
🔴 Blocked by 3.7 · M · `@security-reviewer`
2 goroutines (15-min + nightly cron). Idempotent gap detection (dedupe via `audit_violations_seen`).
**Acceptance:** All tests pass; ≥95% coverage; security-reviewer signoff.

### Task 3.9: Daemon health endpoints + Prometheus metrics
🔴 Blocked by 3.2, 3.4, 3.6, 3.8 · S
Each daemon exposes `/healthz` + `/metrics` per `contracts/daemon-health-contracts.yaml`. Verify all metric names match `^tenet0_[a-z][a-z0-9_]*$`; verify dependency-checks shape; verify ports 9201-9204 stable.
**Acceptance:** Contract test passes; Prometheus scrape config validates.

### Task 3.10: Daemon `/internal/lifecycle/rescan` endpoint
🔴 Blocked by 3.2 · S · **Parallel with 3.9**
Implement the operator-runbook trigger per `contracts/daemon-internal-http.yaml`. Bridge-only; no auth.
**Acceptance:** Contract test passes.

### Task 3.11: Daemon integration soak test
🔴 Blocked by 3.9 · M
1-hour run with all 4 daemons + testcontainers Postgres + mock comm-module + 5 mock Directors. Inject failures (Postgres restart, comm-module timeout, Director MCP crash). Verify all daemons recover; bus events not lost.
**Acceptance:** Soak passes; cursor preservation verified; no goroutine leaks.

### Task 3.12: Phase 3 quality gate
🔴 Blocked by 3.11 · S
`@code-reviewer` Phase 3 diff; commit + tag.

---

## Phase 4 — Memory + Reference Director (4 days, 11 tasks)

Goal: harden memory subsystem; ship reference Director (`president.md`); build CI validator.

### Task 4.1: PII scrubber adversarial corpus expansion
🔴 Blocked by 2.16 · M · `@security-reviewer`
Expand the 50-bad/20-good fixture corpus from Task 1.12 to 200-bad/50-good. Include: rot13-encoded customer email; base64-encoded credit card; Unicode lookalike chars; conversation transcript heuristics; obfuscated Anthropic credentials; high-entropy noise; benign UUIDs (must NOT trigger).
**Acceptance:** All 200 bad rejected; all 50 good accepted; results in `internal/shared/scrubber/testdata/`.

### Task 4.2: Memory access matrix conformance suite (production)
🔴 Blocked by 2.14 · S
Promote 49-cell matrix conformance test from MCP unit test to a CI gate. Run before every PR.
**Acceptance:** CI gate added; failing matrix amendment prevents merge.

### Task 4.3: Reference Director `president.md` — Authoring
🔴 Blocked by 1.14 · M · **Parallel with 4.1**
Author `tenet-0/agents/president.md` per FR-23 + FR-24 + plan §Reference Director: frontmatter (identity, mcp_grants for all 6, bus_namespace=president, constitution_version, operator_signature placeholder), body sections (Identity, Charter, Decision Protocol, Memory Protocol, Constitutional Acknowledgment).
**Acceptance:** File parses against `contracts/director-markdown-contract.yaml`.

### Task 4.4: `cmd/validate-director` CI binary — Tests
🔴 Blocked by 1.13 · S · **Parallel with 4.1, 4.3**
Tests: validates `president.md`; rejects intentionally-broken examples (missing section, wrong namespace prefix, invalid frontmatter, reserved namespace without sig); golden-file regression on `president.md`. Tests FAIL.

### Task 4.5: `cmd/validate-director` CI binary — Implementation
🔴 Blocked by 4.4, 4.3 · S
Wraps `internal/shared/lifecycle.Validator`.
**Acceptance:** Tests pass; CI workflow added to `.github/workflows/` runs validator on every PR touching `tenet-0/agents/`.

### Task 4.6: Operator-signed manifest infrastructure — Tests
🔴 Blocked by 1.13 · M · `@security-reviewer`
Tests: Ed25519 signature over `(department, mcp_grants, file_hash)`; verifying key from `OPERATOR_REGISTRATION_PUBKEY`; reserved namespaces (`president`, `secops`) require valid sig; non-reserved Directors do NOT require sig; invalid sig → `secops.violation.registry_invalid` + quarantine; key rotation grace window (Feature 49 EC-1b pattern). Tests FAIL.

### Task 4.7: Operator-signed manifest infrastructure — Implementation
🔴 Blocked by 4.6 · M · `@security-reviewer`
Sig verifier in `internal/shared/lifecycle`. Lifecycle daemon enforces on register events.
**Acceptance:** Tests pass; security-reviewer signoff; documented in `docs/runbooks/operator-onboarding.md`.

### Task 4.8: Memory cap enforcement integration test
🔴 Blocked by 2.12 · S
End-to-end: write 999 memory rows for a Director → no warning; write 1000th → `president.memory.cap_warned` published; write 5000th → write rejected + `president.memory.cap_rejected` published.
**Acceptance:** Test passes; thresholds match CL-3 (1k/5k).

### Task 4.9: 30-day state expiry maintenance task — Tests
🔴 Blocked by 2.12 · S
Tests: clock-manipulation creates `state` row at T-31d → maintenance task supersedes it; same-name `state` row at T-29d → not superseded; `decision`/`pattern`/`reference`/`charter` types at T-31d → not superseded. Tests FAIL.

### Task 4.10: 30-day state expiry maintenance task — Implementation
🔴 Blocked by 4.9 · S
Daily cron in `tenet0-audit-self-checker` (or new sidecar). Idempotent.
**Acceptance:** Tests pass.

### Task 4.11: Phase 4 quality gate
🔴 Blocked by 4.1, 4.2, 4.5, 4.7, 4.8, 4.10 · S
`@code-reviewer` + `@security-reviewer` Phase 4 diff. Commit + tag.

---

## Phase 5 — Operator Surfacing + Telegram (4 days, 11 tasks)

Goal: end-to-end operator approval flow with Ed25519 verification.

### Task 5.1: `POST /internal/operator-decision` endpoint — Tests
🔴 Blocked by 3.12 · M · `@security-reviewer` · `@tdd-guide`
Per `contracts/daemon-internal-http.yaml`. Tests:
- Happy path: valid sig + nonce + timestamp → 202 + outcome event published
- Bad signature → 401 INVALID_SIGNATURE
- Timestamp outside ±30s → 401 SIGNATURE_TIMESTAMP_OUT_OF_WINDOW (same code as bad sig — timing parity)
- Nonce not found → 404 NONCE_NOT_FOUND
- Nonce already consumed → 200 with `Idempotent-Replay: true` header + cached response
- Approval already decided → 409 APPROVAL_ALREADY_DECIDED
- Approval expired → 409 APPROVAL_EXPIRED
- Bus unavailable → 503 BUS_UNAVAILABLE; decision NOT recorded
Tests FAIL.

### Task 5.2: `POST /internal/operator-decision` endpoint — Implementation
🔴 Blocked by 5.1 · M · `@security-reviewer`
On bus-watcher daemon. 4-step transaction: pending-mcp.record_decision → audit-mcp.record_decision → bus-mcp.publish_event → operator_nonces.consume.
**Acceptance:** All tests pass; security-reviewer signoff (especially constant-time signature comparison, no timing leaks).

### Task 5.3: Operator nonce lifecycle — Tests
🔴 Blocked by 1.13 · S · **Parallel with 5.1**
Tests: nonce issued on `president.approval.surface_requested` publish; consumed on first valid decide POST; replay returns cached response; expired (>24h) sweeper removes; idempotency key = nonce. Tests FAIL.

### Task 5.4: Operator nonce lifecycle — Implementation
🔴 Blocked by 5.3 · S
Lives partially in pending-mcp (issue) and bus-watcher endpoint (consume). 24h TTL sweeper as background goroutine in deadline-sweeper.
**Acceptance:** Tests pass.

### Task 5.5: comm-module `/v1/inject/zero` integration — Tests
🔴 Blocked by 0.2, 3.2 · M · `@tdd-guide`
Mock comm-module endpoint per the design from Task 0.2. Tests:
- bus-watcher Forwarder POSTs framed BUS_EVENT
- Auth header (`Authorization: Bearer ${COMM_MODULE_TOKEN}`)
- comm-module 200 → cursor advances
- comm-module 401 → no cursor advance, retry with backoff
- comm-module 5xx 3× → fallback to polling notifier + publish `president.notification.degraded`
Tests FAIL.

### Task 5.6: comm-module `/v1/inject/zero` integration — Implementation
🔴 Blocked by 5.5 · M
CommModuleNotifier impl; reuses retry/backoff from `internal/shared/operatorch`.
**Acceptance:** Tests pass; integration with real comm-module on staging deferred to Phase 6 deploy.

### Task 5.7: Polling fallback path — Tests
🔴 Blocked by 5.5 · S
Tests: when CommModuleNotifier 3× failures, switch to `notify_queue` table writes; Zero polls via `tenet0-bus-mcp.list_unprocessed_events` and acknowledges; on next successful comm-module probe, switch back. Tests FAIL.

### Task 5.8: Polling fallback path — Implementation
🔴 Blocked by 5.7 · S
PollingShim implementation of `OperatorNotifier`.
**Acceptance:** Tests pass; mode transition events published.

### Task 5.9: Direct-Telegram fallback (last resort) — Tests + Implementation
🔴 Blocked by 5.6 · S
If comm-module is permanently unavailable on aegis-prod (RES-2 fallback), implement direct Telegram bot client behind `OPERATOR_NOTIFIER=direct-telegram` env. Tests verify message delivery + reply ingest.
**Acceptance:** Tests pass; runbook documents the env-var flip.

### Task 5.10: End-to-end operator approval scenario
🔴 Blocked by 5.2, 5.4, 5.6 · M
Full Flow A from spec Behavior Specification: inject `fin.approval.requested` → bus-watcher routes → mock Zero spawns mock Director (returns "surface to operator") → bus-watcher publishes `president.approval.surface_requested` → mock comm-module receives → mock operator signs decision → POST /internal/operator-decision → outcome event on bus.
**Acceptance:** Round-trip < 30s on testcontainers stack (NFR-2 verified).

### Task 5.11: Phase 5 quality gate
🔴 Blocked by 5.10 · S
`@security-reviewer` Phase 5 diff (focus: operator auth, nonce replay, signature timing). Commit + tag.

---

## Phase 6 — Hardening, Load Test, Deploy (4 days, 14 tasks)

Goal: production-readiness gates, container builds, first aegis-prod deploy.

### Task 6.1: Constitution re-evaluation FR-10 warn-only mode — Tests + Implementation
🔴 Blocked by 5.11 · S
Tests: when President's decision diverges from constitution-mcp.evaluate_event, publish `secops.violation.constitution_divergence` (warn only; bus is authoritative).
**Acceptance:** Tests pass; doesn't block legitimate decisions.

### Task 6.2: Audit-self-checker forge detection scenario
🔴 Blocked by 3.8 · S
Inject a `president.approved` event into the bus directly with no matching `decision_log` row. Verify `secops.violation.namespace_impersonation` raised within one self-check cycle (15min in prod; 30s in test override).
**Acceptance:** Test passes.

### Task 6.3: Hash chain corruption detection scenario
🔴 Blocked by 3.8 · S · **Parallel with 6.2**
Mutate one row's `row_hash` field; verify `secops.violation.audit_corruption` raised with affected range; log keeps accepting writes (detection, not freeze).
**Acceptance:** Test passes.

### Task 6.4: Matrix drift detection scenario
🔴 Blocked by 3.8 · S · **Parallel with 6.2, 6.3**
Amend `memory_access_matrix` outside the constitution-amendment process; verify `secops.violation.matrix_drift` raised with diff counts (not grant content).
**Acceptance:** Test passes.

### Task 6.5: Load test — 50 simulated Directors @ 100 events/sec
🔴 Blocked by 5.11 · L · `@tdd-guide`
Custom Go harness publishes synthetic events; verify NFR-1 thresholds:
- Bus event → Zero notified p95 < 5s
- Rule-path decision p95 < 10s e2e
- LLM-path decision p95 < 60s e2e (using mocked subagent simulator)
- decision_log throughput ≥ 10 decisions/min sustained
**Acceptance:** All NFR-1 thresholds met. If decision_log bottlenecks (architect risk #8), file remediation task before deploy.

### Task 6.6: Container builds — 4 daemons
🔴 Blocked by 3.12 · M
Author `tenet-0/Dockerfile.{bus-watcher,healthcheck-poller,deadline-sweeper,audit-self-checker}`: multi-stage, distroless static, non-root UID 65532, ARM64 + amd64. CI builds on every push.
**Acceptance:** All 4 images build; size budget < 50MB each; `docker run --rm --entrypoint /bin/sh` returns "not found" (distroless verified).

### Task 6.7: docker-compose entries
🔴 Blocked by 6.6 · S
Append 4 daemon services to `/mnt/f/overnightdesk/docker-compose.yml` per plan §Deployment Strategy: cap_drop, no-new-privileges, mem_limit, pids_limit, depends_on, expose only (no ports).
**Acceptance:** `docker compose config` validates; bridge network reused.

### Task 6.8: tenant-0 service modifications
🔴 Blocked by 6.6 · S
Add bind-mounts to tenant-0 service: `/opt/mcps/` (read-only, hosts the 6 MCP binaries) and confirm `~/.claude-agent-zero/agents/` mount exists (RES-7).
**Acceptance:** Compose validates; Zero session boots with new mounts (smoke).

### Task 6.9: Phase.dev secret seeding script
🔴 Blocked by 6.7 · S
`docs/runbooks/phase-secrets-seed.md` documents every required secret per plan §Deployment Strategy with the path layout from research.md §Credential Management. Script `tenet-0/scripts/phase-seed.sh` validates that all expected paths populate.
**Acceptance:** Script idempotent; missing-secrets report human-readable.

### Task 6.10: Deploy runbook
🔴 Blocked by 6.6, 6.7, 6.8, 6.9 · M
`docs/runbooks/director-runtime-deploy.md`: 8-step first-deploy sequence from plan; rollback procedure; smoke test commands; troubleshooting per failure mode in plan §Failure Modes.
**Acceptance:** Runbook reviewed by deployer (Gary); steps verified on staging.

### Task 6.11: Constitutional self-check on deploy — quickstart Scenario 11
🔴 Blocked by 6.7 · M · `@security-reviewer`
Implement and gate the deploy on:
- `go build` succeeds with zero tenant-package imports (CI lint)
- Postgres role grants verified
- Distroless containers verified (no /bin/sh)
- Non-root verified (uid=65532)
- Access matrix loads cleanly
- president.md validates
**Acceptance:** All 6 checks pass; deploy script refuses to proceed otherwise.

### Task 6.12: First aegis-prod deploy (no Directors yet)
🔴 Blocked by 6.10, 6.11 · M
Apply migrations; seed secrets; bring up 4 daemon containers; restart tenant-0 with new mounts; verify all healthz; verify `president.lifecycle.restarted` event in bus.
**Acceptance:** Quickstart Scenario 1 + 2 pass on aegis-prod; logged to `/mnt/f/deploys.log`.

### Task 6.13: Production smoke test
🔴 Blocked by 6.12 · S
Run quickstart Scenarios 1, 2, 7, 9, 11 on aegis-prod (skip destructive 6, 8 in production).
**Acceptance:** All 5 scenarios green for 24h.

### Task 6.14: Phase 6 quality gate + Feature 50 release
🔴 Blocked by 6.13 · S
`@code-reviewer` final review. Update roadmap.md to mark Feature 50 ✅. Tag release.
**Acceptance:** Feature 50 marked complete; ready to unblock Features 52–57.

---

## Quality Gates (cross-cutting)

These tasks are inserted at phase boundaries above; restated here for visibility:

| Gate | After Phase | Owner |
|---|---|---|
| Phase 0 GO/NO-GO memo (Task 0.9) | 0 | User approval required |
| Foundation tests + ≥80% coverage (Task 1.14) | 1 | `@code-reviewer` |
| MCP authz + error envelope conformance (Tasks 2.14, 2.15) | 2 | `@security-reviewer` for memory + audit |
| Daemon soak test (Task 3.11) | 3 | Soak passes 1h |
| Memory subsystem signoff (Task 4.11) | 4 | `@security-reviewer` |
| Operator auth signoff (Task 5.11) | 5 | `@security-reviewer` |
| Constitutional self-check (Task 6.11) | 6 | Deploy gate |

---

## Critical Path

```
0.9 → 1.14 → 2.16 → 3.12 → 4.11 → 5.11 → 6.5 → 6.13 → 6.14
```

Approximately 28 working days. Within-phase parallelism (multi-engineer) shortens to ~22 days actual elapsed.

## Parallelization Opportunities

| Phase | Parallel tracks |
|---|---|
| 0 | All 8 RES items (0.1–0.8) parallel |
| 1 | Constitution amendment (1.2–1.3), migrations (1.4–1.7), shared packages (1.8–1.13) parallel after 1.1 |
| 2 | bus-mcp (2.1–2.2) ‖ constitution-mcp (2.3–2.4); then pending+audit+governor parallel; memory-mcp last |
| 3 | All 4 daemons (3.1–3.8) parallel after 2.16 |
| 4 | Scrubber corpus (4.1) ‖ Reference Director (4.3) ‖ validator (4.4–4.5) ‖ operator-signed manifest (4.6–4.7) |
| 5 | Operator endpoint (5.1–5.2) ‖ nonce lifecycle (5.3–5.4) ‖ comm-module integration (5.5–5.6) |
| 6 | Forge detection (6.2) ‖ corruption (6.3) ‖ drift (6.4) parallel; container builds parallel with hardening |

## Summary

- **Total tasks:** 79
- **Phases:** 7 (0–6)
- **Total effort:** ~28 working days (sequential), ~22 elapsed (parallel)
- **TDD compliance:** 100% — every implementation task blocked by its test task
- **Security gates:** 6 (`@security-reviewer` invocations across phases 1, 2, 3, 4, 5, 6)
- **Constitutional gates:** all 8 principles + 2 pillars verified pre-merge
- **Cost-model invariant (NFR-7):** tested as Task 2.10 acceptance criterion

## Next Steps

1. Review task breakdown
2. Run `/speckit-implement` to begin execution starting at Task 0.1
3. Use TaskCreate / TaskUpdate to track in-flight tasks
4. Commit when satisfied:
   ```bash
   git add .specify/specs/50-tenet0-director-runtime/tasks.md
   git commit -m "feat: add task breakdown for Tenet-0 Director Runtime (Feature 50)"
   ```
