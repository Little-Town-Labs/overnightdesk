# Data Model — Feature 18: Issue Lifecycle

## Entity Relationship

```
agents (1) ──────── (0..N) issues          [assignee_agent_id]
issues (1) ──────── (0..N) issue_comments
issues (1) ──────── (0..1) conversations   [conversation_id, existing table]
issue_counter (singleton)                   [next issue number]
```

## Tables

### issues

The core work item table, replacing `agent_jobs`.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| identifier | TEXT | NOT NULL, UNIQUE | Human-readable e.g. "OD-42" |
| title | TEXT | NOT NULL | Short description (from prompt or explicit) |
| description | TEXT | NOT NULL | Full prompt text or user description |
| status | TEXT | NOT NULL, DEFAULT 'todo' | backlog, todo, in_progress, in_review, done, failed |
| priority | TEXT | NOT NULL, DEFAULT 'normal' | urgent, high, normal, low |
| priority_rank | INTEGER | NOT NULL, DEFAULT 2 | 0=urgent, 1=high, 2=normal, 3=low (for sorting) |
| assignee_agent_id | TEXT | DEFAULT NULL | FK → agents.id (null = unassigned) |
| project_id | TEXT | DEFAULT NULL | FK → projects.id (Feature 20, nullable) |
| source | TEXT | NOT NULL | dashboard, heartbeat, cron, telegram, discord, automate, manual |
| result | TEXT | DEFAULT NULL | Execution output |
| conversation_id | TEXT | DEFAULT NULL | FK → conversations.id (bridge context) |
| started_at | TEXT | DEFAULT NULL | RFC3339 when execution began |
| completed_at | TEXT | DEFAULT NULL | RFC3339 when execution finished |
| created_at | TEXT | NOT NULL | RFC3339 |
| updated_at | TEXT | NOT NULL | RFC3339 |

**Indexes:**
- `idx_issues_status` on (status)
- `idx_issues_assignee_status` on (assignee_agent_id, status) — agent queue lookup
- `idx_issues_priority` on (assignee_agent_id, status, priority_rank, created_at) — priority queue ordering
- `idx_issues_identifier` on (identifier) — lookup by human ID

**Constraints:**
- CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'failed'))
- CHECK (priority IN ('urgent', 'high', 'normal', 'low'))
- CHECK (source IN ('dashboard', 'heartbeat', 'cron', 'telegram', 'discord', 'automate', 'manual'))

---

### issue_comments

Comments on issues for collaboration.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| issue_id | TEXT | NOT NULL, FK → issues.id | Parent issue |
| author_agent_id | TEXT | DEFAULT NULL | FK → agents.id (null for non-agent) |
| author_source | TEXT | NOT NULL | dashboard, telegram, discord, system, agent |
| content | TEXT | NOT NULL | Comment text |
| created_at | TEXT | NOT NULL | RFC3339 |

**Indexes:**
- `idx_issue_comments_issue` on (issue_id, created_at)

**Constraints:**
- CHECK (author_source IN ('dashboard', 'telegram', 'discord', 'system', 'agent'))

---

### issue_counter

Singleton row tracking the next issue number.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY, DEFAULT 'default' | Singleton |
| prefix | TEXT | NOT NULL, DEFAULT 'OD' | Identifier prefix |
| next_number | INTEGER | NOT NULL, DEFAULT 1 | Next sequential number |

**Seed data:** `('default', 'OD', 1)`

---

### agent_jobs (EXISTING — retained read-only)

Not modified. Kept as backup during migration. Legacy `/api/jobs` endpoints read from `issues` table with response shape mapping.

---

## Priority Rank Mapping

| Priority | Rank | Sort Order |
|----------|------|------------|
| urgent | 0 | First |
| high | 1 | Second |
| normal | 2 | Third (default) |
| low | 3 | Last |

The `priority_rank` integer column enables efficient `ORDER BY priority_rank ASC, created_at ASC` without string comparison.

---

## Migration Plan

**Migration 006_issues.sql** (Goose up):

1. Create `issues` table with all columns and indexes
2. Create `issue_comments` table
3. Create `issue_counter` table with seed row
4. Migrate existing `agent_jobs` data into `issues`:
   - Map status: pending→todo, running→in_progress, completed→done, failed→failed
   - Generate sequential identifiers (OD-1, OD-2, ...)
   - Set assignee_agent_id = 'agent-zero' for all
   - Copy prompt→description, derive title from first 100 chars
   - Preserve conversation_id, result, timestamps
5. Update `issue_counter.next_number` to max migrated + 1

**Note:** `agent_jobs` table is NOT dropped. It stays as a read-only backup.

## Bootstrap Sequence

After migration, on engine start:
1. Verify `issue_counter` exists and has correct next_number
2. If issues exist but counter is at 1, recalculate from MAX identifier number
3. No Agent Zero changes needed (Feature 17 handles that)
