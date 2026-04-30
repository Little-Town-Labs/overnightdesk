# Technology Research — Feature 13: Platform Knowledge Intelligence

---

## Decision 1: Fact Store Database

**Context:** Need a persistent, queryable store for platform facts with full-text search and
trust scoring. The ops service is a self-contained Node.js process running in a single container.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **SQLite + FTS5** | No external dep; FTS5 built-in with BM25 ranking; self-contained file; zero network latency; synchronous reads are fast | Single-writer; not suitable if ops service ever scales horizontally |
| **PostgreSQL (existing orchestrator-db)** | Already present; native FTS (`tsvector`); more powerful query planner | Couples ops knowledge layer to orchestrator DB; separate concern; network latency per fact query; adds connection pressure |
| **PostgreSQL (new dedicated DB)** | Clean separation; full SQL power | Another container to manage; overkill for ~5000 facts |

**Chosen:** SQLite + FTS5

**Rationale:** The ops service is a single-process, single-container service. SQLite is the right
choice when the data owner and the consumer are the same process. FTS5 is built into SQLite —
no extension installation, no OS dependency, no ARM64 compatibility concern. The entire fact store
is one file on a named volume. BM25 ranking is native to FTS5. At current platform scale (~500
facts), SQLite outperforms PostgreSQL for read-heavy, single-writer workloads due to zero network
overhead.

**Tradeoffs Accepted:** If the ops service ever needs to scale to multiple replicas, SQLite's
single-writer model becomes a constraint. This is not a current or near-term requirement.

---

## Decision 2: SQLite Driver

**Context:** Node.js SQLite client for synchronous fact store operations in an Express + MCP
server context.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **better-sqlite3** | Synchronous API; fastest Node.js SQLite driver; FTS5 support; mature (7M+ weekly downloads) | Requires native compilation (but ARM64 wheels available) |
| **node:sqlite** (Node 22 built-in) | No install; zero dep | Async API adds complexity; newer, less battle-tested; FTS5 support untested |
| **sql.js** | Pure WASM, no native compile | In-memory only; no file persistence |

**Chosen:** better-sqlite3

**Rationale:** Synchronous API matches Express's synchronous request handling naturally. Fastest
Node.js SQLite library in benchmarks. FTS5 queries and UPSERT operations are simpler without
async/await overhead. ARM64 prebuilds available (required for aegis-prod). Already used widely
in production Node.js services.

**Tradeoffs Accepted:** Native module — requires `npm ci` to build or pull prebuilt binary.
Docker build step handles this; not a runtime concern.

---

## Decision 3: Docker Collection Client

**Context:** Need to query the Docker daemon from inside the ops container to discover running
containers, ports, networks, and volumes.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **dockerode** | Most mature Node.js Docker SDK; full API coverage; TypeScript types | Another dependency |
| **Direct HTTP to Docker socket** | No dependency; raw control | Manual JSON parsing; no typing; error-prone |
| **Docker socket proxy (existing)** | Restricts API surface for security | Proxy may not expose all needed endpoints |

**Chosen:** dockerode via the existing `overnightdesk-docker-socket-proxy`

**Rationale:** dockerode provides typed, well-maintained abstractions over the Docker Engine API.
The existing `docker-socket-proxy` container already exists on the network and restricts the API
surface. The ops container will connect to it over HTTP (not raw Unix socket) — no socket mount
needed in the ops container. The proxy already allows container listing for the audit service.

**Tradeoffs Accepted:** Collection is limited to what the socket proxy allows. If additional Docker
API endpoints are needed (exec, build), the proxy allowlist must be updated first.

**Proxy endpoint requirements:** `GET /containers/json`, `GET /containers/{id}/json` — both
likely already allowed.

---

## Decision 4: Collection Scheduler

**Context:** Need to run fact collection on a configurable schedule inside the Node.js process.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **node-cron** | Lightweight; cron expression syntax; well-tested; no external service | Runs in-process — dies with the service |
| **setInterval with ms** | No dependency; simple | No cron syntax; harder to configure intervals like "every 5 min" |
| **External cron (crontab / Docker) restarting container** | Decoupled | Restarts entire service; loses in-memory state; heavyweight |

**Chosen:** `node-cron` with a mutex-guarded runner

**Rationale:** In-process scheduling is correct here. The collection cycle is a read operation
against infrastructure sources — it has no side effects that require decoupling. node-cron uses
standard cron syntax, making the `COLLECTION_CRON` env var human-readable
(`*/10 * * * *` = every 10 minutes). The mutex guard (Decision 5) prevents concurrent cycles.

