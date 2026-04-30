# Task Breakdown — Feature 13: Platform Knowledge Intelligence

**Branch:** 13-platform-knowledge-intelligence
**Plan:** `.specify/specs/13-platform-knowledge-intelligence/plan.md`
**Total Tasks:** 28
**Estimated Duration:** 6 days (with parallelization in Phase 2)

---

## User Story → Task Map

| User Story | Tasks |
|-----------|-------|
| US-1: Automated fact collection | 2.1–2.10 |
| US-2: Trust-weighted knowledge | 1.1–1.2 (confidence derivation) |
| US-3: Unified full-text search | 1.1–1.2 (FTS5 schema), 3.1–3.2 |
| US-4: Platform health summary | 3.3–3.4 |
| US-5: Semantic incident recall | 4.1–4.2, 3.7–3.8 |
| US-6: Fact lineage visibility | 5.1–5.2 |
| US-7: Collection cycle visibility | 2.9–2.10, 3.5–3.6, 5.1–5.2 |

---

## Critical Path

```
1.1 → 1.2 → 1.3 → 2.9 → 2.10 → 3.3 → 3.4 → QG-1 → 4.1 → 4.2 → 5.1 → 5.2 → QG-2
```
(Collectors in Phase 2 are parallel off the critical path — 2.1–2.8 run alongside 2.9/2.10 tests)

---

## Phase 1: SQLite Fact Store Foundation

---

### Task 1.1 — Fact Store: Tests
**Status:** 🟡 Ready
**Effort:** 3 hours
**Dependencies:** None
**Parallel with:** Nothing — must complete before 1.2

**Description:**
Write the full test suite for `src/lib/fact-store.ts` before the file exists. Run tests —
they must fail (RED). Covers the schema initialization, UPSERT logic, stale marking, FTS5
triggers, confidence derivation, and collection run records.

**Test file:** `src/lib/fact-store.test.ts`

**Acceptance Criteria:**
- [ ] `openFactStore(path)` creates DB file with all tables and indexes (verified by querying sqlite_master)
- [ ] `upsertFact(...)` inserts new row on first call; increments `observation_count` and
      refreshes `last_confirmed_at` on subsequent call with same (domain, subject, key)
- [ ] Fact value change on upsert: value updates, count increments, `is_stale` resets to 0
- [ ] `markStale(beforeTimestamp)` sets `is_stale=1` only on facts whose `last_confirmed_at`
      is before the given timestamp; leaves newer facts unchanged
- [ ] FTS5 insert trigger fires: immediately after `upsertFact`, `queryFTS('nginx')` returns
      the inserted fact
- [ ] FTS5 update trigger fires: after value change, FTS index reflects new value not old
- [ ] Confidence derivation:
      - `observation_count=1, is_stale=0` → `low`
      - `observation_count=2, last_confirmed=5 days ago, is_stale=0` → `medium`
      - `observation_count=5, last_confirmed=1 day ago, is_stale=0` → `high`
      - `is_stale=1` → `stale` (regardless of other fields)
- [ ] `insertCollectionRun` creates row with status `running`; `updateCollectionRun` sets
      counts and `completed_at`
- [ ] `getRecentRuns(5)` returns 5 most recent runs ordered newest-first
- [ ] `bootstrapFromYaml(knowledgeDir)` with fixture YAML produces correct fact rows with
      `source='yaml-seed'`; calling it twice does not duplicate rows
- [ ] WAL mode is enabled: `PRAGMA journal_mode` returns `wal`
- [ ] All tests FAIL before implementation (confirm by running with empty fact-store.ts stub)

---

### Task 1.2 — Fact Store: Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 3 hours
**Dependencies:** Task 1.1

**Description:**
Implement `src/lib/fact-store.ts` to make all tests from 1.1 pass (GREEN). No extra behaviour
beyond what the tests specify.

**Acceptance Criteria:**
- [ ] All tests from 1.1 pass
- [ ] `better-sqlite3` added to `package.json`
- [ ] `FACTS_DB_PATH` env var controls DB file location (default `/data/facts.db`)
- [ ] Schema applied via `CREATE TABLE IF NOT EXISTS` on every open (idempotent)
- [ ] WAL mode enabled on open: `db.pragma('journal_mode = WAL')`
- [ ] Exported functions: `openFactStore`, `upsertFact`, `markStale`, `queryFTS`,
      `getConfidenceLevel`, `getHealthSummary`, `insertCollectionRun`, `updateCollectionRun`,
      `getRecentRuns`, `bootstrapFromYaml`
