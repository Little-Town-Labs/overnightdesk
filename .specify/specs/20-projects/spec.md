# Feature 20: Projects

**Status:** Draft
**Priority:** P1
**Complexity:** Small
**Repos:** `overnightdesk-engine`

---

## Overview

Projects group related issues into named collections. A customer running a SaaS business might have projects like "Backend API", "Marketing Site", "Customer Onboarding" — each containing issues assigned to agents. Projects have a color for visual distinction, a status for lifecycle tracking, and an optional target date for deadlines.

The `project_id` column already exists (nullable) on the issues table from Feature 18. This feature creates the projects table and the API to manage them.

### Business Value

- Customers organize agent work by business area instead of one flat list
- Target dates enable deadline tracking
- Project-scoped issue views answer "what's happening on Project X?"
- Foundation for project-level budgets (Feature 21)

---

## User Stories

### User Story 1: Create a Project

**As a** customer organizing my agent work
**I want** to create named projects with a description and color
**So that** I can group related issues together

**Acceptance Criteria:**
- [ ] A project can be created with a name, description, color, and optional target date
- [ ] Project names must be unique within the instance
- [ ] Projects start in "active" status
- [ ] A default color is assigned if none provided

**Priority:** High

### User Story 2: Assign Issues to Projects

**As a** customer managing work
**I want** to assign issues to a project
**So that** I can see all work related to a specific effort

**Acceptance Criteria:**
- [ ] An issue can be assigned to a project at creation time
- [ ] An issue's project can be changed via update
- [ ] An issue can be unassigned from a project (set to null)
- [ ] Deleting a project sets its issues' project_id to null (issues are not deleted)

**Priority:** High

### User Story 3: View Project Issues

**As a** customer checking on a project
**I want** to list issues filtered by project
**So that** I can see what's queued, in progress, and done for that project

**Acceptance Criteria:**
- [ ] Issues can be filtered by project_id via the existing list API
- [ ] The project detail includes a summary: total issues, issues by status
- [ ] The issue response includes project_id for display

**Priority:** High

### User Story 4: Manage Project Lifecycle

**As a** customer completing a project
**I want** to mark projects as completed or archived
**So that** my active project list stays clean

**Acceptance Criteria:**
- [ ] Projects have statuses: active, completed, archived
- [ ] A project can be updated to any status
- [ ] Completed/archived projects still show their issues
- [ ] Projects can be deleted (issues become unassigned)

**Priority:** Medium

### User Story 5: List Projects

**As a** customer with multiple projects
**I want** to see all my projects with status and issue counts
**So that** I can prioritize where to focus

**Acceptance Criteria:**
- [ ] Projects can be listed with pagination
- [ ] Projects can be filtered by status
- [ ] Each project in the list includes issue count by status
- [ ] Projects are sorted by creation time (newest first)

**Priority:** High

---

## Functional Requirements

### FR-1: Projects Table
Store projects with:
- Unique identifier (UUID)
- Name (unique, max 255 chars)
- Description (optional, max 5000 chars)
- Color (hex string, e.g. "#3B82F6", default "#6366F1")
- Status: active, completed, archived
- Target date (optional, date string YYYY-MM-DD)
- Creation and update timestamps

### FR-2: Project CRUD API
- List projects with status filter and pagination, including issue count summary
- Get a single project by ID with issue count summary
- Create a project (name, description, color, target_date)
- Update a project (name, description, color, status, target_date)
- Delete a project (sets issues' project_id to null)

### FR-3: Issue-Project Association
- The existing issues.project_id column links to projects
- Issue list API accepts project_id filter (already partially there via IssueFilters)
- Issue create/update API accepts project_id

### FR-4: Project Issue Summary
When returning a project, include:
- Total issue count
- Count by status (todo, in_progress, done, failed, etc.)

---

## Non-Functional Requirements

### NFR-1: Performance
- Project list with summaries must return in < 100ms for up to 50 projects
- Project creation must complete in < 50ms

### NFR-2: Data Integrity
- Project names unique (enforced by constraint)
- Deleting a project nullifies issues' project_id (application-level cascade)
- Color must be a valid hex string or empty

---

## Edge Cases

### EC-1: Delete Project with Issues
Issues become unassigned (project_id = null). Issues are NOT deleted.

### EC-2: Assign Issue to Nonexistent Project
Return 400 with clear error message.

### EC-3: Duplicate Project Name
Return 409 conflict.

---

## Out of Scope
- Project-level budgets (Feature 21)
- Dashboard UI for projects (Feature 26)
- Project membership / permissions
