# Feature 41: Tenant Export/Import

## Overview

Operators need to export a tenant's full configuration as a portable archive and import it into a fresh or existing instance. This enables backup, migration between hosts, disaster recovery, and template sharing (spin up new tenants with a pre-configured agent team).

The export captures **configuration and structure** — agents, projects, routines, skills, budget policies, goals, labels, instruction bundles, workspace definitions, and bridge configs. It does **not** capture operational history (runs, activity log, conversations, finance events) or sensitive material (secrets, auth tokens, session state).

**Business Value:** Operators can snapshot a working tenant config, restore it after a wipe, clone it for a new customer, or version-control it alongside infrastructure. Reduces setup time for new tenants from hours to seconds.

## User Stories

### User Story 1: Export Tenant Configuration
**As an** operator
**I want to** export all configuration from a tenant instance as a single file
**So that** I have a portable backup of the agent team setup

**Acceptance Criteria:**
- [ ] A single API call produces a complete configuration archive
- [ ] The archive is a self-describing format with a version identifier
- [ ] The archive contains all agent definitions, projects, routines, skills, goals, labels, budget policies, instruction bundles, workspace definitions, and bridge configs
- [ ] The archive does NOT contain secrets, auth tokens, run history, activity logs, conversations, or finance events
- [ ] The archive includes metadata: export timestamp, engine version, feature list

**Priority:** High

### User Story 2: Preview Import Before Applying
**As an** operator
**I want to** see what an import would change before it takes effect
**So that** I can avoid accidentally overwriting existing configuration

**Acceptance Criteria:**
- [ ] A preview endpoint accepts an archive and returns a change summary
- [ ] The summary shows entities that would be created, updated, or skipped
- [ ] The summary identifies conflicts (e.g., agent with same name already exists)
- [ ] No data is modified during preview
- [ ] The preview response includes the archive version and compatibility status

**Priority:** High

### User Story 3: Import Tenant Configuration
**As an** operator
**I want to** apply an exported archive to a tenant instance
**So that** I can restore or clone a configuration

**Acceptance Criteria:**
- [ ] Import creates all entities from the archive that don't already exist
- [ ] Import handles ID conflicts by generating new IDs while preserving internal references
- [ ] Import is atomic — either all entities are created or none are (rollback on failure)
- [ ] Import returns a summary of what was created
- [ ] The operator can choose a conflict strategy: skip existing, overwrite existing, or fail on conflict
- [ ] Agent Zero is never overwritten or duplicated (it is system-seeded)

**Priority:** High

### User Story 4: Export for Template Sharing
**As an** operator
**I want to** export a curated subset of configuration (e.g., just agents and skills)
**So that** I can share reusable templates without exposing the full tenant setup

