# Implementation Plan — Feature 13: Platform Knowledge Intelligence

**Branch:** 13-platform-knowledge-intelligence
**Spec:** `.specify/specs/13-platform-knowledge-intelligence/spec.md`
**Research:** `.specify/specs/13-platform-knowledge-intelligence/research.md`
**Data Model:** `.specify/specs/13-platform-knowledge-intelligence/data-model.md`
**Contracts:** `.specify/specs/13-platform-knowledge-intelligence/contracts/mcp-tools.yaml`

---

## Executive Summary

Feature 13 transforms overnightdesk-ops from a static YAML reader into a self-maintaining platform
intelligence layer. The implementation has five sequential phases: (1) SQLite fact store foundation,
(2) automated collection engine, (3) enhanced MCP tools, (4) PostgreSQL FTS on incident history,
(5) web UI updates. All phases run inside the existing overnightdesk-ops Node.js container with
no new containers required.

**New dependencies:** `better-sqlite3`, `dockerode`, `node-cron`
**New volume:** `ops-facts-data` (named, persisted)
**New migration:** `010_platform_incidents_fts.sql` (orchestrator DB)
**Compose changes:** nginx conf read-only volume mount; `ops-facts-data` volume declaration
**Breaking changes:** None — all existing MCP tools remain backward-compatible

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  overnightdesk-ops container                                     │
│                                                                  │
│  ┌────────────────┐    ┌────────────────────────────────────┐   │
│  │  Collection     │    │  MCP Server (port 3000)            │   │
│  │  Engine         │    │  Web UI (port 3001)                │   │
│  │                 │    │                                    │   │
│  │  node-cron      │    │  get_health_summary  ─────────┐   │   │
│  │  ┌───────────┐  │    │  search (FTS5)         ─────┐  │   │   │
│  │  │ Docker    │──┼──→ │  get_service           ─────┤  │   │   │
│  │  │ collector │  │    │  get_collection_status  ──┐ │  │   │   │
│  │  ├───────────┤  │    │  trigger_collection     ──┤ │  │   │   │
│  │  │ Postgres  │──┼──→ │  find_similar_incidents ──┼─┼──┼───┼──→ Hermes
│  │  │ collector │  │    │  (all existing tools)   ──┘ │  │   │   │
│  │  ├───────────┤  │    └─────────────────────────────┘  │   │   │
│  │  │ nginx     │──┼──→          │                        │   │   │
│  │  │ collector │  │             ▼                        │   │   │
│  │  ├───────────┤  │    ┌────────────────────┐            │   │   │
│  │  │ Audit DB  │──┼──→ │  SQLite Fact Store │◄───────────┘   │   │
│  │  │ collector │  │    │  (FTS5 + trust)    │                │   │
│  │  └───────────┘  │    │  /data/facts.db    │                │   │
│  └────────────────┘    └────────────────────┘                │   │
│                                                               │   │
│  ┌───────────────────────────────────────────────────────┐   │   │
│  │  Orchestrator PostgreSQL (external)                    │   │   │
│  │  platform_incidents + search_vector (GIN index)        │◄──┘   │
│  └───────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Fact store | SQLite (better-sqlite3) | Self-contained; FTS5 built-in; zero network latency; ARM64 prebuilds available |
| Full-text search (facts) | SQLite FTS5 (BM25) | Native to SQLite; no extension install; ranked results |
| Full-text search (incidents) | PostgreSQL tsvector + GIN + ts_rank | Already have the connection; GENERATED ALWAYS column self-maintains |
| Docker API | dockerode via docker-socket-proxy | Typed; mature; uses existing proxy — no socket mount in ops container |
| Scheduler | node-cron | In-process; cron syntax; no external service; lightweight |
| nginx parsing | Read-only volume mount + regex parser | Simplest safe approach; no exec permissions needed |

---

## Implementation Phases

---

