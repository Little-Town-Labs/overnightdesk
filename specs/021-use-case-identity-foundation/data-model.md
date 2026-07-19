# Data Model: Use-Case Identity Foundation

Names are conceptual until the schema task validates repository conventions.
All IDs are UUIDs unless explicitly described otherwise.

## UseCase

| Field | Rule |
|---|---|
| `id` | Immutable canonical UUID primary key |
| `number` | Nullable positive bigint, unique, immutable once allocated, never reused |
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
| `subject_type` / `subject_id` | Stable identity-provider subject binding |
| `runtime_id` | Nullable narrowing scope; null means use-case scope |
| `role` | Explicit approved role, not free-form authority |
| `status` | `invited`, `active`, `suspended`, `revoked` |
| lifecycle timestamps | Granted, activated, suspended/revoked, expiry |

Active membership uniqueness prevents duplicate grants for the same subject and
scope. Email is profile data, not the stable membership key.

## ResourceBinding

| Field | Rule |
|---|---|
| `id` | Binding UUID |
| `use_case_id` / `runtime_id` | Exactly one valid canonical target scope |
| `provider` | Owning system, such as `docker`, `phase`, `nginx`, `better_auth`, `orchestrator` |
| `kind` | `instance`, `external_tenant`, `container`, `volume`, `hostname`, `phase_path`, `oidc_client`, `intake_route` |
| `value` | Exact non-secret identifier or path |
| `state` | `active`, `compatibility`, `rollback`, `retired` |
| `valid_from` / `valid_until` | Lifecycle interval |

Active `(provider, kind, value)` is unique. Secret values and tokens are never
stored as bindings.

## SecretBoundaryBinding

Records that a use case or runtime consumes secrets from a Phase App and
environment. It stores App/environment/path identifiers only, never secret
values or service-account tokens. Several runtimes may intentionally bind to
one App because the App is the approved blast-radius boundary.

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

1. UUID creation and number allocation occur in one transaction.
2. Number allocation is centrally serialized and audited.
3. Numbers are not assigned in fixtures, documentation, or backfill scripts
   without an approved allocation operation.
4. Retirement never deletes allocation history or permits number reuse.
5. Bindings transition through compatibility/rollback states before retirement.
6. Canonical identities are not hard-deleted while referenced by audit,
   membership, runtime, or resource history.
