# Technology Research — 1-platform-schema

## Decision 1: Better Auth Table Ownership

**Context:** Better Auth (Feature 2's auth library) requires 4 core tables: `user`, `session`, `account`, `verification`. Should we define these now in Feature 1, or let Feature 2 handle them?

**Options:**
1. **Define Better Auth tables now** — Include all 4 Better Auth tables in Feature 1's schema, matching their exact requirements. Feature 2 just configures the library against existing tables.
2. **Defer to Feature 2** — Only create our custom tables (subscriptions, instances, etc.) now. Feature 2 creates auth tables when it integrates Better Auth.
3. **Use Better Auth CLI generator** — Let `npx auth@latest generate` create the auth tables in Feature 2.

**Chosen:** Option 1 — Define Better Auth tables now

**Rationale:**
- Our custom tables (subscriptions, instances) need FK references to `user.id`. The users table must exist first.
- The Better Auth CLI generator is destructive — it overwrites the entire output file, deleting any custom columns. Defining manually is safer.
- Better Auth is flexible — as long as required columns exist with correct types, it works with any Drizzle-defined table.
- Keeps Feature 2 focused on auth configuration/logic rather than schema work.

**Tradeoffs:** If Better Auth changes its schema requirements in a future version, we'd need to update manually. Acceptable risk — core table schema is stable.

**Source:** Better Auth Drizzle adapter docs, GitHub Issue #5874 (generator overwrites), `packages/core/src/db/get-tables.ts` source code.

---

## Decision 2: Table Naming Convention

**Context:** Better Auth defaults to singular table names (`user`, `session`, `account`, `verification`). The PRD uses plural (`users`, `subscriptions`). Our custom tables should be consistent.

**Options:**
1. **Singular everywhere** — Match Better Auth defaults. `user`, `session`, `account`, `verification`, `subscription`, `instance`, `fleet_event`, `usage_metric`, `platform_audit_log`.
2. **Plural everywhere** — Use Better Auth's `usePlural` config or manual table name mapping. `users`, `sessions`, `accounts`, `verifications`, `subscriptions`, `instances`, etc.
3. **Mixed** — Better Auth tables singular, custom tables plural.

**Chosen:** Option 1 — Singular everywhere

**Rationale:**
- Matches Better Auth's default naming, avoiding configuration complexity.
- Singular table names are a valid convention (each row is one `user`, one `subscription`).
- Existing `waitlist` table is already singular.
- Avoids the need for `usePlural: true` or schema mapping in Better Auth config.

**Tradeoffs:** Differs from PRD Section 6 which uses plural names. PRD is a requirements doc, not a schema spec — the mapping is clear.

---

## Decision 3: Primary Key Strategy

**Context:** Better Auth defaults to `text()` primary keys with `crypto.randomUUID()`. The PRD specifies `uuid` for users, subscriptions, instances. Existing `waitlist` table uses `text()` with `crypto.randomUUID()`.

**Options:**
1. **text() with crypto.randomUUID()** — Match existing waitlist pattern and Better Auth defaults.
2. **uuid() native Postgres type** — Use Postgres UUID type with `gen_random_uuid()`.

**Chosen:** Option 1 — text() with crypto.randomUUID()

**Rationale:**
- Matches existing `waitlist` table pattern (consistency within this repo).
- Matches Better Auth's default ID generation.
- Works with Neon's serverless driver without issues.
- UUID values are still generated, just stored as text — functionally identical for our use case.

**Tradeoffs:** Slightly less storage-efficient than native UUID (36 bytes text vs 16 bytes binary). Negligible at our scale (< 40 tenants).

---

## Decision 4: Password Storage Location

**Context:** The PRD shows `password_hash` on the `users` table. Better Auth stores passwords on the `account` table instead (in the `password` column), alongside OAuth provider credentials. Each "account" represents one auth method (email/password is provider `credential`).

**Chosen:** Follow Better Auth's pattern — password lives on `account` table.

**Rationale:** Fighting Better Auth's data model creates unnecessary complexity. The `account` table stores credentials per provider — email/password is just one provider (`credential`). This also cleanly supports adding social login later without schema changes.

**Impact on PRD:** Remove `password_hash` from the conceptual `users` table. No functional impact — password reset and auth still work, just through Better Auth's API.

---

## Decision 5: Enum Implementation

**Context:** The spec requires constrained status fields (subscription status, instance status, Claude auth status). Drizzle supports Postgres enums via `pgEnum()`.

**Options:**
1. **Postgres enums** — `CREATE TYPE` at database level, referenced by `pgEnum()` in Drizzle.
2. **Text columns with check constraints** — `text()` with `CHECK (status IN (...))`.
3. **Text columns with application-level validation** — Validate in code, no DB constraint.

**Chosen:** Option 1 — Postgres enums

**Rationale:**
- Enforces constraints at database level (spec FR-6 requires this).
- Drizzle's `pgEnum()` generates type-safe TypeScript types automatically.
- Clear, self-documenting schema.
- Standard Postgres feature, fully supported by Neon.

**Tradeoffs:** Adding new enum values requires a migration (`ALTER TYPE ... ADD VALUE`). Acceptable — status transitions are deliberate design decisions, not ad-hoc changes.

---

## Decision 6: Cascade Policy

**Context:** The spec (EC-4) asks the schema to "not prevent" cascading cleanup but defers the policy decision. Better Auth uses `onDelete: "cascade"` for session and account tables (referencing user).

**Chosen:**
- Better Auth tables: `CASCADE` (sessions, accounts deleted when user is deleted — Better Auth requires this)
- Custom tables: `SET NULL` for fleet_events (preserves audit history), `CASCADE` for subscriptions and instances (cleaned up with user)
- Audit log: No FK to users — uses text `actor` field (spec says actor can be "provisioner", "agent-zero", "owner", not just users)

**Rationale:** Fleet events and audit logs are operational records that should survive user deletion for investigation. Subscriptions and instances have no meaning without a user.
