# Data Model: Legacy Customer Lifecycle Retirement

No new entity or account state is introduced.

## Retained authoritative entities

### User

Existing Better Auth identity. Gary's active identity and every dormant
identity remain unchanged.

- Retained behavior: sign-in, session issuance/revocation, password recovery.
- Creation rule after retirement: no web or API registration path may create a
  user.
- Deletion rule: no self-service deletion; owner-operated process only.

### Membership and use-case identity

The authoritative link from an existing user to an approved workspace and
named runtime.

- Retained behavior: exact active membership is required for workspace,
  chat, dashboard, and OAuth/OIDC authorization.
- Prohibited dependency: subscription, plan, Stripe customer, or payment
  status.

### Platform instance

Current named-runtime linkage used by selected-agent resolution, OIDC, health,
and dashboard capabilities.

- Retained fields: every field with a proven current named-runtime or OIDC
  consumer.
- Retired behavior: customer-created queued/provisioning transitions, wizard
  writes, dynamic provision, broad restart, and deprovision.
- Cleanup rule: a compatibility field is removable only after source and
  production reads prove zero active consumer.

### Managed-variable boundary and audit/idempotency records

Existing exact allowlisted secret-replacement authority.

- Retained operation: one qualified managed-variable replacement.
- Retained evidence: value-free authorization, audit, idempotency, outcome, and
  bounded runtime-effect metadata.
- Prohibited operations: arbitrary secret maps, caller-selected runtime,
  provision, deprovision, or broad restart.

## Retired entities

### Subscription

Legacy local Stripe/customer-plan record.

State transition:

```text
application-authoritative
    -> source-unreferenced
    -> preflight-proven-empty
    -> migration-approved
    -> schema-removed
```

Required preflight:

1. Provider census reports zero active, disputed, refundable, retained, or
   otherwise unresolved obligation.
2. Local subscription count is zero.
3. No foreign key, code path, report, authorization rule, or audit process
   consumes the table.
4. Backup and rollback SQL are reviewed.

Any non-zero or ambiguous result stops at `source-unreferenced` for owner
decision; it is never automatically deleted.

### Wizard state

Legacy customer setup progress embedded in platform-instance compatibility
state.

- Source behavior is removed in the application slice.
- Field cleanup is optional in the data migration and requires zero rows with
  meaningful wizard state plus no active reader.

## Preserved data classes

The migration does not alter users, credentials, sessions except normal auth
use, memberships, use cases, runtime identities, platform-instance linkage,
OIDC clients, conversations, memories, audits, tenant data, prospect data, or
other business records.
