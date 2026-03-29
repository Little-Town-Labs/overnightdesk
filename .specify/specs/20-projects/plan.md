# Implementation Plan — Feature 20: Projects

**Repo:** `overnightdesk-engine` | **Complexity:** Small

## Phases

### Phase A: Migration 008_projects.sql
Create projects table.

### Phase B: Project Data Layer
`internal/database/projects.go`: CreateProject, GetProject, ListProjects (with issue summary), UpdateProject, DeleteProject (cascade nullify issues).

### Phase C: Issue Filter Extension
Add `ProjectID` to `IssueFilters` in `internal/database/issues.go`.

### Phase D: Project API
`internal/api/projects.go`: CRUD endpoints + route registration.

### Phase E: Issue API Update
Accept `project_id` on issue create/update.

## Testing: TDD throughout. ~8 hours total.