- [ ] TypeScript types exported for `Fact`, `CollectionRun`, `ConfidenceLevel`
- [ ] No `console.log` statements

---

### Task 1.3 — Docker Compose & Volume Setup
**Status:** 🔴 Blocked by 1.2
**Effort:** 1 hour
**Dependencies:** Task 1.2

**Description:**
Update `docker-compose.yml` on the server to add the `ops-facts-data` named volume and the
read-only nginx conf mount. Update the ops service `Dockerfile` if needed for
`better-sqlite3` native compilation.

**Acceptance Criteria:**
- [ ] `ops-facts-data` named volume declared in `volumes:` section of compose file
- [ ] ops service mounts `ops-facts-data:/data`
- [ ] ops service mounts `/opt/overnightdesk/nginx/conf.d:/etc/nginx/conf.d:ro`
- [ ] Dockerfile installs build tools if needed for better-sqlite3 native module
      (`apk add python3 make g++` in Alpine builder stage)
- [ ] `docker compose config` validates without error
- [ ] Ops service restarts cleanly with new volume — no crash on startup

---

## Phase 2: Collection Engine

> Tasks 2.1–2.8 (the four collector pairs) can run in parallel with each other.
> Tasks 2.9–2.10 (the orchestrating engine + scheduler) depend on all collectors being done.

---

### Task 2.1 — Docker Collector: Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 2 hours
**Dependencies:** Task 1.2
**Parallel with:** Tasks 2.3, 2.5, 2.7

**Description:**
Write tests for `src/lib/collectors/docker.ts` using a mock dockerode instance.

**Test file:** `src/lib/collectors/docker.test.ts`

**Acceptance Criteria:**
- [ ] Mock returns two containers (one running, one stopped); collector writes correct fact rows
      for each: status, image, port list, restart policy, network membership
- [ ] Port mapping fact value is comma-separated list of host ports (`"80,443"`)
- [ ] Container with no ports produces fact with `value=''` not an error
- [ ] Docker proxy unreachable → collector returns `{ created:0, updated:0, errors:['...'] }`
      without throwing
- [ ] Second call with same container data increments `observation_count` on existing facts
      (upsert verified)
- [ ] `DOCKER_PROXY_URL` env controls connection target
- [ ] All tests FAIL before implementation

---

### Task 2.2 — Docker Collector: Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 2 hours
**Dependencies:** Task 2.1

**Acceptance Criteria:**
- [ ] All tests from 2.1 pass
- [ ] `dockerode` added to `package.json`
- [ ] Connects via `DOCKER_PROXY_URL` (default `http://overnightdesk-docker-socket-proxy:2375`)
- [ ] Uses `docker.listContainers({ all: true })` — includes stopped containers
- [ ] Per-container facts written per data-model.md schema (`domain='service'`)
- [ ] 10-second timeout on Docker API call; error recorded in return value on timeout
- [ ] No environment variable values extracted from container inspect

---

### Task 2.3 — nginx Collector: Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 1.5 hours
**Dependencies:** Task 1.2
**Parallel with:** Tasks 2.1, 2.5, 2.7

**Description:**
Write tests for `src/lib/collectors/nginx.ts` using fixture nginx config files.

**Test file:** `src/lib/collectors/nginx.test.ts`
**Fixture:** `src/lib/collectors/__fixtures__/default.conf` (a representative nginx config)

**Acceptance Criteria:**
- [ ] Fixture with 3 location blocks → 3 route facts in DB
- [ ] `proxy_pass` value correctly parsed as upstream value
- [ ] Location block with `auth_request` directive → `auth` fact value `bearer`
- [ ] Location block without auth directive → `auth` fact value `none`
- [ ] Config file not found (mount missing) → error recorded, no throw
- [ ] Malformed location block skipped; parse continues; error recorded
- [ ] `NGINX_CONF_PATH` env controls file location (default `/etc/nginx/conf.d/default.conf`)
- [ ] All tests FAIL before implementation

---

### Task 2.4 — nginx Collector: Implementation
**Status:** 🔴 Blocked by 2.3
**Effort:** 1.5 hours
**Dependencies:** Task 2.3

