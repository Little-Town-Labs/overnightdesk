# Implementation Plan — Feature 41: Tenant Export/Import

## Executive Summary

Add three API endpoints to the engine: `GET /api/export`, `POST /api/import/preview`, and `POST /api/import`. Export reads all configuration entities from SQLite and serializes them into a versioned JSON archive. Import deserializes the archive, remaps IDs, resolves conflicts per the chosen strategy, and writes everything in a single transaction. Preview dry-runs the import logic without committing.

No new database tables or migrations. No schema changes. All entity structs already have JSON tags.

## Architecture Overview

```
GET /api/export
  → database.ExportConfig(db, includeTypes)
  → JSON archive response

POST /api/import/preview
  → parse archive
  → database.PreviewImport(db, archive, strategy)
  → diff response (no writes)

POST /api/import
  → parse archive
  → database.ExecuteImport(tx, archive, strategy)
  → commit or rollback
  → result response
```

**New files:**
- `internal/database/export.go` — export queries, archive types, serialization
- `internal/database/import.go` — import logic, ID remapping, conflict resolution, transaction
- `internal/api/export_import.go` — HTTP handlers for all three endpoints
- `internal/api/export_import_test.go` — handler tests
- `internal/database/export_test.go` — export unit tests
- `internal/database/import_test.go` — import unit tests (round-trip, conflicts, atomicity)

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Serialization | `encoding/json` | Already used for all entity structs; zero new deps |
| Transactions | `database/sql` Tx | Native Go, first-class SQLite support |
| ID generation | `github.com/google/uuid` | Already in use throughout engine |
| Body limit | Echo per-route middleware | 10MB for import only, keeps 1MB default elsewhere |
| Schema version | `goose_db_version` table | Already tracked, no new schema needed |

## Technical Decisions

### TD-1: No New Migration
All exported entities already exist. The archive is a serialization of existing table rows. No new columns or tables are needed.

### TD-2: Export as Read Transaction
Export wraps all reads in a single `db.Begin()` with `sql.TxOptions{ReadOnly: true}` to get a consistent snapshot. SQLite's WAL mode ensures this doesn't block writes.

### TD-3: Import Insertion Order
Entities with foreign key dependencies must be inserted in topological order:
1. `labels` (no deps)
2. `goals` (self-referential — insert roots first, then children by level)
3. `agents` (self-referential via `reports_to` — insert roots first, then by hierarchy)
4. `projects` (depends on goals)
5. `project_workspaces` (depends on projects)
6. `skills` (depends on agents)
7. `agent_instruction_files` (depends on agents)
8. `routines` (depends on agents)
9. `budget_policies` (depends on agents, projects)
10. `telegram_config`, `discord_config`, `heartbeat_state` (singletons, upsert)

Self-referential entities (goals, agents) are inserted in two passes: first with `parent_id`/`reports_to` set to NULL, then updated with remapped references.

### TD-4: Agent Zero Merge Strategy
Agent Zero is identified by `name = 'Agent Zero'`. On import:
- If archive contains an agent named "Agent Zero", its ID is remapped to the existing Agent Zero's ID
- Skills, instruction files, and routines referencing the archive Agent Zero are linked to the existing one
- The existing Agent Zero's config fields are updated only if strategy is `overwrite`
- With `skip` strategy, Agent Zero config is left as-is but child entities (skills, instructions) are still imported

### TD-5: Singleton Entity Handling
Bridge configs (`telegram_config`, `discord_config`) and `heartbeat_state` are singleton rows with `id='default'`. Import uses upsert logic:
- `skip`: leave existing config as-is
- `overwrite`: replace config (excluding token fields which are zeroed in the archive)
- `fail`: conflict if singleton already has non-default values

Token fields are exported as empty strings. On import, they remain empty — operator must reconfigure.

### TD-6: Body Size Override
Import endpoint gets a 10MB body limit via Echo middleware:
```go
api.POST("/import", s.handleImport, middleware.BodyLimit("10M"))
api.POST("/import/preview", s.handleImportPreview, middleware.BodyLimit("10M"))
```

## Archive Format (v1)

