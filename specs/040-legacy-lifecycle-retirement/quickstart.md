# Quickstart: Legacy Customer Lifecycle Retirement

This runbook separates local source verification from production activation.
Running local checks authorizes no Vercel, database, Stripe, secret, or Aegis
mutation.

## 1. Baseline the surviving frontend

Before deleting source, record passing checks for:

1. Existing owner sign-in.
2. Password-reset request and completion using test transport.
3. Dashboard selected-agent resolution.
4. Authorized chat launch/use.
5. Advanced Dashboard authorization.
6. Membership denial for a non-member or fixture identity.
7. Qualified managed-variable success and denial contracts using mocks only.

## 2. Verify source retirement

Run focused route, auth, workspace, and managed-variable tests, followed by:

```bash
npm test
npm run build
```

The retirement scan must find no active source/config reference to:

- Stripe SDK, keys, prices, checkout, portal, webhook, or subscription
  authorization;
- signup or email-verification UI/API creation;
- public waitlist or other anonymous customer-acquisition mutation;
- customer setup wizard or provisioning callback;
- provision, arbitrary write-secrets, configure-dashboard-auth, broad restart,
  deprovision, or self-service account deletion;
- public plan, pricing, “created after payment,” or customer-hosting claims.

Business uses of words such as “pricing” in Mitchel prospect records and
unrelated Telegram/Discord configuration wizards are not retirement matches.

## 3. Verify the HTTP contract

Using test fixtures, prove:

- root -> sign-in or dashboard;
- sign-in/reset-password still work for an existing fixture account;
- direct signup returns the configured disabled/not-found outcome and creates
  zero rows;
- every route in
  [contracts/retirement-boundary.md](contracts/retirement-boundary.md) returns
  404;
- chat/dashboard checks pass;
- managed-variable replacement preserves its exact value-free response and
  denial behavior;
- retired requests make zero mocked external and database mutation calls.

The source retirement removes the waitlist route, application schema export,
conversion helper, and lifecycle notification helpers. The historical
`waitlist` table and any rows are intentionally not deleted or transformed by
this source PR. Any retained-record export, deletion, or other data treatment
requires a separately approved procedure with its own backup and rollback
evidence.

## 4. Prepare, but do not apply, data cleanup

### Owner-operated account deletion

Self-service account deletion is unavailable. Any deletion request requires a
separately approved owner-operated procedure that inventories active identities
and memberships, verifies a checked backup and rollback handle, and names the
exact identity proposed for deletion. The procedure must refuse to delete the
sole active owner identity. It must not cancel Stripe state, deprovision a
runtime, or alter named-runtime and business records as a side effect.

Because the current limited frontend has one active owner, that owner's account
is not eligible for deletion unless ownership is first transferred through a
separately reviewed change.

### Legacy data preflight

The migration plan reports:

- provider obligation count/status without private payment detail;
- local `subscription` row count;
- dependency/foreign-key inventory;
- meaningful `wizard_state` row count;
- exact objects proposed for removal;
- backup and rollback handle.

Any non-zero provider obligation, subscription row, meaningful wizard state, or
ambiguous consumer is a stop condition. The source release can remain complete
while data cleanup waits for an owner decision.

## 5. Review gates

Before merge:

- latest head passes deterministic tests and build;
- code review confirms surviving auth/chat/dashboard behavior;
- security review confirms signup denial and authority reduction;
- source and documentation agree;
- migration and Aegis work are not presented as already deployed.

Before each production mutation:

- obtain explicit owner approval for that exact boundary;
- verify rollback first;
- record preflight evidence;
- mutate only the approved Vercel, database, Aegis service, provider, or secret
  boundary;
- run focused postflight and owner smoke checks;
- append the production result to `/opt/overnightdesk/deploys.log` on Aegis
  where applicable.

## 7. T030 verification evidence

These checks were run locally on 2026-08-10 against the merged source heads:

- Frontend `origin/main` at `533ac419fee7fdb5bd0e975bf5df672150582c82` (PRs
  216–219 merged).
- Engine `origin/main` at `52cdcc53acdd663e5222c8f2fcbcdb96043abd87` (PRs 6–7
  merged).