**Acceptance Criteria:**
- [ ] Export accepts an optional filter specifying which entity types to include
- [ ] Omitted entity types are excluded from the archive
- [ ] References to excluded entities are set to null (e.g., a routine's agent_id when agents are excluded)
- [ ] The archive is valid for import even when incomplete — missing references are ignored gracefully

**Priority:** Medium

### User Story 5: Version Compatibility Check
**As the** system
**I want to** detect when an archive was created by a different engine version
**So that** imports don't silently produce corrupt state

**Acceptance Criteria:**
- [ ] The archive includes the schema version (migration number) at export time
- [ ] Import checks the archive schema version against the current engine schema version
- [ ] If the archive is from a newer schema version, import fails with a clear error
- [ ] If the archive is from an older schema version, import proceeds with a warning (forward-compatible fields are set to defaults)

**Priority:** Medium

## Functional Requirements

### FR-1: Archive Format
The archive must be a single JSON document with:
- A top-level `version` field identifying the archive format version
- A `metadata` object with export timestamp, engine version, and schema version
- A `data` object with keys for each entity type, each containing an array of records

### FR-2: Exportable Entity Types
The following entity types must be exportable:
- `agents` — identity, role, status, budget, heartbeat config, approval mode (excluding Agent Zero's system fields)
- `projects` — name, description, color, status, target date, goal association
- `project_workspaces` — workspace definitions per project
- `routines` — schedules, triggers, concurrency and catch-up policies
- `skills` — name, description, content, agent association
- `goals` — hierarchy (company → team → agent → task), status, ownership
- `labels` — name, color
- `budget_policies` — limits, thresholds, actions per agent/project
- `agent_instruction_files` — per-agent instruction bundles
- `telegram_config` — bot configuration (token excluded)
- `discord_config` — bot configuration (token excluded)
- `heartbeat_state` — interval, enabled status

### FR-3: Excluded Data
The following must NEVER be included in exports:
- `runs`, `run_events` — execution history
- `activity_log` — audit trail
- `conversations`, `conversation_messages` — customer data
- `finance_events` — financial records
- `claude_sessions` — session state
- `agent_runtime_state` — transient state
- `agent_wakeup_requests` — transient queue
- `agent_config_revisions` — revision history (config snapshots are in the archive itself)
- `agent_task_sessions` — session-to-issue mappings
- `execution_workspaces` — ephemeral workspace records
- `issue_work_products` — linked to specific runs
- `issues`, `issue_comments`, `issue_counter`, `issue_labels`, `issue_documents` — work item history
- `documents`, `document_revisions` — issue-attached documents
- `budget_incidents` — incident history
- `approval_comments`, `approvals` — approval history
- `memory_documents`, `memory_chunks` — agent memory (rebuild on use)
- Bot tokens in bridge configs (sensitive)
- Any field containing encrypted values or credentials

### FR-4: ID Remapping
On import, all entity IDs must be regenerated. Internal foreign key references (e.g., routine → agent, goal → parent goal, skill → agent) must be remapped to the new IDs. The archive includes original IDs only as reference keys for relationship mapping.

### FR-5: Agent Zero Handling
Agent Zero is pre-seeded on every instance. Export includes Agent Zero's configuration (skills, instruction files, routines) but import must merge into the existing Agent Zero rather than creating a duplicate. Agent Zero is identified by a well-known name or role, not by ID.

### FR-6: Conflict Strategies
Import must support three conflict resolution strategies, specified by the caller:
- `skip` — if an entity with the same natural key (name for agents, slug for skills, etc.) exists, skip it
- `overwrite` — replace the existing entity with the archive version
- `fail` — abort the entire import if any conflict is detected

### FR-7: Atomic Import
Import must execute within a single database transaction. If any entity fails to insert or update, the entire import is rolled back. The caller receives an error identifying which entity and field caused the failure.

### FR-8: Selective Export
Export accepts an optional list of entity type keys to include. When provided, only those types are exported. Omitted types result in empty arrays. Foreign key references to excluded types are exported as-is but marked as unresolved.

## Non-Functional Requirements

### NFR-1: Performance
- Export of a tenant with 20 agents, 50 routines, 100 skills must complete in < 2 seconds
- Import of an equivalently sized archive must complete in < 5 seconds
- Preview must complete in < 2 seconds

### NFR-2: Archive Size
- Archives must be reasonable size (< 5MB for a typical tenant)
- Request body size limit for import endpoint must accommodate the archive (engine's 1MB default may need a per-route override)

### NFR-3: Security
- Export endpoint requires bearer token authentication (standard engine auth)
- Import endpoint requires bearer token authentication
- No secrets, tokens, or credentials in the archive
- Archive does not include customer conversation data (Data Sacred principle)

### NFR-4: Reliability
- Import atomicity must hold even under concurrent API requests
- Export must produce a consistent snapshot (read within a transaction)

## Edge Cases & Error Handling

### EC-1: Empty Instance
Export from a fresh instance (only Agent Zero, no custom config) produces a valid archive with Agent Zero's config and empty arrays for other types.

### EC-2: Circular Goal References
Goals form a tree via `parent_id`. Export must serialize the full tree. Import must handle insertion order (parents before children) regardless of array order in the archive.

### EC-3: Self-Referential Agents
Agents have `reports_to` which can reference other agents. Import must handle insertion order or use deferred constraint resolution.

### EC-4: Import to Non-Empty Instance
Importing into an instance that already has custom agents, routines, etc. The conflict strategy determines behavior. Preview shows exactly what would happen.

### EC-5: Duplicate Import
Importing the same archive twice with `skip` strategy should be idempotent — no errors, no duplicates.

### EC-6: Archive from Future Version
If the archive schema version is higher than the current engine, import must fail with a clear message ("upgrade engine before importing").

### EC-7: Partial Archive
An archive with only some entity types populated (from selective export) must import cleanly. Missing foreign key targets are treated as null references.

### EC-8: Large Instruction Bundles
Instruction files can contain substantial markdown content. The archive must handle this without truncation.

### EC-9: Bridge Config Without Tokens
Bridge configs are exported without bot tokens. On import, bridge configs are created in a "not configured" state — the operator must re-enter tokens manually.

## Success Metrics

- Export produces a valid, self-describing archive for any tenant configuration
- Import + Export round-trip preserves all configuration (excluding IDs and excluded data)
- Preview accurately predicts import outcome with zero false positives
- Import is fully atomic — no partial state on failure
- 80%+ test coverage on export, import, and preview logic