**Default schedule:** Every 10 minutes (`*/10 * * * *`), configurable via `COLLECTION_CRON`.

---

## Decision 5: Concurrent Cycle Prevention

**Context:** If a collection cycle takes longer than the interval, the next scheduled run must be
skipped (EC-4 from spec).

**Chosen:** Boolean flag (`isCollecting`) checked before each scheduled run. If true, log and skip.
No queue, no lock file, no distributed locking needed for a single-process service.

---

## Decision 6: nginx Config Parsing

**Context:** nginx config is at `/opt/overnightdesk/nginx/conf.d/default.conf` on the host.
The ops container does not have host filesystem access.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Mount nginx conf dir as read-only volume** | Direct file access; no Docker API needed | Requires compose change |
| **Docker exec into nginx container** | No volume mount needed | Requires socket proxy exec permission (not currently allowed) |
| **Read from network.yaml (existing)** | Works today | Static; does not auto-update |
| **Nginx container API / stub_status** | Real-time | nginx doesn't expose routing config via API |

**Chosen:** Mount nginx conf directory as read-only volume into the ops container, parse with a
lightweight nginx config parser (`nginx-conf` npm package or regex-based parser for our simple
`location` block structure).

**Rationale:** The nginx config is structurally simple (`location` blocks with `proxy_pass`). A
mounted read-only volume is the cleanest approach — no elevated permissions, no socket proxy
changes, no running commands inside containers. A parse of `/etc/nginx/conf.d/default.conf` on
each collection cycle gives an accurate route map.

**Compose change required:** Add `volumes: - /opt/overnightdesk/nginx/conf.d:/etc/nginx/conf.d:ro`
to the ops service in docker-compose.yml.

---

## Decision 7: Platform Incidents Full-Text Search

**Context:** `platform_incidents` lives in the orchestrator PostgreSQL database. The spec requires
ranked full-text retrieval on `symptom`, `root_cause`, and `learning` columns (FR-8).

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **PostgreSQL native FTS (tsvector + GIN index)** | Already have pg connection; ts_rank for relevance ordering; zero new dep | Requires a migration to add column + index |
| **Mirror incidents into SQLite FTS5** | Single search surface | Dual-write complexity; data duplication; staleness risk |
| **pgvector semantic search** | True semantic similarity | Requires embedding model call per query; added latency; new dep |

**Chosen:** PostgreSQL native FTS — add `search_vector tsvector` column + GIN index to
`platform_incidents`, populate via trigger, query with `ts_rank`.

**Rationale:** PostgreSQL FTS (`tsvector`/`tsquery`) with `ts_rank` ordering provides relevance
ranking without any external model call. "Semantically similar" at this scale means good
tokenized full-text matching, not vector embeddings. A trigger keeps `search_vector` current
on insert/update. The existing `orchestratorPool` connection handles queries. One migration,
no new service.

**pgvector deferred to:** Future feature if Hermes needs true semantic similarity across thousands
of incidents.

---

## Decision 8: Confidence Scoring Formula

**Context:** Need a deterministic, explainable confidence tier per fact (FR-3, US-2).

**Chosen tiers:**

| Tier | Condition |
|------|-----------|
| `stale` | `is_stale = true` (not seen in most recent cycle) |
| `low` | `observation_count = 1` AND not stale |
| `medium` | `observation_count >= 2` AND last confirmed within 7 days AND not stale |
| `high` | `observation_count >= 5` AND last confirmed within 2 days AND not stale |

**Rationale:** Simple, auditable tiers that Hermes can reason about. Thresholds are configurable
constants, not magic numbers baked into queries. The `high` tier (5+ observations, confirmed
recently) maps to "seen every run for ~50 minutes at 10-min intervals" — facts of this quality
warrant autonomous action. `stale` is binary and takes precedence over all other conditions.

---

## Dependency Summary

**New production dependencies:**
- `better-sqlite3` — SQLite driver with FTS5
- `dockerode` — Docker API client
- `node-cron` — in-process scheduler

**New dev dependencies:**
- `@types/better-sqlite3`
- `@types/dockerode`

**New Docker compose changes:**
- Mount nginx conf as read-only volume into ops container
- Ensure socket proxy allows `GET /containers/json` and `GET /containers/{id}/json`

**New database migration (orchestrator DB):**
- Add `search_vector tsvector` column + GIN index + trigger to `platform_incidents`
- New migration file: `010_platform_incidents_fts.sql`
