# Contract: Canonical Native Dashboard Assignment

## Purpose

Define a shared, guarded plan/apply/verify contract for attaching an existing
native dashboard to an exact canonical runtime without creating another agent.

## Planner input

```ts
interface DashboardAssignmentDescriptor {
  tenantId: string;
  hostname: string;
  containerId: string;
}

interface DashboardAssignmentSnapshot {
  schemaReady: boolean;
  identities: CanonicalRuntimeIdentity[];
  memberships: CanonicalMembership[];
  platformBindings: ResourceBinding[];
  hostnameBindings: ResourceBinding[];
  candidates: DashboardInstanceCandidate[];
}
```

The caller supplies the identity template and a repository-owned descriptor.
No browser or request value may choose the runtime, host, tenant, or container.

## Binding prerequisite

An existing foundation is not rewritten to add later dashboard selectors.
Before assignment planning, a separate guarded reconciler must prove one exact
active use case/runtime and then add only the missing repository-declared
`overnightdesk/platform_instance` and `nginx/hostname` bindings. It:

- plans, applies, and verifies independently;
- accepts only absent or exact runtime-scoped state;
- refuses copied, partial, duplicated, non-active, or ambiguous bindings;
- requires private-runtime qualification, an explicit confirmation, and a
  bounded non-secret actor before apply;
- writes the missing one or two bindings and one count-only audit atomically;
- converges safely if an exact concurrent writer wins;
- emits status and counts only.

## Plan output

```ts
type DashboardAssignmentPlan =
  | { status: "blocked"; reasons: string[] }
  | { status: "ready"; assignment: ExactAssignment }
  | { status: "verified_noop"; assignmentId: string };
```

`ready` requires:

- schema available;
- exactly one active use case and runtime;
- exactly one current owner;
- exactly one matching active platform-instance binding;
- no conflicting hostname binding;
- zero candidates, or one exact idempotent candidate;
- valid lowercase OvernightDesk hostname and bounded tenant/container values.

## Apply semantics

- Require an exact explicit confirmation sentinel.
- Insert at most one projection with exact canonical IDs.
- Never create, stop, restart, or remove a runtime or volume.
- Never copy an engine key, dashboard token, Phase token, or secret.
- Record one value-free audit event with counts only.
- Re-read and require `verified_noop` before reporting success.
- Concurrent winner handling must converge to the exact verified record or fail.

## Command surface

```text
npx tsx scripts/dashboard-instance-reconciliation.ts titus plan
npx tsx scripts/dashboard-instance-reconciliation.ts titus apply
npx tsx scripts/dashboard-instance-reconciliation.ts titus verify
```

Output is JSON containing status and counts only. IDs, hostnames, emails,
cookies, tokens, database URLs, and exception internals are prohibited.

## Rollback

Rollback disables the exact OIDC client first. The existing lifecycle moves its
runtime-scoped OIDC binding to `rollback` and marks the dashboard projection's
auth state `disabled`; the route is then disabled and the runtime returns to
loopback-only configuration. The canonical projection and platform/hostname
selector bindings remain as exact operational metadata so restoration is
idempotent. Rollback must preserve canonical identity, membership, runtime,
volume, audit history, Chat, and provider configuration.
