# Data Model — Feature 13: Platform Knowledge Intelligence

---

## SQLite Fact Store (new — overnightdesk-ops container)

### Table: `facts`

The primary knowledge store. One row per (domain, subject, key) triple.
UPSERT on conflict — never duplicates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Row ID (used as FTS5 content rowid) |
| `domain` | TEXT | NOT NULL | Knowledge domain: `service` \| `database` \| `network` \| `finding` |
| `subject` | TEXT | NOT NULL | The entity this fact is about (e.g. `overnightdesk-nginx`) |
| `key` | TEXT | NOT NULL | Fact attribute name (e.g. `status`, `port`, `image`, `table`) |
| `value` | TEXT | | Fact value (e.g. `running`, `443`, `nginx:1.27-alpine`) |
| `source` | TEXT | NOT NULL | Collection origin: `docker` \| `postgres` \| `nginx` \| `audit-db` \| `yaml-seed` |
| `observation_count` | INTEGER | NOT NULL DEFAULT 1 | Times this fact has been confirmed |
| `first_observed_at` | TEXT | NOT NULL | ISO-8601 timestamp of first observation |
| `last_confirmed_at` | TEXT | NOT NULL | ISO-8601 timestamp of most recent observation |
| `is_stale` | INTEGER | NOT NULL DEFAULT 0 | 1 if not seen in the most recent completed cycle |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Row creation timestamp |
| `updated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Last update timestamp |

**Unique constraint:** `(domain, subject, key)` — drives UPSERT logic.

**Indexes:**
- `UNIQUE(domain, subject, key)` — primary lookup key
- `INDEX(domain)` — filter by domain
- `INDEX(subject)` — filter by subject (all facts about a service)
- `INDEX(is_stale)` — health summary stale count
- `INDEX(last_confirmed_at)` — recency queries

---

### Virtual Table: `facts_fts` (FTS5)

Full-text search index backed by the `facts` table. BM25 ranking native.

```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
  domain,
  subject,
  key,
  value,
  content='facts',
  content_rowid='id',
  tokenize='unicode61'
);
```

Kept in sync via triggers on INSERT, UPDATE, DELETE of `facts`.

**FTS query examples:**
- `facts_fts MATCH 'nginx'` → all facts mentioning nginx in any column
- `facts_fts MATCH 'subject:orchestrator'` → facts whose subject contains "orchestrator"
- `facts_fts MATCH 'postgres OR database'` → union across terms

---

### Table: `collection_runs`

One row per scheduled or manual collection cycle.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Run ID |
| `trigger` | TEXT | NOT NULL | `scheduled` \| `manual` |
| `status` | TEXT | NOT NULL | `running` \| `completed` \| `partial` \| `failed` |
| `started_at` | TEXT | NOT NULL | ISO-8601 start timestamp |
| `completed_at` | TEXT | | ISO-8601 completion timestamp (NULL while running) |
| `facts_created` | INTEGER | NOT NULL DEFAULT 0 | New facts written this run |
| `facts_updated` | INTEGER | NOT NULL DEFAULT 0 | Existing facts refreshed this run |
| `facts_staled` | INTEGER | NOT NULL DEFAULT 0 | Facts marked stale this run |
| `facts_changed` | INTEGER | NOT NULL DEFAULT 0 | Facts whose value changed this run |
| `sources_attempted` | TEXT | NOT NULL DEFAULT '[]' | JSON array of source names attempted |
| `sources_failed` | TEXT | NOT NULL DEFAULT '[]' | JSON array of source names that errored |
| `errors` | TEXT | NOT NULL DEFAULT '[]' | JSON array of error message strings |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Row creation timestamp |

**Index:** `INDEX(started_at DESC)` — most recent run lookup.

---

### Derived: Confidence Level

Computed at query time from `observation_count`, `last_confirmed_at`, and `is_stale`.
Not stored — derived via a CASE expression or application logic.

| Level | Condition (evaluated in order) |
|-------|-------------------------------|
| `stale` | `is_stale = 1` |
| `high` | `observation_count >= 5` AND `last_confirmed_at >= now - 2 days` |
| `medium` | `observation_count >= 2` AND `last_confirmed_at >= now - 7 days` |
| `low` | All other non-stale facts |

---

## PostgreSQL Migration (orchestrator DB — existing)

### Migration: `010_platform_incidents_fts.sql`

Adds ranked full-text search to the existing `platform_incidents` table.

```sql
-- +goose Up

