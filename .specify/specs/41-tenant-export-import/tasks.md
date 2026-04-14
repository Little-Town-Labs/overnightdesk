# Task Breakdown — Feature 41: Tenant Export/Import

## Summary

- **Total Tasks:** 12
- **Phases:** 3 (Export, Import, API Handlers)
- **Quality Gates:** 2 (analyze, code review)
- **Critical Path:** 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2

---

## Phase 1: Archive Types & Export

### Task 1.1: Export — Tests
**Status:** 🟡 Ready
**Dependencies:** None

**Description:**
Write tests for archive types and export logic in `internal/database/export_test.go`. Tests MUST fail before implementation.

**Test Cases:**
- Export from empty instance produces valid archive with Agent Zero and empty arrays
- Export with seeded data (agents, projects, routines, skills, goals, labels, budget policies, instruction files, workspace defs) returns all entities
- Selective export with `includeTypes` filter returns only requested types
- Excluded types have empty arrays in selective export
- Bot tokens are stripped from telegram/discord config
- Archive metadata includes timestamp, engine version, schema version
- Schema version matches current goose migration number

**Acceptance Criteria:**
- [ ] All test cases written and confirmed to FAIL
- [ ] Tests use real temp SQLite DB (existing `database.Open(t.TempDir())` pattern)
- [ ] Test helpers seed realistic data across all exportable entity types

---

### Task 1.2: Export — Implementation
**Status:** 🔴 Blocked by 1.1
**Dependencies:** Task 1.1

**Description:**
Implement archive types and export logic in `internal/database/export.go`.

**Implementation:**
- Define `Archive`, `ArchiveMetadata`, `ArchiveData` structs with JSON tags
- Define `ArchiveVersion = 1` constant
- Implement `ExportConfig(db *sql.DB, includeTypes []string) (*Archive, error)`
- Read all entity types within a read-only transaction (`sql.TxOptions{ReadOnly: true}`)
- Use existing `List*` query functions where possible, add new ones where needed
- Strip sensitive fields: zero out bot tokens in bridge configs
- Read schema version: `SELECT MAX(version_id) FROM goose_db_version WHERE is_applied = 1`
- If `includeTypes` is non-empty, only query those types; others get empty slices

**Acceptance Criteria:**
- [ ] All tests from 1.1 pass
- [ ] No new dependencies added
- [ ] Sensitive fields confirmed stripped

---

## Phase 2: Import Logic

### Task 2.1: Import — Tests
**Status:** 🔴 Blocked by 1.2
**Dependencies:** Task 1.2 (needs working export for round-trip tests)

**Description:**
Write tests for import logic in `internal/database/import_test.go`. Tests MUST fail before implementation.

**Test Cases:**

*Round-trip fidelity:*
- Export → Import into fresh instance → Re-export → archives match (excluding IDs and timestamps)

*Conflict strategies:*
- `skip`: existing entities untouched, new entities created
- `overwrite`: existing entities replaced with archive versions
- `fail`: import aborted with 0 changes when any conflict exists

*Agent Zero handling:*
- Agent Zero config merged (not duplicated) on import
- Agent Zero's child entities (skills, instructions, routines) imported and linked to existing Agent Zero
- `skip` strategy leaves Agent Zero config as-is but imports children
- `overwrite` strategy updates Agent Zero config and imports children

*Self-referential entities:*
- Goals with parent→child hierarchy import correctly regardless of array order
- Agents with `reports_to` chain import correctly regardless of array order

*Atomicity:*
- Inject invalid entity mid-archive → entire import rolled back, DB unchanged
- Verify no partial state after rollback

*Singleton handling:*
- Bridge configs imported as "not configured" (tokens empty)
- Heartbeat state upserted correctly
- `skip` leaves existing singleton, `overwrite` replaces it

*Version compatibility:*
- Archive with higher schema version → error, no changes
- Archive with lower schema version → warning in result, import proceeds

*Edge cases:*
- Empty archive (only metadata, all empty arrays) → success, nothing created
- Partial archive (only agents + skills) → success, missing FK targets set to null
- Duplicate import with `skip` → idempotent, no errors

**Acceptance Criteria:**
- [ ] All test cases written and confirmed to FAIL
- [ ] Tests cover all three conflict strategies
- [ ] Atomicity test verifies rollback leaves DB clean

---

### Task 2.2: Import — Implementation
**Status:** 🔴 Blocked by 2.1
**Dependencies:** Task 2.1

**Description:**
Implement import logic in `internal/database/import.go`.

**Implementation:**
- Define `ImportStrategy` string type with constants: `StrategySkip`, `StrategyOverwrite`, `StrategyFail`
- Define `ImportPreview` and `ImportResult` structs with per-entity-type counts
- Define `EntityAction` struct: `{Create, Update, Skip, Conflict int}`

- **ID Remapping:**
  - Build `map[string]string` (oldID → newID) per entity type
  - Agent Zero special case: map archive Agent Zero ID → existing Agent Zero ID
  - Generate new UUIDs for all other entities