### Phase 1: SQLite Fact Store Foundation

**Goal:** Establish the persistence layer. All subsequent phases write to and read from this store.

#### 1.1 — Add dependencies

```bash
npm install better-sqlite3 @types/better-sqlite3
```

#### 1.2 — Create `src/lib/fact-store.ts`

Responsibilities:
- Open/create SQLite database at `FACTS_DB_PATH` (default `/data/facts.db`)
- Run schema migrations on startup (idempotent `CREATE TABLE IF NOT EXISTS`)
- Create FTS5 virtual table and sync triggers
- Export typed functions: `upsertFact`, `markStale`, `queryFTS`, `getHealthSummary`,
  `insertCollectionRun`, `updateCollectionRun`, `getRecentRuns`

**Schema to apply (from data-model.md):**

```sql
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  subject TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  source TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1,
  first_observed_at TEXT NOT NULL,
  last_confirmed_at TEXT NOT NULL,
  is_stale INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(domain, subject, key)
);

CREATE INDEX IF NOT EXISTS facts_domain_idx ON facts(domain);
CREATE INDEX IF NOT EXISTS facts_subject_idx ON facts(subject);
CREATE INDEX IF NOT EXISTS facts_stale_idx ON facts(is_stale);
CREATE INDEX IF NOT EXISTS facts_confirmed_idx ON facts(last_confirmed_at);

CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
  domain, subject, key, value,
  content='facts',
  content_rowid='id',
  tokenize='unicode61'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, domain, subject, key, value)
  VALUES (new.id, new.domain, new.subject, new.key, new.value);
END;
CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, domain, subject, key, value)
  VALUES ('delete', old.id, old.domain, old.subject, old.key, old.value);
END;
CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, domain, subject, key, value)
  VALUES ('delete', old.id, old.domain, old.subject, old.key, old.value);
  INSERT INTO facts_fts(rowid, domain, subject, key, value)
  VALUES (new.id, new.domain, new.subject, new.key, new.value);
END;

CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  facts_created INTEGER NOT NULL DEFAULT 0,
  facts_updated INTEGER NOT NULL DEFAULT 0,
  facts_staled INTEGER NOT NULL DEFAULT 0,
  facts_changed INTEGER NOT NULL DEFAULT 0,
  sources_attempted TEXT NOT NULL DEFAULT '[]',
  sources_failed TEXT NOT NULL DEFAULT '[]',
  errors TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS runs_started_idx ON collection_runs(started_at DESC);
```

#### 1.3 — Bootstrap from YAML

On first startup, if `facts` table is empty:
- Load all 6 YAML knowledge files
- Write each service, database, route, and finding as a fact row with `source = 'yaml-seed'`,
  `observation_count = 1`, `confidence → low`
- This ensures existing MCP tools work immediately (FR-11, EC-6)

#### 1.4 — Docker Compose changes

In `/opt/overnightdesk/docker-compose.yml`, add to the ops service:

```yaml
volumes:
  - ops-facts-data:/data
  - /opt/overnightdesk/nginx/conf.d:/etc/nginx/conf.d:ro

volumes:
  ops-facts-data:
```

#### 1.5 — Tests (TDD — write first)

- `fact-store.test.ts`: upsert creates row; second upsert increments count; stale marking works;
  FTS trigger fires on insert; confidence levels computed correctly; bootstrap from YAML produces
  expected fact count

---

### Phase 2: Collection Engine

**Goal:** Four collectors + scheduler that populate the fact store automatically.

#### 2.1 — Add dependencies

```bash
npm install dockerode node-cron
npm install -D @types/dockerode
```

#### 2.2 — Create `src/lib/collectors/docker.ts`

- Connect to Docker socket proxy at `DOCKER_PROXY_URL` (default
  `http://overnightdesk-docker-socket-proxy:2375`)
