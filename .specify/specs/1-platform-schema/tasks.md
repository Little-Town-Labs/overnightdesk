# Task Breakdown — 1-platform-schema

**Feature:** 1-platform-schema
**Plan:** plan.md
**Total Tasks:** 10
**Total Effort:** ~3 hours
**Critical Path:** 1.1 → 2.1 → 2.2 → 3.1 → 3.2 → 4.1

---

## Phase 1: Test Infrastructure Setup

### Task 1.1: Set Up Test Runner and Database Test Utilities
**Status:** 🟡 Ready
**Effort:** 30 min
**Dependencies:** None

**Description:**
Install vitest (or jest) as test runner if not already present. Create a test utility that connects to a test Neon database (using `DATABASE_TEST_URL` env var) and provides helpers for setup/teardown. The test database must be separate from production.

**Acceptance Criteria:**
- [ ] Test runner installed and configured
- [ ] `npm test` script added to package.json
- [ ] Test utility creates a Drizzle client connected to test database
- [ ] Helper function to clean up test data between tests
- [ ] A trivial passing test confirms the setup works

---

## Phase 2: Schema Definition (TDD)

### Task 2.1: Write Schema Export and Constraint Tests (RED)
**Status:** 🔴 Blocked by 1.1
**Effort:** 45 min
**Dependencies:** Task 1.1

**Description:**
Write tests FIRST. All tests must FAIL before any schema code is written. Tests cover:

1. **Export tests** — Verify schema module exports all expected tables and enums:
   - 11 tables: `waitlist`, `user`, `session`, `account`, `verification`, `subscription`, `instance`, `fleetEvent`, `usageMetric`, `platformAuditLog`
   - 4 enums: `subscriptionStatusEnum`, `instanceStatusEnum`, `claudeAuthStatusEnum`, `subscriptionPlanEnum`

2. **Uniqueness constraint tests** — Against test database:
   - Duplicate user email → unique violation
   - Duplicate instance tenant_id → unique violation
   - Duplicate instance subdomain → unique violation
   - Duplicate instance gateway_port → unique violation
   - Duplicate (instance_id, metric_date) → unique violation

3. **Enum constraint tests** — Against test database:
   - Insert subscription with invalid status → rejected
   - Insert instance with invalid status → rejected
   - Insert instance with invalid claude_auth_status → rejected
   - Insert subscription with invalid plan → rejected

4. **Foreign key tests** — Against test database:
   - Insert subscription with non-existent user_id → FK violation
   - Insert instance with non-existent user_id → FK violation
   - Delete user → sessions, accounts, subscription, instance cascade deleted
   - Delete instance → fleet_event.instance_id set to NULL
   - Delete instance → usage_metric rows cascade deleted

5. **Coexistence test** — After migration:
   - Waitlist table exists and is queryable
   - Inserting into waitlist still works

