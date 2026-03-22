# Implementation Plan — 1-platform-schema

## Executive Summary

Extend the existing Drizzle ORM schema file (`src/db/schema.ts`) with 10 new tables: 4 for Better Auth (user, session, account, verification) and 6 for platform operations (subscription, instance, fleet_event, usage_metric, platform_audit_log). Define 4 Postgres enums for constrained status fields. Generate and apply Drizzle migrations. Verify against existing Neon database containing waitlist and security team tables.

---

## Architecture Overview

```
src/db/
├── schema.ts          ← Extend this file (currently: waitlist only)
├── index.ts           ← No changes needed (already imports * from schema)
drizzle/
├── NNNN_*.sql         ← Generated migration files (drizzle-kit generate)
drizzle.config.ts      ← No changes needed
```

**Single schema file:** All table definitions live in `src/db/schema.ts`. This project is small enough that splitting into multiple schema files adds complexity without benefit. If the file exceeds 400 lines after this feature, consider splitting into `schema/auth.ts`, `schema/platform.ts` with a barrel export — but not preemptively.

---

## Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| ORM | Drizzle ORM 0.39 | Already in use, type-safe, migration-based |
| Database | Neon Postgres | Already in use, serverless driver |
| Enums | pgEnum() | Database-level constraints, auto-generates TS types |
| IDs | text + crypto.randomUUID() | Matches existing waitlist pattern and Better Auth defaults |
| Migrations | drizzle-kit generate/migrate | Already configured, npm scripts exist |

---

## Technical Decisions

See `research.md` for full decision records. Key decisions:

1. **Better Auth tables defined now** — Feature 2 configures auth against existing tables, no schema migration needed.
2. **Singular table names** — Matches Better Auth defaults and existing `waitlist` convention.
3. **text() primary keys** — Matches existing pattern, Better Auth defaults.
4. **Passwords on account table** — Better Auth's model, not on user table.
5. **Postgres enums** — Database-level enforcement for status fields.
6. **Mixed cascade policies** — CASCADE for owned data, SET NULL for audit-preserving references.

---

## Implementation Phases

### Step 1: Define Enums

Add 4 `pgEnum()` definitions to `schema.ts`:
- `subscriptionStatusEnum`: active, past_due, canceled, trialing
- `instanceStatusEnum`: queued, provisioning, awaiting_auth, running, stopped, error, deprovisioned
- `claudeAuthStatusEnum`: not_configured, connected, expired
- `subscriptionPlanEnum`: starter, pro

### Step 2: Define Better Auth Tables

Add `user`, `session`, `account`, `verification` tables matching Better Auth's exact column requirements (see `data-model.md`). These must match precisely — Better Auth validates table structure at startup.

### Step 3: Define Platform Tables

Add `subscription`, `instance`, `fleet_event`, `usage_metric`, `platform_audit_log` tables with foreign keys referencing `user` and `instance` as documented in `data-model.md`.

### Step 4: Define Relations

Add Drizzle `relations()` definitions for type-safe joins:
- user → sessions, accounts, subscription, instance
- instance → fleet_events, usage_metrics
- subscription → user
- etc.

### Step 5: Generate Migration

Run `npm run db:generate` to produce SQL migration files in `drizzle/`.

### Step 6: Verify Migration

- Review generated SQL for correctness
- Confirm no references to existing security team tables
- Confirm waitlist table is not modified
- Run `npm run db:migrate` against a test/branch Neon database

### Step 7: Apply to Production

Run `npm run db:migrate` against production Neon database. Verify:
- All 10 new tables created
- All 4 enums created
- Waitlist table and data unaffected
- Security team tables unaffected

---

## Security Considerations

