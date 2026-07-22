# Contract: Managed Variable Replacement

## Browser request

`POST /api/settings/agent-variables`

```json
{
  "agentKey": "titus",
  "variableId": "openrouter_api_key",
  "value": "new-write-only-value",
  "requestId": "018f6f54-...",
  "confirmation": "replace:openrouter_api_key:restart"
}
```

Limits: JSON only, bounded body, one variable per request, exact Zod schema,
no unknown fields. `agentKey` is only a presentation selector; the server maps
it to the active membership/runtime. Raw Phase App/environment/path/key,
tenant ID, runtime ID, restart target, or secret map is rejected.

## Response envelope

Success:

```json
{
  "success": true,
  "data": {
    "variableId": "openrouter_api_key",
    "outcome": "replaced",
    "runtimeEffect": "restart",
    "runtimeEffectStatus": "completed"
  }
}
```

Partial success uses HTTP 502, `success: false`, error code
`RUNTIME_EFFECT_FAILED`, and metadata stating that the value was replaced but
manual recovery is required. No response contains a submitted/existing value,
Phase coordinate, external body, internal token, or stack trace.

Error mapping:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Malformed JSON/body/confirmation |
| 401 | `UNAUTHORIZED` | No current session |
| 403 | `FORBIDDEN` | Membership/role/admin policy denied |
| 404 | `AGENT_NOT_FOUND` | Explicit selector does not resolve |
| 409 | `DUPLICATE_REQUEST` | Request ID already completed or in flight |
| 422 | `INVALID_VALUE` | Catalog validator rejected new value |
| 423 | `VARIABLE_UNAVAILABLE` | Safe boundary/effect is not deployed |
| 429 | `RATE_LIMITED` | Bounded retry response |
| 502 | `SECRET_WRITE_FAILED` | External write failed without claimed success |
| 502 | `RUNTIME_EFFECT_FAILED` | Write succeeded; required effect failed |
| 503 | `AUTHORITY_UNAVAILABLE` | Canonical authorization/binding/audit unavailable |

## Server evaluation order

1. Authenticate current session.
2. Parse exact request schema and enforce size/rate bounds.
3. Resolve exact selected-agent context.
4. Resolve catalog entry and validate value/confirmation.
5. Reauthorize membership role and optional platform admin role.
6. Resolve exactly one supported secret boundary.
7. Persist metadata-only attempt audit/idempotency claim.
8. Call the boundary-aware provisioner once with one opaque boundary, catalog
   variable ID, and value; the provisioner owns the write and declared effect.
9. Persist the metadata-only outcome and return a value-free response.

The existing `/api/settings/update-credential` arbitrary `{secrets}` contract is
deprecated and must reject the old shape before the new endpoint is enabled.

## Provisioner boundary contract (v1)

The platform server calls the Aegis provisioner synchronously after browser
authorization, canonical boundary resolution, validation, and its metadata-only
attempt claim succeed.

`POST /v1/managed-variable-replacements`

```json
{
  "requestId": "018f6f54-7b2e-7d31-9f6c-7e2ef3b11a62",
  "boundaryId": "f45a5421-585d-4f0a-9a30-f9ec22850d87",
  "variableId": "openrouter_api_key",
  "value": "new-write-only-value"
}
```

The provisioner request has these invariants:

- `Authorization: Bearer <PROVISIONER_SECRET>` is required and is checked in
  constant time before the body is parsed. Production transport is HTTPS; the
  browser never calls this endpoint or receives the bearer credential.
- Only `application/json` is accepted. The body is capped at 8 KiB, uses an
  exact schema with no unknown fields, and carries one variable only.
- `requestId` is a UUID and the durable idempotency key. `boundaryId` is an
  opaque provisioner-issued UUID, not a Phase coordinate or a tenant ID.
  `variableId` is a stable catalog ID. `value` is a non-empty string capped at
  512 bytes before variable-specific validation.
- App ID/name, environment, path, Phase secret ID/key, service-account token,
  tenant/runtime target, runtime effect, arbitrary command arguments, and a
  `secrets` map are not accepted. A body containing any of them is invalid.
- The platform must derive `boundaryId` from exactly one canonical
  `secret_boundary_binding`. Presentation state is never authoritative, and the
  provisioner does not accept a fallback tenant or default boundary.

The platform must not forward `boundaryId`, the provisioner response, or any
provisioner error details to the browser. It translates only the safe fields
defined by the browser response contract above.

