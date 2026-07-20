# Data Model: Use-Case Identity Foundation

Names are conceptual until the schema task validates repository conventions.
All IDs are UUIDs unless explicitly described otherwise.

## UseCase

| Field | Rule |
|---|---|
| `id` | Immutable canonical UUID primary key |
| `number` | Nullable projection from the append-only UseCaseNumberAllocation registry |
| `slug` | Unique mutable operational label; not authorization |
| `display_name` | Mutable human-readable name |
| `status` | `planned`, `active`, `suspended`, `retired` |
| audit timestamps | Creation/update/retirement metadata |

## RuntimeIdentity

| Field | Rule |
|---|---|
| `id` | Canonical runtime UUID |
| `use_case_id` | Required FK to one UseCase |
| `slug` | Unique operational runtime label |
| `memory_boundary_kind` | Explicit primary-memory/storage type |
| `status` | `planned`, `active`, `suspended`, `retired` |

Runtime identity is not a persona. A separate primary-memory requirement means
a separate runtime record even if the same people or persona labels are used.

## UseCaseNumberAllocation

| Field | Rule |
|---|---|
| `number` | Non-negative bigint within JavaScript's safe-integer range; primary key; allocation starts at zero |
| `use_case_id` | Unique FK to UseCase; one allocated number per use case |
| `allocated_by` | Non-secret actor identifier for the approved allocation |
| `allocated_at` | Immutable allocation timestamp |

The allocation registry is append-only. Database triggers reject updates and
deletes, which preserves non-reuse even after a use case is retired. The number
is joined/projected as the use case's human-facing number; it is not duplicated
as an independently mutable column on `use_case`.

The owner-approved initial sequence is `Tenet 0` for OvernightDesk/Walter,
`Tenet 1` for Mitchel/Trevor, and `Tenet 2` for TTS/Titus. Those approvals do
not create registry rows; each allocation still uses the audited append-only
operation. Historical resource names such as `tenant-0`, `tenet-0`, and
`tenet0-postgres` are compatibility bindings, not proof that every workload or
schema they host belongs to that use case.

## PersonaAssignment

| Field | Rule |
|---|---|
| `id` | Assignment UUID |
| `runtime_id` | Required FK to RuntimeIdentity |
| `persona_key` | Stable profile key; display name is separate |
| `is_default` | At most one active default per runtime |
| `authority_profile` | Reference to an approved capability policy |
| `status` | `active`, `disabled`, `retired` |

## Membership

| Field | Rule |
|---|---|
| `id` | Membership UUID |
| `use_case_id` | Required FK to UseCase |
| `user_id` | Stable Better Auth user ID for the person; email is profile data only |
| `runtime_id` | Nullable narrowing scope; null means use-case scope |
| `role` | Explicit approved role, not free-form authority |
| `status` | `invited`, `active`, `suspended`, `revoked` |
| lifecycle timestamps | Granted, activated, suspended/revoked, expiry |

One membership lifecycle record per user and scope prevents duplicate grants;
revocation and later reactivation update that record rather than creating a
second authority path. Email is profile data, not the stable membership key. Deleting the
Better Auth user cascades that user's membership grants so identity metadata
does not block the existing account-deletion flow; canonical use-case/runtime
records and allocation audit remain intact.

A canonical use case is valid with zero memberships. That state means the
platform has provisioned and can resolve the boundary, but nobody receives
canonical access through it. Invitation allowlists or pending email delivery
are onboarding inputs, not membership records. Membership activation requires
an existing email-verified Better Auth user and does not rewrite the use case,
number allocation, runtime, persona, or resource bindings.

## ResourceBinding

| Field | Rule |
|---|---|
| `id` | Binding UUID |
| `use_case_id` / `runtime_id` | Required use-case scope with optional runtime narrowing |
| `provider` | Owning system, such as `docker`, `phase`, `nginx`, `better_auth`, `orchestrator` |
| `kind` | `platform_instance`, `orchestrator_tenant`, `container`, `volume`, `hostname`, `phase_path`, `oidc_client`, `intake_route` |
| `value` | Exact non-secret identifier or path |
| `state` | `active`, `compatibility`, `rollback`, `retired` |
| `valid_from` / `valid_until` | Lifecycle interval |

Every non-retired `(provider, kind, value)` is unique. Secret values and tokens
are never stored as bindings.

## SecretBoundaryBinding

Records that a use case or runtime consumes secrets from a Phase App and
environment. It stores App/environment/path identifiers only, never secret
values or service-account tokens. Several runtimes may intentionally bind to
one App because the App is the approved blast-radius boundary.

## External Consumer Identity Adapter

This is an authorization boundary, not a new canonical person or membership
record. It maps an authenticated provider subject into the existing Better
Auth membership subject and resolves the consumer from canonical runtime
resource bindings.

For the selected Titus Open WebUI consumer:

| Input / binding | Rule |
|---|---|
| OIDC issuer | Exact OvernightDesk Better Auth issuer |
| OIDC subject | Opaque Better Auth `user.id`; never email |
| OIDC client/audience | Separate Titus Open WebUI client bound server-side to the Titus runtime |
| callback and hostname | Exact active resource bindings for the Titus Open WebUI deployment |
| local account key | Exact `(issuer, subject)` pair; email linking disabled |
| Hermes target | Server-derived private `hermes-titus` connection only |

The Open WebUI deployment, hostname, OIDC client, volume, and Phase path are
resource or secret-boundary bindings added during Feature 020 implementation.
No second user table or email-to-user mapping is added to the canonical
identity schema for this adapter. Matrix MXIDs, AgentMail senders, and future
Teams/Entra objects are different external subjects and require separate later
bindings if those channels adopt canonical membership.

## Existing Record Compatibility

- `instance.id` remains the current platform UUID and is bound or linked to a
  canonical runtime/use case through a nullable additive reference.
- `instance.userId` remains readable during migration but becomes an owner-role
  membership projection rather than the only authorization source.
- `instance.tenantId`, `containerId`, and `subdomain` become active resource
  bindings; existing constraints remain until consumers migrate.
- orchestrator `tenant_id` remains an external registry UUID represented by a
  binding unless that registry is later selected as the canonical authority.

## Allocation and State Rules

1. UUID creation and any approved number allocation occur in one foundation
   transaction that does not require or create a membership.
2. Number allocation is centrally serialized and audited.
3. Numbers are not assigned in fixtures, documentation, or backfill scripts
   without an approved allocation operation.
4. Retirement never deletes allocation history or permits number reuse.
5. Bindings transition through compatibility/rollback states before retirement.
6. Canonical identities are not hard-deleted while referenced by audit,
   membership, runtime, or resource history.
7. Verified membership activation is a separate idempotent transaction and
   fails closed when the Better Auth subject is missing or unverified.