- **Natural Key Matching (conflict detection):**
  - agents: `name`
  - projects: `name`
  - routines: `name` + remapped `agent_id`
  - skills: `name` + remapped `agent_id`
  - goals: `title` + `level` + remapped `parent_id`
  - labels: `name`
  - budget_policies: remapped `agent_id` + remapped `project_id`
  - agent_instruction_files: remapped `agent_id` + `filename`
  - project_workspaces: remapped `project_id` + `name`
  - singletons: always match (id='default')

- **PreviewImport(db, archive, strategy):**
  - Run conflict detection without writes
  - Return counts per entity type

- **ExecuteImport(db, archive, strategy):**
  - Validate archive version and schema compatibility
  - Begin transaction
  - Insert in topological order (plan TD-3)
  - Two-pass for self-referential: insert with NULL refs, then UPDATE refs
  - Apply conflict strategy per entity
  - Commit on success, rollback on any error
  - Return result with counts and warnings

**Acceptance Criteria:**
- [ ] All tests from 2.1 pass
- [ ] Round-trip export→import preserves all config
- [ ] Atomicity verified — no partial state on failure
- [ ] Agent Zero never duplicated

---

## Phase 3: API Handlers

### Task 3.1: Handlers — Tests
**Status:** 🔴 Blocked by 2.2
**Dependencies:** Task 2.2

**Description:**
Write handler tests in `internal/api/export_import_test.go`. Tests MUST fail before implementation.

**Test Cases:**

*Authentication:*
- All three endpoints return 401 without bearer token

*Export handler:*
- `GET /api/export` returns valid archive JSON
- `GET /api/export?include=agents,skills` returns selective archive
- Response Content-Type is `application/json`

*Preview handler:*
- `POST /api/import/preview` with valid archive returns preview
- `POST /api/import/preview?strategy=fail` with conflicts returns conflict counts
- Malformed JSON body returns 400
- Archive from future schema returns 409

*Import handler:*
- `POST /api/import` with valid archive returns result with created counts
- `POST /api/import?strategy=skip` skips existing entities
- `POST /api/import?strategy=overwrite` replaces existing entities
- `POST /api/import?strategy=fail` with conflicts returns 409
- Malformed JSON body returns 400
- Archive from future schema returns 409

**Acceptance Criteria:**
- [ ] All test cases written and confirmed to FAIL
- [ ] Auth tests verify 401 response
- [ ] Tests use existing `newTestServer(t)` helper pattern

---

### Task 3.2: Handlers — Implementation
**Status:** 🔴 Blocked by 3.1
**Dependencies:** Task 3.1

**Description:**
Implement handlers in `internal/api/export_import.go` and register routes in `server.go`.

**Implementation:**
- Register routes in `server.go`:
  ```
  api.GET("/export", s.handleExport)
  api.POST("/import/preview", s.handleImportPreview, middleware.BodyLimit("10M"))
  api.POST("/import", s.handleImport, middleware.BodyLimit("10M"))
  ```

- `handleExport`:
  - Parse `include` query param (comma-separated)
  - Call `database.ExportConfig(s.db, includeTypes)`
  - Return `c.JSON(200, archive)`

- `handleImportPreview`:
  - Bind request body to `Archive`
  - Parse `strategy` query param (default "skip")
  - Check schema version compatibility
  - Call `database.PreviewImport(s.db, archive, strategy)`
  - Return `c.JSON(200, preview)`

- `handleImport`:
  - Bind request body to `Archive`
  - Parse `strategy` query param (default "skip")
  - Check schema version compatibility
  - Call `database.ExecuteImport(s.db, archive, strategy)`
  - Return `c.JSON(200, result)` or error

**Acceptance Criteria:**
- [ ] All tests from 3.1 pass
- [ ] Routes registered with correct middleware
- [ ] Body limit set to 10MB on import endpoints only

---

## Quality Gates

### Task QG-1: Spec-Plan-Task Consistency Check
**Status:** 🔴 Blocked by 3.2
**Dependencies:** All implementation tasks

**Description:**
Run `/speckit-analyze` to validate that implementation covers all spec requirements and plan decisions.

**Acceptance Criteria:**
- [ ] All functional requirements (FR-1 through FR-8) traced to tasks
- [ ] All edge cases (EC-1 through EC-9) covered by tests
- [ ] No spec drift

---

### Task QG-2: Code Review
**Status:** 🔴 Blocked by QG-1
**Dependencies:** QG-1

**Description:**
Run `/code-review` on all new files. Address CRITICAL and HIGH issues.

**Acceptance Criteria:**
- [ ] No CRITICAL issues
- [ ] No HIGH issues
- [ ] Security review passes (no secrets, auth enforced, input validated)
- [ ] 80%+ test coverage on new code

---

## Dependency Graph

```
1.1 (export tests) → 1.2 (export impl)
                          ↓
                     2.1 (import tests) → 2.2 (import impl)
                                               ↓
                                          3.1 (handler tests) → 3.2 (handler impl)
                                                                      ↓
                                                                 QG-1 (analyze)
                                                                      ↓
                                                                 QG-2 (review)
```

**Critical Path:** 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → QG-1 → QG-2
**No parallelization:** Each phase depends on the previous (import needs working export, handlers need working import).