### Frontend adoption gate

The frontend implementation is deliberately split across the current hardening
increment and post-qualification enablement:

- Before provisioner qualification, the current legacy-boundary adapter may
  remain available only for already supported legacy paths. Canonical Titus and
  Walter bindings remain read-only.
- A server-only platform allowlist maps an exact canonical
  `(phaseApp, environment, pathIdentifier)` tuple to one provisioner-issued
  `boundaryId`. No browser prop, form field, query parameter, or database value
  supplied by a user may select or mint that ID. A missing or ambiguous mapping
  is `VARIABLE_UNAVAILABLE`.
- The frontend provisioner client adds one typed
  `replaceManagedVariable({requestId, boundaryId, variableId, value})` method.
  It replaces the managed-variable route's `writeSecrets()` plus `restart()`
  dependencies; the route must not call the legacy operations before or after
  it.
- The client validates the provisioner response against the exact value-free
  schema in this document. It does not parse, log, or forward an unknown/raw
  response body. Network and schema failures map to a safe platform error.
- Only after the engine endpoint and a specific registry combination pass the
  enablement evidence may the corresponding frontend mapping/catalog capability
  change from read-only to write-only. This is the T044 change and requires
  focused route/client tests; it is not implicit in the engine deployment.

### Provisioner-owned registry

An enabled registry entry resolves one `boundaryId` to all authority needed for
the operation:

| Registry field | Rule |
| --- | --- |
| Phase App | Exact App identifier/name; never caller supplied |
| Phase environment | Exact environment; never caller supplied |
| Phase path | Exact absolute path; never caller supplied |
| credential reference | One Phase service-account credential assigned to this boundary's use case |
| runtime target | Exact provisioner-owned container/service identifier |
| allowed variables | Map of catalog `variableId` to exact Phase key, validator, and effect |
| enabled | Kill switch; defaults false for unqualified combinations |

Registry loading fails closed on duplicate boundary IDs, duplicate effective
App/environment/path/variable combinations, missing credential references,
unsupported effects, invalid paths, or an empty allowlist. The registry is
operator configuration: the API cannot create, widen, or enumerate entries.

Titus and Walter use-case boundaries must not share a service-account
credential merely because they run on the same host. Each credential inherits
only the Phase App/environment access required for its registry entries. Human
PATs are prohibited. Server-side encryption must already be enabled for every
App written through the Phase REST API.

### Execution order and secret handling

For an authenticated, valid request the provisioner:

1. claims or resolves the durable `requestId` idempotency record;
2. resolves one enabled registry entry and one allowed variable definition;
3. validates the value against the provisioner copy of the variable policy;
4. records a value-free `accepted` event;
5. creates or updates exactly one static Phase secret at the resolved
   App/environment/path/key using the boundary's service account;
6. performs the registry-declared effect (`none` or `restart`) against the exact
   runtime target; and
7. durably records and returns a value-free terminal outcome.

The value may exist only in the bounded HTTPS request body, short-lived process
memory, and the Phase client's stdin/request body. When the Phase CLI is used,
the value is passed through `RunWithStdin`; it is never placed in argv, process
environment, a temporary file, stdout/stderr, an error, a log field, an audit
row, an idempotency record, a metric label, a trace, or a response. The
provisioner must not log request bodies or Phase response bodies. It also must
not hash, prefix, measure, or otherwise derive logged/audited metadata from the
value.

Only static secrets are eligible. A Phase response is untrusted input: the
provisioner checks only the bounded status/fields needed to establish the
write, discards bodies that may echo values, and maps failures to the safe codes
below. Create-versus-update discovery must remain inside the resolved boundary
and must never return an existing value.

### Success and partial-success response

Completed write and effect:

```json
{
  "success": true,
  "data": {
    "requestId": "018f6f54-7b2e-7d31-9f6c-7e2ef3b11a62",
    "variableId": "openrouter_api_key",
    "outcome": "replaced",
    "runtimeEffect": "restart",
    "runtimeEffectStatus": "completed",
    "replayed": false
  }
}
```

If the Phase write succeeds but the required runtime effect fails, the endpoint
returns HTTP 502 with `RUNTIME_EFFECT_FAILED` and only these additional safe
fields:

