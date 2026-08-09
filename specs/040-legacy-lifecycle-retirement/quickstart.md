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

## 6. Closeout

Close Issue #215 only after source, production routes, database treatment,
Aegis operations service, secret metadata, inventories, ADR 007, README/PRD,
runbooks, and the canonical deployment ledger all agree. Record any retained
compatibility field as historical and non-authoritative.
