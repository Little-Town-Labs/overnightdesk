# Data Model — Feature 20: Projects

## Tables

### projects

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL, UNIQUE | Project name |
| description | TEXT | NOT NULL, DEFAULT '' | Project description |
| color | TEXT | NOT NULL, DEFAULT '#6366F1' | Hex color for UI |
| status | TEXT | NOT NULL, DEFAULT 'active' | active, completed, archived |
| target_date | TEXT | DEFAULT NULL | YYYY-MM-DD (optional) |
| created_at | TEXT | NOT NULL | RFC3339 |
| updated_at | TEXT | NOT NULL | RFC3339 |

**Constraints:**
- CHECK (status IN ('active', 'completed', 'archived'))

**Indexes:**
- `idx_projects_status` on (status)

### issues (EXISTING — no schema change)

The `project_id` column already exists from migration 006. Just needs the project filter added to `ListIssues` (already in `IssueFilters` struct).

## Migration 008_projects.sql

- Create `projects` table
- No data migration needed