```json
{
  "version": 1,
  "metadata": {
    "exported_at": "2026-04-13T12:00:00Z",
    "engine_version": "1.14.0",
    "schema_version": 27
  },
  "data": {
    "agents": [...],
    "projects": [...],
    "project_workspaces": [...],
    "routines": [...],
    "skills": [...],
    "goals": [...],
    "labels": [...],
    "budget_policies": [...],
    "agent_instruction_files": [...],
    "telegram_config": [...],
    "discord_config": [...],
    "heartbeat_state": [...]
  }
}
```

Each entity array contains objects matching the existing JSON serialization of the entity struct (same shape as API responses), with one addition: the original `id` field is preserved for relationship mapping during import.

## Implementation Phases

### Phase 1: Archive Types & Export (database layer)
- Define `Archive`, `ArchiveMetadata`, `ArchiveData` structs in `export.go`
- Implement `ExportConfig(db, includeTypes []string) (*Archive, error)`
- Read each entity type within a read transaction
- Strip sensitive fields (bot tokens)
- Read schema version from `goose_db_version`
- Unit tests: export empty instance, export with data, selective export

### Phase 2: Import Logic (database layer)
- Define `ImportStrategy` type (`skip`, `overwrite`, `fail`)
- Define `ImportResult`, `ImportPreview` structs
- Implement ID remapping: build `oldID → newID` map per entity type
- Implement conflict detection using natural keys (see research.md)
- Implement `PreviewImport(db, archive, strategy) (*ImportPreview, error)` — read-only
- Implement `ExecuteImport(db, archive, strategy) (*ImportResult, error)` — transactional
- Handle insertion order (TD-3), Agent Zero merge (TD-4), singletons (TD-5)
- Two-pass self-referential insert for goals and agents (TD-3)
- Unit tests: round-trip fidelity, conflict strategies, atomicity (inject error mid-import), Agent Zero merge, empty archive, partial archive, future version rejection

### Phase 3: API Handlers
- Register routes in `server.go` with body limit middleware
- `handleExport` — parse `include` query param, call ExportConfig, return JSON
- `handleImportPreview` — parse body + strategy, call PreviewImport, return diff
- `handleImport` — parse body + strategy, call ExecuteImport, return result
- Schema version compatibility check (reject newer, warn on older)
- Handler tests: auth required, happy paths, error cases, 413 on oversized body

## Security Considerations

- **Auth required**: All three endpoints behind `bearerAuth()` middleware (existing)
- **No secrets in archive**: Bot tokens zeroed before serialization; `encrypted_value` fields from secrets table excluded entirely (secrets table is NOT in the exportable entity list)
- **Data Sacred compliance**: Conversations, messages, runs, activity logs, finance events — all excluded by design
- **Input validation**: Import validates archive version, schema compatibility, and entity structure before any DB writes
- **Transaction isolation**: Import runs in an exclusive transaction — concurrent imports are serialized by SQLite

## Performance Strategy

- Export: single read transaction, sequential table scans. 20 agents + 50 routines + 100 skills is ~200 rows total — sub-100ms.
- Import: single write transaction, bulk inserts. Same volume — sub-500ms.
- Preview: same as import minus the commit — sub-200ms.
- All well within NFR-1 targets (export < 2s, import < 5s).

## Testing Strategy

- **Unit tests (database layer)**: Round-trip export→import, each conflict strategy, atomicity, Agent Zero handling, self-referential entities, selective export, version checks, empty instance, singleton upsert
- **Handler tests (API layer)**: Auth enforcement, happy path for each endpoint, malformed input, oversized body, query param parsing
- **Target**: 80%+ coverage on new code
- **No mocks**: Real temp SQLite DB per test (existing pattern)

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| First transaction usage in codebase | Low | Medium | Pattern is standard Go; SQLite handles well |
| Self-referential entity ordering | Medium | Medium | Two-pass insert (nullify refs, then update) |
| Future schema changes break archives | Low | High | Version field + compatibility check |
| Large instruction bundles exceed body limit | Low | Low | 10MB per-route limit is generous |

## Constitutional Compliance

- [x] **Data Sacred**: No customer data in archives (conversations, runs excluded)
- [x] **Security**: Auth required, no secrets exported, input validated
- [x] **Simple Over Clever**: JSON format, raw SQL, no new dependencies
- [x] **Test-First**: TDD workflow, 80%+ coverage target
- [x] **Owner's Time**: Clone/restore reduces manual tenant setup