- **No secrets in schema:** The schema defines column types and constraints only. No default values contain secrets.
- **Hashed-only columns:** `dashboard_token_hash` and `password` columns are documented as storing hashes only. The schema cannot enforce this (it's a text column), but the column name signals intent. Application-layer enforcement is Feature 2 and Feature 5's responsibility.
- **Sensitive columns on account table:** `access_token`, `refresh_token`, `id_token`, `password` are sensitive. Better Auth's query layer excludes these from default responses. Our code must not query these directly.

---

## Performance Strategy

- **Indexes:** All lookup columns indexed (email, token, tenant_id, subdomain, gateway_port). Time-series tables (fleet_event, platform_audit_log) indexed on created_at. Composite unique index on usage_metric(instance_id, metric_date).
- **No performance testing needed for schema creation.** Performance will be validated when Features 2-7 implement queries against these tables.

---

## Testing Strategy

### Tests to Write (TDD — RED first)

1. **Schema export test:** Import schema module, verify all 11 tables are exported (waitlist + 10 new), verify all 4 enums are exported.
2. **Migration test:** Run `drizzle-kit generate` and verify migration SQL is produced without errors.
3. **Table creation test:** Apply migration to a test database, verify all tables exist with correct columns.
4. **Constraint tests:**
   - Insert duplicate email → expect unique violation
   - Insert duplicate tenant_id → expect unique violation
   - Insert duplicate subdomain → expect unique violation
   - Insert duplicate (instance_id, metric_date) → expect unique violation
   - Insert invalid enum value → expect constraint violation
5. **Foreign key tests:**
   - Insert subscription with non-existent user_id → expect FK violation
   - Delete user → verify cascade deletes session, account, subscription, instance
   - Delete instance → verify fleet_event.instance_id set to null
   - Delete instance → verify usage_metric cascade deleted
6. **Coexistence test:** After migration, verify waitlist table still exists with data intact.

### What NOT to test
- Better Auth's query behavior (that's Feature 2)
- Application-layer validation (that's each downstream feature)
- Security team tables (owned by another repo)

---

## Deployment Strategy

1. Run `npm run db:generate` locally to produce migration files
2. Commit migration files to git
3. Run `npm run db:migrate` against Neon production database (safe — only CREATE TABLE and CREATE TYPE statements)
4. Verify via `drizzle-kit studio` or direct Neon console query
5. Deploy updated schema to Vercel (no runtime impact — schema types are build-time only)

**Rollback:** Drop all new tables and enums. This is safe because no existing code references the new tables yet. Generated migration files include the SQL needed; reverse operations are `DROP TABLE` and `DROP TYPE`.

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Better Auth schema mismatch | Low | High | Cross-reference against Better Auth source code (done in research). Verify with `npx auth@latest generate` into throwaway file. |
| Migration conflicts with security team tables | Low | Medium | Drizzle only manages tables defined in its schema. Security team tables use separate raw SQL migrations with no overlap. |
| Enum values need expansion later | Medium | Low | `ALTER TYPE ... ADD VALUE` migration. Standard Postgres operation, well-supported by drizzle-kit. |
| Neon serverless driver compatibility | Very Low | High | Already proven with existing waitlist table. Same driver, same connection pattern. |

---

## Constitutional Compliance

### Principle 1: Data Sacred
- [x] No tenant data in platform tables — only operational metadata
- [x] Claude auth credentials stay in containers — platform tracks status enum only

### Principle 2: Security
- [x] Password and token columns store hashes only (enforced by naming convention + application layer)
- [x] No secrets in schema defaults

### Principle 4: Simple Over Clever
- [x] Single schema file (no premature splitting)
- [x] Drizzle ORM for all access (no raw SQL in this repo)
- [x] Standard Postgres features only (enums, FKs, indexes)

### Principle 8: Platform Quality
- [x] Type-safe schema provides reliable foundation for all downstream features
- [x] Enum constraints prevent invalid states from entering the database

### Test-First Imperative
- [x] Tests defined before implementation (schema export, constraints, FK behavior, coexistence)
- [x] Tests verify database-level behavior, not just code structure

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| src/db/schema.ts | Modify | Add 4 enums, 10 tables, relations |
| drizzle/*.sql | Create (generated) | Migration files from drizzle-kit |
| src/db/__tests__/schema.test.ts | Create | Schema and migration tests |

---

## Estimated Effort

- Schema definition: ~1 hour
- Test writing (RED): ~1 hour
- Migration generation and verification: ~30 minutes
- Production migration: ~15 minutes
- **Total: ~3 hours**
