# ob1-mcp

MCP server exposing Ace's long-term memory (`ace_memory` schema in tenet0-postgres) over Streamable HTTP. Implements the Open Brain pattern: every entry carries provenance metadata so consumers can distinguish **evidence** from **instruction**.

## Trust model (provenance)

Every entry is labeled with a provenance value:

| Provenance  | Meaning                                                       | Trust tier  | Settable on save? |
| ----------- | ------------------------------------------------------------- | ----------- | ----------------- |
| `observed`  | Captured directly from a source (log, tool output, message)   | instruction | yes |
| `confirmed` | A human (or platform-trusted caller) explicitly endorsed it   | instruction | **no — `confirm_thought(id)` only** |
| `inferred`  | A model derived this from other context                       | evidence    | yes |
| `generated` | Agent-produced during work (review note, summary)             | evidence    | yes (default) |
| `imported`  | Migrated from an older system / transcript                    | evidence    | yes |

Consumers should default to instruction-grade (`['confirmed','observed']`) when recalling for action, and widen to evidence when exploring.

**Provenance integrity rule:** `save_thought` and `supersede_thought` reject `provenance='confirmed'` — workers cannot self-elevate their own writes to instruction-grade. The only way to set `confirmed` is `confirm_thought(id)`, which models a deliberate endorsement.

## Trust-layer guard on writes

Every `save_thought` / `supersede_thought` call passes through a guard before embedding or storage:

1. **Rate limit** — token-bucket per identity (default `100/min`, `1000/hour`; tunable via `WRITE_RATE_PER_MIN` / `WRITE_RATE_PER_HOUR`). Prevents runaway workers from poisoning memory or burning embedding $$$.
2. **Securityteam pre-flight** — when `SECURITYTEAM_URL` is set, content is POSTed to the securityteam container's `/check-outbound` endpoint **before** the OpenRouter embed call. Findings (PII, secrets, financial-channel violations) reject the write. Securityteam outage or 5xx is **fail-closed** — refused write rather than unscanned passthrough. With `SECURITYTEAM_URL` unset (local dev) the check is bypassed with a one-time WARNING log.

## Workflow (recall → work → write-back)

```
1. RECALL    search_thoughts(query, min_provenance=['confirmed','observed'], task_id?)
2. WORK      do the thing, carrying task_id / channel / runtime context
3. WRITE     save_thought(content, category, provenance, source, runtime,
                          reasoning_model, channel, task_id, confidence)
4. PROMOTE   confirm_thought(id)            # user endorsed an inferred entry
5. SUPERSEDE supersede_thought(old_id, new_content, ...)  # fact changed
```

## Tools

| Tool | Purpose |
| --- | --- |
| `save_thought` | Embed + store with full provenance metadata. Defaults `provenance='generated'`. |
| `search_thoughts` | Semantic search; filters: `category`, `min_provenance`, `task_id`, `include_inactive`. |
| `list_thoughts` | Browse newest-first; same filters as search. |
| `confirm_thought` | Promote an entry to `provenance='confirmed'` (instruction-grade). |
| `supersede_thought` | Atomically replace an entry; old is soft-deleted, new is linked via `supersedes_id`. |
| `forget_thought` | Soft (default) or hard delete. |
| `memory_stats` | Counts incl. `by_provenance` breakdown. |
| `list_provenance_values` | Returns the allowed provenance enum values. |

## Schema

Live schema: `ace_memory` in tenet0-postgres.

- `entries(id, category, content, tags, is_active, provenance, source, runtime, reasoning_model, channel, task_id, confidence, user_confirmed_at, supersedes_id, created_at, updated_at)`
- `embeddings(entry_id, embedding vector, model)`

Migrations live under `migrations/`. Apply with `psql` against tenet0-postgres after `pg_dump -n ace_memory`. Numbered, idempotent (`IF NOT EXISTS` everywhere) — safe to re-run.

## Env

| Var | From |
| --- | --- |
| `DATABASE_URL` | Phase `/ob1/DATABASE_URL` (postgresql://ace_app:...@tenet0-postgres:5432/tenet0) |
| `OPENROUTER_API_KEY_GARY` | Phase `/ob1/OPENROUTER_API_KEY_GARY` (plain `OPENROUTER_API_KEY` accepted as transitional fallback) |
| `MCP_ACCESS_KEY` | Phase `/ob1/MCP_ACCESS_KEY` (bearer for hermes) |
| `EMBEDDING_MODEL` | optional, default `openai/text-embedding-3-small` |
| `PORT` | optional, default `3000` |
| `SECURITYTEAM_URL` | optional, e.g. `http://overnightdesk-securityteam:4700`; unset = guard bypass with WARNING |
| `WRITE_RATE_PER_MIN` | optional, default `100` (per-identity sliding window) |
| `WRITE_RATE_PER_HOUR` | optional, default `1000` |

## Auth

All MCP requests require `Authorization: Bearer <MCP_ACCESS_KEY>`. `/healthz` is unauthenticated.

## Development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q
```

Tests use a fake in-memory `Store` and exercise the FastMCP tool registry directly — no Postgres needed for the unit suite.

## Deploy

Built and run on aegis-prod via the main `/opt/overnightdesk/docker-compose.yml`. Source rsynced to `~/ob1-mcp/`.

To roll out the provenance migration:

```bash
# on aegis-prod
pg_dump -n ace_memory tenet0 > ace_memory_pre_provenance.sql
psql tenet0 < ~/ob1-mcp/migrations/001_provenance.sql
docker compose -f /opt/overnightdesk/docker-compose.yml up -d --build ob1-mcp
curl -s localhost:<port>/healthz
```

Existing rows backfill to `provenance='imported'`. Old `save_thought` callers continue to work (defaulting to `provenance='generated'`); update hermes-agent skills incrementally to pass real provenance / source / runtime / task_id.