- Call `GET /containers/json?all=true` to list all containers
- For each container: extract name, image, status, ports, restart policy, networks
- Write facts: `domain='service'`, `subject=container_name`, keys per column in data-model.md
- Return: `{ created, updated, changed, errors }`

#### 2.3 — Create `src/lib/collectors/postgres.ts`

- For each known Postgres instance (read from fact store subjects where `domain='database'`,
  seeded from YAML on first run):
  - Connect using the instance's `DATABASE_URL` from environment
  - Query `information_schema.tables` for table names
  - Query `pg_stat_user_tables` for approximate row counts
- Write facts: `domain='database'`, `subject=db-container-name`
- Handle unreachable instances gracefully (record error, continue)
- Return: `{ created, updated, changed, errors }`

#### 2.4 — Create `src/lib/collectors/nginx.ts`

- Read `/etc/nginx/conf.d/default.conf` (mounted read-only)
- Parse `location` blocks: extract path pattern, `proxy_pass` upstream, presence of auth
  directives (`auth_request`, `Authorization`)
- Write facts: `domain='network'`, `subject=path_pattern`
- Return: `{ created, updated, changed, errors }`

#### 2.5 — Create `src/lib/collectors/audit.ts`

- Query `coo_findings` via existing `dbPool` (if configured):
  `SELECT check_id, subject, severity, status, first_seen_at, last_seen_at, finding FROM coo_findings`
- Write facts: `domain='finding'`, `subject='{check_id}/{finding_subject}'`
- Return: `{ created, updated, changed, errors }`

#### 2.6 — Create `src/lib/collection-engine.ts`

Orchestrates all four collectors:

```typescript
export async function runCollectionCycle(trigger: 'scheduled' | 'manual'): Promise<CollectionRunResult>
```

1. Check `isCollecting` flag — if true, return `{ status: 'already_running' }`
2. Set `isCollecting = true`
3. Insert `collection_runs` row with `status = 'running'`
4. Mark all existing facts `is_stale = 0` (reset before cycle — staleness is set below)
5. Run all four collectors concurrently (`Promise.allSettled`)
6. Mark facts not updated this cycle as `is_stale = 1` by checking
   `last_confirmed_at < cycle_start_time`
7. Update run record: `status = partial | completed | failed`, all counts, errors
8. Set `isCollecting = false`
9. Return result

#### 2.7 — Create `src/lib/scheduler.ts`

```typescript
export function startScheduler(db: Database): void
```

- Read `COLLECTION_CRON` env (default `*/10 * * * *`)
- Schedule via `node-cron`
- On fire: call `runCollectionCycle('scheduled')`
- Trigger immediate run on startup if fact store is empty

#### 2.8 — Tests (TDD — write first)

- `docker.test.ts`: mock dockerode responses → correct fact rows written
- `nginx.test.ts`: parse sample nginx config → correct route facts
- `collection-engine.test.ts`: concurrent call returns `already_running`; partial failure
  (one collector throws) records error and continues; stale marking applies only to facts
  not touched this cycle

---

### Phase 3: Enhanced MCP Tools

**Goal:** Update existing tools to read from fact store; add 4 new tools from contracts.

#### 3.1 — Update `search` tool

Replace `searchAll()` with FTS5 query:

```sql
SELECT f.*, rank
FROM facts_fts
JOIN facts f ON facts_fts.rowid = f.id
WHERE facts_fts MATCH ?
ORDER BY rank
LIMIT 50
```

- Append confidence level to each result (derived from `observation_count`, `last_confirmed_at`,
  `is_stale`)
- Accept optional `confidence` filter input — post-filter results after FTS
- Backward compat: response shape adds `confidence` and `source` fields; existing `file` field
  becomes `domain`; `matches` becomes `snippets`

#### 3.2 — Update `get_service` and `get_database` tools

