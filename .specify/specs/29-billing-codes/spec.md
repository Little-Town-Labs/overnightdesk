# Feature 29: Billing Codes

## Overview

Optional billing code field on issues that propagates to runs and cost tracking, enabling cost allocation by business function. Platform operators can tag issues with codes like "marketing", "devops", or "research" and then view cost breakdowns grouped by billing code.

**Business Value:** Enables organizations to attribute AI agent costs to specific departments, projects, or business functions for chargeback, budgeting, and ROI analysis.

## User Stories

### User Story 1: Assign Billing Code to Issue
**As a** platform operator
**I want** to assign a billing code when creating or updating an issue
**So that** costs incurred by that issue are attributed to the correct business function

**Acceptance Criteria:**
- [ ] Billing code is an optional free-text field on issue creation
- [ ] Billing code can be added or changed on an existing issue
- [ ] Billing code can be cleared (set to empty/null)
- [ ] Billing code value is returned when viewing an issue

**Priority:** High

### User Story 2: Propagate Billing Code to Runs
**As a** platform operator
**I want** runs spawned from an issue to inherit that issue's billing code
**So that** run-level costs are automatically tagged without manual entry

**Acceptance Criteria:**
- [ ] When a run is created for an issue, the run record includes the issue's billing code
- [ ] If an issue has no billing code, the run's billing code is null
- [ ] The billing code on a run reflects the issue's billing code at the time the run was created (snapshot, not live reference)

**Priority:** High

### User Story 3: View Costs by Billing Code
**As a** platform operator
**I want** to view cost summaries grouped by billing code
**So that** I can understand spending by business function

**Acceptance Criteria:**
- [ ] A cost-by-billing-code endpoint returns totals grouped by billing code
- [ ] Runs with no billing code appear under a "untagged" group
- [ ] Results include token counts and cost amounts per billing code
- [ ] Results can be filtered by date range

**Priority:** High

### User Story 4: Filter Issues by Billing Code
**As a** platform operator
**I want** to filter the issue list by billing code
**So that** I can see all work attributed to a specific business function

**Acceptance Criteria:**
- [ ] Issue list supports a billing_code query parameter
- [ ] Exact match filtering (not partial/fuzzy)
- [ ] Empty filter returns all issues (current behavior unchanged)

**Priority:** Medium

### User Story 5: Billing Code Validation
**As a** platform operator
**I want** billing codes to follow a consistent format
**So that** cost reports are clean and free of duplicates from typos or casing differences

**Acceptance Criteria:**
- [ ] Billing codes are case-insensitive (stored in a normalized form)
- [ ] Maximum length of 64 characters
- [ ] Only alphanumeric characters, hyphens, and underscores allowed
- [ ] Leading/trailing whitespace is trimmed

**Priority:** Medium

## Functional Requirements

- **FR-1:** Issues accept an optional `billing_code` field on create and update operations
- **FR-2:** The billing code is returned in all issue response payloads
- **FR-3:** Runs created from an issue copy the issue's current billing code at creation time
- **FR-4:** The billing code is returned in all run response payloads
- **FR-5:** A cost aggregation endpoint groups costs by billing code with token and cost totals
- **FR-6:** Issue list supports filtering by billing code
- **FR-7:** Billing codes are normalized to lowercase on storage
- **FR-8:** Billing codes are validated against format rules (max 64 chars, alphanumeric + hyphen + underscore)

## Non-Functional Requirements

- **NFR-1:** Adding billing code to issue create/update adds < 5ms latency
- **NFR-2:** Cost-by-billing-code query returns in < 200ms for up to 10,000 runs
- **NFR-3:** Billing code field does not break existing API consumers (backward compatible, optional field)

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Issue created without billing code | billing_code is null, runs inherit null |
| Billing code changed after runs exist | Existing runs keep their original billing code; only new runs get the updated code |
| Billing code with invalid characters | 400 error with descriptive message |
| Billing code exceeds 64 characters | 400 error with descriptive message |
| Billing code with mixed case | Normalized to lowercase before storage |
| Issue deleted with billing code | No impact on existing runs (billing code already copied) |
| Cost query with no runs | Returns empty results, not an error |
| Run created without an issue | billing_code is null on the run |

## Success Metrics

- All existing issue and run API tests continue to pass (backward compatibility)
- Cost-by-billing-code endpoint returns correct groupings
- Billing code propagation verified through issue-to-run lifecycle test