### Frontend managed-variable and read-only suites

```bash
npm ci
npm test -- --runInBand \
  src/app/api/settings/agent-variables/__tests__/route.test.ts \
  src/lib/__tests__/managed-agent-variable.test.ts \
  src/lib/__tests__/managed-agent-variable-audit.test.ts \
  src/lib/__tests__/provisioner.test.ts \
  src/lib/mitchel-prospecting/__tests__/trevor-summary-client.test.ts \
  src/app/api/mitchel/prospecting/summary/__tests__/route.test.ts \
  src/app/api/engine/__tests__/engine-routes.test.ts \
  src/app/api/engine/__tests__/route-retirement.test.ts
```

Result: PASS — 8 suites, 115 tests, 0 failures.

### Frontend full test and build checks

```bash
npm test -- --runInBand
DATABASE_URL='postgres://build:build@127.0.0.1:5432/build?sslmode=disable' \
BETTER_AUTH_SECRET='local-build-placeholder-not-a-secret' npm run build
```

Results:

- `npm test -- --runInBand`: PASS — 116 suites passed; 4 existing
  environment-gated suites skipped; 1,215 tests passed and 27 skipped.
- `npm run build`: PASS — compilation, lint/type checking, static page
  generation, and route collection completed with non-secret local placeholder
  values; no database connection or mutation was performed.
- `npm ci`: PASS — installation completed. npm reported 11 existing audit
  findings (8 moderate, 3 high); no dependency changes were made for T030.

### Engine full test, vet, and build checks

```bash
go test ./...
go vet ./...
make build && make build-hermes-provisioner
```

Results: PASS — all Go tests passed, `go vet ./...` reported no findings, and
both the platform orchestrator and retained Hermes provisioner binaries built
successfully. No production service or runtime state was changed.

All recorded results are value-free. This section is local source evidence only
and does not authorize production activation, secret removal, data cleanup, or
deployment.

## 8. T031 RED test evidence

The T031 cleanup contract suite was authored before the implementation. It uses
an in-memory count-only store and contains no real identifiers, payment values,
database URLs, or secrets.

```bash
npx jest --config jest.config.ts --roots scripts --runInBand \
  scripts/__tests__/legacy-customer-lifecycle-cleanup.test.ts
```

Result: EXPECTED RED — Jest discovered the suite and stopped because
`scripts/legacy-customer-lifecycle-cleanup.ts` does not exist yet. Zero tests
executed and zero database, provider, or filesystem mutations occurred. The
suite defines the T032 contract for value-free plan output, explicit distinct
apply/rollback approval tokens, non-zero and ambiguous stop conditions,
before/after count reconciliation, active-data preservation, and rollback.

T032 is the implementation gate and must keep this suite passing before the
cleanup command is used against any database.

## 9. T032 implementation evidence

The cleanup executor is now implemented in
`scripts/legacy-customer-lifecycle-cleanup.ts`. It provides parameterized
plan/apply/verify/rollback modes through an injected store contract and a
default Drizzle database adapter. Plan mode reports only counts and stable
stop-reason metadata. Provider obligations and active schema consumers remain
ambiguous unless their owner-supplied numeric gate values are explicitly set;
ambiguous or non-zero local subscriptions, wizard state, provider obligations,
or active consumers stop cleanup before mutation.

Apply and rollback require separate configured approval tokens and reject an
identical token configuration. The default database adapter additionally
requires an explicit destructive opt-in and a database name matching the
disposable cleanup pattern unless a separately controlled production opt-in is
present. Apply locks the affected tables and rechecks the local zero-state gates
in the same transaction immediately before DDL. Rollback restores only objects
recorded as present in the plan's before-state. Database SQL uses fixed
allowlisted tables and columns, and command output excludes identifiers,
payment values, tokens, and error details.

Verification run locally on 2026-08-10:

```bash
npx jest --config jest.config.ts --roots scripts --runInBand \
  scripts/__tests__/legacy-customer-lifecycle-cleanup.test.ts
npx tsc --noEmit
npm test -- --runInBand
```

Results: PASS — 16 cleanup contract tests, TypeScript compilation, and the
existing frontend suite (116 suites passed; 4 skipped; 1,215 tests passed; 27
skipped). No database, provider, filesystem, or production mutation was
performed.

