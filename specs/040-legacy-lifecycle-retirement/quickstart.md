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

Apply and rollback require separate configured approval tokens. The default
database adapter additionally requires an explicit destructive opt-in and a
database name matching the disposable cleanup pattern unless a separately
controlled production opt-in is present. Database SQL uses fixed allowlisted
tables and columns, and command output excludes identifiers, payment values,
tokens, and error details.

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

## 10. Closeout

Close Issue #215 only after source, production routes, database treatment,
Aegis operations service, secret metadata, inventories, ADR 007, README/PRD,
runbooks, and the canonical deployment ledger all agree. Record any retained
compatibility field as historical and non-authoritative.