- Query fact store first: `SELECT * FROM facts WHERE domain=? AND subject LIKE ?`
- Fall back to YAML if no fact store rows (EC-6, FR-11)
- When `include_confidence=true`: include `confidence`, `observation_count`,
  `last_confirmed_at`, `source` per fact

> **Note — `get_dependencies` not migrated to fact store:** The `getDependencies()` function
> reads service-to-service topology from `network.yaml`. This graph (gRPC, internal RPC,
> platform job dispatch) is not auto-discoverable by any collector. `get_dependencies` continues
> reading from YAML unchanged. This is an intentional exception to FR-1 under FR-11's
> "where applicable" clause — manually-curated topology data has no live collection source.

#### 3.3 — Add `get_health_summary` tool

```sql
-- containers running/stopped
SELECT value, COUNT(*) FROM facts
WHERE domain='service' AND key='status'
GROUP BY value;

-- stale count
SELECT COUNT(*) FROM facts WHERE is_stale=1;

-- high confidence count
SELECT COUNT(*) FROM facts
WHERE is_stale=0 AND observation_count>=5
  AND last_confirmed_at >= datetime('now', '-2 days');

-- open findings by severity
-- (from existing dbPool — coo_findings)

-- most recent incident
-- (from orchestratorPool — platform_incidents ORDER BY occurred_at DESC LIMIT 1)

-- last collection run
SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT 1;
```

Posture logic:
- `stale` if last run is > 30 minutes old OR stale_count > 10% of total facts
- `degraded` if any critical or high findings are open
- `healthy` otherwise

#### 3.4 — Add `trigger_collection` tool

- Call `runCollectionCycle('manual')` from the MCP handler
- Return `{ run_id, trigger: 'manual', status, started_at }`
- If `already_running`: return `{ status: 'already_running' }` (not an error)

#### 3.5 — Add `get_collection_status` tool

```sql
SELECT * FROM collection_runs
ORDER BY started_at DESC
LIMIT ?
```

- Parse `sources_failed` and `errors` JSON arrays
- Return structured array per contracts spec

#### 3.6 — Add `find_similar_incidents` tool

```sql
SELECT id, service, severity, occurred_at, symptom, root_cause, fix_applied, learning,
       ts_rank(search_vector, plainto_tsquery('english', $1)) AS relevance_rank
FROM platform_incidents
WHERE search_vector @@ plainto_tsquery('english', $1)
ORDER BY relevance_rank DESC
LIMIT 10
```

- Requires `orchestratorPool` (existing)
- Requires migration 010 applied (Phase 4)
- Falls back to ILIKE on `symptom` if `search_vector` column not yet present (migration guard)

#### 3.7 — Tests (TDD — write first)

- `mcp-tools.test.ts`: each tool handler tested with mocked DB responses
- `search.test.ts`: FTS returns ranked results; confidence filter works; empty result returns
  empty array not error
- `get_health_summary.test.ts`: posture logic for each of three states; null last_run handled
- `trigger_collection.test.ts`: concurrent calls return `already_running`
- `find_similar_incidents.test.ts`: ranked results; empty query returns empty; unreachable
  orchestrator DB falls back gracefully

---

### Phase 4: PostgreSQL FTS Migration

**Goal:** Enable ranked full-text search on `platform_incidents`.

#### 4.1 — Create migration file

`overnightdesk-engine/internal/orchestrator/migrations/010_platform_incidents_fts.sql`:

```sql
-- +goose Up
ALTER TABLE platform_incidents
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(symptom, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(root_cause, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(learning, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(fix_applied, '')), 'D')
  ) STORED;

CREATE INDEX platform_incidents_fts_idx
  ON platform_incidents USING GIN (search_vector);

-- +goose Down
DROP INDEX IF EXISTS platform_incidents_fts_idx;
ALTER TABLE platform_incidents DROP COLUMN IF EXISTS search_vector;
```

#### 4.2 — Apply migration

Migration applies via the orchestrator's existing goose migration runner on startup.
No manual SQL execution needed — the orchestrator container picks it up on next restart.