## 10. T033 deterministic commands and disposable database contract

The package exposes independently executable preflight, cutover, and postflight
commands:

```bash
npm run legacy-customer-lifecycle:plan
npm run legacy-customer-lifecycle:apply
npm run legacy-customer-lifecycle:verify
```

Do not run apply, verify, or rollback against a shared or production database
during T033. T035 owns the first execution against a populated disposable test
database. That database must:

- be dedicated to this rehearsal and safe to destroy;
- use a database name matching
  `overnightdesk_legacy_cleanup_[a-z0-9_]+` in `DATABASE_URL`;
- have the current schema and representative count-only fixtures loaded;
- have a checked backup and an executable restore handle before apply;
- have no concurrent writers during the rehearsal; and
- use explicit zero values for
  `LEGACY_CLEANUP_PROVIDER_OBLIGATION_COUNT` and
  `LEGACY_CLEANUP_ACTIVE_SCHEMA_CONSUMER_COUNT`. Missing or invalid values are
  ambiguous and stop cleanup.

Before apply, configure different non-empty values for
`LEGACY_CLEANUP_APPLY_APPROVAL_TOKEN` and
`LEGACY_CLEANUP_ROLLBACK_APPROVAL_TOKEN`. Supply only the token for the current
mutation through `LEGACY_CLEANUP_APPROVAL_TOKEN`, and set
`LEGACY_CLEANUP_ALLOW_DESTRUCTIVE=true`. Never print or commit token values.

Persist the successful apply result as the value-free artifact consumed by
verify and rollback. Using `--silent` prevents npm's command banner from
corrupting the JSON file:

```bash
npm run --silent legacy-customer-lifecycle:apply > cleanup-applied.json
LEGACY_CLEANUP_PLAN_PATH="$PWD/cleanup-applied.json" \
  npm run legacy-customer-lifecycle:verify
```

The artifact parser accepts only a structurally valid `status: applied` result
whose before/after counts agree with its ready plan. Verify and rollback fail
closed when `LEGACY_CLEANUP_PLAN_PATH` is missing, unreadable, malformed,
stopped, or count-inconsistent. Rollback remains independently executable with
`npx tsx scripts/legacy-customer-lifecycle-cleanup.ts rollback`; it additionally
requires the rollback approval token and the same validated artifact path.

T033 verification is static and in-memory only: the focused contract suite,
TypeScript compilation, and package-command inspection are run without a
database connection and without provider, cleanup-artifact, or production
mutation. The populated disposable-database plan/apply/verify/rollback
evidence belongs to T035.

```bash
npx jest --config jest.config.ts --roots scripts --runInBand \
  scripts/__tests__/legacy-customer-lifecycle-cleanup.test.ts
npx tsc --noEmit
npm test -- --runInBand
```

Results: PASS — 20 focused cleanup contract tests, TypeScript compilation, and
the full frontend suite (116 suites passed; 4 skipped; 1,215 tests passed; 27
skipped). Package inspection confirmed all three commands map to the expected
script modes. No cleanup command or database connection was executed.

## 11. T034 schema and reversible migration evidence

The application schema no longer exports the legacy `subscription` table,
`subscription_plan` or `subscription_status` enums, subscription relations, or
the unused `instance.wizard_state` compatibility projection. Targeted source
reads found `wizard_state` selected only by the shared agent-page projection
and never consumed; removing that selection leaves active identity,
membership, named-runtime, OIDC, conversation, and business-data fields
unchanged.

`drizzle/0011_legacy_customer_lifecycle_retirement.sql` contains one atomic
PostgreSQL block. It locks and rechecks local subscription rows and meaningful
wizard state before dropping the subscription table, its two enum types, and
only the `instance.wizard_state` column. It never drops or recreates the active
`instance` table. Any dependent object or nonzero local state causes the
transaction to fail closed.

The cleanup executor now reports separate count-only fields for both enum
types. Apply, verify, and rollback reconcile those counts, reject an
inconsistent table/type shape, and restore each type only when it was present
in the recorded before-state. The migration header identifies the existing
approval-gated rollback command and `LEGACY_CLEANUP_PLAN_PATH` artifact
contract. T034 did not execute that migration or connect to a database; T035
owns the populated disposable-database rehearsal.

