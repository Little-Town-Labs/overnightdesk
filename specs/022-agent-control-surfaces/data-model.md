# Data Model: Agent Control Surfaces

No database migration is required for the frontend increments. Existing
canonical tables remain authoritative.

## SelectedAgentContext

Server-only derived model.

| Field | Type | Rule |
| --- | --- | --- |
| key | validated slug | Presentation selector only; never an authorization ID |
| useCaseId | UUID | From active canonical membership |
| runtimeIdentityId | UUID | From the authorized active runtime |
| runtimeSlug | string | Canonical runtime label |
| runtimeStatus | enum | Canonical state, never inferred from instance position |
| membershipRole | owner/operator/member/viewer | Exact active membership role |
| identity | name + logo | Presentation data from default active persona/catalog |
| useCaseName | string | Canonical display name |
| instance | exact optional link | Present only when `instance.runtimeIdentityId` matches |
| capabilities | capability list | Derived server-side from verified bindings/instance state |

Selection states are `available`, `empty`, and `unavailable`; an explicit
invalid selector is a separate not-found outcome. No state falls back to the
first instance after an explicit selector.

## AgentCapability

| Field | Type | Rule |
| --- | --- | --- |
| id | stable enum | `runtime`, `open_chat`, `advanced_dashboard`, `managed_variables` |
| label | string | Shared UI label |
| state | enum | `available`, `not_deployed`, `unavailable`, `not_applicable` |
| detail | safe string | No secret, hostname authority, or internal error |
| action | optional safe link | Created only from verified server-side bindings |

## ManagedVariableDefinition

Source-controlled policy, not a database row.

| Field | Type | Rule |
| --- | --- | --- |
| id | stable enum | Only client-visible mutation identifier |
| phaseKey | internal string | Never accepted from the client |
| label/help | safe strings | User-facing copy |
| sensitivity | secret/config | Secret values remain write-only |
| allowedRoles | role set | Narrowest roles for this variable |
| scope | runtime/use-case | Determines required exact binding |
| validator | bounded schema | Format and maximum size |
| effect | none/reload/restart/manual | Declared before confirmation |
| enabledBoundaryKinds | policy | Defaults disabled for unsupported boundaries |

Initial catalog candidates are OpenRouter and approved messaging credentials.
Each candidate remains disabled unless its boundary and runtime effect can be
executed safely.

## SecretBoundary

Existing `secret_boundary_binding` row. Exactly one compatible row must resolve
for the selected use case/runtime. Multiple, missing, or unsupported App/env/path
combinations deny mutation. App, environment, and path never enter client props.

## VariableReplacementAttempt

Transient request plus existing `platform_audit_log` outcome.

| Field | Stored? | Rule |
| --- | --- | --- |
| actor user ID | yes | Authenticated stable ID |
| useCaseId/runtimeIdentityId | yes | Canonical target IDs |
| variableId | yes | Catalog ID, never Phase key/value |
| requestId | yes | Bounded idempotency identifier |
| outcome/reason | yes | Bounded enum |
| submitted value | no | Exists only in bounded request memory and downstream stdin |
| service token/external body | no | Never logged or audited |

State flow: `validated -> authorized -> boundary_resolved -> audited_attempt ->
external_write -> runtime_effect -> audited_outcome`. Any failure denies claimed
success. A write followed by runtime-effect failure returns `partial_success`
with recovery guidance.