**Acceptance Criteria:**
- [ ] All tests from 2.3 pass
- [ ] Reads config file synchronously (collection cycle is already async-bounded)
- [ ] Regex-based parser for `location` and `proxy_pass` directives — no heavy nginx parser dep
- [ ] Facts written with `domain='network'`, `subject=path_pattern`, per data-model.md
- [ ] Returns `{ created, updated, errors }`

---

### Task 2.5 — Postgres Collector: Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 2 hours
**Dependencies:** Task 1.2
**Parallel with:** Tasks 2.1, 2.3, 2.7

**Description:**
Write tests for `src/lib/collectors/postgres.ts` using a mock `pg.Pool`.

**Test file:** `src/lib/collectors/postgres.test.ts`

**Acceptance Criteria:**
- [ ] Mock returns 3 tables + row counts → 3 `table` facts + 3 `row_count:tableName` facts per DB
- [ ] Multiple DB instances: each produces its own facts under separate `subject`
- [ ] Postgres unreachable → error recorded for that instance, other instances still collected
- [ ] `information_schema.tables` query uses `table_schema = 'public'` filter
- [ ] `pg_stat_user_tables` query used for row count approximation (not `COUNT(*)`)
- [ ] No column values or row data extracted — schema metadata only
- [ ] Max 200 tables per DB instance (configurable via `POSTGRES_TABLE_LIMIT` env)
- [ ] All tests FAIL before implementation

---

### Task 2.6 — Postgres Collector: Implementation
**Status:** 🔴 Blocked by 2.5
**Effort:** 2 hours
**Dependencies:** Task 2.5

**Acceptance Criteria:**
- [ ] All tests from 2.5 pass
- [ ] Reads target DB instances from fact store (subjects where `domain='database'`, `key='host'`)
      — seeded from YAML on first run
- [ ] Uses read-only pool per configured `DATABASE_URL` env vars
- [ ] Per-instance 10-second connection timeout
- [ ] Facts written with `domain='database'` per data-model.md schema
- [ ] Returns `{ created, updated, errors }`

---

### Task 2.7 — Audit Collector: Tests
**Status:** 🔴 Blocked by 1.2
**Effort:** 1 hour
**Dependencies:** Task 1.2
**Parallel with:** Tasks 2.1, 2.3, 2.5

**Description:**
Write tests for `src/lib/collectors/audit.ts` using a mock `pg.Pool` (COO audit DB).

**Test file:** `src/lib/collectors/audit.test.ts`

**Acceptance Criteria:**
- [ ] Mock returns 2 open findings → 4 facts each (severity, status, finding, last_seen)
      with `subject='{check_id}/{finding_subject}'`
- [ ] `DATABASE_URL` absent → collector returns `{ created:0, updated:0, errors:[] }` (no-op)
- [ ] DB unreachable → error recorded, no throw
- [ ] All tests FAIL before implementation

---

### Task 2.8 — Audit Collector: Implementation
**Status:** 🔴 Blocked by 2.7
**Effort:** 1 hour
**Dependencies:** Task 2.7

**Acceptance Criteria:**
- [ ] All tests from 2.7 pass
- [ ] Uses existing `dbPool` from `mcp/server.ts` (passed as argument, not re-created)
- [ ] Queries `coo_findings` for all statuses (not just open) — full picture
- [ ] Facts written with `domain='finding'` per data-model.md schema
- [ ] Returns `{ created, updated, errors }`

---

### Task 2.9 — Collection Engine & Scheduler: Tests
**Status:** 🔴 Blocked by 2.2, 2.4, 2.6, 2.8
**Effort:** 2 hours
**Dependencies:** Tasks 2.2, 2.4, 2.6, 2.8

**Description:**
Write tests for `src/lib/collection-engine.ts` and `src/lib/scheduler.ts` with all four
collectors mocked.

**Test file:** `src/lib/collection-engine.test.ts`

**Acceptance Criteria:**
- [ ] `runCollectionCycle('scheduled')` with all collectors succeeding:
      - `collection_runs` row created with `status='running'`, updated to `status='completed'`
      - `facts_created`, `facts_updated`, `facts_staled` counts are accurate
      - `sources_failed` is empty array
- [ ] `runCollectionCycle` called concurrently (two simultaneous calls):
      - First returns `{ status: 'completed' }`
      - Second returns `{ status: 'already_running' }` without a DB write