Verification run locally on 2026-08-10:

```bash
npx jest --config jest.config.ts --runInBand \
  src/db/__tests__/schema.test.ts \
  src/db/__tests__/selected-agent-page-context.test.ts
npx jest --config jest.config.ts --roots scripts --runInBand \
  scripts/__tests__/legacy-customer-lifecycle-cleanup.test.ts \
  scripts/__tests__/legacy-customer-lifecycle-migration.test.ts
npx tsc --noEmit
npm test -- --runInBand
DATABASE_URL='postgres://build:build@127.0.0.1:5432/build?sslmode=disable' \
BETTER_AUTH_SECRET='local-build-placeholder-not-a-secret' npm run build
```

Results: PASS — 17 focused schema/context tests, 22 cleanup/migration contract
tests, TypeScript compilation, the full frontend suite (116 suites passed; 4
skipped; 1,214 tests passed; 23 skipped), and the production build. The
T034-specific source scan found no production `wizardState`, `wizard_state`,
subscription schema export, or subscription relation references.

At the T034 checkpoint, the broader retirement qualifier was intentionally red
on three retained 404 route tombstones plus their middleware deny entries.
Those fail-closed production routing surfaces were outside T034; T041 records
the corrected scanner scope below, while T043 remains the production route
verification gate.

## 12. T035 populated disposable-database rehearsal

The cleanup commands were rehearsed on 2026-08-10 against one PostgreSQL 16
database dedicated to T035. It used the required disposable database-name
pattern, loopback-only transport, tmpfs-backed storage, and no concurrent
writers. Migrations `0000` through `0010` established the pre-retirement
schema; migration `0011` was intentionally excluded so the cleanup command
encountered the four legacy objects it must remove. Count-only fixtures
represented one active user, membership, and instance; explicit count inputs
represented two conversations and three business records. No production,
shared database, provider, Vercel, Aegis, customer, or secret-system operation
occurred.

Before apply, `pg_dump --format custom` created a non-empty backup and
`pg_restore --list` successfully parsed its complete catalog. The unchanged
package commands then exercised plan, apply, and verify; the documented
approval-gated script entry point exercised rollback using the value-free apply
artifact:

```bash
npm run --silent legacy-customer-lifecycle:plan
npm run --silent legacy-customer-lifecycle:apply > cleanup-applied.json
LEGACY_CLEANUP_PLAN_PATH="$PWD/cleanup-applied.json" \
  npm run --silent legacy-customer-lifecycle:verify
LEGACY_CLEANUP_PLAN_PATH="$PWD/cleanup-applied.json" \
  npx --no-install tsx scripts/legacy-customer-lifecycle-cleanup.ts rollback
```

Approval values, database URLs, fixture identifiers, and backup contents were
not printed or retained in repository evidence. The sanitized count matrix was:

| Check | Provider | Local subscriptions | Wizard state | Consumers | Subscription table | Plan type | Status type | Wizard column | Users | Memberships | Instances | Conversations | Business records |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ready plan / apply before | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 3 |
| Apply after / fresh verify | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 2 | 3 |
| Rollback after | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 3 |

Result: PASS — plan was ready, apply reached every planned after-count, verify
re-inspected and matched that state, and rollback restored every before-count.
Active user, membership, instance, conversation, and business-record counts
remained unchanged throughout.

Two independent non-zero fixtures then exercised apply with valid disposable
approval. A single local subscription stopped with exit code 2 and reason
`local subscription rows`; direct before/after state was identically
`1/0/1/1/1/1/1/1/1`. A single meaningful wizard value stopped with exit code
2 and reason `meaningful wizard state`; direct before/after state was
identically `0/1/1/1/1/1/1/1/1`. Those vectors are, in order, subscription
rows, meaningful wizard rows, users, memberships, instances, subscription
table, plan type, status type, and wizard column. Both stopped runs preserved
the non-zero fixture, active rows, and all four legacy schema objects unchanged.