#### 4.3 — Tests

- Migration up/down applies cleanly against a test Postgres instance
- `find_similar_incidents` with `search_vector` present returns ts_rank-ordered results

---

### Phase 5: Web UI Updates

**Goal:** Surface collection status, fact confidence, and stale indicators in the ops web UI.

#### 5.1 — Collection status banner

At the top of the web UI (`/`), below the header:
- "Last collection: 3 minutes ago | 247 facts | 0 stale" (green)
- "Last collection: 47 minutes ago | 247 facts | 12 stale" (amber)
- "Collection has not run" (grey, first boot)
- Manual trigger button → POST to new `/api/trigger-collection` web endpoint

#### 5.2 — Fact confidence indicators

In the Services table, add a `Confidence` column:
- `●` high (green)
- `●` medium (amber)
- `●` low (grey)
- `○` stale (strikethrough text)

In the Databases table, same indicator per database fact.

#### 5.3 — Collection run history section

New table section below Flight Recorder:
- Columns: Trigger, Status, Started, Duration, Created, Updated, Staled, Changed, Errors
- Show last 5 runs
- Partial and failed runs shown in amber/red

#### 5.4 — New web API endpoint

`POST /api/trigger-collection` → calls `runCollectionCycle('manual')` → returns JSON run record.
Used by the manual trigger button.

#### 5.5 — Tests

- Web endpoint returns correct JSON for trigger and `already_running` cases
- Stale facts render with stale CSS class in snapshot test

---

## File Structure Changes

```
overnightdesk-ops/src/
├── lib/
│   ├── fact-store.ts          [NEW] SQLite wrapper, schema, CRUD, FTS queries
│   ├── collection-engine.ts   [NEW] Orchestrates collectors, run records, mutex
│   ├── scheduler.ts           [NEW] node-cron setup
│   ├── collectors/
│   │   ├── docker.ts          [NEW] Docker API collector
│   │   ├── postgres.ts        [NEW] Postgres schema collector
│   │   ├── nginx.ts           [NEW] nginx conf parser
│   │   └── audit.ts           [NEW] coo_findings collector
│   └── fr-client.ts           [UNCHANGED]
├── mcp/
│   └── server.ts              [MODIFIED] 4 new tools; updated search, get_service, get_database
└── web/
    └── server.ts              [MODIFIED] Collection status banner, confidence column, run history

overnightdesk-engine/internal/orchestrator/migrations/
└── 010_platform_incidents_fts.sql  [NEW]
```

---

## Security Considerations

- **No secrets in facts.** Collectors extract structural metadata only. The Postgres collector
  reads `information_schema` and `pg_stat_user_tables` — no row data, no column values.
  The Docker collector reads container metadata — no environment variable values.
- **Read-only DB credentials.** The Postgres collector must use a connection with
  `SELECT`-only permissions on `information_schema` and `pg_stat_user_tables`.
- **nginx volume read-only.** The mount is `:ro` — the ops container cannot modify nginx config.
- **Socket proxy.** The ops container connects to Docker via the existing socket proxy, not
  directly to the Docker daemon socket. The proxy's allowlist already restricts the available
  endpoints.
- **SQLite file.** Stored on a named volume with standard filesystem permissions. Not
  accessible from outside the container.

---

## Performance Strategy

- **FTS5 queries:** BM25 ranking is computed by SQLite natively — no application-level sorting.
  Queries on 5,000 facts complete in < 5ms (SQLite FTS5 benchmark).
- **Collection concurrency:** Four collectors run via `Promise.allSettled` — total cycle time
  is bounded by the slowest source, not the sum. Expected: ~10s for all four sources.
- **Fact store reads are non-blocking relative to writes.** SQLite WAL mode enables concurrent
  reads during a write transaction. Enable via `PRAGMA journal_mode=WAL` on DB open.