- [ ] One collector throws mid-cycle:
      - Run record shows `status='partial'`
      - Failing source name appears in `sources_failed`
      - Error message appears in `errors`
      - Other collectors' facts are still written
- [ ] Stale marking: facts from a previous cycle not seen in current cycle get `is_stale=1`
- [ ] `trigger='manual'` written correctly to run record
- [ ] Scheduler fires `runCollectionCycle('scheduled')` when cron expression triggers
- [ ] `COLLECTION_CRON` env controls schedule expression
- [ ] All tests FAIL before implementation

---

### Task 2.10 — Collection Engine & Scheduler: Implementation
**Status:** 🔴 Blocked by 2.9
**Effort:** 2 hours
**Dependencies:** Task 2.9

**Acceptance Criteria:**
- [ ] All tests from 2.9 pass
- [ ] `node-cron` added to `package.json`
- [ ] `isCollecting` boolean flag guards concurrent runs
- [ ] `Promise.allSettled` runs all four collectors concurrently
- [ ] Stale marking: `UPDATE facts SET is_stale=1 WHERE last_confirmed_at < cycleStartTime`
- [ ] Scheduler calls `runCollectionCycle('scheduled')` on configured cron
- [ ] On startup: if fact table is empty, triggers immediate cycle before first scheduled one
- [ ] `startScheduler` exported; called from both `mcp/server.ts` and `web/server.ts` entry points

---

## Phase 3: Enhanced MCP Tools

---

### Task 3.1 — Updated `search` Tool: Tests
**Status:** 🔴 Blocked by 2.10
**Effort:** 1.5 hours
**Dependencies:** Task 2.10

**Description:**
Write tests for the updated `search` MCP tool handler that uses FTS5 instead of `searchAll()`.

**Test file:** `src/mcp/tools/search.test.ts`

**Acceptance Criteria:**
- [ ] `search({ query: 'nginx' })` returns facts whose subject/key/value contains "nginx",
      ranked by BM25 relevance (highest rank first)
- [ ] Each result includes `domain`, `subject`, `key`, `value`, `confidence`, `source`
- [ ] `search({ query: 'nginx', confidence: 'high' })` filters to only high-confidence facts
- [ ] `search({ query: 'zzznomatch' })` returns empty text response, not an error
- [ ] Prefix match: `search({ query: 'orches' })` matches `overnightdesk-platform-orchestrator`
- [ ] Existing callers: response still includes `file` (aliased to `domain`) and `matches`
      (aliased to `snippets`) for backward compatibility
- [ ] All tests FAIL before implementation

---

### Task 3.2 — Updated `search` Tool: Implementation
**Status:** 🔴 Blocked by 3.1
**Effort:** 1 hour
**Dependencies:** Task 3.1

**Acceptance Criteria:**
- [ ] All tests from 3.1 pass
- [ ] Replaces `searchAll()` entirely — no YAML file reads in the search path
- [ ] Uses `queryFTS` from `fact-store.ts`
- [ ] Falls back to YAML `searchAll()` if fact store has zero rows (EC-6 / FR-11)
- [ ] Optional `confidence` input added to tool schema in `ListToolsRequestSchema`

---

### Task 3.3 — `get_health_summary` Tool: Tests
**Status:** 🔴 Blocked by 2.10
**Effort:** 1.5 hours
**Dependencies:** Task 2.10
**Parallel with:** Tasks 3.1, 3.5, 3.7, 3.9

**Test file:** `src/mcp/tools/get-health-summary.test.ts`

**Acceptance Criteria:**
- [ ] Response shape matches contract: `containers`, `facts`, `open_findings`,
      `most_recent_incident`, `last_collection_run`, `posture`
- [ ] `posture='healthy'` when: no critical/high findings, stale_count < 10% of total,
      last run < 30 minutes ago
- [ ] `posture='degraded'` when any critical or high finding is open
- [ ] `posture='stale'` when last completed run is > 30 minutes ago OR stale_count ≥ 10% of total
- [ ] `most_recent_incident=null` when no incidents recorded
- [ ] `last_collection_run=null` when no runs have completed
- [ ] Orchestrator DB unreachable → incident fields null, no throw; posture still derived from facts
- [ ] Response completes in < 500ms against a SQLite DB with 500 facts (performance assertion)
- [ ] All tests FAIL before implementation

---