The first real plan also exposed that table inspection sent the literal
`public.${table}` instead of each allowlisted qualified table name. A focused
regression test reproduced the failure for subscription, user, membership, and
instance inspection. The interpolation was corrected before any apply ran;
the focused suite then passed all 22 tests and the repeated real plan reported
the populated baseline shown above.

Final repository verification passed:

```bash
npx jest --config jest.config.ts --roots scripts --runInBand \
  scripts/__tests__/legacy-customer-lifecycle-cleanup.test.ts \
  scripts/__tests__/legacy-customer-lifecycle-migration.test.ts
npx tsc --noEmit
npm test -- --runInBand
DATABASE_URL='postgres://build:build@127.0.0.1:5432/build?sslmode=disable' \
BETTER_AUTH_SECRET='local-build-placeholder-not-a-secret' npm run build
git diff --check
```

Results: PASS — 23 focused cleanup/migration tests, TypeScript compilation,
the full frontend suite (116 suites passed; 4 skipped; 1,214 tests passed; 23
skipped), the production build, and diff validation. The exact disposable
container and temporary artifact directory were then removed. Its tmpfs
database and in-container backup are destroyed and not recoverable; repository
and production data were not affected.

## 13. T036 production read-only plan evidence

The owner explicitly approved T036 plan mode on 2026-08-10 and explicitly
excluded production apply. The check used merged frontend head
`5cbc377910d7077b0ebeb28932a3fb42b6715103`. Vercel deployment metadata showed
that head was already the current Production deployment before this check;
T036 did not deploy or alter it. T043 still owns production-route and owner
smoke verification plus reconciliation of the deployment record.

Provider evidence combined the owner's prior statement that Stripe was never
fully set up and is not used with a metadata-only inventory of the production
Vercel project. The inventory found zero Stripe or billing-enable variable
keys. It did not print values or call a payment-provider mutation API. On that
bounded evidence, the owner-supplied provider-obligation gate was explicit
zero. The deployed source contains no active legacy Stripe, subscription,
wizard, or provisioner-callback route handler and no active subscription
schema consumer; retained test-only route tombstones and middleware deny
entries continue to fail closed with 404 and are not active consumers.

The Aegis provisioner was active with zero restarts. A metadata-only check at
the preflight instant found zero child processes, zero established provisioner
connections, and zero exact legacy provision, deprovision, or callback journal
mentions since the current service start. The old Aegis `/provision` and
`/deprovision` routes remain mounted and are not claimed as retired by T036;
safe GET probes returned 405. Together with the database's zero meaningful
wizard rows, the observed callback/wizard/in-flight state was zero. No service
restart, request mutation, file change, or secret change occurred.

The production database URL was resolved inside the approved Phase/Vercel
secret boundary, transferred directly into a temporary process environment,
and never printed, passed as an argument, or written to a file. Destructive,
production-apply, plan-artifact, and approval-token variables were explicitly
unset. The unchanged merged command was then run once:

```bash
LEGACY_CLEANUP_PROVIDER_OBLIGATION_COUNT=0 \
LEGACY_CLEANUP_ACTIVE_SCHEMA_CONSUMER_COUNT=0 \
npm run --silent legacy-customer-lifecycle:plan
```

The secret-safe result was `ready` with no stop reasons:

| Check | Provider | Local subscriptions | Wizard state | Consumers | Subscription table | Plan type | Status type | Wizard column | Users | Memberships | Instances |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Production before | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 2 | 2 |
| Planned after | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 2 |

Result: PASS — every T036 stop gate was an explicit numeric zero, and the plan
preserves all active user, membership, and instance counts. This authorizes no
data treatment by itself. T037 remains blocked until the owner separately
approves the exact destructive production boundary and a production backup is
verified. No apply, verify, rollback, DDL, database write, production deployment,
provider write, Aegis mutation, or production-ledger append occurred in T036.
Publishing the evidence PR may run the repository's ordinary Vercel Preview
check; that preview CI is not production activation or T043 verification.

Focused repository verification passed 46 cleanup and retired-route tests,
TypeScript compilation, and targeted source scans for zero active legacy route
handlers and zero active schema consumers. `git diff --check` also passed. The
broader retirement qualifier is recorded in T041; its scan scope now treats
retained test-only route contracts and the explicit middleware 404 deny
registry as verification evidence rather than active source.