**Acceptance Criteria:**
- [ ] All tests written and committed
- [ ] All tests FAIL (schema doesn't exist yet — RED phase)
- [ ] Tests do not reference security team tables

**Maps to:** User Stories 1-7, FR-1 through FR-6

---

### Task 2.2: Implement Schema — Enums, Tables, and Relations (GREEN)
**Status:** 🔴 Blocked by 2.1
**Effort:** 45 min
**Dependencies:** Task 2.1

**Description:**
Implement the schema in `src/db/schema.ts` to pass all tests from Task 2.1. Follow the exact column definitions from `data-model.md`.

**Implementation order within the file:**
1. Add imports (`pgEnum`, `boolean`, `integer`, `serial`, `date`, `jsonb`, `uniqueIndex`)
2. Define 4 enums
3. Define `user` table (Better Auth core)
4. Define `session` table (Better Auth core, FK → user)
5. Define `account` table (Better Auth core, FK → user)
6. Define `verification` table (Better Auth core, standalone)
7. Define `subscription` table (FK → user, uses enums)
8. Define `instance` table (FK → user, uses enums)
9. Define `fleet_event` table (FK → instance, SET NULL)
10. Define `usage_metric` table (FK → instance, CASCADE, unique composite)
11. Define `platform_audit_log` table (no FKs)
12. Define Drizzle `relations()` for type-safe joins

**Acceptance Criteria:**
- [ ] All tests from Task 2.1 PASS (GREEN phase)
- [ ] Existing waitlist table definition unchanged
- [ ] All columns match data-model.md exactly
- [ ] File stays under 400 lines (single file OK at this size)

**Maps to:** FR-1 (table definitions), FR-2 (referential integrity), FR-3 (uniqueness), FR-5 (type safety), FR-6 (enums)

---

## Phase 3: Migration

### Task 3.1: Generate and Review Migration
**Status:** 🔴 Blocked by 2.2
**Effort:** 15 min
**Dependencies:** Task 2.2

**Description:**
Run `npm run db:generate` to produce migration SQL. Review the generated files to verify:

1. Only CREATE TABLE and CREATE TYPE statements (no ALTER on existing tables)
2. No references to security team tables
3. No modifications to waitlist table
4. All enums created before tables that reference them
5. Foreign keys reference correct tables and columns
6. Cascade policies match data-model.md (CASCADE vs SET NULL)

**Acceptance Criteria:**
- [ ] Migration files generated in `drizzle/` directory
- [ ] Generated SQL reviewed — no unexpected operations
- [ ] No references to security team tables in migration
- [ ] Waitlist table not referenced in migration

**Maps to:** FR-4 (migration safety)

---

### Task 3.2: Apply Migration to Test Database and Verify
**Status:** 🔴 Blocked by 3.1
**Effort:** 15 min
**Dependencies:** Task 3.1

**Description:**
Run `npm run db:migrate` against the test Neon database. Then run the full test suite to confirm all constraint, FK, and coexistence tests pass against real Postgres.

**Acceptance Criteria:**
- [ ] Migration applies cleanly (no errors)
- [ ] All tests from Task 2.1 pass against migrated database
- [ ] Tables visible in Drizzle Studio or Neon console

**Maps to:** NFR-3 (compatibility), EC-1 (existing data), EC-3 (re-running)

---

## Phase 4: Better Auth Verification

### Task 4.1: Verify Better Auth Schema Compatibility
**Status:** 🔴 Blocked by 2.2
**Effort:** 15 min
**Dependencies:** Task 2.2
**Parallel with:** Task 3.1

**Description:**
Install `better-auth` as a dev dependency (or use npx). Run `npx auth@latest generate --output /tmp/auth-schema-check.ts` to generate Better Auth's expected schema into a throwaway file. Compare the generated column names and types against our `user`, `session`, `account`, `verification` table definitions. Confirm our definitions are a superset of what Better Auth requires.

**Acceptance Criteria:**
- [ ] Better Auth generator runs without config errors
- [ ] All Better Auth required columns present in our schema
- [ ] Column types match (text, boolean, timestamp)
- [ ] Throwaway file deleted after comparison
- [ ] Any discrepancies documented and resolved

**Maps to:** Risk mitigation (Better Auth schema mismatch)

---

## Phase 5: Production Deployment

### Task 5.1: Apply Migration to Production Neon
**Status:** 🔴 Blocked by 3.2, 4.1
**Effort:** 15 min
**Dependencies:** Task 3.2, Task 4.1

**Description:**
Run `npm run db:migrate` against the production Neon database. Verify all tables created and existing data preserved.

**Acceptance Criteria:**
- [ ] All 10 new tables exist in production Neon
- [ ] All 4 enums exist in production Neon
- [ ] Waitlist table and existing rows unaffected
- [ ] Security team tables unaffected
- [ ] Verified via Neon console or Drizzle Studio

**Maps to:** Success Metrics (all tables created, existing data unaffected)

---

### Task 5.2: Verify Vercel Build
**Status:** 🔴 Blocked by 5.1
**Effort:** 10 min
**Dependencies:** Task 5.1

**Description:**
Run `npm run build` to confirm the updated schema doesn't break the Next.js build. The schema types are imported at build time — any type errors will surface here.

**Acceptance Criteria:**
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors from schema imports
- [ ] Waitlist API endpoint still functions (existing functionality preserved)

---

## Phase 6: Cleanup

### Task 6.1: Code Review and Commit
**Status:** 🔴 Blocked by 5.2
**Effort:** 10 min
**Dependencies:** Task 5.2

**Description:**
Review all changes. Ensure no console.log statements, no commented-out code, no TODO markers. Commit with conventional commit message.

**Acceptance Criteria:**
- [ ] Schema file clean and well-organized
- [ ] Migration files committed
- [ ] Tests committed
- [ ] All tests pass in final run

---

## Dependency Graph

```
1.1 (test setup)
 └→ 2.1 (write tests — RED)
     └→ 2.2 (implement schema — GREEN)
         ├→ 3.1 (generate migration)
         │   └→ 3.2 (apply to test DB)
         │       └→ 5.1 (apply to production) ─→ 5.2 (verify build) ─→ 6.1 (commit)
         └→ 4.1 (Better Auth verification) ─┘
```

**Critical Path:** 1.1 → 2.1 → 2.2 → 3.1 → 3.2 → 5.1 → 5.2 → 6.1
**Parallel opportunity:** Task 4.1 runs alongside Tasks 3.1-3.2

---

## User Story → Task Mapping

| User Story | Tasks |
|------------|-------|
| US-1: Account Data Storage | 2.1, 2.2 (user table) |
| US-2: Subscription Tracking | 2.1, 2.2 (subscription table + enum) |
| US-3: Instance Registry | 2.1, 2.2 (instance table + enums) |
| US-4: Fleet Event Log | 2.1, 2.2 (fleet_event table) |
| US-5: Usage Metrics | 2.1, 2.2 (usage_metric table) |
| US-6: Platform Audit Log | 2.1, 2.2 (platform_audit_log table) |
| US-7: Waitlist Preservation | 2.1, 3.1, 3.2, 5.1 (coexistence tests + migration review) |

---

## Quality Gates

| Gate | After Task | Check |
|------|-----------|-------|
| TDD RED confirmed | 2.1 | All tests fail |
| TDD GREEN confirmed | 2.2 | All tests pass |
| Migration safety | 3.1 | No modifications to existing tables |
| Better Auth compat | 4.1 | Schema matches library requirements |
| Production verified | 5.1 | All tables created, existing data safe |
| Build verified | 5.2 | Next.js build succeeds |