### Task 3.4 — `get_health_summary` Tool: Implementation
**Status:** 🔴 Blocked by 3.3
**Effort:** 1.5 hours
**Dependencies:** Task 3.3

**Acceptance Criteria:**
- [ ] All tests from 3.3 pass
- [ ] Registered in `ListToolsRequestSchema` handler per contract schema
- [ ] Uses `getHealthSummary()` from `fact-store.ts` for SQLite aggregates
- [ ] Queries `orchestratorPool` for most recent incident (isolated try/catch)
- [ ] Posture thresholds: `degraded` if `open_findings.critical > 0 OR open_findings.high > 0`;
      `stale` if `minutes_since_last_run > 30 OR stale_pct >= 10`; else `healthy`

---

### Task 3.5 — `trigger_collection` & `get_collection_status` Tools: Tests
**Status:** 🔴 Blocked by 2.10
**Effort:** 1 hour
**Dependencies:** Task 2.10
**Parallel with:** Tasks 3.1, 3.3, 3.7, 3.9

**Test file:** `src/mcp/tools/collection-tools.test.ts`

**Acceptance Criteria:**
- [ ] `trigger_collection({})` when idle: returns `{ run_id, trigger:'manual', status:'started', started_at }`
- [ ] `trigger_collection({})` when cycle already running: returns `{ status:'already_running' }` — not an error response
- [ ] `trigger_collection({ reason: 'investigating nginx crash' })` — reason logged in run record
- [ ] `get_collection_status({})` returns 5 most recent runs by default
- [ ] `get_collection_status({ limit: 2 })` returns 2 runs
- [ ] `get_collection_status({ limit: 25 })` clamped to 20
- [ ] Run with `sources_failed: ['postgres']` — field is string array in response
- [ ] All tests FAIL before implementation

---

### Task 3.6 — `trigger_collection` & `get_collection_status` Tools: Implementation
**Status:** 🔴 Blocked by 3.5
**Effort:** 1 hour
**Dependencies:** Task 3.5

**Acceptance Criteria:**
- [ ] All tests from 3.5 pass
- [ ] Both registered in `ListToolsRequestSchema` per contract schemas
- [ ] `trigger_collection` calls `runCollectionCycle('manual')` — does not await completion
      (returns immediately with `started` or `already_running`)
- [ ] `get_collection_status` parses `sources_failed` and `errors` JSON columns before returning

---

### Task 3.7 — `find_similar_incidents` Tool: Tests
**Status:** 🔴 Blocked by 2.10
**Effort:** 1 hour
**Dependencies:** Task 2.10
**Parallel with:** Tasks 3.1, 3.3, 3.5, 3.9

**Test file:** `src/mcp/tools/find-similar-incidents.test.ts`

**Acceptance Criteria:**
- [ ] Mock orchestrator pool returns 2 incidents ranked by ts_rank: higher relevance first
- [ ] Each result includes: `id`, `service`, `severity`, `occurred_at`, `symptom`,
      `root_cause`, `fix_applied`, `learning`, `relevance_rank`
- [ ] No matching incidents → empty array, not an error
- [ ] `orchestratorPool` not configured → returns "ORCHESTRATOR_DATABASE_URL not configured" message
- [ ] `search_vector` column absent (migration not yet applied) → falls back to
      `ILIKE '%query%'` on `symptom` column
- [ ] All tests FAIL before implementation

---

### Task 3.8 — `find_similar_incidents` Tool: Implementation
**Status:** 🔴 Blocked by 3.7, 4.1
**Effort:** 1 hour
**Dependencies:** Tasks 3.7, 4.1

**Acceptance Criteria:**
- [ ] All tests from 3.7 pass
- [ ] Registered in `ListToolsRequestSchema` per contract schema
- [ ] Primary query: `search_vector @@ plainto_tsquery('english', $1)` with `ts_rank` ordering
- [ ] Fallback: `symptom ILIKE '%' || $1 || '%'` when `search_vector` column absent
      (checked via `information_schema.columns`)
- [ ] Results limited to 10

---

### Task 3.9 — Updated `get_service` & `get_database` Tools: Tests
**Status:** 🔴 Blocked by 2.10
**Effort:** 1 hour
**Dependencies:** Task 2.10
**Parallel with:** Tasks 3.1, 3.3, 3.5, 3.7

**Test file:** `src/mcp/tools/get-service-database.test.ts`