## 14. T037 production Neon apply and verification evidence

The owner separately approved the exact T037 destructive boundary on
2026-08-10 after PR 226 merged: remove only the zero-state `subscription`
table, `subscription_plan` and `subscription_status` enum types, and
`instance.wizard_state`, then verify active counts. The approval did not cover
identity, membership, instance, provider, secret, runtime, or other business
data mutation.

Production is Neon PostgreSQL 17. The first schema-backup attempt stopped
before apply because Aegis had PostgreSQL 16 client tools; PostgreSQL correctly
rejects an older `pg_dump` against a newer server. The official PostgreSQL 17
container was then used locally as an ephemeral client, without adding a Neon
CLI dependency or changing Aegis packages. A full schema-only custom archive
was created, parsed successfully with `pg_restore --list`, and checked for all
four targeted objects. The archive contains schema, not table data. Its remote
copy was checksum-verified and restricted to mode 600:

```text
/opt/overnightdesk/backups/legacy-customer-lifecycle/
  legacy-customer-lifecycle-schema-20260810T125416Z.dump
SHA-256: 9ae3efe937263aba29a0016c0c9671a123a203519a66d7b3d730895c1f83c434
```

Immediately after backup verification, the unchanged merged plan was rerun
against Neon and remained `ready`: provider obligations, local subscriptions,
meaningful wizard state, and active schema consumers were all explicit zero;
the four targeted schema-object counts were each one. Apply used distinct
temporary apply and rollback tokens plus the explicit destructive and
production opt-ins. The script locked and atomically rechecked the two local
zero-state predicates before DDL.

Fresh verify returned `verified` and reconciled every planned count:

| Check | Provider | Local subscriptions | Wizard state | Consumers | Subscription table | Plan type | Status type | Wizard column | Users | Memberships | Instances |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Apply before | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 2 | 2 |
| Apply after / fresh verify | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 2 |

The value-free apply artifact required by the independently approval-gated
rollback command was checksum-verified and retained mode 600 beside the
backup:

```text
/opt/overnightdesk/backups/legacy-customer-lifecycle/
  legacy-customer-lifecycle-apply-20260810T125542Z.json
SHA-256: e6a15317487b1aa7d6fe0aea8b69537ba296476a18effb986deff7783542ec0a
```

Rollback remains the T035-proven command documented in the migration header:
retrieve the retained artifact into a restricted temporary path, resolve the
production database through the approved secret boundary, configure a new
pair of distinct approval tokens, set the destructive and production opt-ins,
supply only the rollback token, and run the script's `rollback` mode with
`LEGACY_CLEANUP_PLAN_PATH`. Rollback is not authorized or needed after this
successful verify.

Public postflight returned 200 for `/` and `/sign-in`, and 404 for
`/api/subscription` and `/api/provisioner/callback`. No provider, identity,
membership, instance, runtime, or secret mutation occurred. The canonical
Aegis ledger records success at `2026-08-10T12:56:04Z` in
`/opt/overnightdesk/deploys.log`, including the backup, rollback artifact,
schema transition, and preserved active counts.

Repository closeout verification passed 23 focused cleanup/migration tests,
TypeScript compilation, diff validation, and a secret scan. Remote closeout
rechecked both restricted artifacts and the canonical ledger entry.

## 15. T038 product-document reconciliation

README and PRD now describe the current product in present tense: an
existing-account, limited Timeless Technology Solutions and OvernightDesk
frontend for owner sign-in/recovery, membership-scoped chat and dashboards,
settings, and administration. They no longer advertise or preserve public
registration, verification, pricing, checkout, Stripe, subscription authority,
customer setup, lifecycle callbacks/controls, or self-service account deletion
as current or pending product behavior.

The documents also distinguish completed source and Neon schema retirement
from the remaining production gates. The current Aegis provisioner binary's
old routes are not declared retired before T044; production route verification
remains T043; obsolete provider/secret cleanup remains T045. The active
managed-variable boundary and current identity/membership/instance records are
preserved. PRD now points production evidence to the canonical Aegis ledger at
`/opt/overnightdesk/deploys.log` rather than an obsolete workstation path.

