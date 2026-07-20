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
- Allocation is zero-based. The approved initial sequence is `Tenet 0` for
  OvernightDesk/Walter, `Tenet 1` for Mitchel/Trevor, and `Tenet 2` for
  TTS/Titus; a `tenant-0`, `tenet-0`, or `tenet0-postgres` resource name remains
  a compatibility binding and cannot grant or imply canonical ownership.
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

## Provisioning and Membership Contract

- The platform may create an approved use case, immutable number allocation,
  runtime, persona assignments, and verified resource bindings with zero
  memberships.
- A membership-free foundation is resolvable metadata, not an access grant;
  canonical authorization must deny every subject until an active membership
  exists.
- Membership activation is a separate idempotent operation that accepts only
  an existing email-verified Better Auth user ID. Email, a fake account, or a
  substituted operator identity cannot stand in for the intended member.
- Adding a membership must not replace or regenerate the canonical use-case or
  runtime IDs.

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

## External Consumer Identity Contract

Canonical membership is necessary but is not, by itself, proof of an identity
presented by an external channel. Each consumer adapter must authenticate its
own provider subject and bind that subject to the membership identity without
using email, a display name, a room alias, or a client-supplied use-case value.

The first Titus adapter is a dedicated Open WebUI OIDC client. It uses the
exact OvernightDesk issuer and opaque Better Auth subject as the external
account key. The client/audience, exact callback, requested hostname,
canonical Tenet 2 runtime, Open WebUI deployment, and private Hermes endpoint
are resolved and compared server-side. Account linking by email and trusted
identity headers are prohibited. Nginx rechecks the Better Auth session and
active membership for all HTTP, streaming, and WebSocket requests; an Open
WebUI cookie is not independent authorization.

This adapter does not authorize Titus Matrix, AgentMail, or Teams. Their MXID,
sender address, and Entra object identities remain separate provider subjects
with separate channel-native controls until later approved adapters exist.
Adding another person requires that person's own Better Auth membership and
external-provider binding; bindings are never copied between people.

## Open WebUI Contract

Feature 020 uses canonical runtime identity for workspace assignment and active
membership for access. Its release/auth research and fixture-backed
implementation may proceed once this contract is accepted and the foundation
is available. Mitchel's end-user activation and browser acceptance cannot start
until his membership is active; a missing membership must render an unavailable
or forbidden state without forwarding to `hermes-mitchel`.

## Versioning

This is additive contract version 1. Breaking removal of a legacy selector,
change to number semantics, membership-role change, or canonical-authority
transfer requires a new ADR, migration plan, compatibility window, and rollback
evidence.