**Acceptance Criteria:**
- [ ] `get_service({ name: 'nginx' })` returns facts from fact store, not YAML
- [ ] `get_service({ name: 'nginx', include_confidence: true })` — each fact includes
      `confidence`, `observation_count`, `last_confirmed_at`, `source`
- [ ] `get_service` with empty fact store → falls back to YAML lookup (FR-11)
- [ ] `get_database({ name: 'commmodule' })` returns database facts from fact store
- [ ] Existing response shape preserved when `include_confidence` is false or absent
- [ ] All tests FAIL before implementation

---

### Task 3.10 — Updated `get_service` & `get_database` Tools: Implementation
**Status:** 🔴 Blocked by 3.9
**Effort:** 1 hour
**Dependencies:** Task 3.9

**Acceptance Criteria:**
- [ ] All tests from 3.9 pass
- [ ] Queries `SELECT * FROM facts WHERE domain=? AND subject LIKE ?` for primary lookup
- [ ] YAML fallback active when zero fact rows returned
- [ ] `include_confidence` optional input added to both tool schemas

---

### Task 3.11 — Security Review: MCP Tool Layer
**Status:** 🔴 Blocked by 3.2, 3.4, 3.6, 3.8, 3.10
**Effort:** 1 hour
**Dependencies:** Tasks 3.2, 3.4, 3.6, 3.8, 3.10

**Description:**
Run focused security review on all new and modified MCP tool handlers and the fact store module.

**Use:** `security-reviewer` agent with scope `src/lib/fact-store.ts`, `src/lib/collectors/`,
`src/lib/collection-engine.ts`, `src/mcp/server.ts`

**Acceptance Criteria:**
- [ ] No SQL injection vectors in SQLite queries (parameterized statements verified)
- [ ] No secrets or credential values written to fact store (code-level audit)
- [ ] Docker collector does not extract container env var values
- [ ] Postgres collector query confirmed to `information_schema` only — no user data access
- [ ] All CRITICAL and HIGH findings resolved before Phase 4

---

## Phase 4: PostgreSQL FTS Migration

---

### Task 4.1 — Migration 010: Write
**Status:** 🟡 Ready (can start in parallel with Phase 2/3)
**Effort:** 0.5 hours
**Dependencies:** None
**Parallel with:** Tasks 2.1–3.10

**Description:**
Write the goose migration file for `platform_incidents` full-text search column.

**File:** `overnightdesk-engine/internal/orchestrator/migrations/010_platform_incidents_fts.sql`

**Acceptance Criteria:**
- [ ] `-- +goose Up` section adds `search_vector tsvector GENERATED ALWAYS AS (...) STORED`
      with weight A=symptom, B=root_cause, C=learning, D=fix_applied
- [ ] `-- +goose Down` section drops index and column cleanly
- [ ] `CREATE INDEX ... USING GIN` on `search_vector`
- [ ] Migration tested against a local Postgres 16 instance: up and down apply without error
- [ ] Existing rows get `search_vector` populated by Postgres on column add (GENERATED ALWAYS
      does this automatically)
- [ ] File committed to `overnightdesk-engine` repo: `git commit -m "feat: add FTS index to platform_incidents (migration 010)"`

---

### Task 4.2 — Migration 010: Apply to Production
**Status:** 🔴 Blocked by 4.1, 3.11
**Effort:** 0.5 hours
**Dependencies:** Tasks 4.1, 3.11

**Description:**
Deploy updated `overnightdesk-engine` to aegis-prod so migration 010 runs on orchestrator startup.

**Acceptance Criteria:**
- [ ] `overnightdesk-engine` synced to server and orchestrator container rebuilt
- [ ] Container starts and migration 010 applies: confirmed via
      `SELECT column_name FROM information_schema.columns WHERE table_name='platform_incidents'`
      showing `search_vector`
- [ ] GIN index confirmed: `SELECT indexname FROM pg_indexes WHERE tablename='platform_incidents'`
- [ ] Existing incident rows have non-null `search_vector` values
- [ ] Deploy logged to `/mnt/f/deploys.log`

---

## Phase 5: Web UI Updates

---

### Task 5.1 — Web UI Endpoint & UI: Tests
**Status:** 🔴 Blocked by 4.2
**Effort:** 1 hour
**Dependencies:** Task 4.2