```json
{
  "success": false,
  "error": {
    "code": "RUNTIME_EFFECT_FAILED",
    "message": "The value was replaced, but the required runtime effect failed."
  },
  "data": {
    "requestId": "018f6f54-7b2e-7d31-9f6c-7e2ef3b11a62",
    "variableId": "openrouter_api_key",
    "outcome": "replaced",
    "runtimeEffect": "restart",
    "runtimeEffectStatus": "failed",
    "replayed": false
  }
}
```

No response contains the boundary ID, Phase coordinates/key/secret ID/version,
runtime target, credential reference, submitted/existing value, external body,
command output, token, or stack trace.

`runtimeEffect` is `none` or `restart`. `runtimeEffectStatus` is `not_required`
when the effect is `none`, otherwise `completed` or `failed`. `outcome` is
`replaced`; the error code distinguishes a completed replacement from partial
success or an unproven write.

### Error mapping

Errors use `{ "success": false, "error": { "code": "...", "message":
"..." } }`. Messages are fixed safe strings; internal and external errors are
classified rather than interpolated.

After a valid authenticated request is claimed, an error may also carry only
`data.requestId`, `data.variableId`, and `data.replayed`. Partial success adds
the exact effect fields shown above. Pre-claim validation, authentication,
boundary lookup, and disabled-boundary errors contain no `data`. A replay sets
`replayed: true`; no other response field changes.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Body, content type, size, UUID, or exact schema invalid |
| 401 | `UNAUTHORIZED` | Provisioner bearer missing or invalid |
| 404 | `BOUNDARY_NOT_FOUND` | Opaque boundary is unknown; no fallback is attempted |
| 409 | `OPERATION_IN_PROGRESS` | The same request ID is currently executing |
| 409 | `IDEMPOTENCY_CONFLICT` | Request ID is already bound to another boundary/variable |
| 422 | `INVALID_VALUE` | Provisioner-side variable validator rejected the value |
| 423 | `BOUNDARY_DISABLED` | Boundary or variable kill switch is disabled |
| 429 | `RATE_LIMITED` | Local or Phase limit reached; include bounded `Retry-After` when known |
| 502 | `SECRET_WRITE_FAILED` | Phase definitively rejected/failed the write |
| 502 | `WRITE_OUTCOME_UNKNOWN` | Timeout/transport loss prevents proving whether Phase wrote the value |
| 502 | `RUNTIME_EFFECT_FAILED` | Write succeeded; required effect failed |
| 503 | `STATE_UNAVAILABLE` | Registry, idempotency, or audit state cannot fail-closed |
| 500 | `INTERNAL_ERROR` | Unclassified failure with no internal detail exposed |

Malformed external responses, CLI output, transport errors, and command errors
must never be copied into the response. Authentication is evaluated before
boundary lookup so unauthenticated callers cannot enumerate registry state.

### Idempotency and concurrency

The provisioner persists `requestId`, `boundaryId`, `variableId`, timestamps,
bounded state/outcome enums, effect state, and the value-free response needed
for replay. The record survives process restart and contains no value-derived
field. In particular, it contains no request-body hash because that would hash
the submitted secret.

- A new request ID is claimed before Phase mutation. If durable state is
  unavailable, return `STATE_UNAVAILABLE` and do not mutate Phase.
- A completed request with the same ID, boundary, and variable returns the
  stored terminal response without writing or restarting again and sets
  `replayed: true`.
- An in-flight match returns `OPERATION_IN_PROGRESS`. Reuse for a different
  boundary or variable returns `IDEMPOTENCY_CONFLICT`.
- On process startup, or after the bounded execution deadline, a non-terminal
  claimed record becomes `WRITE_OUTCOME_UNKNOWN`; it is never resumed or
  automatically re-executed.
- A request ID whose terminal outcome is failure or unknown replays that exact
  safe outcome. A deliberate retry uses a new request ID after reconciliation;
  it never silently re-executes an uncertain operation.
- The provisioner serializes concurrent operations for the same resolved
  boundary and variable. Different enabled boundaries may execute independently.

### Timeout, audit, and observability

Phase write, runtime effect, and total handler execution each have bounded
timeouts. The platform client's timeout must exceed the provisioner's total
budget. A timeout after dispatch is `WRITE_OUTCOME_UNKNOWN`, not a claimed
failure or success.