T038 changed documentation and task state only. It performed no Vercel, Neon,
Aegis, provider, secret, identity, membership, instance, or runtime mutation.
Focused stale-claim and retired-environment scans, canonical-ledger checks,
relative-link target checks, and `git diff --check` passed. No application test
or build was rerun because T038 changes no source, configuration, or behavior;
T041 owns the full frontend/engine verification gate.

## 16. T041 full frontend and engine verification

T041 verification ran locally on 2026-08-10 against the merged source heads:

- Frontend `origin/main` at `2a1ae8593d9bd5bdf4ac5b416780326045b85e0f` (PR
  228 merged).
- Engine `origin/main` at `52cdcc53acdd663e5222c8f2fcbcdb96043abd87` (PR 7
  merged).

No production database, provider, Vercel, Aegis, runtime, secret, or ledger
mutation occurred.

### Frontend install, qualification, test, and build

```bash
npm ci
scripts/qualify-legacy-customer-lifecycle-retirement.sh
npm test -- --runInBand
DATABASE_URL='postgres://build:build@127.0.0.1:5432/build?sslmode=disable' \
BETTER_AUTH_SECRET='local-build-placeholder-not-a-secret' npm run build
```

Results:

- `npm ci`: PASS — installation completed with no dependency changes. npm
  reported 11 existing audit findings (8 moderate, 3 high); no audit fix was
  run as part of T041.
- `scripts/qualify-legacy-customer-lifecycle-retirement.sh`: PASS. The scanner
  was corrected to classify only active TypeScript source as a retired-path
  failure and to exclude the explicit middleware 404 registry from active
  route-reference checks. Retained retirement tests remain available as
  contract evidence.
- `npm test -- --runInBand`: PASS — 116 suites passed; 4 existing
  environment-gated suites skipped; 1,214 tests passed and 23 skipped.
- `npm run build`: PASS — Next.js compilation, lint/type checking, static page
  generation, route collection, and build-trace collection completed with
  non-secret local placeholder values. No database connection or mutation was
  performed.

### Engine test, vet, and build

```bash
go test ./...
go vet ./...
make build
make build-hermes-provisioner
```

Results: PASS — all Go packages passed, `go vet ./...` reported no findings,
and both the historical platform-orchestrator and retained Hermes provisioner
binaries built successfully. No production service or runtime state changed.

The result is local merged-source evidence only. It does not authorize T043
frontend activation, T044 Aegis runtime replacement, T045 provider/secret
cleanup, or any production mutation.

## 17. T042 follow-up disposition

The bounded security and code-quality follow-up review is recorded in the
implementation PR and Issue #215. This slice disposition is:

- Issue #230: the anonymous waitlist route now fails closed through the exact
  middleware 404 registry; its application model, conversion path, lifecycle
  email templates/helpers, and unreferenced customer instance mutation
  helpers are removed. Retained waitlist data is untouched.
- Issue #231: the transitive `nanoid` advisory is remediated with the exact
  `3.3.17` override and lockfile entry. After `npm ci`,
  `npm audit --omit=dev --audit-level=high` reports no high-severity finding.
  The remaining three moderate findings are accepted pending non-breaking
  upstream remediation: Better Auth has no fix and remains guarded by
  `hasForbiddenOAuthResourceIndicator`; PostCSS remediation requires the
  unapproved Next.js 16 major upgrade. Re-review is due 2026-09-10.
- Issue #232: T041 is checked complete above and its merged PR/command evidence
  remains recorded in section 16.
- Issue #233: the qualifier now scans every non-test file under retired route
  directories, validates the exact middleware deny registry, and scans
  middleware code outside that registry. Regression fixtures cover a
  JavaScript retired route and an active middleware reference.

The Better Auth resource-indicator guard remains covered by the existing auth
security suite, and no secret values were added to source, test output, or
documentation.

## 18. Closeout

Close Issue #215 only after source, production routes, database treatment,
Aegis operations service, secret metadata, inventories, ADR 007, README/PRD,
runbooks, and the canonical deployment ledger all agree. Record any retained
compatibility field as historical and non-authoritative.