**Test file:** `src/web/server.test.ts`

**Acceptance Criteria:**
- [ ] `POST /api/trigger-collection` when idle → 200 JSON `{ run_id, status:'started' }`
- [ ] `POST /api/trigger-collection` when running → 200 JSON `{ status:'already_running' }`
- [ ] `GET /` with 3 stale facts → HTML contains `is-stale` CSS class on those rows
- [ ] `GET /` with a completed collection run < 30 min ago → HTML shows green status indicator
- [ ] `GET /` with no collection runs → HTML shows "Collection has not run" state
- [ ] All tests FAIL before implementation

---

### Task 5.2 — Web UI: Implementation
**Status:** 🔴 Blocked by 5.1
**Effort:** 2 hours
**Dependencies:** Task 5.1

**Acceptance Criteria:**
- [ ] All tests from 5.1 pass
- [ ] Collection status banner in `GET /` response:
      - Green: last run < 30 min, stale_count = 0
      - Amber: last run < 30 min, stale_count > 0
      - Red: last run > 30 min
      - Grey: no runs yet
- [ ] Manual trigger button → `POST /api/trigger-collection` → page reflects in-progress state
- [ ] Services table has `Confidence` column with `●` badge (colour coded: green/amber/grey/strikethrough)
- [ ] Collection run history table: last 5 runs with trigger, status, duration, counts, errors
- [ ] `GET /api/knowledge/:file` continues to function (backward compat)
- [ ] Stale facts in Services/Databases table rows have `opacity: 0.6` and stale indicator

---

### Task QG-2 — Final Quality Gate
**Status:** 🔴 Blocked by 5.2
**Effort:** 1 hour
**Dependencies:** Task 5.2

**Description:**
End-to-end verification that all acceptance criteria from the spec are met. Run on aegis-prod
against the deployed service.

**Acceptance Criteria:**
- [ ] Hermes calls `get_health_summary` → receives valid posture response in < 500ms
- [ ] Hermes calls `search({ query: 'nginx' })` → ranked results with confidence field
- [ ] `get_collection_status` shows at least one completed run since deployment
- [ ] `find_similar_incidents({ symptom: 'container not starting' })` returns results if any
      incidents exist; returns empty cleanly if none
- [ ] All 13 previously existing MCP tools still return correct responses (regression)
- [ ] Web UI shows collection status banner and confidence column
- [ ] Collection cycle ran on schedule (verified from run history — no manual trigger needed)
- [ ] `SUCCESS METRICS` from spec verified:
  - [ ] Hermes produces health summary in ≤ 2 MCP calls
  - [ ] Facts from YAML fully represented in fact store after first cycle
  - [ ] No breaking changes to existing tools

---

## Task Summary

| Phase | Tasks | Effort | Parallel? |
|-------|-------|--------|-----------|
| Phase 1: SQLite Foundation | 1.1, 1.2, 1.3 | 7h | Sequential |
| Phase 2: Collection Engine | 2.1–2.10 | 14h | 2.1–2.8 parallel |
| Phase 3: MCP Tools | 3.1–3.11 | 12h | 3.1–3.10 parallel pairs |
| Phase 4: Postgres Migration | 4.1, 4.2 | 1h | 4.1 parallel with Phase 2 |
| Phase 5: Web UI | 5.1, 5.2, QG-2 | 4h | Sequential |
| **Total** | **28 tasks** | **38h** | **~6 days with parallelization** |

---

## Parallelization Opportunities

```
Day 1:  1.1 → 1.2 → 1.3
        4.1 (write migration — no dependencies)

Day 2:  2.1 ──┐
        2.3 ──┤  (all parallel)
        2.5 ──┤
        2.7 ──┘

Day 3:  2.2 ──┐  (implementations, parallel)   2.9 tests (blocked by all ^)
        2.4 ──┤
        2.6 ──┤
        2.8 ──┘

Day 4:  2.10 → 3.1 tests ──┐
                3.3 tests ──┤  (all parallel)
                3.5 tests ──┤
                3.7 tests ──┤
                3.9 tests ──┘

Day 5:  3.2 ──┐  (implementations, parallel)
        3.4 ──┤
        3.6 ──┤
        3.8 ──┤  (also needs 4.1)
        3.10──┘
        3.11 (security review after all ^)

Day 6:  4.2 → 5.1 → 5.2 → QG-2
```
