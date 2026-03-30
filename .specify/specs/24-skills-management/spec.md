# Feature 24: Skills Management

## Overview

Skills are markdown knowledge documents injected into agent context via CLAUDE.md. Currently they are filesystem-based (embedded base skills + tenant-added SKILL.md files). This feature adds DB-backed skills with CRUD API, agent assignment, and source tracking. Filesystem skills remain as read-only defaults. DB skills supplement them and can be assigned to specific agents or shared globally.

## User Stories

### US-1: Create a Skill
**As an** operator
**I want** to create a named skill with markdown content via the API
**So that** I can add knowledge to my agents without editing filesystem files

**Acceptance Criteria:**
- [ ] Skill has name, slug, description, and markdown content
- [ ] Slug is auto-generated from name if not provided
- [ ] Skill has source: system, user, or scanned
- [ ] Skill can be assigned to a specific agent or shared (null agent_id)
- [ ] Duplicate slugs are rejected

**Priority:** High

### US-2: Manage Skills
**As an** operator
**I want** to list, update, and delete skills
**So that** I can maintain my agent knowledge base

**Acceptance Criteria:**
- [ ] List skills filterable by agent and source
- [ ] Update skill content, description, and agent assignment
- [ ] Delete skill by ID
- [ ] System-source skills cannot be deleted via API

**Priority:** High

### US-3: View Agent Skills
**As an** operator
**I want** to see which skills are available to a specific agent
**So that** I can verify agent capabilities

**Acceptance Criteria:**
- [ ] List returns global skills (null agent_id) plus agent-specific skills
- [ ] Skills ordered by name

**Priority:** Medium

## Functional Requirements

- **FR-1:** Skills stored in database with full CRUD via REST API
- **FR-2:** Slug uniqueness enforced at database level
- **FR-3:** Skills filterable by agent_id and source
- **FR-4:** Agent-specific skills scoped; global skills shared
- **FR-5:** Source field tracks origin (system/user/scanned)

## Non-Functional Requirements

- **NFR-1:** Skill list API responds in <50ms
- **NFR-2:** Skill content can be up to 100KB of markdown

## Edge Cases

- Agent deleted with assigned skills: skills remain with original agent_id (no cascade)
- Duplicate slug: reject with 409 Conflict
- Empty content: allowed (skill may be placeholder)
- Slug with special characters: sanitize to lowercase alphanumeric + hyphens
