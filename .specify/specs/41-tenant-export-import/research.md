# Technology Research — Feature 41: Tenant Export/Import

## Decision 1: Archive Format

**Options:**
1. **Single JSON document** — one file, self-describing, easy to inspect and diff
2. **Tar/Gzip archive** — multiple files, better for large payloads, harder to inspect
3. **SQLite dump** — native to the engine's DB, but tightly coupled to schema

**Chosen:** Single JSON document
**Rationale:** The engine already uses `json.Marshal` on all entity structs. JSON is human-readable, diffable, and trivially parseable. Typical tenant config is small (< 1MB). No new dependencies required.
**Tradeoffs:** Larger payloads than compressed binary, but the data volume is tiny for config-only exports.

## Decision 2: Transaction Approach

**Options:**
1. **database/sql Begin/Commit/Rollback** — standard Go, already available
2. **Savepoints** — nested transactions for partial rollback
3. **Write-ahead journal** — rely on SQLite WAL for atomicity

**Chosen:** database/sql Begin/Commit/Rollback
**Rationale:** Simple, well-understood pattern. The codebase doesn't use transactions yet but `*sql.DB` supports them natively. Import is a single bulk operation — no need for savepoints.
**Tradeoffs:** This will be the first transaction usage in the codebase. Establishes a pattern others can follow.

## Decision 3: Conflict Detection Natural Keys

**Options:**
1. **Name-based matching** — match agents by name, skills by slug, routines by name
2. **ID-based matching** — match by original IDs stored in archive
3. **Hash-based matching** — content hash for dedup

**Chosen:** Name-based matching
**Rationale:** Names are the user-visible identity of entities. An agent named "Marketing Bot" is the "same" agent regardless of its UUID. This is intuitive for operators and works across instances that were never related.
**Tradeoffs:** Entities with duplicate names within an archive would be ambiguous (edge case — names should be unique per type in practice).

**Natural key table:**
| Entity | Natural Key |
|--------|-------------|
| agents | name |
| projects | name |
| routines | name + agent_id (remapped) |
| skills | name + agent_id |
| goals | title + level + parent_id |
| labels | name |
| budget_policies | agent_id + project_id (composite) |
| agent_instruction_files | agent_id + filename |
| project_workspaces | project_id + name |
| telegram_config | singleton (id='default') |
| discord_config | singleton (id='default') |
| heartbeat_state | singleton (id='default') |

## Decision 4: Body Size Limit

**Current:** Engine enforces 1MB request body limit globally.
**Needed:** Import archives could exceed 1MB with large instruction bundles.

**Options:**
1. **Per-route override** — raise limit to 10MB on import endpoint only
2. **Global increase** — raise to 10MB everywhere
3. **Streaming import** — read body in chunks

**Chosen:** Per-route override (10MB on import endpoint)
**Rationale:** Most endpoints should stay at 1MB for security. Only the import endpoint handles large payloads. Echo framework supports per-route body limit middleware.
**Tradeoffs:** Slightly more config complexity vs. opening up attack surface globally.

## Decision 5: Schema Version Tracking

**Current:** Goose manages migrations with `goose_db_version` table.
**Needed:** Archive must record which schema version it was exported from.

**Chosen:** Read max version from `goose_db_version` table at export time, embed in archive metadata.
**Rationale:** Already tracked by goose. No new tables or columns needed.
