# Contract: Use-Case and Runtime Identity

## Terminology

| Term | Meaning | Must not mean |
|---|---|---|
| Use case | Canonical operational purpose/trust context | Persona, container, Phase App |
| Tenet number | Optional stable human-facing number for a use case | Primary key, credential, authorization grant |
| Tenant | Existing customer-tenancy concept and legacy selector | Automatic synonym for use-case UUID |
| Runtime | Agent process and primary-memory boundary | Persona or human owner |
| Persona | Behavior/presentation/authority assignment to a runtime | Runtime identity or memory boundary |
| Membership | Explicit person-to-use-case/runtime access grant | Ownership inferred from email or a slug |
| Resource binding | Compatibility mapping to an infrastructure identifier | Canonical identity |
| Secret boundary | Phase App/environment access boundary | Use-case or runtime identity |

## Identifier Contract

- Internal APIs, foreign keys, authorization decisions, and audit correlation use
  canonical UUIDs.
- Human surfaces may show `Tenet <number>` and may resolve that number to a
  canonical UUID server-side.
- A number is public, enumerable, immutable, and never reused. Knowing it grants
  no access.
- Allocation is zero-based. `Tenet 0` identifies the OvernightDesk/Walter use
  case; a `tenant-0`, `tenet-0`, or `tenet0-postgres` resource name remains a
  compatibility binding and cannot grant or imply canonical ownership.
- Slugs and display names may change. Historical aliases remain resolvable only
  while their binding state permits it.
- A caller may submit a legacy selector only to a compatibility endpoint. The
  server resolves it and returns/uses canonical identity; downstream code does
  not propagate the legacy string as authority.

## Authorization Contract

An authorization decision requires all of the following:

1. an authenticated stable identity-provider subject;
2. an active, non-expired membership for the canonical use case or runtime;
3. an allowed role/capability for the requested action;
4. active canonical and runtime state;
5. a server-side resource assignment when forwarding to external infrastructure.

Client-provided use-case numbers, slugs, hostnames, persona names, container
names, or Phase paths never establish authorization.

## Compatibility Contract

The foundation release preserves current platform and provisioner inputs and
outputs. It adds a canonical resolver beside them. For each consumer:

1. register and verify the existing resource binding;
2. dual-resolve and compare without changing authority;
3. enable canonical resolution for one canary;
4. observe and retain a fast read-path rollback;
5. migrate remaining callers;
6. retire a legacy binding only after no verified consumer uses it.

No compatibility step prints or stores secret values.

## Open WebUI Contract

Feature 020 uses canonical runtime identity for workspace assignment and active
membership for access. Its release/auth research may proceed once this contract
is accepted. The Mitchel/Trevor stateful canary cannot start until the Mitchel
business use case, Mitchel's membership, Trevor's persona assignment, and the
current `hermes-mitchel` runtime resource bindings are verified.

## Versioning

This is additive contract version 1. Breaking removal of a legacy selector,
change to number semantics, membership-role change, or canonical-authority
transfer requires a new ADR, migration plan, compatibility window, and rollback
evidence.