-- Add the tsvector search column
ALTER TABLE platform_incidents
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(symptom, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(root_cause, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(learning, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(fix_applied, '')), 'D')
  ) STORED;

-- GIN index for fast FTS queries
CREATE INDEX platform_incidents_fts_idx
  ON platform_incidents USING GIN (search_vector);

-- +goose Down
DROP INDEX IF EXISTS platform_incidents_fts_idx;
ALTER TABLE platform_incidents DROP COLUMN IF EXISTS search_vector;
```

**Notes:**
- `GENERATED ALWAYS AS ... STORED` eliminates the need for a trigger — Postgres recomputes
  automatically on INSERT and UPDATE.
- Weight `A` (symptom) ranks highest in `ts_rank` output; `D` (fix_applied) ranks lowest.
- `english` dictionary handles stemming (e.g. "crashing" → "crash" matches "crashed").
- No application change needed for existing `log_incident` writes — the column updates itself.

---

## Fact Schema by Collection Source

### Docker → `domain = 'service'`

| Subject | Key | Value Example | Source |
|---------|-----|---------------|--------|
| `overnightdesk-nginx` | `status` | `running` | docker |
| `overnightdesk-nginx` | `image` | `nginx:1.27-alpine` | docker |
| `overnightdesk-nginx` | `port` | `80,443` | docker |
| `overnightdesk-nginx` | `restart_policy` | `unless-stopped` | docker |
| `overnightdesk-nginx` | `network` | `overnightdesk_overnightdesk` | docker |
| `overnightdesk-nginx` | `uptime_seconds` | `864000` | docker |

### Postgres → `domain = 'database'`

| Subject | Key | Value Example | Source |
|---------|-----|---------------|--------|
| `overnightdesk-platform-orchestrator-db` | `table` | `platform_incidents` | postgres |
| `overnightdesk-platform-orchestrator-db` | `table` | `tenants` | postgres |
| `overnightdesk-platform-orchestrator-db` | `row_count:platform_incidents` | `47` | postgres |
| `commmodule-db` | `table` | `cm_dead_letter` | postgres |

### nginx → `domain = 'network'`

| Subject | Key | Value Example | Source |
|---------|-----|---------------|--------|
| `/api/chat` | `upstream` | `overnightdesk-platform-orchestrator` | nginx |
| `/api/chat` | `auth` | `bearer` | nginx |
| `/health` | `upstream` | `overnightdesk-platform-orchestrator` | nginx |
| `/health` | `status` | `live` | nginx |

### Audit DB → `domain = 'finding'`

| Subject | Key | Value Example | Source |
|---------|-----|---------------|--------|
| `COMP-001/overnightdesk-nginx` | `severity` | `high` | audit-db |
| `COMP-001/overnightdesk-nginx` | `status` | `open` | audit-db |
| `COMP-001/overnightdesk-nginx` | `finding` | `Container runs without seccomp profile` | audit-db |
| `COMP-001/overnightdesk-nginx` | `last_seen` | `2026-04-30` | audit-db |

---

## Volume Requirements

| Volume Name | Mount Path (container) | Contents |
|-------------|------------------------|----------|
| `ops-facts-data` | `/data` | `facts.db` (SQLite file) |
| (existing) | `/etc/nginx/conf.d` (read-only) | nginx config for route collection |

The `ops-facts-data` named volume must be declared in `docker-compose.yml` and referenced in
the ops service definition. The SQLite file path is configurable via `FACTS_DB_PATH`
(default: `/data/facts.db`).