Value-free logs/audit events may contain request ID, variable ID, bounded
boundary registry label, stage, outcome/reason enum, replay flag, and duration.
They must not contain a browser actor identifier (the platform audit owns that
association), raw boundary ID, Phase coordinates, runtime target, credential
reference, value metadata, or external/command bodies. Metrics use bounded
stage/outcome labels only; request IDs and variable IDs are not metric labels.

### Rollback and recovery

Rollback is fail-closed and preserves data:

1. Disable the affected frontend catalog/boundary combination so the control
   renders read-only.
2. Disable the provisioner registry entry before rolling back its binary or
   credentials. Verify the endpoint denies the combination without a Phase
   call or runtime effect.
3. Restore the last qualified provisioner artifact/config if required. Keep
   idempotency and audit state so old request IDs cannot execute again.
4. If the Phase write succeeded and restart failed, recover by restarting the
   exact runtime manually after verification. Do not automatically write an
   assumed old value.
5. If the write outcome is unknown, reconcile Phase metadata through an
   approved operator path before issuing a new request ID. Never fetch or print
   the existing value for evidence.

Rollback does not delete Phase secret versions, secret-boundary bindings,
service accounts, audit rows, runtime data, or idempotency records. Reverting a
value is a separately authorized replacement operation using the same contract;
there is no delete or arbitrary-map endpoint in v1. The legacy
`/write-secrets` route is not a fallback for this flow and can be retired only
after its remaining callers are inventoried and migrated.

### Enablement evidence

Each boundary/variable combination remains disabled until tests and production
qualification prove exact registry resolution, one-key mutation, separate
service-account authority, stdin-only value handling, idempotent replay,
value-free logs/errors, exact runtime effect, disabled-boundary denial, and the
rollback sequence above. Qualification evidence records identifiers and
outcomes only; it never contains a real or synthetic submitted value.

## External basis

Phase's REST API supports server-side create/update operations and requires
bearer authentication; secret manipulation requires App server-side encryption
([API overview](https://docs.phase.dev/public-api), [Secrets
API](https://docs.phase.dev/public-api/secrets)). Service-account tokens inherit
the account's granted policies, and service accounts require explicit App and
environment access ([Service accounts](https://docs.phase.dev/access-control/service-accounts),
[Authentication tokens](https://docs.phase.dev/access-control/authentication/tokens)).

## T040 review record (2026-07-22)

The contract was reconciled against both sides of the current boundary:

- The frontend currently calls legacy `writeSecrets({tenantId, secrets})` and
  `restart(tenantId)` separately. The adoption gate above replaces both with
  one typed operation without changing the browser form or UI contract.
- The engine currently exposes `/write-secrets`, accepts an arbitrary map, and
  resolves one process-wide Phase App/environment plus `/{tenantId}`. The v1
  registry and exact request schema remove each of those authority inputs.
- The engine already supports stdin delivery for Phase values and constant-time
  bearer comparison. T042 preserves those properties while adding the exact
  registry, durable idempotency, safe errors, and owned runtime effect.
- No frontend mapping becomes writable from this document change. T041-T043
  implement and qualify the engine boundary; T044 adds the reviewed frontend
  adapter and enables only combinations proven by qualification evidence.

Review result: **accepted for T041 implementation**. No engine worktree,
runtime configuration, production service, Phase value, or credential was
changed by T040.

## T041-T044 delivery record (2026-07-22)

- Engine PR 4 merged at `fc8211e` after Go tests, focused race coverage, vet,
  lint, and ARM64 build checks passed.
- T043 installed the registry disabled first, proved `BOUNDARY_DISABLED`
  without a Phase call or runtime effect, restored the previous binary and
  environment with route absence, then restored the merged artifact while
  preserving durable state.
- The existing Titus and Walter Phase service-account inputs were proven
  distinct and cross-App denied. Only the Titus runtime/OpenRouter combination
  qualified: a same-value one-key replacement caused exactly one
  `hermes-titus` restart, recovered healthy, replayed durably without another
  write/restart, kept the Phase key set unchanged, and left responses, journal,
  and SQLite evidence value-free.
- Walter remains disabled because its current canonical boundary has no
  qualified catalog variable.
- T044 resolves only source-controlled canonical tuples whose opaque boundary
  ID is supplied by a server-only environment variable. It makes one typed
  `replaceManagedVariable` call, strictly validates the bounded value-free
  response, and contains no legacy write/restart fallback. An absent or invalid
  boundary ID renders every control read-only.