- **Health summary caches the posture.** Re-derive from a single aggregation query, not four
  separate round-trips.

---

## Testing Strategy

**Unit tests** (each new module):
- `fact-store.test.ts` — schema, UPSERT, stale marking, confidence derivation, FTS
- `docker.test.ts` — mock dockerode, verify fact rows
- `nginx.test.ts` — parse fixture configs, verify route facts
- `collection-engine.test.ts` — mutex, partial failure, stale marking
- `mcp-tools.test.ts` — each new tool handler with mocked DB/pool

**Integration tests:**
- Collection cycle against real SQLite in temp file + mock collectors
- `find_similar_incidents` against a real Postgres instance with migration applied

**Regression tests (existing tools):**
- `get_service`, `get_database`, `search`, `list_open_findings`, `query_learnings` return
  correct results from fact store (not YAML) after first collection run

**Coverage target:** 80% across new modules (per project constitution).

---

## Deployment Strategy

**Step 1:** Apply orchestrator migration (010)
- Merge `010_platform_incidents_fts.sql` to `overnightdesk-engine`
- Deploy engine/orchestrator — migration runs on startup
- Verify: `platform_incidents` has `search_vector` column

**Step 2:** Deploy ops service
- Update `docker-compose.yml`: add `ops-facts-data` volume, nginx conf mount
- Build and deploy `overnightdesk-ops` via standard `docker compose up -d --build overnightdesk-ops`
- On first start: YAML bootstrap runs, immediate collection cycle fires
- Verify: `get_health_summary` MCP tool returns valid response

**Step 3:** Validate
- Hermes: call `get_health_summary` → confirm posture and fact counts
- Hermes: call `search` with `query: "nginx"` → confirm ranked results with confidence
- Wait 10 minutes → call `get_collection_status` → confirm scheduled run completed

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Docker socket proxy blocks `GET /containers/{id}/json` | Medium | Partial collection | Check proxy allowlist before coding; expand if needed |
| better-sqlite3 ARM64 build fails | Low | Phase 1 blocked | Prebuilds available for `linux-arm64`; test in CI first |
| nginx config format changes and breaks parser | Low | Route facts missing | Parser logs parse errors as collection source errors; YAML-seeded facts remain as fallback |
| Orchestrator DB migration takes lock on large `platform_incidents` table | Low | Brief write pause | Table has < 100 rows today; `ADD COLUMN` with `GENERATED ALWAYS` is fast on small tables |
| Collection cycle > 60s if Postgres instances are slow to respond | Medium | Stale facts | Per-source timeout of 10s; truncate at configurable limit (default 200 tables/DB) |

---

## Constitutional Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| Data Sacred (P1) | ✅ | Fact store records structural metadata only; no secrets, no tenant data, no conversation content |
| Security (P2) | ✅ | Read-only Postgres credentials; read-only nginx volume mount; SQLite on named volume |
| Ops Agent Acts / Owner Decides (P3) | ✅ | No auto-remediation; Hermes receives confidence-weighted facts and reports; Gary decides |
| Simple Over Clever (P4) | ✅ | HRR explicitly out of scope; SQLite FTS5 over pgvector; no new containers |
| Owner's Time (P7) | ✅ | Fully automated collection; Hermes health summary in ≤ 2 MCP calls |
| Test-First (constitution Part III) | ✅ | Tests defined before implementation in each phase; 80% coverage target |

---

## Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1: SQLite foundation | fact-store.ts + schema + bootstrap + compose | 1 day |
| Phase 2: Collection engine | 4 collectors + scheduler + engine + tests | 2 days |
| Phase 3: Enhanced MCP tools | 4 new + 3 updated + tests | 1.5 days |
| Phase 4: PostgreSQL FTS migration | 1 migration file + apply + verify | 0.5 days |
| Phase 5: Web UI | banner + confidence column + run history | 1 day |
| **Total** | | **6 days** |
